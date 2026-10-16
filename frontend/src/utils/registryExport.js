/**
 * Exporting the Letter Registry.
 *
 * Two artefacts leave this screen, and both carry the SAME column set on
 * purpose: what is printed must be what the clerk is looking at, or the printout
 * and the screen disagree about the letter and neither can be trusted. The
 * column list therefore lives here once and is read by both the CSV writer and
 * the print-only table.
 *
 * The CSV is UTF-8 with a byte-order mark. Letters are filed in Sinhala and
 * Tamil as often as in English, and without the BOM Excel reads the file as
 * CP1252 and renders every Sinhala subject as mojibake - the export "works" and
 * the file is useless, which is the worst outcome because nothing reports it.
 */
import { formatDate, isoToday } from './dateUtils.js';

/**
 * The registry columns, in screen order: day stamp, reference, subject, sender,
 * state, priority, category, officer, received date.
 *
 * `header` is an i18n key rather than a string so the printout follows the
 * language the reader chose. `value(row)` never throws on a missing field - a
 * blank cell is a blank cell, not a crashed export.
 */
export const REGISTRY_COLUMNS = [
  { key: 'day_stamp_no', header: 'print.dayStamp', value: (row) => row.day_stamp_no ?? '' },
  { key: 'letter_ref_no', header: 'print.reference', value: (row) => row.letter_ref_no ?? '' },
  { key: 'subject', header: 'print.subject', value: (row) => row.subject ?? '' },
  { key: 'sender_name', header: 'mail.sender', value: (row) => row.sender_name ?? '' },
  { key: 'status', header: 'common.status', value: (row) => row.status ?? '' },
  { key: 'priority', header: 'common.priority', value: (row) => row.priority ?? '' },
  { key: 'category', header: 'mail.category', value: (row) => row.category ?? '' },
  { key: 'assigned_officer_id', header: 'mail.assignedOfficer', value: (row) => row.assigned_officer?.full_name ?? '' },
  { key: 'receipt_date', header: 'mail.received', value: (row) => formatDate(row.receipt_date) },
];

/** One CSV field. A field containing a comma, quote or newline is quoted, and an inner quote is doubled (RFC 4180). */
function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The registry as CSV text, translated with `t`.
 *
 * CRLF line endings, because RFC 4180 asks for them and Excel on Windows is the
 * reader this is written for. The BOM is prepended so Excel decodes the Sinhala
 * and Tamil correctly.
 */
export function registryCsv(rows, t, { bom = true } = {}) {
  const lines = [
    REGISTRY_COLUMNS.map((column) => t(column.header)),
    ...rows.map((row) => REGISTRY_COLUMNS.map((column) => column.value(row))),
  ];
  const text = lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n');
  return bom ? `\uFEFF${text}` : text;
}

/** `letter-registry-2026-09-19.csv`, dated so two exports never collide. */
export function registryFilename(extension) {
  return `letter-registry-${isoToday()}.${extension}`;
}

/**
 * Hand text to the browser as a download.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * it in the same synchronous block can cancel the download in some browsers
 * before it has read the blob. One frame is enough.
 */
export function downloadTextFile(filename, text, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
