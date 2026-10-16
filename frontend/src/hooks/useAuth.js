/**
 * Session access, as a hook.
 *
 * Lives apart from `context/AuthContext.jsx` for two reasons. The obvious one is
 * Fast Refresh: a module exporting both a component and a hook is invalidated as
 * a unit on every edit. The better one is that the provider file should have to
 * be opened to understand what `useAuth()` returns, and a hook that re-exports
 * its own context's shape is a second place for that shape to be wrong.
 *
 * That second reason is why the permission helpers are NOT re-derived here. An
 * earlier version of this file exported a separate `useSession()` that added
 * `hasPermission` and `isAdmin` on top of `useAuth()`, and it caused a real
 * failure: `Sidebar.jsx` destructures `hasPermission` from `useAuth()`, which did
 * not provide it, so the sidebar threw on first render and the app was blank. One
 * hook, one shape â€” the helpers are built in AuthContext.jsx.
 *
 * @returns {{
 *   session: object|null,
 *   user: object|null,
 *   permissions: string[],
 *   loading: boolean,
 *   signIn: (nic: string, password: string) => Promise<object>,
 *   signOut: () => void,
 *   hasPermission: (permission: string) => boolean,
 *   hasAny: (permissions: string[]) => boolean,
 *   canCreateMail: boolean,
 *   isAdmin: boolean,
 * }}
 */
import { useContext } from 'react';

import { AuthContext } from '../context/AuthContext.jsx';

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
