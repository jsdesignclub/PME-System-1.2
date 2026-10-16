/**
 * "By priority" — three rounded bars, one per rung of the ladder.
 *
 * A BAR chart, where this was previously a smoothed area chart. Both read the
 * same three counts, but the design the client signed off draws the comparison
 * as LENGTH, and length is the honest encoding for three discrete categories
 * that do not sit on a continuum: an area chart draws a slope between "Normal"
 * and "Confidential" as if the registry passed through the values in between,
 * and there is no letter between them. The bar also survives being reduced to a
 * very small panel, where three dots on a spline stop being legible.
 *
 * `radius` on the top corners and `maxBarSize` rather than a full-width bar: a
 * category axis with three entries would otherwise draw three slabs, and the
 * rounded cap is what keeps a 30px bar from reading as a progress meter.
 *
 * The gradient runs from the priority's own colour down to a transparent stop of
 * the same hue, so the bar carries its colour at the top — where the eye lands —
 * without a hard fill edge along the baseline.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useLanguage } from '../../context/LanguageContext.jsx';
import {
  AXIS_PROPS,
  CHART_ANIMATION,
  GRID_INK,
  PRIORITY_COLOURS,
  share,
  tooltipStyle,
} from './chartTheme.js';

/**
 * Priority order is the registry's own, from `PRIORITIES`, and not the object's
 * key order and not a sort by size. A chart whose bars move as the data grows
 * cannot be compared with the last time it was looked at, and a priority is a
 * fixed ladder whether or not this month has any letters on it.
 */
const ORDER = ['Normal', 'Urgent', 'Confidential'];

export function PriorityChart({ byPriority, onSelect }) {
  const { t } = useLanguage();

  const safeByPriority = byPriority || {};

  const total = ORDER.reduce((sum, key) => sum + (safeByPriority[key] ?? 0), 0);

  const rows = ORDER.filter((key) => Object.hasOwn(safeByPriority, key)).map((key) => ({
    priority: key,
    label: t(`priority.${key}`),
    count: safeByPriority[key] ?? 0,
    colour: PRIORITY_COLOURS[key],
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={230}>
        <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: -16 }} barCategoryGap="28%">
          <defs>
            {rows.map((row) => (
              <linearGradient key={row.priority} id={`pme-priority-${row.priority}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={row.colour} stopOpacity={0.95} />
                <stop offset="100%" stopColor={row.colour} stopOpacity={0.45} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke={GRID_INK} strokeDasharray="3 3" vertical={false} />

          <XAxis dataKey="label" {...AXIS_PROPS} dy={6} />
          <YAxis {...AXIS_PROPS} width={48} allowDecimals={false} />

          <Tooltip
            {...tooltipStyle()}
            cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
            /* `item` is recharts' payload wrapper, so the original row — and with
               it the untranslated priority — is `item.payload`. The `?? name`
               fallback is what keeps the tooltip readable if a future version
               hands over a flatter shape: a missing name is cosmetic, and a thrown
               TypeError inside a tooltip takes the whole chart down with it. */
            formatter={(value, name, item) => [
              `${value} (${share(value, total)}%)`,
              item?.payload?.priority ?? name,
            ]}
          />

          <Bar
            dataKey="count"
            maxBarSize={46}
            radius={[6, 6, 0, 0]}
            className="cursor-pointer"
            {...CHART_ANIMATION}
          >
            {rows.map((row) => (
              <Cell
                key={row.priority}
                fill={`url(#pme-priority-${row.priority})`}
                stroke={row.colour}
                strokeWidth={1}
                className="cursor-pointer outline-none"
                tabIndex={0}
                role="button"
                aria-label={`Show the ${row.count} ${row.label} letters`}
                onClick={() => onSelect(row.priority)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row.priority);
                  }
                }}
              />
            ))}

            {/* The count sits above each bar rather than on an axis, so the value
                is read at the bar it belongs to. */}
            <LabelList
              dataKey="count"
              position="top"
              offset={8}
              className="fill-ink text-xs font-semibold"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/*
        The legend is real controls, not a colour key. A priority is one of the
        three things a clerk most often needs to pull — "show me the urgent
        letters" — and a legend that only explains the colours makes the reader
        aim at the chart itself and hope. Each row carries its own count, so the
        chart can stay uncluttered.
      */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {rows.map((row) => (
          <li key={row.priority}>
            <button
              type="button"
              onClick={() => onSelect(row.priority)}
              aria-label={`Show the ${row.count} ${row.label} letters`}
              className="group flex w-full items-center gap-2.5 rounded-btn border border-transparent px-2.5 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: row.colour }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700 group-hover:text-ink">
                {row.label}
              </span>
              <span className="text-sm font-semibold text-ink tabular-nums">{row.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
