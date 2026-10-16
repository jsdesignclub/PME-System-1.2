/**
 * The loading placeholder for a route or a panel.
 *
 * Text, not a spinner graphic, and the reason given here is now out of date:
 * `lucide-react` IS a dependency (the sidebar uses it). The reason this stayed
 * text is the one the sentence was reaching for — a loading state that animates
 * is a loading state that cannot be read by someone using a screen reader to
 * follow progress, and `aria-busy` plus a label says the same thing without the
 * motion. `SkeletonRow` covers the cases where a shape is genuinely wanted.
 *
 * The label is required in practice — a bare "Loading…" on a screen with three of
 * them tells the user nothing about which one is arriving.
 */
export function Spinner({ label = 'Loading' }) {
  return (
    <p aria-busy="true" className="py-10 text-center text-sm text-slate-500">
      {label}…
    </p>
  );
}
