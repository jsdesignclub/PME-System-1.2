import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as notificationApi from '../api/notificationApi.js';
import { useAuth } from '../hooks/useAuth.js';

/**
 * The header bell's feed, shared by the bell button and its panel.
 *
 * A context rather than page state because the badge outlives every page: it is
 * mounted in the shell and must keep its count while the user moves between the
 * dashboard, the registry and a letter.
 *
 * POLLING, NOT REALTIME. A Supabase Realtime channel would push the instant a row
 * lands, but it means a websocket per signed-in tab and a subscription lifecycle
 * to get right; a 60s poll is one cheap count query and is indistinguishable from
 * live for a queue that changes when a colleague presses a button. The one number
 * `unreadCount()` fetches uses `head: true`, so the poll moves no rows.
 *
 * Tied to the session, not the app: signing out clears the feed, and the interval
 * runs only while a user is signed in. That is also what keeps one user's badge
 * from surviving into the next user's session on a shared machine.
 */

const FEED_LIMIT = 20;
const POLL_MS = 60_000;

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  /**
   * Fetch the newest page and the count together.
   *
   * A failed poll is swallowed on purpose: a blip in a background request must
   * not raise a toast over whatever the user is doing, and the next tick retries.
   */
  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setUnread(0);
      return;
    }

    try {
      const [rows, count] = await Promise.all([
        notificationApi.list({ limit: FEED_LIMIT }),
        notificationApi.unreadCount(),
      ]);
      setItems(rows);
      setUnread(count);
    } catch {
      // Transient; the interval will try again.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      // Signed out. Clear the feed so a shared machine cannot show the previous
      // user's notifications to whoever signs in next.
      setItems([]);
      setUnread(0);
      return undefined;
    }

    setLoading(true);
    refresh().finally(() => setLoading(false));

    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [userId, refresh]);

  /**
   * Mark one row read.
   *
   * Optimistic: the badge should drop the instant the panel opens, not a round
   * trip later. The row is looked up first so a tap on an ALREADY-read row does
   * not decrement the count a second time; a failed write re-syncs from the
   * server rather than leaving the optimistic state standing.
   */
  const markRead = useCallback(
    async (id) => {
      const item = items.find((entry) => entry.id === id);
      if (!item || item.is_read) return;

      setItems((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, is_read: true } : entry)),
      );
      setUnread((current) => Math.max(0, current - 1));

      try {
        await notificationApi.markRead(id);
      } catch {
        refresh();
      }
    },
    [items, refresh],
  );

  /** Mark every row read, optimistically. */
  const markAllRead = useCallback(async () => {
    setItems((current) => current.map((entry) => ({ ...entry, is_read: true })));
    setUnread(0);

    try {
      await notificationApi.markAllRead();
    } catch {
      refresh();
    }
  }, [refresh]);

  const value = useMemo(
    () => ({ items, unread, loading, refresh, markRead, markAllRead }),
    [items, unread, loading, refresh, markRead, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return value;
}
