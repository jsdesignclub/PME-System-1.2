/**
 * Keeps a render error inside the page that caused it.
 *
 * ============================================================================
 * WHY THIS EXISTS, AND WHY IT IS NOT AT THE ROOT
 * ============================================================================
 *
 * This app had no error boundary until a missing `render` on one `DataTable`
 * column in `UsersTab` produced `TypeError: column.render is not a function`.
 * With no boundary above it, React unmounts the whole tree on an uncaught render
 * error — so a defect scoped to ONE TABLE CELL took down the header, the sidebar
 * and the sign-out button with it. The user's report was "/admin is blank", and
 * the actual blast radius was "the entire application, with no way out of it
 * except the browser's back button".
 *
 * That second half is why this is mounted around `<Outlet />` inside `Layout`
 * rather than around `<Routes>` in App.jsx. A boundary at the root would also
 * catch the error and would still be an improvement, but it would replace the
 * shell along with the page — producing the exact trap App.jsx already names
 * when it puts `/forbidden` inside the authenticated area: "a 403 with no way to
 * sign out is a trap". Here the header and sidebar survive, so a user who lands
 * on a broken page can navigate elsewhere or sign out normally.
 *
 * ============================================================================
 * WHY THE ERROR IS RESET ON NAVIGATION
 * ============================================================================
 *
 * The obvious implementation — catch once, hold the error — leaves the user
 * stuck. They click a link to a working page and the boundary keeps rendering
 * its fallback, because the error is still in state and nothing changed it. The
 * page they wanted never appears, and the fallback's own wording ("this page
 * could not be displayed") stops being true the moment they navigate away.
 *
 * React offers no hook equivalent of `getDerivedStateFromError`, so this cannot
 * be `useEffect` plus a flag. `RouteBoundary` below remounts the class on every
 * pathname change via `key`, which resets the error without a subscription and
 * without the boundary having to know anything about the router.
 *
 * ============================================================================
 * THE RAW MESSAGE IS SHOWN DELIBERATELY
 * ============================================================================
 *
 * `error.message` is rendered verbatim rather than replaced with a friendly
 * sentence. This is an internal, support-driven system: the person hitting the
 * boundary cannot fix it, so their only route to resolution is telling someone
 * what happened, and "an unexpected error occurred" is not something anyone can
 * act on. The tradeoff is that an error message can describe internals — the
 * trade is taken knowingly, because a diagnosis nobody can transmit is worth
 * less than the detail it costs.
 *
 * `componentDidCatch` re-logs to the console regardless of what the fallback
 * renders. A boundary that renders a message but silences the console trades a
 * blank screen for a silent one, which is strictly harder to diagnose — and the
 * evidence is the same object either way.
 */
import { Component } from 'react';
import { useLocation } from 'react-router-dom';

class PageBoundary extends Component {
  state = { error: null };

  /**
   * React hands the thrown value here on its way down; storing it is what makes
   * `render` take the fallback path on the same pass.
   */
  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Deliberately unconditional. The fallback shows the message to the user;
    // this keeps it in the console for whoever is debugging, with the component
    // stack that says WHICH page threw.
    console.error('[pme] unhandled render error:', error, info?.componentStack);
  }

  /** Re-render the children as if nothing happened. */
  retry = () => this.setState({ error: null });

  /**
   * Last resort for an error that is deterministic — a missing property throws
   * every time. Remounting resets module state and any half-applied local
   * storage, which a plain retry cannot.
   */
  reload = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-[55vh] items-start justify-center py-8"
      >
        <div className="w-full max-w-xl">
          <div className="rounded-btn border border-red-200 bg-red-50 px-4 py-4">
            <h2 className="text-sm font-semibold text-red-900">
              This page could not be displayed
            </h2>

            <p className="mt-2 text-sm text-red-800">{error.message}</p>

            <p className="mt-2 text-xs text-red-700">
              The rest of the application is still usable — the menu on the left still
              works. If this keeps happening, send the message above to support.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={this.retry}
                className="rounded-btn border border-red-300 bg-surface px-3 py-1.5 text-xs font-medium text-red-800 transition hover:bg-red-100"
              >
                Try again
              </button>

              <button
                type="button"
                onClick={this.reload}
                className="rounded-btn border border-red-300 bg-surface px-3 py-1.5 text-xs font-medium text-red-800 transition hover:bg-red-100"
              >
                Reload the page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

/**
 * The router-aware wrapper. See the note on resetting above — the `key` is the
 * whole mechanism, so it must not be simplified away.
 */
export function RouteBoundary({ children }) {
  const { pathname } = useLocation();

  return <PageBoundary key={pathname}>{children}</PageBoundary>;
}