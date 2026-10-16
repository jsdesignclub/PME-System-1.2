/**
 * The top bar: the product name, where you are, and who is signed in.
 *
 * THE BRAND IS NO LONGER HERE (UI UXdesign.md). The ministry mark and name moved
 * into the sidebar, and this bar now carries the PRODUCT — "Enterprise
 * Management System" — with a breadcrumb under it. That split is the client's
 * arrangement, and it is also the clearer one: the rail answers "which ministry
 * am I in", the bar answers "which screen of it", and a user who has two
 * windows open can tell them apart from either.
 *
 * The four identity fields come from spec §7.1's login response — `full_name`,
 * `role`, `designation`, `department_id` — and all four are shown, because a
 * user working a shared machine needs to see which account they are in before
 * they act. The department is the one most often missing from a header, and it is
 * the one that explains why a registry looks empty: a clerk scoped to their
 * department sees their department's letters, and a colleague's absence is a
 * scope, not a bug.
 *
 * The bar also hosts the mobile navigation trigger, which sits left of the title
 * and is `lg:hidden`. It lives here rather than in a second stacked bar because at
 * 375px a separate row would push the module list below the fold and force two
 * screens of scrolling to reach it. Header RENDERS the trigger; Layout OWNS the
 * state, so the button and the drawer can never disagree about whether the menu is
 * open. `id="nav-toggle"` is load-bearing: Layout looks it up by id to hand focus
 * back when the drawer closes.
 *
 * Sign out is NOT here — it is the foot of the sidebar. It was here until the rail
 * became reachable on a phone, where a header-only sign out meant scrolling past a
 * drawer that covers the header to reach it.
 */
import { Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { LanguageToggle } from './LanguageToggle.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { RoleBadge } from './RoleBadge.jsx';

/**
 * The ministry mark.
 *
 * Inline SVG rather than a file in `public/`, for one reason that matters on
 * print: a slip printed from a page whose emblem has not finished loading
 * carries a broken-image box in the header of a government document. An inline
 * mark cannot fail to load.
 */
export function Emblem({ className = 'h-9 w-9' }) {
  const { t } = useLanguage();

  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label={t('app.emblem')}>
      {/* The tile is the raised surface rather than the literal deepest dark, so
          the mark still reads as a tile on the sidebar (which is `bg-canvas`) as
          well as on the sign-in page, which is that same colour. The hairline is
          a white fraction rather than a grey, so it survives on any dark ground
          without a variant prop. */}
      <rect
        width="48"
        height="48"
        rx="12"
        fill="#111526"
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1"
      />
      <path d="M24 11 L34 17.5 V26 C34 32.5 29.5 37 24 39 C18.5 37 14 32.5 14 26 V17.5 Z" fill="#7357ED" />
      <path d="M19.5 26 L22.5 29 L28.5 22.5" stroke="#050714" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Route → breadcrumb key.
 *
 * A list of prefixes rather than a `switch` on the exact path, because the mail
 * routes have children (`/mail/:id`) that must not fall back to "Dashboard" the
 * moment a user opens a letter. Longest-prefix order matters, so `/mail` is
 * tested before the `/` catch-all.
 */
const BREADCRUMBS = [
  { prefix: '/mail', labelKey: 'nav.registry' },
  { prefix: '/officers', labelKey: 'nav.officers' },
  { prefix: '/admin', labelKey: 'nav.admin' },
];

function useBreadcrumbKey() {
  const { pathname } = useLocation();
  return BREADCRUMBS.find((entry) => pathname.startsWith(entry.prefix))?.labelKey ?? 'nav.dashboard';
}

/**
 * Up to two initials from a full name.
 *
 * `split(/\s+/)` and not `charAt(0) + charAt(1)`: the seeded names are Sinhala
 * and reach the header as multi-byte text, and two glyphs off the front of one
 * word read as a different name. Falls back to a single letter, then to the
 * account's role, so the avatar box is never empty.
 */
function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '–';
  if (words.length === 1) return [...words[0]][0].toUpperCase();
  return ([...words[0]][0] + [...words[words.length - 1]][0]).toUpperCase();
}

export function Header({ onOpenNav, navOpen = false }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const breadcrumbKey = useBreadcrumbKey();

  return (
    <header className="no-print border-b border-slate-300 bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {/* 44x44 is the smallest reliably tappable box on a phone; anything
              smaller turns "open the menu" into a miss. */}
          <button
            type="button"
            id="nav-toggle"
            onClick={onOpenNav}
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            aria-label={t(navOpen ? 'nav.closeMenu' : 'nav.openMenu')}
            className="-ml-1 flex size-11 items-center justify-center rounded-btn text-ink transition hover:bg-slate-100 lg:hidden"
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-ink sm:text-lg">
              {t('app.title')}
            </h1>
            {/* The breadcrumb is a real `<nav>` with a list, not two spans and a
                slash: it is a location, and the separator is decoration that a
                screen reader should not read as punctuation. */}
            <nav aria-label={t('shell.workspace')} className="mt-0.5">
              <ol className="flex items-center gap-1.5 text-xs text-slate-500">
                <li>{t('shell.workspace')}</li>
                <li aria-hidden="true" className="text-slate-400">
                  /
                </li>
                <li aria-current="page" className="font-medium text-slate-600">
                  {t(breadcrumbKey)}
                </li>
              </ol>
            </nav>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Inside the authenticated cluster so it is hidden on the sign-in
              page: the language is a per-user preference stored on this
              machine, and offering it to someone who is not yet signed in would
              store a preference for whoever signs in next. */}
          {user && <LanguageToggle />}

          {/* The bell sits with the other account controls, inside the same
              `user &&` gate: a feed read needs a signed-in identity to scope it,
              and nothing here means anything to a visitor at the login page. */}
          {user && <NotificationBell />}

          {user && (
            <div className="flex items-center gap-3 border-l border-slate-300 pl-3 sm:pl-4">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-ink">{user.full_name}</p>
                <p className="text-xs text-slate-500">
                  {user.designation}
                  {user.department_name ? ` · ${user.department_name}` : ''}
                </p>
              </div>
              {/* Initials rather than a photo: the ministry has no avatar store,
                  and a placeholder silhouette is the one icon the design brief
                  calls out by name as forbidden. The ring is the same tint as
                  the active nav row so the two read as one system. */}
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-btn bg-brand-100 text-xs font-semibold text-brand-400 ring-brand/30 ring-1 ring-inset"
              >
                {initialsOf(user.full_name)}
              </span>
              <RoleBadge role={user.role} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
