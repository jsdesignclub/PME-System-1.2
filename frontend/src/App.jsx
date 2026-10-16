/**
 * Routing, and the two gates in front of it.
 *
 * Providers live here rather than in main.jsx because `<AuthProvider>` must be
 * INSIDE `<BrowserRouter>`: `RequireAuth` and `RequirePermission` both read from
 * `useAuth()` and redirect with `<Navigate>`, and `useNavigate` throws outside a
 * router. Mounting auth in main.jsx and the router in App.jsx is the arrangement
 * that makes one of them wrong, and the failure is a blank screen with a console
 * error rather than anything a test would describe.
 *
 * MailProvider is nested inside AuthProvider for the same reason one level down:
 * it reads the session to decide whether to prefetch anything.
 */
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { MailProvider } from './context/MailContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { useAuth } from './hooks/useAuth.js';
import { Layout } from './components/common/Layout.jsx';
import { Spinner } from './components/common/Spinner.jsx';
import { ToastProvider } from './components/common/Toast.jsx';
import { ADMIN_ROLES } from './utils/permissions.js';
import AdminPage from './pages/AdminPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ForbiddenPage from './pages/ForbiddenPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MailDetailPage from './pages/MailDetailPage.jsx';
import MailRegistryPage from './pages/MailRegistryPage.jsx';
import NewMailPage from './pages/NewMailPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import OfficerPage from './pages/OfficerPage.jsx';

/**
 * Gate for the signed-in area.
 *
 * `loading` is checked BEFORE the redirect on purpose. On a hard refresh the
 * session is read from localStorage but the permission list is not yet known;
 * redirecting during that window would bounce a signed-in user to /login and
 * then straight back, which on a slow connection looks like a failed login.
 */
function RequireAuth() {
  const { session, loading } = useAuth();

  if (loading) return <Spinner label="Restoring your session" />;
  if (!session?.token) return <Navigate to="/login" replace />;
  return <Layout />;
}

/**
 * What the administration area needs, and how it can be satisfied.
 *
 * `ADMIN_AREA_PERMISSION` is a named constant rather than a literal in the check
 * because the same string has to appear in the 403 message, and two literals is
 * how a refusal message starts telling people the wrong reason. It is named once
 * here and referenced by both.
 */
const ADMIN_AREA_PERMISSION = 'UPDATE_DUTY_CHART';

/**
 * The ways in, as ALTERNATIVES, because that is what they are.
 *
 * A holder of either one gets through. Listing them as a conjunction — "for
 * ADMIN" *and* "requires UPDATE_DUTY_CHART" — describes an area nobody with a
 * single credential could open, and tells a refused Administrative Officer that only
 * the administrator gets in, when a subject clerk demonstrably does too.
 *
 * This is also the only writer of `/forbidden`'s router state, so the gate and the
 * message it produces cannot drift apart: the page renders this array rather than
 * naming the requirements itself.
 */
const ADMIN_AREA_ALTERNATIVES = Object.freeze([
  Object.freeze({ kind: 'role', value: ADMIN_ROLES }),
  Object.freeze({ kind: 'permission', value: ADMIN_AREA_PERMISSION }),
]);

/**
 * Gate for the administration surface.
 *
 * Not `RequirePermission`, and not `RequireRole` alone. The admin area holds four
 * tabs with two different authorities behind them (D73):
 *
 *   - Users, Departments, Audit are guarded server-side by `requireAdmin`, which
 *     checks the `role` column. `MANAGE_USERS` and friends are NOT permissions in
 *     this system, so `hasPermission('MANAGE_USERS')` is false for every user
 *     including the administrator. Gating on those names would hide Administration
 *     from the one role that owns it, with nothing to indicate why.
 *
 *   - Duty Charts is writable by any holder of `ADMIN_AREA_PERMISSION`, which is a
 *     real permission and is granted to `SUBJECT_CLERK` as well as `ADMIN`. A
 *     subject clerk who cannot reach the page cannot maintain the duty chart the
 *     matcher runs on (D68), so the route must admit them.
 *
 * So the route admits EITHER an admin role OR the duty-chart permission, and the
 * page decides per tab: `AdminPage` hides the admin-only tabs from a non-admin
 * rather than rendering a tab that would 403 on every request. A user with neither
 * lands on /forbidden, which is told the alternatives rather than being told only
 * about the role.
 *
 * A convenience guard, not the control. `requireAdmin` and the duty permission
 * checks in the controllers are.
 */
function RequireAdminArea({ children }) {
  const { user, permissions, loading } = useAuth();

  if (loading) return <Spinner label="Restoring your session" />;

  const permitted =
    ADMIN_ROLES.includes(user?.role) || permissions.includes(ADMIN_AREA_PERMISSION);

  if (!permitted) {
    return <Navigate to="/forbidden" replace state={{ alternatives: ADMIN_AREA_ALTERNATIVES }} />;
  }

  return children;
}

export default function App() {
  return (
    // BASE_URL mirrors Vite's `base`: "/" locally, "/PME-System-1.2/" on
    // GitHub Pages, so client-side routes survive the sub-path.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      {/* LanguageProvider is OUTSIDE AuthProvider on purpose: the sign-in page
          is translated too, and it must render before a session exists. */}
      <LanguageProvider>
        <AuthProvider>
          {/* Inside AuthProvider because the feed is scoped to the signed-in
              user, and above the router because the bell lives in the shell that
              every route renders inside. */}
          <NotificationProvider>
            <ToastProvider>
              <MailProvider>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />

                  <Route element={<RequireAuth />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/mail" element={<MailRegistryPage />} />
                    <Route path="/mail/new" element={<NewMailPage />} />
                    {/* After `/mail/new`, so "new" is never read as an id. */}
                    <Route path="/mail/:id" element={<MailDetailPage />} />
                    <Route path="/officers" element={<OfficerPage />} />
                    <Route path="/officers/:id" element={<OfficerPage />} />

                    <Route
                      path="/admin"
                      element={
                        <RequireAdminArea>
                          <AdminPage />
                        </RequireAdminArea>
                      }
                    />

                    {/* Inside the authenticated shell, so the header and sidebar are
                        present: a 403 with no way to sign out is a trap. */}
                    <Route path="/forbidden" element={<ForbiddenPage />} />
                  </Route>

                  {/* Outside it, deliberately. An unauthenticated visitor to a bad
                      URL gets the login page rather than a 403 that reveals the
                      route exists and is guarded. */}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </MailProvider>
            </ToastProvider>
          </NotificationProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
