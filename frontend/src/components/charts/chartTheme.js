/**
 * Chart colour and chrome, in one place.
 *
 * The hex values here are the SAME ones `@theme` in index.css declares as
 * `brand-*` / `slate-*`. They are repeated rather than referenced because SVG
 * `fill`/`stroke` attributes cannot take a Tailwind class, and a chart library
 * wants a colour string, not a class name. So the duplication is real and it has
 * to be a deliberate one: every value below names the token it came from, and a
 * palette change is an edit in two files rather than one. That is the price of
 * SVG, and it was cheaper than the alternatives — a CSS custom property read at
 * mount time (`getComputedStyle`) would work but couples these components to the
 * theme being loaded before they render, which is a class of bug no amount of
 * commenting makes worth accepting.
 *
 * What is NOT duplicated is the mapping from a letter's state or priority to a
 * colour. `StatusBadge` and `PriorityBadge` own that, and these two tables agree
 * with them on purpose: a donut slice and the badge on the same letter's row
 * being different colours would tell the user two different stories about one
 * letter.
 */

/**
 * The workflow states, in workflow order.
 *
 * Taken from `STATES` in MailContext rather than restated, and the colours are
 * keyed by the same strings. A new state added to the workflow therefore lands
 * on `undefined` here and is drawn in the fallback grey below — visible enough
 * that the gap is obvious in review, quiet enough not to crash the page, which
 * is the same trade `StatusBadge`'s `UNKNOWN_STATUS_CLASS` makes.
 */
export const STATE_COLOURS = Object.freeze({
  Logged: '#7c869c', // slate-500 — nothing has happened to it yet
  'Forwarded to AO': '#4f8cff', // info blue — in transit, upstream
  'Forwarded to Subject': '#a98af7', // purple-600 — in transit, to the subject clerk
  Assigned: '#7357ED', // the accent — someone owns it
  'In Progress': '#f6b94c', // warning amber — the state that needs a person
  'Pending Approval': '#9161f2', // purple-500 — waiting on a signature
  Completed: '#39d6a3', // success green — the destination
});

/** Drawn for a state the database has and this build does not. Amber, like the badges. */
export const UNKNOWN_STATE_COLOUR = '#f6b94c';

/** Matches `PRIORITY_CLASS` in PriorityBadge: Normal grey, Urgent red, Confidential purple. */
export const PRIORITY_COLOURS = Object.freeze({
  Normal: '#7c869c', // slate-500
  Urgent: '#ff6375', // critical
  Confidential: '#a98af7', // purple-600
});

/**
 * Sender types get the accent ramp, lightest first.
 *
 * A single-hue ramp rather than four hues: sender type is an ATTRIBUTE of a
 * letter, not a severity. Four different colours would imply a ranking between
 * "Judicial / Court" and "Government Office" that does not exist, and the eye
 * reads the most saturated slice as the most urgent one. Steps are ordered so
 * the largest bar is the brightest, which is the one ordering that stays true
 * when the data changes.
 */
export const SENDER_TYPE_COLOURS = Object.freeze([
  '#7357ED', // the accent
  '#8b73f3', // brand-400
  '#a98af7', // brand-500 lighter
  '#c1a8fa', // brand-700 on the dark ramp
]);

/** Ink for axis labels and a soft rule for the gridlines. The page's own two neutrals. */
export const AXIS_INK = '#7c869c'; // slate-500
export const GRID_INK = '#232a47'; // slate-300

/**
 * Axis and grid props shared by every cartesian chart here.
 *
 * Only HORIZONTAL gridlines. A vertical gridline on a category axis crosses every
 * bar and line to mark a position that the label underneath already names, so it
 * is noise at best and a bar-splitting rule at worst.
 *
 * `tickLine={false}` and `axisLine={false}` because the card's own border is the
 * axis: drawing a second rule 2px away from it reads as a rendering fault.
 */
export const AXIS_PROPS = Object.freeze({
  tick: { fill: AXIS_INK, fontSize: 12 },
  tickLine: false,
  axisLine: false,
});

/**
 * The chart tooltip, styled to match `Card`.
 *
 * `cursor` is set per chart because a bar chart wants a block behind the pointer
 * and a line chart wants a vertical rule — recharts passes the hovered axis
 * value through, so the caller chooses.
 */
export function tooltipStyle() {
  return {
    contentStyle: {
      background: '#111526',
      border: '1px solid #232a47',
      borderRadius: 8,
      boxShadow: '0 16px 40px rgb(0 0 0 / 0.55)',
      fontSize: 12,
      padding: '6px 10px',
      color: '#f3f5fb',
    },
    labelStyle: { color: '#e4e8f2', fontWeight: 600, marginBottom: 2 },
    itemStyle: { color: '#c3cadb', padding: 0 },
  };
}

/**
 * A percentage for a legend or a tooltip, from counts.
 *
 * `total || 1` rather than a guard clause: with zero letters every share is 0%,
 * which is the truthful answer, and a `<0/0>` avoided by dividing by one is
 * arithmetically wrong but renders the right character. Returning `0` early
 * would be the same output with more lines.
 */
export function share(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

/**
 * Recharts animation, tuned.
 *
 * `begin` is set to 0 rather than left at the library default, and the duration
 * dropped to 700ms from the default 1500ms: the dashboard is not a presentation,
 * and a chart that is still sweeping when the numbers beside it have finished
 * counting makes the whole page feel slow. 700ms is long enough to read as
 * deliberate and short enough not to be waited on.
 *
 * `isAnimationActive` is written out on every chart that uses it rather than
 * taken from a shared constant, because the value is the thing a reader will want
 * to change and one readable occurrence beats one indirection.
 */
export const CHART_ANIMATION = Object.freeze({ isAnimationActive: true, animationBegin: 0, animationDuration: 700 });
