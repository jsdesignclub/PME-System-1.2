import { supabase } from './supabaseClient.js';

/**
 * The letter-category dictionary behind the intake form's dropdown.
 *
 * `mail_records.category` stays the text recorded on the letter; this table is
 * only the list the clerk picks from, and the source of the default action and
 * the maximum days allowed to complete it. As with `senders`, editing or
 * removing a category never rewrites a letter that already named it.
 */

const FIELDS = 'id,name,action_to_take,max_days';

export async function list() {
  const { data, error } = await supabase
    .from('letter_categories')
    .select(FIELDS)
    .order('name');
  if (error) throw error;
  return data || [];
}

/**
 * Look a category up by its exact name, case-insensitively.
 *
 * The letter stores only the name, so the detail page needs this to recover the
 * action and due period for a letter that was logged before its category was
 * edited. Returns null (rather than throwing) when the name is not in the
 * dictionary — a letter may carry a category that was since removed.
 */
export async function getByName(name) {
  if (!name) return null;
  const pattern = name.trim().replace(/([\\%_])/g, '\\$1');
  const { data, error } = await supabase
    .from('letter_categories')
    .select(FIELDS)
    .ilike('name', pattern)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

export async function create({ name, action_to_take, max_days }) {
  const trimmed = name.trim();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('letter_categories')
    .insert({
      name: trimmed,
      action_to_take: (action_to_take ?? '').trim(),
      max_days: max_days === '' || max_days === null || max_days === undefined ? null : Number(max_days),
      created_by_user_id: user?.id ?? null,
    })
    .select(FIELDS)
    .single();

  // A unique_violation (23505) means the category now exists — the row the admin
  // wanted is there, so hand it back instead of surfacing a duplicate-key error.
  if (error) {
    if (error.code === '23505') {
      const existing = await getByName(trimmed);
      if (existing) return existing;
    }
    throw error;
  }

  return data;
}

export async function update(id, fields) {
  const payload = { ...fields, updated_at: new Date().toISOString() };
  if (payload.max_days === '' || payload.max_days === null || payload.max_days === undefined) {
    payload.max_days = null;
  } else {
    payload.max_days = Number(payload.max_days);
  }

  const { data, error } = await supabase
    .from('letter_categories')
    .update(payload)
    .eq('id', id)
    .select(FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function remove(id) {
  const { error } = await supabase.from('letter_categories').delete().eq('id', id);
  if (error) throw error;
  // Returns true rather than undefined so a caller can tell a successful delete
  // (undefined) apart from `useApiError.run`'s failure sentinel (null).
  return true;
}
