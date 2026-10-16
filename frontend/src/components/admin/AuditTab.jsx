/**
 * The Audit Log tab.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DELTA IS BEHIND A SECOND CLICK
 * ---------------------------------------------------------------------------
 * `GET /audit` does not return `action_delta`. `auditModel.list` omits the column
 * deliberately (Phase 1 D32): it is a JSON blob per row, and a page of 25 of them
 * is a payload nobody asked for.
 *
 * The temptation is to fetch it per row to show it inline. That is 25 extra
 * requests for one field, and it makes the log slower to read than the thing it
 * is recording. So the list shows WHO / WHAT / WHEN, and opening one entry shows
 * the delta from `GET /audit/:id` — the only endpoint that returns it.
 *
 * The delta is rendered as raw JSON in a `<pre>`, deliberately unformatted. It is
 * a structured diff whose keys are generated (`before`, `after`, and whatever the
 * action used), and a pretty-printer that tries to be clever about them will
 * eventually hide a field it did not recognise — which in an audit view is the
 * worst possible failure.
 */
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../../api/axiosClient.js';
import * as auditApi from '../../api/auditApi.js';
import { DataTable } from '../../components/common/DataTable.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { ErrorNote } from '../../components/common/ErrorNote.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';
import { formatDateTime } from '../../utils/dateUtils.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const PAGE_SIZE = 25;

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

/**
 * The actions the system's phases have written, for the filter dropdown.
 *
 * A list of strings the user can type, not an authority: an action this list is
 * missing is still filterable by typing it, and the server matches exactly. A
 * dropdown of known values is a convenience; an unrecognised filter would be
 * silently ignored, which is why `search`-style free text is also offered below.
 */
const ACTIONS = [
  'USER_LOGIN',
  'USER_LOGOUT',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DEACTIVATED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'MAIL_LOGGED',
  'MAIL_MINUTES_ADDED',
  'MAIL_STATUS_CHANGED',
  'MAIL_ASSIGNED',
  'MAIL_NOTES_UPDATED',
  'MAIL_ATTACHMENT_ADDED',
  'MAIL_ATTACHMENT_DOWNLOADED',
  'DUTY_CREATED',
  'DUTY_UPDATED',
  'DUTY_DELETED',
];

