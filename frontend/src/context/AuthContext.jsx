import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../api/supabaseClient.js';
import * as authApi from '../api/authApi.js';
import { normaliseError } from '../api/axiosClient.js';
import { ADMIN_ROLES } from '../utils/permissions.js';

export const AuthContext = createContext(null);

/**
 * Does this error mean the session is actually gone, or just that we could not
 * ask the server right now?
 *
 * Only a genuine auth rejection should end the session. A transport failure — the
 * Wi-Fi is not up yet when a minimized tab is restored, a VPN is reconnecting —
 * must leave the cached session in place, or the user is forced to sign in again
 * every time they come back to the tab.
 */
function isAuthRejection(error) {
  const kind = normaliseError(error).kind;
  return kind === 'unauthenticated' || kind === 'forbidden';
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const stored = localStorage.getItem('pme.session');
    return stored ? JSON.parse(stored) : null;
  });
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(Boolean(session?.token));

  const signOut = useCallback(() => {
    authApi.logout().catch(() => {});
    localStorage.removeItem('pme.session');
    setSession(null);
    setPermissions([]);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        // Supabase only hands us id/email on a token refresh. Keep the profile
        // fields we already fetched (name, role, department...) or a refresh —
        // which fires whenever the user returns to the tab — would blank the
        // header and the permissions until the next successful `me()` call.
        const stored = localStorage.getItem('pme.session');
        const previous = stored ? JSON.parse(stored) : null;
        const user =
          previous?.user?.id === session.user.id
            ? { ...previous.user, id: session.user.id, email: session.user.email }
            : { id: session.user.id, email: session.user.email };
        const next = {
          token: session.access_token,
          refresh_token: session.refresh_token,
          user,
        };
        localStorage.setItem('pme.session', JSON.stringify(next));
        setSession(next);
      } else {
        localStorage.removeItem('pme.session');
        setSession(null);
        setPermissions([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    setLoading(true);

    authApi
      .me()
      .then((user) => {
        if (cancelled) return;
        if (!user) {
          signOut();
          return;
        }
        const next = { ...session, user };
        localStorage.setItem('pme.session', JSON.stringify(next));
        setSession(next);
      })
      .catch((error) => {
        // Transient: keep the cached session so a backgrounded tab that wakes up
        // before the network is ready does not force a fresh sign-in.
        if (!cancelled && isAuthRejection(error)) signOut();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [session?.token, signOut]);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    setLoading(true);

    authApi
      .permissions()
      .then((granted) => {
        if (cancelled) return;
        if (!granted) {
          signOut();
          return;
        }
        setPermissions(granted);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isAuthRejection(error)) {
          signOut();
          return;
        }
        // Transient failure: permissions are a pure function of the cached role,
        // so the UI can keep working instead of dumping the user at the login page.
        setPermissions(authApi.rolePermissions(session?.user?.role));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [session?.token, signOut]);

  useEffect(() => {
    window.addEventListener('pme:signed-out', signOut);
    return () => window.removeEventListener('pme:signed-out', signOut);
  }, [signOut]);

  const signIn = useCallback(async (nic, password) => {
    const data = await authApi.login(nic, password);
    const next = {
      token: data.token,
      refresh_token: data.refresh_token,
      user: data.user,
    };
    localStorage.setItem('pme.session', JSON.stringify(next));
    setSession(next);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      permissions,
      loading,
      signIn,
      signOut,
      hasPermission: (permission) => permissions.includes(permission),
      hasAny: (wanted) => wanted.some((permission) => permissions.includes(permission)),
      canCreateMail: permissions.includes('CREATE_MAIL'),
      isAdmin: ADMIN_ROLES.includes(session?.user?.role),
    }),
    [session, permissions, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
