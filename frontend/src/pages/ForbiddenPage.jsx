/**
 * The 403, inside the authenticated shell.
 *
 * Rendered as a real page rather than a toast or a redirect, for two reasons.
 * A redirect to `/` loses the user's place and hides why they were stopped; a
 * toast disappears before it is read. And the message names the requirement,
 * because "you do not have access" with no further detail sends an administrator
 * to the server logs to work out which of a dozen permissions was missing.
 *
 * The refusal reason travels in ROUTER STATE, not as a prop, and it travels as a
 * LIST of alternatives rather than a single reason — see `AdminAreaAccess` in
 * App.jsx for why the administration area's two credentials are alternatives and
 * not a conjunction. Reading them as a list is also what stops this page from
 * having to know what any given area requires: it renders what the gate said it
 * requires, so a new area cannot leave a stale requirement behind here.
 */
import { Link, useLocation } from 'react-router-dom';

import { Card } from '../components/common/Card.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { ADMIN_ROLES } from '../utils/permissions.js';

export default function ForbiddenPage() {
  const { t } = useLanguage();
  const { state } = useLocation();

  // `alternatives` is the current shape. `role` / `permission` are the older
  // single-reason fields, still honoured so a gate that refuses on one ground
  // alone needs no ceremony to be described.
  const alternatives = state?.alternatives ?? [
    ...(state?.permission ? [{ kind: 'permission', value: state.permission }] : []),
    ...(state?.role ? [{ kind: 'role', value: ADMIN_ROLES }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <Card title={t('forbidden.title')}>
         <p className="text-sm text-slate-700">
           {t('forbidden.body')}
          {/* The sentence names the CONSTRAINT rather than the user's role:
              "you are an OFFICER" is not why they were stopped, and stating it
              invites a reading that the problem is who they are. */}
               {alternatives.length > 0 && (
             <>
               {' '}
               {t('forbidden.requires', { kind: alternatives[0]?.kind, value: alternatives[0]?.value })}
             </>
           )}
        </p>

        {/* The registry, not the dashboard: whatever the user was reaching for is
            most often a letter, and a 403 that leaves them on an unrelated page
            reads as the system being broken. */}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/mail"
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {t('forbidden.goToRegistry')}
          </Link>
          <Link
            to="/"
            className="rounded-btn border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-brand hover:text-white"
          >
            {t('forbidden.goToDashboard')}
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          {t('forbidden.footer')}
        </p>
      </Card>
    </div>
  );
}
