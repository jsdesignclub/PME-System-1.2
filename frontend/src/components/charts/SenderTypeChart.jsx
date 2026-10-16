/**
 * "By sender type" — horizontal bars, longest first.
 *
 * Horizontal because the labels are sentences. "Non-Government / Public" and
 * "Judicial / Court" are long, and a vertical bar chart either rotates them or
 * truncates them; laid on their side they read as plain text at full width, with
 * the bar underneath doing the comparing. Four categories against a value axis
 * is also exactly the case where a bar chart beats a pie — the reader is asking
 * "which is biggest", and lengths answer that faster than angles.
 *
 * The value at the end of each bar is a `<LabelList>`, not a second axis. A
 * second y-axis for the same numbers the bars already encode is one more thing to
 * keep in sync, and it draws the reader's eye away from the bar it is describing.
 *
 * Bars are drawn one colour stepped by rank, not one colour per sender type. A
 * sender type is an attribute of a letter and not a severity, so four hues would
 * imply a ranking between "Judicial / Court" and "Government Office" that does
 * not exist — and the eye reads the most saturated colour as the most urgent.
 * A single-hue ramp keeps the one ordering that stays true as the data changes:
 * darkest is biggest.
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

import { AXIS_PROPS, CHART_ANIMATION, GRID_INK, SENDER_TYPE_COLOURS, share, tooltipStyle } from './chartTheme.js';

export function SenderTypeChart({ rows, onSelect }) {
  const safeRows = Array.isArray(rows) ? rows : Object.entries(rows || {}).map(([sender_type, count]) => ({ sender_type, count }));

  const total = safeRows.reduce((sum, row) => sum + row.count, 0);

  // The server already orders by count DESC; re-sorting here would be trusting
  // that less than it deserves, and the order IS the reading of this chart.
  const data = safeRows.map((row, index) => ({
    ...row,
    colour: SENDER_TYPE_COLOURS[index % SENDER_TYPE_COLOURS.length],
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 52)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 4 }} barCategoryGap={14}>
          <CartesianGrid stroke={GRID_INK} strokeDasharray="3 3" horizontal={false} />

          {/* `type="number"` on the value axis is what makes `allowDecimals` mean
              anything: on a category axis it is ignored, and a letter count
              scaling to 1.5 is the kind of axis nobody believes. */}
          <XAxis type="number" {...AXIS_PROPS} allowDecimals={false} />
          <YAxis type="category" dataKey="sender_type" {...AXIS_PROPS} width={168} />

          <Tooltip
            {...tooltipStyle()}
            cursor={{ fill: 'rgb(255 255 255 / 0.04)' }}
            formatter={(value) => [`${value} letters`, 'On record']}
          />

          <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26} {...CHART_ANIMATION}>
            {data.map((row) => (
              <Cell
                key={row.sender_type}
                fill={row.colour}
                className="cursor-pointer outline-none"
                tabIndex={0}
                role="button"
                aria-label={`Show the ${row.count} letters from ${row.sender_type}`}
                onClick={() => onSelect(row.sender_type)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect(row.sender_type);
                  }
                }}
              />
            ))}

            {/* `position="right"` outside the bar rather than `inside`: a count
                inside a short bar is unreadable, and the shortest bar is the
                whole reason the chart exists.

                The share is appended to the count for the same reason it is in
                the tooltip: four bars and no denominator leaves the reader
                dividing 3 by 41 in their head. */}
            <LabelList
              dataKey="count"
              position="right"
              offset={10}
              className="fill-ink text-xs font-semibold"
              formatter={(value) => `${value} · ${share(value, total)}%`}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {total === 0 && (
        <p className="mt-3 text-sm text-slate-500">No letters have been logged yet.</p>
      )}
    </div>
  );
}
