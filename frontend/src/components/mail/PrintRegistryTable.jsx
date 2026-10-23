/**
 * The registry as a printed sheet.
 *
 * The sibling of `PrintMinuteSlip`, and it follows the same rule: ALWAYS MOUNTED,
 * hidden on screen by `.print-only`, revealed by `@media print`. The registry
 * page keeps its interactive table for the screen behind `no-print`, so what
 * reaches paper is this — not the header, the filter bar, or the pagination.
 *
 * It renders `result.rows` (the page in view) for a plain Ctrl+P, or the whole
 * filtered result set when the Print button asks for it, so the two paths share
 * one artefact.
 *
 * The column list is `REGISTRY_COLUMNS`, the same one the CSV writer reads, so
 * the printed sheet and the CSV are the same columns in the same order.
 */
import { useState } from 'react';

import { formatDate, formatDateTime } from '../../utils/dateUtils.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { REGISTRY_COLUMNS } from '../../utils/registryExport.js';

/** A one-line account of what the printout is a slice of. */
function describeFilters(filters, t) {
  if (!filters) return t('registry.printNoFilters');

  const parts = [];
  if (filters.search) parts.push(`${t('common.search')}: ${filters.search}`);
  if (filters.status) parts.push(`${t('common.status')}: ${filters.status}`);
  if (filters.priority) parts.push(`${t('common.priority')}: ${filters.priority}`);
  if (filters.sender_type) parts.push(`${t('print.senderType')}: ${filters.sender_type}`);
  if (filters.category) parts.push(`${t('mail.category')}: ${filters.category}`);
  if (filters.from) parts.push(`${t('registry.receivedFrom')}: ${formatDate(filters.from)}`);
  if (filters.to) parts.push(`${t('registry.receivedTo')}: ${formatDate(filters.to)}`);

  return parts.length
    ? t('registry.printFilters', { summary: parts.join(' · ') })
    : t('registry.printNoFilters');
}

export function PrintRegistryTable({ rows, filters }) {
  const { t } = useLanguage();
  const safeRows = Array.isArray(rows) ? rows : [];

  // Captured once on mount, for the same reason the slip captures it: `new Date()`
  // during render is an impure read and would move the timestamp on any re-render.
  // The page remounts this component (via `key`) when the Print button fires, so
  // the printed time is fresh for a button print and page-load time for Ctrl+P.
  const [printedAt] = useState(() => new Date());

  return (
    <div className="print-only">
      <article className="registry-print">
        <header className="registry-print-header">
          <div>
            <p className="registry-print-ministry">{t('print.ministry')}</p>
            <h1 className="registry-print-title">{t('registry.printTitle')}</h1>
          </div>
          <dl className="registry-print-meta">
            <div>
              <dt>{t('registry.printCount')}</dt>
              <dd>{safeRows.length}</dd>
            </div>
          </dl>
        </header>

        <p className="registry-print-filters">{describeFilters(filters, t)}</p>

        <table className="registry-print-table">
          <thead>
            <tr>
              {REGISTRY_COLUMNS.map((column) => (
                <th key={column.key} className={column.className}>{t(column.header)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row) => (
              <tr key={row.id}>
                {REGISTRY_COLUMNS.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.key === 'signature' ? (
                      <span
                        className="registry-print-signature-line"
                        aria-hidden="true"
                      />
                    ) : (
                      column.value(row) || '—'
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="registry-print-footer">
          <span>{t('registry.printCount')}: {safeRows.length}</span>
          <span>{t('registry.printGenerated', { date: formatDateTime(printedAt) })}</span>
        </footer>
      </article>
    </div>
  );
}
