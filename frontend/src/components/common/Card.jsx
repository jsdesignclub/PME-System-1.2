/**
 * A titled section surface.
 *
 * The `action` slot exists so a card's header can carry a control without the
 * card growing a second API for "something on the right" — which is how a
 * layout prop ends up holding a button on one screen and a link on another.
 *
 * `subtitle` is a status line under the title, and it is separate from `action`
 * for a reason the registry demonstrates: "filters applied, press Apply to
 * update" is something the user must READ, while "Showing 1–25 of 340" is
 * something they must be able to find. Overloading one slot with both puts them
 * in a competition for the same corner of the header.
 */
export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`rounded-card border border-slate-300 bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <header className="no-print flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
