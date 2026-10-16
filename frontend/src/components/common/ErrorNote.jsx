/**
 * An inline error block.
 *
 * `role="alert"` so a screen reader announces a failure that appears after the
 * user pressed a button — an error that is visible but silent is not reported to
 * the person who needs it.
 *
 * Renders the SERVER's own message verbatim, and offers a Refresh only when the
 * failure is retryable (D62). A 403 is not retryable: the server will refuse
 * again, and a "Try again" button on a refusal teaches the user that the
 * controls on this screen are unreliable.
 */
export function ErrorNote({ children, remedy, onRetry, retryLabel = 'Refresh' }) {
  if (!children) return null;

  return (
    <div
      role="alert"
      className="rounded-btn border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      <p>{children}</p>
      {remedy && <p className="mt-1 text-xs text-red-700">{remedy}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-btn border border-red-300 bg-surface px-2.5 py-1 text-xs font-medium text-red-800 transition hover:bg-red-100"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
