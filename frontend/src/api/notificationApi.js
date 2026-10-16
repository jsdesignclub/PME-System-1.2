import { supabase } from './supabaseClient.js';

/**
 * The header bell's feed.
 *
 * Rows are only ever WRITTEN by database triggers (see patch_notifications.sql),
 * so this module is read-and-acknowledge only: list the newest page, count the
 * unread, flip one row read, or flip them all. There is deliberately no `create`
 * — the table has no INSERT policy, and a notification its actor could forge is
 * not a record of anything.
 *
 * RLS already scopes every call to `user_id = auth.uid()`, so none of these
 * queries filter by user; adding one would suggest the policy might not hold.
 */

/** The columns the bell renders. Narrower than `*` so the payload stays the only
 *  variable-width field over the wire. */
const COLUMNS = 'id,type,payload,mail_record_id,is_read,created_at';

/** Newest first, capped. The bell shows a panel, not an archive. */
export async function list({ limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

/**
 * The unread total.
 *
 * `head: true` asks PostgREST for the count alone — no rows cross the wire — which
 * is what the red badge needs and nothing more.
 */
export async function unreadCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) throw error;
  return count ?? 0;
}

/** Mark one notification read. The `is_read = false` filter makes this a no-op
 *  on a row that is already read, so a double tap cannot miscount the badge. */
export async function markRead(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('is_read', false);

  if (error) throw error;
}

/** Mark every unread notification read. */
export async function markAllRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('is_read', false);

  if (error) throw error;
}
