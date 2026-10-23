/**
 * The registry, configured for letters.
 *
 * A thin adapter over `DataTable`, and the column set is the one the ministry
 * reads a file by: day stamp, reference, subject, sender, state, priority,
 * category, officer, received date. The `subject` cell carries the `▣ scan`
 * marker because `has_attachment` is on the list projection and is the only
 * thing distinguishing a letter with its scan from one without.
 *
 * The subject is NOT truncated by a CSS ellipsis alone. A long subject is
 * usually a long Sinhala or Tamil subject, and truncating it in a table the
 * clerk is using to identify the letter defeats the purpose — the cell wraps,
 * and the full string stays in the DOM.
 */
import { Link } from 'react-router-dom';

import { addDays, formatDate, isoToday } from '../../utils/dateUtils.js';
import { isBranchLetter } from '../../utils/mailStatus.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { DataTable } from '../common/DataTable.jsx';
import { PriorityBadge } from '../common/PriorityBadge.jsx';
import { StatusBadge } from '../common/StatusBadge.jsx';

export function MailTable({ categories, ...props }) {
  const { t } = useLanguage();

  // The category dictionary, keyed case-insensitively by name, so a row's
  // `category` text can be resolved back to the maximum days it allows.
  const maxDaysByName = new Map(
    (categories ?? []).map((category) => [String(category.name).toLowerCase(), category.max_days]),
  );

  /**
   * A letter is overdue when its category defines a maximum, its receipt date
   * plus that maximum is already behind us, and it is not yet completed. The row
   * is tinted red so a whole page of the registry reads at a glance, without the
   * clerk having to compare each date to today.
   */
  function rowClassName(row) {
    if (row.status === 'Completed' || !row.receipt_date) return '';

    const maxDays = maxDaysByName.get(String(row.category ?? '').toLowerCase());
    if (maxDays == null) return '';

    const due = addDays(row.receipt_date, maxDays);
    if (!due || due >= isoToday()) return '';

    return 'bg-red-100 hover:bg-red-200';
  }

  const COLUMNS = [
    {
      key: 'day_stamp_no',
      header: t('print.dayStamp'),
      sortable: true,
      className: 'font-mono text-xs whitespace-nowrap',
      render: (row) => (
        <Link to={`/mail/${row.id}`} className="text-ink hover:underline">
          {row.day_stamp_no}
        </Link>
      ),
    },
    {
      key: 'letter_ref_no',
      header: t('print.reference'),
      sortable: true,
      className: 'font-mono text-xs whitespace-nowrap text-slate-500',
      render: (row) => row.letter_ref_no ?? '—',
    },
    {
      key: 'subject',
      header: t('print.subject'),
      sortable: true,
      className: 'text-slate-800',
      render: (row) => (
        <>
          <Link to={`/mail/${row.id}`} className="hover:underline">
            {row.subject}
          </Link>
          {row.has_attachment && (
            <span className="ml-2 text-xs text-slate-400" title={t('mail.hasAttachment')}>
              ▣ scan
            </span>
          )}
        </>
      ),
    },
    {
      key: 'sender_name',
      header: t('mail.sender'),
      sortable: true,
      className: 'text-slate-600',
      render: (row) => row.sender_name,
    },
    {
      key: 'status',
      header: t('common.status'),
      sortable: true,
      render: (row) => (
        <StatusBadge
          status={row.status}
          endorserRole={row.endorser_role}
          branch={isBranchLetter(row)}
        />
      ),
    },
    {
      key: 'priority',
      header: t('common.priority'),
      sortable: true,
      render: (row) => <PriorityBadge priority={row.priority} />,
    },
    {
      key: 'category',
      header: t('mail.category'),
      sortable: true,
      className: 'text-slate-600',
      render: (row) => row.category,
    },
    {
      key: 'assigned_officer_id',
      header: t('mail.assignedOfficer'),
      sortable: true,
      className: 'text-slate-600',
      render: (row) => row.assigned_officer?.full_name ?? <span className="text-slate-400">{t('mail.unassigned')}</span>,
    },
    {
      key: 'receipt_date',
      header: t('mail.received'),
      sortable: true,
      className: 'whitespace-nowrap text-slate-600',
      render: (row) => formatDate(row.receipt_date),
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      className: 'whitespace-nowrap text-right',
      render: (row) =>
        row.status === 'Logged' && props.onEdit && props.onDelete ? (
          <span className="flex justify-end gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onEdit?.(row);
              }}
              className="rounded-btn border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {t('common.edit')}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                props.onDelete?.(row);
              }}
              className="rounded-btn border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              {t('common.delete')}
            </button>
          </span>
        ) : null,
    },
  ];

  return <DataTable columns={COLUMNS} rowKey="id" rowClassName={rowClassName} {...props} />;
}
