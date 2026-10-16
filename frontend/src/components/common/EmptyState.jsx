/**
 * "Nothing here yet", with the reason.
 *
 * The second argument is the part that matters. An empty registry means four
 * different things to four users — a clerk who has just logged in has an empty
 * *their* registry, an officer has an empty *assignment* queue, and an
 * executive filtering on a state nobody holds has an empty *result*. A single
 * "No letters" line makes all four look like a broken query, and the empty
 * registry is the one case where the correct next action differs most.
 */
export function EmptyState({ title, children, action }) {
  return (
    <div className="rounded-btn border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