export function AuditTab() {
  const { t } = useLanguage();
  const [filters, setFilters] = useState({ action: '', entity_type: '', entity_id: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  // The open entry. An ID, not a row, because the delta is not in the row.
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    auditApi
      .list(applied, { limit: PAGE_SIZE, offset })
      .then(setResult)
      .catch((problem) => setNotice(errorMessage(problem, t('audit.failed'))))
      .finally(() => setLoading(false));
  }, [applied, offset, t]);

  useEffect(load, [load]);

  const columns = [
    {
      key: 'created_at',
      header: t('audit.when'),
      className: 'whitespace-nowrap text-slate-600',
      render: (row) => formatDateTime(row.created_at),
    },
    {
      key: 'action',
      header: t('audit.action'),
      render: (row) => (
        <button
          type="button"
          onClick={() => setOpenId(row.id)}
          className="font-mono text-xs text-ink hover:underline"
        >
          {row.action}
        </button>
      ),
    },
    {
      key: 'user_name',
      header: t('audit.by'),
      className: 'text-slate-700',
      render: (row) => row.user_name ?? '—',
    },
    {
      key: 'entity_type',
      header: t('audit.entity'),
      className: 'text-slate-600',
      render: (row) => (row.entity_type ? `${row.entity_type}` : '—'),
    },
    {
      key: 'entity_id',
      header: t('audit.entityId'),
      className: 'font-mono text-xs text-slate-400',
      render: (row) => row.entity_id ?? '—',
    },
    {
      key: 'detail',
      header: '',
      sortable: false,
      render: (row) => (
        <button
          type="button"
          onClick={() => setOpenId(row.id)}
          className="text-xs text-slate-500 underline hover:text-ink"
        >
          {t('audit.whatChanged')}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(filters);
          setOffset(0);
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('audit.action')}</span>
          <select
            value={filters.action}
            onChange={(event) => setFilters((c) => ({ ...c, action: event.target.value }))}
            className={`${INPUT} mt-1`}
          >
            <option value="">{t('audit.allActions')}</option>
            {ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('audit.entityType')}</span>
          <input
            value={filters.entity_type}
            onChange={(event) => setFilters((c) => ({ ...c, entity_type: event.target.value }))}
            className={`${INPUT} mt-1`}
            placeholder="mail"
          />
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('audit.entityId')}</span>
          <input
            value={filters.entity_id}
            onChange={(event) => setFilters((c) => ({ ...c, entity_id: event.target.value }))}
            className={`${INPUT} mt-1 font-mono text-xs`}
            placeholder="letter or duty id"
          />
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('common.from')}</span>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => setFilters((c) => ({ ...c, from: event.target.value }))}
            className={`${INPUT} mt-1`}
          />
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('common.to')}</span>
          <input
            type="date"
            value={filters.to}
            onChange={(event) => setFilters((c) => ({ ...c, to: event.target.value }))}
            className={`${INPUT} mt-1`}
          />
        </label>

        <div className="flex gap-2 lg:col-span-5">
          <button type="submit" className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white">
            {t('common.apply')}
          </button>
          <button
            type="button"
            onClick={() => {
              const blank = { action: '', entity_type: '', entity_id: '', from: '', to: '' };
              setFilters(blank);
              setApplied(blank);
              setOffset(0);
            }}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t('common.clear')}
          </button>
        </div>
      </form>

      {notice && (
        <p className="text-sm text-slate-700" role="status">
          {notice}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={result.rows}
        loading={loading}
        total={result.total}
        offset={offset}
        pageSize={PAGE_SIZE}
        onOffsetChange={setOffset}
        onRowClick={(row) => setOpenId(row.id)}
        empty={
          <EmptyState title={t('audit.noMatches')}>
            {t('audit.noMatchesHint')}
          </EmptyState>
        }
      />

      {openId && <AuditEntryDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/** One entry, with its delta. Fetches on mount; the list could not have supplied it. */
function AuditEntryDialog({ id, onClose }) {
  const { t } = useLanguage();
  const [entry, setEntry] = useState(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let cancelled = false;

    auditApi
      .getById(id)
      .then((found) => {
        if (!cancelled) setEntry(found);
      })
      .catch((problem) => {
        setFailure(errorMessage(problem, t('audit.loading')));
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Modal open title={t('audit.entryTitle')} onClose={onClose} wide>
      {failure ? (
        <ErrorNote>{failure}</ErrorNote>
      ) : !entry ? (
        <Spinner label={t('audit.loading')} />
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label={t('audit.action')}>
              <span className="font-mono text-xs">{entry.action}</span>
            </Field>
            <Field label={t('audit.when')}>{formatDateTime(entry.created_at)}</Field>
            <Field label={t('audit.by')}>{entry.user_name ?? '—'}</Field>
            <Field label={t('audit.fromAddress')}>{entry.ip_address ?? '—'}</Field>
            <Field label={t('audit.entity')}>
              {entry.entity_type ?? '—'}
              {entry.entity_id ? ` · ${entry.entity_id}` : ''}
            </Field>
          </dl>

          <div>
            <h3 className="text-sm font-semibold text-ink">{t('audit.whatChanged')}</h3>
            {entry.action_delta ? (
              // Raw JSON, indented, scrollable. Not pretty-printed into fields: the
              // delta's shape belongs to the action that wrote it, and a renderer
              // that guessed wrong would hide the change it was asked to show.
              <pre className="mt-2 max-h-72 overflow-auto rounded-btn border border-slate-300 bg-canvas p-4 font-mono text-xs leading-relaxed text-slate-600">
                {JSON.stringify(entry.action_delta, null, 2)}
              </pre>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                {t('audit.noFieldChange')}
              </p>
            )}
          </div>

          <p className="text-xs text-slate-500">
            {t('audit.credentialNote')}
          </p>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}
