/**
 * The module switcher.
 *
 * Mail is live; Vehicles, Staff Transfers and Inventory render DISABLED with
 * their phase number and no link. Parent plan §8 forbids starting those modules
 * before Phase 3 is accepted, and a dead link that 404s is worse than an honest
 * disabled item — a user who clicks it and lands on "not found" concludes the
 * system is broken, where a disabled item reads as "not yet".
 *
 * The disabled items are still LISTED (Q22 answered 2026-09-30). A sidebar
 * containing only what works reads as "this is all there is", which is a
 * different and wrong message for a ministry that knows four modules are coming.
 *
 * Items are filtered by whatever the server enforces behind them — PERMISSION for
 * the mail routes (D25), and for the admin surface a MIX: `requireAdmin` for the
 * Users/Departments/Audit tabs, which is a check on the role column, and
 * `UPDATE_DUTY_CHART` for Duty Charts, which is a real permission (D73).
 *
 * That mix is why Administration is not simply `isAdmin`: a `SUBJECT_CLERK` can
 * maintain the duty chart the D68 matcher runs on and would find nothing here if
 * the item were hidden from them. `MANAGE_USERS` is still not a permission in this
 * system and no test may ask for it — see `utils/permissions.js`.
 *
 * ============================================================================
 * THE BRAND BLOCK MOVED HERE FROM THE HEADER (UI UXdesign.md)
 * ============================================================================
 *
 * The identity a user sees first is now the rail's own — the ministry mark, the
 * ministry and the province — and the header carries the PRODUCT name plus a
 * breadcrumb instead. That is the arrangement in the client's design: the rail
 * says which ministry you are in, the bar says which screen of it you are on.
 *
 * `app.ministry` is a single string ("Ministry of Sport, Uva Province") and is
 * split at the first comma for the two-line lockup. A translation without a
 * comma renders as one line rather than dropping the second half — the split is
 * a presentation choice, so it must never be able to lose content.
 *
 * ============================================================================
 * COLLAPSING, AND WHY THE ICONS ARE NOT DECORATION
 * ============================================================================
 *
 * The rail collapses to icons, and the icons are what makes that safe rather than
 * a regression. A label-only sidebar collapsed to a narrow strip has to hide the
 * label, and a nav item with no visible text is a row of anonymous glyphs: five
 * boxes stacked vertically where a user has to hover each one to learn what it
 * does. With an icon per item, the collapsed rail still reads as four destinations
 * because the icons differ in silhouette, which is the thing the eye actually
 * uses to find a target.
 *
 * So the icon carries the identity and the label carries the precision, and both
 * survive: the collapsed rail keeps `aria-label` on every link (so the accessible
 * name never depends on the glyph) plus a `title` for the pointer. The `title` is
 * not the only affordance — it is a supplement to an already-named control, not a
 * substitute, which is why removing hover still leaves a screen reader and the
 * keyboard fully informed.
 *
 * `lucide-react` is named in package.json and was already installed but unused;
 * this is what it was put there for. An icon library is the right answer at five
 * items and stays the right answer as the ministry adds three more modules, which
 * the disabled list above says is the plan. The icons are outline-style and
 * 1.75px-stroke to match the hand-rolled glyphs already in the codebase
 * (`EyeIcon` in LoginPage.jsx, the `Tick` list that used to sit on the sign-in
 * page) so the shell does not look like two sets of artwork.
 *
 * ============================================================================
 * ONE COMPONENT, TWO LAYOUTS
 * ============================================================================
 *
 * Below `lg` this used to not render at all — `hidden lg:block` on the wrapper —
 * which left a phone with no navigation whatsoever. It is now one element that is
 * a fixed drawer below `lg` and a static rail at `lg` and above, rather than two
 * elements switched by breakpoint. Two elements would duplicate the DOM ids
 * (`sidebar-modules`), duplicate the icon tree, and — worse — leave both mounted
 * so the off-screen copy stayed in the tab order.
 *
 * Every width and offset decision here is CSS, not JS. In particular the labels
 * are NOT gated on `collapsed` alone: they get `lg:hidden` when collapsed, which
 * keeps them visible in the drawer. Gating on `collapsed` in JS would show an
 * icon-only drawer on a phone for anyone who had collapsed the rail on a desktop
 * first, which is the same missing-name bug in a different costume.
 *
 * Because the drawer is translated rather than `display:none`, its links are still
 * focusable while it is closed. Layout marks it `inert` below `lg` when shut, so
 * it drops out of the tab order without needing a `display` flip that would kill
 * the slide animation.
 */
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  Boxes,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Truck,
  Users,
  X,
} from 'lucide-react';

