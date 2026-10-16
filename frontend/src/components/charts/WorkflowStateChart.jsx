/**
 * "By workflow state" — an animated donut, with a legend that is also the
 * control for drilling into a state.
 *
 * A DONUT rather than a filled pie chart, and the hole is not decoration: the
 * total sits in it, which is the one number a pie chart otherwise cannot show.
 * With the total in the middle each slice's share is legible as an angle AND as a
 * fraction of something the reader already has, and the legend carries the exact
 * figures for anyone who wants to read rather than estimate.
 *
 * FIVE slices is near the upper limit of what a pie chart reads well. It is the
 * number of workflow states, so the alternative is a chart that hides the least
 * interesting state — and a distribution whose fifth slice is dropped is not the
 * distribution.
 *
 * Every slice carries `paddingAngle`, so adjacent slices are separated by a gap
 * of the card's own background rather than by a stroke. That is what makes the
 * whole chart read as one object at a glance.
 *
 * Clicking a slice, or its legend row, reports the state. Both are `<button>`s:
 * the slice because the chart library renders it as an SVG path, which needs
 * `tabIndex` and a key handler to be reachable at all, and the legend row because
 * a 4px slice is a worse click target than a line of text.
 */
import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';

import { useLanguage } from '../../context/LanguageContext.jsx';
import {
  CHART_ANIMATION,
  STATE_COLOURS,
  UNKNOWN_STATE_COLOUR,
  share,
  tooltipStyle,
} from './chartTheme.js';

export function WorkflowStateChart({ byStatus, onSelect }) {
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(null);

  // Ordered by the workflow, not by size. The reader is looking at where the
  // FILES are in the process, and a pie sorted by count would reorder the
  // workflow on every refresh — the same state landing in a different slot as
  // another state grows, which is the sort of change that makes a chart impossible
  // to compare against the last time it was looked at.
  const safeByStatus = byStatus || {};
  const rows = Object.keys(safeByStatus).map((state) => ({
    state,
    label: t(`status.${state}`),
    count: safeByStatus[state],
    colour: STATE_COLOURS[state] ?? UNKNOWN_STATE_COLOUR,
  }));

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  /**
   * The hovered slice grows, the rest recede.
   *
   * Handled by a custom `activeShape` rather than by dimming the other slices'
   * opacity, because opacity on a `<Cell>` also fades its label and its border and
   * the chart ends up looking broken rather than focused. Growing the active
   * sector leaves the others untouched, so the comparison the reader was making
   * is still there afterwards.
   */
  function renderActive(props) {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{ filter: 'drop-shadow(0 6px 14px rgb(0 0 0 / 0.55))', outline: 'none' }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-56 w-56 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            {/* A slice thicker than the eye can judge: `outerRadius` 88% with a
                62% hole leaves a 23px ring, which stays readable at any panel
                width the grid gives this column. */}
            <Pie
              data={rows}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={rows.length > 1 ? 2 : 0}
              cornerRadius={4}
              stroke="none"
              animationDuration={CHART_ANIMATION.animationDuration}
              animationBegin={CHART_ANIMATION.animationBegin}
              activeIndex={hovered}
              activeShape={renderActive}
            >
              {rows.map((row) => (
                <Cell
                  key={row.state}
                  fill={row.colour}
                  className="cursor-pointer outline-none"
                  tabIndex={0}
                  role="button"
                  aria-label={`${row.label}: ${row.count}`}
                  onMouseEnter={() => setHovered(rows.indexOf(row))}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(rows.indexOf(row))}
                  onBlur={() => setHovered(null)}
                  onClick={() => onSelect(row.state)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(row.state);
                    }
                  }}
                />
              ))}
            </Pie>

            <Tooltip
              {...tooltipStyle()}
              formatter={(value) => [`${value} (${share(value, total)}%)`, 'Letters']}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* The hole. An absolutely-positioned div rather than a recharts `<Label>`
            because the text must sit still while the rings animate underneath
            it, and a Label is re-positioned on every animation frame. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl leading-none font-semibold text-ink tabular-nums">
            {total.toLocaleString()}
          </span>
          <span className="mt-1 text-[11px] tracking-wide text-slate-500 uppercase">
            Letters
          </span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-1">
        {rows.map((row) => (
          <li key={row.state}>
            <button
              type="button"
              onClick={() => onSelect(row.state)}
              onMouseEnter={() => setHovered(rows.indexOf(row))}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(rows.indexOf(row))}
              onBlur={() => setHovered(null)}
              aria-label={`Show the ${row.count} letters in "${row.label}"`}
              className={`flex w-full items-center gap-3 rounded-btn border px-2.5 py-2 text-left transition ${
                hovered === rows.indexOf(row)
                  ? 'border-brand-200 bg-brand-50'
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full transition-transform"
                style={{
                  background: row.colour,
                  transform: hovered === rows.indexOf(row) ? 'scale(1.25)' : 'none',
                }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{row.label}</span>
              <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">
                {row.count}
              </span>
              <span className="w-10 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                {share(row.count, total)}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
