/**
 * Printing.
 *
 * One function, wrapping `window.print()`. Spec §9.2's `printUtils.js` is
 * "Trigger native browser print dialogs" and that is the whole of it — no PDF
 * library, because `@media print` and the browser's own dialog produce the same
 * artifact a printer would, and adding `jspdf` to render a slip ourselves would
 * mean reimplementing pagination, font metrics and page breaks to arrive at
 * something worse (D67).
 *
 * The one thing that is NOT trivial is *when* to call it. The slip is always
 * mounted and hidden on screen, so pressing Print never assembles anything and
 * cannot race a render. If instead the component were mounted on demand, the
 * dialog would open against an empty document and the user would get a blank
 * page with no error to explain it — a failure that reproduces on a fast
 * machine and is intermittent on a slow one, which is the worst kind.
 */

/**
 * Open the browser's print dialog.
 *
 * A guard rather than a bare call, because `window.print()` is unavailable in
 * some embedded webviews and in any non-browser test environment, and an
 * uncaught `TypeError` there would take down the page rather than the feature.
 *
 * @returns {boolean} whether the dialog was requested
 */
export function printDocument() {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return false;
  window.print();
  return true;
}