import { useAuth } from '../../hooks/useAuth.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { ADMIN_ROLES } from '../../utils/permissions.js';
import { Emblem } from './Header.jsx';

/**
 * The live routes, each with the permission that reveals it.
 *
 * `labelKey` is a translation KEY, not the English text. These arrays are
 * module-level constants, so they cannot call `t()` — and storing the English
 * string here instead would make it a label no language can change. The key is
 * resolved once at render, below.
 */
const LIVE_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', end: true, permission: null, icon: LayoutDashboard },
  { to: '/mail', labelKey: 'nav.registry', permission: null, icon: Inbox },
  { to: '/officers', labelKey: 'nav.officers', permission: null, icon: Users },
  // Either authority admits the page; `AdminPage` then hides the tabs the visitor
  // would get a 403 on. See the note in App.jsx's RequireAdminArea.
  { to: '/admin', labelKey: 'nav.admin', adminArea: true, icon: ShieldCheck },
];

/**
 * Modules 2-4. Rendered, never linked.
 *
 * The phase numbers are the roadmap's: Vehicles is 6, Staff Transfers 7,
 * Inventory 8 (parent plan §6-8). Spec §9.2's comment calls Module 3 "HR",
 * which the roadmap and every other document call Staff Transfers; the roadmap's
 * name is used, and §3.6 records the discrepancy rather than leaving a reader to
 * find it.
 */
const FUTURE_ITEMS = [
  { labelKey: 'nav.vehicles', phase: 6, icon: Truck },
  { labelKey: 'nav.transfers', phase: 7, icon: ArrowLeftRight },
  { labelKey: 'nav.inventory', phase: 8, icon: Boxes },
];

/** One size for every glyph, so a 20px icon does not sit next to a 16px one. */
const ICON_SIZE = 'size-5 shrink-0';

/**
 * "Ministry of Sport, Uva Province" → the two-line lockup the design asks for.
 *
 * Split at the FIRST comma only, so a name with more than one keeps the rest
 * together on the second line. No comma at all returns the whole string as the
 * first line and an empty second, which the caller renders as nothing — the
 * alternative, slicing on a guess, would silently lose half a ministry's name.
 */
function splitMinistry(name) {
  const at = name.indexOf(',');
  if (at === -1) return { line1: name, line2: '' };
  return { line1: name.slice(0, at).trim(), line2: name.slice(at + 1).trim() };
}

