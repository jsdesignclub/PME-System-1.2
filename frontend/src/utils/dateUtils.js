/**
 * Dates, as this ministry writes them.
 *
 * D74 — a fixed format, and never a bare `toLocaleDateString()`. Two reasons,
 * and the second is the one that bites.
 *
 * 1. A bare `toLocaleDateString()` renders differently for a clerk in Colombo
 *    and an administrator reading the same record over a remote session, so a
 *    printed minute slip is not the document the office filed. Explicit `en-GB`
 *    with `day/month/year` pins the shape.
 *
 * 2. `receipt_date` is a CALENDAR DATE, not an instant. It arrives as
 *    `2026-09-19T00:00:00.000Z`, and rendered in a timezone west of Greenwich
 *    that is the 18th — so a letter filed on the 19th is stamped the 18th, and
 *    nothing on screen says whether the date column or the filter is lying. Every
 *    calendar-date formatter here is pinned to UTC for that reason.
 *
 * `formatDateTime` is the exception: an audit timestamp IS an instant, and it is
 * shown in the reader's own timezone because "when was this saved" is a question
 * about a moment, not a calendar day.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** `2026-09-19` → `19 Sep 2026`. Unparseable input is returned as given. */
export function formatDate(value) {
  if (!value) return '—';

  // A bare `YYYY-MM-DD` is parsed as UTC midnight explicitly. `new Date('2026-09-19')`
  // is already UTC, but `new Date('2026-09-19T10:00:00')` is NOT, and mixing the
  // two means half the dates in a column shift by a day depending on which
  // endpoint supplied them.
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `2026-09-19T14:05:00Z` → `19 Sep 2026, 14:05`, in the reader's own time. */
export function formatDateTime(value) {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

/** Today as `YYYY-MM-DD`, for `<input type="date">` bounds. */
export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` for a date `years` ago — the lower bound on a receipt date. */
export function isoYearsAgo(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

/**
 * A calendar date `days` later, returned as `YYYY-MM-DD`.
 *
 * Done in UTC for the same reason the formatters are (D74): `receipt_date` is a
 * calendar date, and adding days in local time would shift the result by one for
 * readers west of Greenwich. Returns null when the input cannot be read, so a
 * caller can skip a deadline rather than render an invalid one.
 */
export function addDays(value, days) {
  if (!value || days == null) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

/** A file size, in the unit a reader would use to judge whether to open it. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
