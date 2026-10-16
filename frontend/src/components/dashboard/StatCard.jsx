/**
 * One KPI tile on the ministry dashboard: an icon, a figure, and the label that
 * says what the figure is of.
 *
 * Every tile is a `<button>`. That is the whole reason this component exists as
 * separate from the section that lays four of them out: a figure an executive
 * cannot act on is decoration, and the four figures here — everything on record,
 * what is still open, what is finished, what is late — are the four questions a
 * dashboard gets opened to answer. Clicking one opens the letters behind it.
 *
 * The figure COUNTS UP rather than appearing. A number that animates from zero
 * to its value is the cheapest possible way to make a dashboard feel considered,
 * and it is also honest: the count is arriving from the server at the same time
 * as the tile, so a count-up is the page catching up with the request rather than
 * a number performing. It is skipped entirely under `prefers-reduced-motion`.
 *
 * `--pme-i` is not used here even though the tiles stagger — a `style` prop and
 * the CSS animation's own `both` fill is enough, and the tiles are few enough
 * that a shared delay keeps them arriving together rather than one at a time.
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

/** How long the count takes. Long enough to register, short enough not to wait. */
const COUNT_MS = 900;

export function StatCard({ icon: Icon, label, value, hint, tone = 'brand', delay = 0, onClick }) {
  const shown = useCountUp(value, delay);

  // `alert` only paints red when there IS something overdue. A red tile reading
  // "0" is a permanent alarm that has been going off since the registry was
  // empty, and a permanently alarming dashboard is a dashboard nobody reads.
  const alerting = tone === 'alert' && value > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${value}. Show these letters.`}
      style={{ animationDelay: `${delay}ms` }}
      className={`group animate-rise-in relative overflow-hidden rounded-card border bg-surface p-5 text-left shadow-card transition duration-200 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none ${
        alerting
          ? 'border-critical/30 hover:-translate-y-0.5 hover:border-critical/60 hover:shadow-pop'
          : 'border-slate-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop'
      }`}
    >
      {/* A wash of the tile's own colour, wiped in from the left on hover. It is a
          pseudo-element rather than a background transition because the card has
          to keep its own background for the border and shadow to read; the wash
          sits over it. On the dark canvas this is what gives the tile its hover
          without a second surface colour to keep in step. */}
      <span
        aria-hidden="true"
        className={`absolute inset-0 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${
          alerting ? 'bg-red-50/70' : 'bg-brand-50/70'
        }`}
      />

      <span className="relative flex items-start justify-between gap-3">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-btn transition-transform duration-200 group-hover:scale-105 ${
            alerting
              ? 'bg-critical/15 text-critical ring-critical/25 ring-1 ring-inset'
              : 'bg-brand/15 text-brand-400 ring-brand/25 ring-1 ring-inset'
          }`}
        >
          <Icon size={20} strokeWidth={2} aria-hidden="true" />
        </span>

        {/* The affordance. Hidden until hover because a chevron on all four tiles
            at rest is four arrows pointing at nothing in particular. */}
        <ArrowUpRight
          size={16}
          aria-hidden="true"
          className={`shrink-0 -translate-y-0.5 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 ${
            alerting ? 'text-critical' : 'text-brand-400'
          }`}
        />
      </span>

      <span className="relative mt-4 block font-mono text-4xl leading-none font-semibold tabular-nums text-ink">
        {shown.toLocaleString()}
      </span>

      <span className="relative mt-2 block text-[0.7rem] font-medium tracking-[0.12em] text-slate-500 uppercase">
        {label}
      </span>

      {hint && (
        <span className="relative mt-1.5 block text-xs text-slate-400">{hint}</span>
      )}
    </button>
  );
}

/**
 * Animate from zero to `value`.
 *
 * The animation starts `delay` ms late because the tiles are handed to the same
 * `delay` for their entrance: the number must not be counting while its tile is
 * still off-screen.
 *
 * `requestAnimationFrame` rather than a CSS transition, because a number is not a
 * property CSS can interpolate — there is no way to say "animate this text from 0
 * to 412" without writing the intermediate values yourself.
 *
 * Under `prefers-reduced-motion` the final value is returned on the first render
 * and the effect never runs, so the number is correct immediately rather than
 * being counted up and then snapped. `matchMedia` is read inside the effect
 * rather than at module scope so a user who changes the setting while the page
 * is open is honoured on the next figure.
 */
function useCountUp(value, delay = 0) {
  const [shown, setShown] = useState(() => (reduceMotion() ? value : 0));

  // The animation's own frame handle, kept so it can be cancelled. Without it the
  // rAF keeps running after the tile unmounts — on sign-out, or on a drill-down
  // that re-renders the section — and every one of those callbacks then calls
  // `setShown` on a component that is gone.
  const frame = useRef(null);

  const target = Number(value) || 0;

  useEffect(() => {
    if (reduceMotion()) {
      setShown(target);
      return undefined;
    }

    let start = null;

    function step(now) {
      if (start === null) start = now;
      const elapsed = now - start - delay;

      // Still waiting out the tile's own entrance delay.
      if (elapsed < 0) {
        frame.current = requestAnimationFrame(step);
        return;
      }

      const progress = Math.min(1, elapsed / COUNT_MS);
      // easeOutCubic: fast off the line, settling onto the value. Linear counting
      // spends most of its time in the low hundreds and arrives abruptly, which
      // is why a linear counter reads as a loading bar rather than as a number.
      const eased = 1 - (1 - progress) ** 3;

      setShown(Math.round(target * eased));

      if (progress < 1) frame.current = requestAnimationFrame(step);
    }

    frame.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame.current);
  }, [target, delay]);

  return shown;
}

function reduceMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