export function Sidebar({
  collapsed = false,
  onToggleCollapsed,
  navOpen = false,
  onNavigate,
  onDismiss,
  panelRef,
  id = 'app-sidebar',
}) {
  const { hasPermission, user, signOut } = useAuth();
  const { t } = useLanguage();
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const navigate = useNavigate();

  const { line1: ministryLine1, line2: ministryLine2 } = splitMinistry(t('app.ministry'));

  /** Labels collapse away at `lg` and above only, so the drawer never loses them. */
  const hideWhenCollapsed = collapsed ? 'lg:hidden' : '';

  const items = LIVE_ITEMS.filter((item) => {
    if (item.adminArea) return isAdmin || hasPermission('UPDATE_DUTY_CHART');
    return !item.permission || hasPermission(item.permission);
  });

  return (
    <nav
      ref={panelRef}
      id={id}
      aria-label={t('nav.modules')}
      // Focusable programmatically only, so Layout can move focus into the drawer
      // when it opens. Without it `focus()` is a no-op on a container with no
      // tabindex, and focus would silently stay on the page behind.
      tabIndex={-1}
      // `translate`, NOT `transform`. Tailwind v4 moved `translate-x-*` off the
      // `transform` property and onto the standalone `translate` property —
      // `.translate-x-0` compiles to `translate: var(--tw-translate-x) ...`. So a
      // `transition-transform` (or `transition-[width,transform]`) declares a
      // transition on a property that never changes, the browser has nothing to
      // interpolate, and the drawer simply appears. Naming `translate` explicitly
      // is the fix; `width` stays in the list because the desktop rail collapses.
      //
      // The `lg:` widths below are a TERNARY, not an unconditional `lg:w-64` plus a
      // conditional `lg:w-20`. Both had shipped at once, and they have identical
      // specificity, so the winner was whichever Tailwind happened to emit first in
      // the stylesheet — meaning the collapse button did nothing at all. Class
      // attribute order is irrelevant to CSS precedence; emission order decides.
      // Emitting exactly one makes the question disappear.
      className={`no-print flex flex-col overflow-y-auto border-r border-slate-300 bg-canvas py-4 transition-[width,translate] duration-300 ease-out ${
        navOpen ? 'translate-x-0' : '-translate-x-full'
      } fixed inset-y-0 left-0 z-50 w-64 shadow-pop lg:static lg:z-auto lg:translate-x-0 lg:shadow-none ${
        collapsed ? 'lg:w-20' : 'lg:w-64'
      }`}
    >
      {/* --- Brand ----------------------------------------------------------
          The ministry, not the product. `Emblem` is the same component the
          header and the sign-in page draw, imported rather than re-made: three
          hand-kept copies of a government mark are three chances to ship
          different ones. */}
      <div
        className={`flex items-center gap-3 px-4 pb-4 ${
          collapsed ? 'lg:justify-center lg:px-0' : ''
        }`}
      >
        <Emblem className="size-9 shrink-0" />
        <div className={`min-w-0 ${hideWhenCollapsed}`}>
          <p className="truncate text-sm leading-tight font-semibold text-ink">
            {ministryLine1}
          </p>
          {ministryLine2 && (
            <p className="truncate text-[0.68rem] font-medium tracking-[0.12em] text-slate-500 uppercase">
              {ministryLine2}
            </p>
          )}
        </div>
      </div>

      {/* --- Rail controls --------------------------------------------------
          Both live in one row so the rail never grows a second control after
          the brand. Collapse is a desktop affordance — the drawer has a whole
          screen to spend on labels, so there is nothing to reclaim by hiding
          them — and the close control is the opposite, drawer-only. */}
      <div className="flex items-center gap-1 px-3 pb-4">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="sidebar-modules"
          aria-label={t(collapsed ? 'nav.expand' : 'nav.collapse')}
          title={t(collapsed ? 'nav.expand' : 'nav.collapse')}
          // Matching the links' own `px-3` makes the glyph line up with the items
          // below it for the reason they line up, not by coincidence.
          className={`hidden rounded-btn py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-200 hover:text-ink lg:flex ${
            collapsed ? 'w-full justify-center px-0' : 'flex-1 items-center gap-2 px-3'
          }`}
        >
          {collapsed ? (
            <ChevronsRight className={ICON_SIZE} aria-hidden="true" />
          ) : (
            <>
              <ChevronsLeft className={ICON_SIZE} aria-hidden="true" />
              <span>{t('nav.collapse')}</span>
            </>
          )}
        </button>

        {/* Drawer-only. Dismissing by tapping the close control is not optional
            on a phone: a drawer that covers most of the viewport and only closes
            on a backdrop tap outside it strands anyone who opened it by keyboard. */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('nav.closeMenu')}
          title={t('nav.closeMenu')}
          className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-btn text-slate-500 transition hover:bg-slate-200 hover:text-ink lg:hidden"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <p
        className={`px-4 pb-2 text-[0.65rem] font-semibold tracking-[0.16em] text-slate-500 uppercase ${hideWhenCollapsed}`}
      >
        {t('nav.modules')}
      </p>

      <ul id="sidebar-modules" className="space-y-1 px-3">
        {items.map((item) => {
          const label = t(item.labelKey);

          return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              // A navigation closes the drawer: leaving it open over the page the
              // user just chose hides the result they navigated to look at. Plain
              // close, not the dismissing close — the focus belongs on the new page.
              onClick={onNavigate}
              // Always set, at every width. The visible label is display, not the
              // name of the control — this is what a screen reader reads when the
              // label is collapsed away.
              aria-label={label}
              title={label}
              className={({ isActive }) =>
                `flex items-center rounded-btn text-sm font-medium transition ${
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? // Tinted rather than filled: on the dark canvas a solid
                      // purple row is the brightest thing on the screen and pulls
                      // the eye off the content it is meant to label. The inset
                      // ring is what keeps it from reading as a hover.
                      'bg-brand/15 text-brand-400 ring-brand/30 ring-1 ring-inset'
                    : 'text-slate-600 hover:bg-slate-200 hover:text-ink'
                }`
              }
            >
              <item.icon className={ICON_SIZE} aria-hidden="true" />
              <span className={`truncate ${hideWhenCollapsed}`}>{label}</span>
            </NavLink>
          </li>
        );
        })}
      </ul>

      <p
        className={`mt-6 px-4 pb-2 text-[0.65rem] font-semibold tracking-[0.16em] text-slate-500 uppercase ${hideWhenCollapsed}`}
      >
        {t('nav.comingLater')}
      </p>

      <ul className="space-y-1 px-3">
        {FUTURE_ITEMS.map((item) => {
          const label = t(item.labelKey);

          return (
          <li key={item.labelKey}>
            {/* Not a button and not a link: `aria-disabled` plus a title, so it
                is skipped by Tab rather than focusable-and-dead. A focusable
                disabled control is a keyboard trap with extra steps. */}
            <span
              aria-disabled="true"
              aria-label={collapsed ? `${label}, ${t('nav.phase')} ${item.phase}` : undefined}
              title={`${label} — ${t('nav.phase')} ${item.phase}`}
              className={`flex items-center rounded-btn text-sm text-slate-400 ${
                collapsed ? 'justify-center px-2 py-2.5' : 'justify-between gap-3 px-3 py-2.5'
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <item.icon className={ICON_SIZE} aria-hidden="true" />
                <span className={`truncate ${hideWhenCollapsed}`}>{label}</span>
              </span>
              <span
                className={`rounded-full bg-slate-200 px-2 py-0.5 text-[0.6rem] font-semibold tracking-wide text-slate-500 ${
                  hideWhenCollapsed
                }`}
              >
                {t('nav.phase')} {item.phase}
              </span>
            </span>
          </li>
        );
        })}
      </ul>

      {/* Footer: the system indicator and sign out, pinned to the bottom.
          `mt-auto` is what pins them: the nav is `flex flex-col`, and it stretches
          to full height in both layouts — `fixed inset-y-0` on mobile, and a
          stretched flex child of the shell's `flex flex-1` row at `lg`. So one
          `mt-auto` serves both without a second breakpoint rule.

          Sign out used to live in the header. It belongs here because the header
          is chrome the drawer cannot reach, and on a phone the rail is the only
          persistent navigation — a sign-out stranded in the header meant
          scrolling back up a page the drawer had just covered.

          Hover goes red rather than brand purple: it is the one
          destructive-adjacent control in the shell, and tinting it the same as
          "Letter Registry" would make it read as navigation. */}
      <div className="mt-auto border-t border-slate-300 px-3 pt-3">
        <p
          className={`flex items-center gap-2 px-2 pb-2 text-[0.68rem] font-medium text-slate-500 ${
            collapsed ? 'lg:justify-center lg:px-0' : ''
          }`}
        >
          {/* A live dot, not a decoration: this is the one place the shell says the
              app is reachable. `motion-reduce:animate-none` because a pulsing
              indicator is exactly the kind of movement the reduced-motion setting
              is asking not to have. */}
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <span className={`truncate ${hideWhenCollapsed}`}>{t('shell.systemOnline')}</span>
        </p>

        <button
          type="button"
          onClick={() => {
            signOut();
            navigate('/login', { replace: true });
          }}
          aria-label={t('nav.signOut')}
          title={t('nav.signOut')}
          className={`mb-1 flex w-full items-center rounded-btn text-sm font-medium text-slate-600 transition hover:bg-red-500/10 hover:text-red-700 ${
            collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          <LogOut className={ICON_SIZE} aria-hidden="true" />
          <span className={`truncate ${hideWhenCollapsed}`}>{t('nav.signOut')}</span>
        </button>
      </div>
    </nav>
  );
}
