/**
 * The signed-in shell: brand bar, module switcher, routed content.
 *
 * Split from App.jsx because the shell is a layout concern and the route table
 * is a routing concern. App.jsx decides WHO may reach a route; this decides what
 * the frame looks like once they have.
 *
 * Two details that are easy to get wrong and are load-bearing:
 *
 *  - The chrome is `no-print` (Header.jsx and Sidebar.jsx both carry it) and the
 *    routed content is NOT, so `@media print` yields the minute slip and nothing
 *    else. Hiding the shell at print time is what makes D67's promise — that the
 *    browser dialog produces the slip — actually true.
 *
 *  - `<Outlet />` and nothing else. A layout that also fetched data would re-fetch
 *    on every navigation, and the registry's filters live in MailContext, not here.
 *
 *  - It OWNS BOTH pieces of navigation chrome state — the desktop rail's collapsed
 *    flag and the mobile drawer's open flag — rather than Sidebar owning them. Both
 *    outlive the Sidebar in different ways: the collapsed flag has to be persisted
 *    and read back on mount, and the drawer has to be openable from a button that
 *    lives in the Header. A context provider would be the answer if a THIRD
 *    component needed either flag — nothing does, so props are the smaller answer.
 *
 * ============================================================================
 * THE DRAWER, AND THE FOUR THINGS THAT HAVE TO BE TRUE FOR IT
 * ============================================================================
 *
 * Below `lg` the sidebar is a fixed drawer that slides in from the left. It was
 * previously not rendered at all below `lg`, which left a phone with no way to
 * reach any module — see the note on the breakpoint in Sidebar.jsx.
 *
 * A slide-in menu needs more than a translate class to be usable, and each of the
 * following is easy to skip and hard to notice until it is missing:
 *
 *   1. ESCAPE MUST CLOSE IT. A drawer that dismisses only by tapping the backdrop
 *      strands anyone who opened it with the keyboard, on a screen reader most of
 *      all. `role="dialog"` is NOT used here: this is navigation, not a modal
 *      dialog, and announcing it as one would suppress the rest of the page behind
 *      it. The drawer traps nothing and the page stays reachable underneath.
 *   2. THE CLOSED DRAWER MUST LEAVE THE TAB ORDER. It is translated off-screen, not
 *      `display:none`, because `display:none` cannot be transitioned — so its links
 *      would stay focusable and keyboard users would tab into a menu they cannot
 *      see. `inert` removes them from the tab order without killing the animation.
 *      `inert` is applied only below `lg`, because at `lg` the same element is the
 *      visible rail and must stay reachable.
 *   3. THE PAGE BEHIND MUST NOT SCROLL UNDER IT. Dragging a drawer open should not
 *      reveal content moving beneath it.
 *   4. FOCUS MUST GO SOMEONE'S SOMEWHERE. Into the drawer on open, and back to the
 *      button that opened it on close — otherwise focus falls to `body` and a
 *      keyboard user has to re-tab the entire header to continue.
 *
 * The state also closes on navigation, because leaving the drawer open over the
 * page the user just chose hides the thing they navigated to look at.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';
import { RouteBoundary } from './ErrorBoundary.jsx';

/** Matches Tailwind's `lg`. Duplicated as a literal because Tailwind cannot read
 *  this value, and a mismatch between the two would mean the drawer `inert` state
 *  and the CSS breakpoint disagreeing about whether the menu is visible. */
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Whether the viewport is at least `lg`.
 *
 * Needed for `inert` alone, because `inert` is an attribute rather than a style
 * and so cannot be scoped to a breakpoint in CSS. The sidebar's own layout stays
 * entirely in CSS; only this one question crosses into JavaScript.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`. The hand-rolled
 * version needs a re-sync inside the effect, because a viewport change landing
 * between the first render and the listener being attached is an event nobody
 * will ever deliver. That re-sync is a `setState` synchronously inside an effect,
 * which triggers a second render and trips `react(set-state-in-effect)` — a
 * correct warning about a race the hook is built specifically to not have.
 * `useSyncExternalStore` re-reads the snapshot after subscribing, so it closes
 * that window without a re-render.
 */
function useDesktopViewport() {
  return useSyncExternalStore(
    // Subscribed fresh on every commit is harmless: `matchMedia` objects are
    // cheap and the returned teardown removes the listener each time.
    (onChange) => {
      const list = window.matchMedia(DESKTOP_QUERY);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
  );
}

/**
 * Whether the sidebar starts collapsed.
 *
 * `localStorage` rather than nothing: the collapsed rail is a preference about how
 * this person likes to work, and a preference that resets on every refresh gets
 * abandoned. Read defensively — a browser with storage disabled (private mode,
 * a locked-down policy) throws on ACCESS, and an exception in a `useState`
 * initialiser unmounts the whole app rather than degrading to "expanded".
 */
function readCollapsed() {
  try {
    return window.localStorage.getItem('pme.sidebar.collapsed') === '1';
  } catch {
    return false;
  }
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const isDesktop = useDesktopViewport();
  const panelRef = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    try {
      window.localStorage.setItem('pme.sidebar.collapsed', collapsed ? '1' : '0');
    } catch {
      // Non-fatal by design: the toggle still works for this session, it just
      // will not be remembered. Nothing here is worth breaking the shell over.
    }
  }, [collapsed]);

  // Wrapped so Sidebar does not need to know the setter is also a persister.
  const toggleCollapsed = useCallback(() => setCollapsed((was) => !was), []);

  /**
   * The route the drawer was opened ON, not a boolean.
   *
   * Storing the pathname makes "close on navigation" fall out of render for free:
   * `navOpen` is true only while `navOpenAt` still equals the current route, so any
   * route change closes the drawer with no effect watching `pathname` at all. It
   * also covers browser Back and Forward, which a `NavLink` `onClick` cannot — a
   * link is never clicked on the way back.
   *
   * The obvious `useEffect(() => setNavOpen(false), [pathname])` is a
   * `setState` synchronously inside an effect, which `react(set-state-in-effect)`
   * flags and which costs a second render on every single navigation. This costs
   * nothing.
   */
  const [navOpenAt, setNavOpenAt] = useState(null);
  const navOpen = navOpenAt === pathname;

  const openNav = useCallback(() => setNavOpenAt(pathname), [pathname]);

  /** Close, deliberately WITHOUT moving focus. Used when a nav link was chosen:
   *  the route change has already put the user on the page they asked for, and
   *  yanking focus back to a header button would undo that.
   */
  const closeNav = useCallback(() => setNavOpenAt(null), []);

  /**
   * Close AND return focus to the trigger that opened it.
   *
   * For dismissals rather than navigation — Escape, the backdrop, the drawer's own
   * close button. In each of those the user changed their mind and went nowhere,
   * so leaving focus where it was would drop it on `body` and force a keyboard
   * user to re-tab the whole header to continue.
   */
  const dismissNav = useCallback(() => {
    setNavOpenAt(null);
    document.getElementById('nav-toggle')?.focus();
  }, []);

  // (1) Escape, and (4) focus into the drawer when it opens.
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') dismissNav();
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navOpen, dismissNav]);

  // (3) Hold the page still while the drawer is up.
  useEffect(() => {
    if (!navOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <Header onOpenNav={openNav} navOpen={navOpen} />

      <div className="flex flex-1">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          navOpen={navOpen}
          onNavigate={closeNav}
          onDismiss={dismissNav}
          panelRef={panelRef}
          // (2) Off-screen must mean out of the tab order. Suppressed at `lg`,
          // where this same element is the visible rail.
          inert={!isDesktop && !navOpen}
        />

        {/* Behind the drawer. `lg:hidden` so it can never dim a desktop page, and
            `aria-hidden` because it conveys nothing to a screen reader — Escape
            and the in-drawer close button are the accessible dismissals. The fade
            matches the panel's 300ms slide (`pme-fade-in` in index.css) so the two
            arrive as one movement. */}
        {navOpen && (
          <div
            aria-hidden="true"
            onClick={dismissNav}
            className="no-print fixed inset-0 z-40 animate-[pme-fade-in_300ms_ease-out] bg-black/60 lg:hidden"
          />
        )}

        <main className="min-w-0 flex-1 p-6">
          {/* Around the outlet, not around <Routes>. A page that throws is
              replaced by a readable fallback while the header, sidebar and
              sign-out stay alive — an error boundary at the root would take
              those with it and leave no way out. */}
          <RouteBoundary>
            <Outlet />
          </RouteBoundary>
        </main>
      </div>
    </div>
  );
}

export default Layout;
