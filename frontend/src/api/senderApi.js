import { supabase } from './supabaseClient.js';

/**
 * The sender directory behind the intake form's dropdown.
 *
 * `mail_records.sender_name` stays the text recorded on the letter; this is
 * only the list the clerk picks from so the same office is not spelled three
 * ways across the registry.
 */

export async function list() {
  const { data, error } = await supabase
    .from('senders')
    .select('id,name,sender_type')
    .order('name');
  if (error) throw error;
  return data || [];
}

/**
 * Add a sender to the directory and hand it back.
 *
 * Two clerks adding the same office at the same moment race, and the unique
 * index (lower(name)) lets exactly one win. The loser gets a 23505
 * unique_violation — which is not a failure the user did anything wrong to
 * cause, and the row they wanted now exists. So the existing row is read back
 * and returned instead of surfacing a duplicate-key error.
 */
export async function create({ name, sender_type }) {
  const trimmed = name.trim();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('senders')
    .insert({ name: trimmed, sender_type, created_by_user_id: user?.id ?? null })
    .select('id,name,sender_type')
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await findByName(trimmed);
      if (existing) return existing;
    }
    throw error;
  }

  return data;
}

/**
 * Case-insensitive lookup by exact name.
 *
 * `ilike` treats `%` and `_` as wildcards, and an office name may contain
 * either, so they are escaped before the pattern is built. Without this,
 * "Dept_001" would also match "DeptX001" and the wrong sender could be returned.
 */
async function findByName(name) {
  const pattern = name.replace(/([\\%_])/g, '\\$1');
  const { data, error } = await supabase
    .from('senders')
    .select('id,name,sender_type')
    .ilike('name', pattern)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}
