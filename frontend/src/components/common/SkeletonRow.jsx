/**
 * Placeholder rows for a loading table.
 *
 * The height is the point. A table that renders nothing and then snaps to 25
 * rows moves everything below it by several hundred pixels a second after the
 * user clicks, which loses the row they were reading. These match the real
 * row height and count so the layout does not shift when the data arrives.
 *
 * `aria-hidden` because this is decoration: a screen reader should hear "loading"
 * once, from the table's own busy state, rather than six empty rows.
 */
export function SkeletonRow({ columns = 6, rows = 5, height = 'h-8' }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex} aria-hidden="true" className="border-b border-slate-100 last:border-0">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <td key={columnIndex} className="py-2.5 pr-3">
              <div
                className={`animate-pulse rounded bg-slate-200 ${height}`}
                // The first column is wider in the real table, so the shimmer
                // matches the shape the eye is about to see.
                style={{ width: columnIndex === 0 ? '70%' : '85%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
