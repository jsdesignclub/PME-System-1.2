/**
 * The shared table: columns, server-side sort, pagination.
 *
 * SERVER-SIDE sort and paging, and that is the decision this component exists to
 * enforce. The registry is paginated at 20 by default (more on request); sorting those rows in the browser
 * and calling the result sorted produces a table ordered by the page the server
 * chose, which is the registry's default order. A clerk looking for the oldest
 * Urgent letter would be shown the newest 25, sorted among themselves, and have
 * no way to tell. The sort key goes into the query string and the server orders
 * the whole result set before the page is cut.
 *
 * `pagination.total` is rendered next to the controls for the same reason: a
 * table that says "Showing 1–25" on a result set of 340 is indistinguishable
 * from one holding 25 rows, and an officer who believes their whole queue is on
 * screen is not managing the queue.
 *
 * `columns[].render` is OPTIONAL, and a column without one shows `row[key]` as-is.
 * That was not a choice so much as a correction: it was originally typed as
 * required, while `UsersTab` and `DepartmentsTab` between them declared four
 * columns carrying only `key`, `header` and `className` — plainly deliberate, a raw
 * value plus styling — and every one of them was a latent crash. `column.render(row)`
 * was called unguarded, so opening Administration threw
 * `TypeError: column.render is not a function`, and because this app has no error
 * boundary React unmounted the WHOLE root: header, sidebar and all, on a page that
 * was only meant to render a table.
 *
 * The asymmetry is the lesson. `rows`, `loading` and `total` all have defaults and a
 * missing one degrades quietly; `render` had no default, so the same omission in
 * four places was a whole-application outage. A shared component's optional fields
 * should be optional in what they DO, not only in what the docblock says.
 */
import { SkeletonRow } from './SkeletonRow.jsx';

const SORT_INDICATOR = { asc: '▲', desc: '▼' };

/**
 * @param {object} props
 * @param {Array<{key: string, header: string, sortable?: boolean, className?: string, render?: (row: object) => React.ReactNode}>} props.columns
 * @param {object[]} props.rows
 * @param {string} [props.rowKey]        the id field used for React keys
 * @param {boolean} [props.loading]
 * @param {number} [props.total]
 * @param {number} [props.offset]
 * @param {number} [props.pageSize]
 * @param {{key: string, direction: 'asc'|'desc'}|null} [props.sort]
 * @param {(sort: {key: string, direction: 'asc'|'desc'}|null) => void} [props.onSortChange]
 * @param {(offset: number) => void} [props.onOffsetChange]
 * @param {React.ReactNode} [props.empty]
 * @param {(row: object) => void} [props.onRowClick]
 * @param {(row: object) => string|undefined} [props.rowClassName]  extra classes per row
 * @param {boolean} [props.staggerRows]  cascade the rows in on mount
 */
export function DataTable({
  columns,
  rows,
  rowKey = 'id',
  loading = false,
  total = 0,
  offset = 0,
  pageSize = 25,
  sort = null,
  onSortChange,
  onOffsetChange,
  empty = null,
  onRowClick,
  rowClassName,
  staggerRows = false,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const showing = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + pageSize, total);

  // Sortability is the conjunction of two things, and both must hold before a
  // header is drawn as a button: the COLUMN must be sortable, and the CONSUMER
  // must have supplied a handler. Without this the dashboard's "Latest letters"
  // preview renders nine headers that look clickable and silently do nothing,
  // because sorting is server-side and the dashboard has no query string to
  // change. A dead control is worse than a plain label — it invites the user to
  // find the oldest Urgent letter and then quietly show them the newest six.
  const canSort = Boolean(onSortChange);

  function toggleSort(column) {
    if (!canSort || !column.sortable) return;

    // Third click clears the sort, so a user who has sorted twice can get back
    // to the server's own ordering without a separate "reset" control.
    if (!sort || sort.key !== column.key) {
      onSortChange({ key: column.key, direction: 'asc' });
    } else if (sort.direction === 'asc') {
      onSortChange({ key: column.key, direction: 'desc' });
    } else {
      onSortChange(null);
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-xs tracking-wide text-slate-600 uppercase">
              {columns.map((column) => {
                const active = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={`py-2 pr-3 ${column.className ?? ''}`}
                    aria-sort={
                      active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    {column.sortable && canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 transition hover:text-ink"
                      >
                        {column.header}
                        <span className={active ? 'text-ink' : 'text-slate-500'}>
                          {active ? SORT_INDICATOR[sort.direction] : '↕'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody aria-busy={loading}>
            {loading ? (
              <SkeletonRow columns={columns.length} />
            ) : safeRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-4">
                  {empty}
                </td>
              </tr>
            ) : (
              safeRows.map((row, index) => {
                // A row that supplies its own classes also owns its hover: the
                // default `hover:bg-slate-50` would otherwise fight an overdue
                // row's red tint, and which one wins is not the caller's to say.
                const extra = rowClassName ? rowClassName(row) : '';
                return (
                  <tr
                    key={row[rowKey]}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    /* `--pme-i` rather than `animationDelay` inline: the delay is
                       arithmetic on the row's position, and keeping the arithmetic
                       in the stylesheet means a row cannot render with a delay that
                       disagrees with the cascade. `0` is the fallback so the class is
                       safe on any row that forgot to set it — a row stuck at
                       opacity 0 would be a row that never appears. */
                    style={staggerRows ? { '--pme-i': index } : undefined}
                    className={`border-b border-slate-100 last:border-0 ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${onRowClick && !extra ? 'hover:bg-slate-50' : ''} ${extra} ${
                      staggerRows ? 'animate-row-in' : ''
                    }`}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={`py-2.5 pr-3 ${column.className ?? ''}`}>
                        {/* The fallback is the whole point: a column is allowed to be
                            just a field and a className, and must not need a render
                            function to be spelled out. */}
                        {column.render ? column.render(row) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && onOffsetChange && (
        <div className="no-print mt-4 flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            Showing {showing}–{last} of {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
              className="rounded-btn border border-slate-300 px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={last >= total}
              onClick={() => onOffsetChange(offset + pageSize)}
              className="rounded-btn border border-slate-300 px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
