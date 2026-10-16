/**
 * The 404.
 *
 * Outside the authenticated shell, which is the one deliberate thing here: an
 * unauthenticated visitor to a bad URL is shown the login page rather than a 403
 * that would confirm the route exists and is guarded. Telling an anonymous
 * visitor which paths are real is a small disclosure, and there is nothing to
 * gain by making it.
 *
 * The signed-in shell's own catch-all does not exist for the same reason: inside
 * the shell a user who mistypes a URL should see the frame they are used to, with
 * the message inside it, rather than being thrown back to a login they did not
 * need.
 */
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';
import { Card } from '../components/common/Card.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function NotFoundPage() {
  const { t } = useLanguage();
  const { session, loading } = useAuth();
  const { pathname } = useLocation();

  // Same two-step rule as RequireAuth: on a reload the session is present before
  // the permission list has arrived, so redirecting on `!session` alone would
  // flash the login page for a user who is already signed in.
  if (loading) return null;

  if (!session?.token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <Card title={t('notFound.signIn')}>
          <p className="text-sm text-slate-600">
            {t('notFound.body')}
          </p>
          <Link
            to="/login"
            className="mt-4 inline-block rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Sign in
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card title={t('notFound.title')}>
        <p className="text-sm text-slate-600">
          {t('notFound.nothingAt', { pathname })}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/"
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {t('notFound.dashboard')}
          </Link>
          <Link
            to="/mail"
            className="rounded-btn border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-brand hover:text-white"
          >
            {t('notFound.registry')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
