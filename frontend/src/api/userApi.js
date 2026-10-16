import { supabase } from './supabaseClient.js';

export async function list(filters = {}, paging = {}) {
  const limit = paging.limit || 25;
  const offset = paging.offset || 0;
  let query = supabase
    .from('profiles')
    .select(`
      id,
      nic_no,
      full_name,
      email,
      role,
      department_id,
      designation,
      section_name,
      is_active,
      is_central_clerk,
      created_at,
      updated_at,
      department:departments!department_id(id,name,code)
    `, { count: 'exact' });

  if (filters.role) query = query.eq('role', filters.role);
  if (filters.department_id) query = query.eq('department_id', filters.department_id);
  // The Status picker's "All" option is `value=""`, which arrives here as an
  // empty string rather than `undefined`. Passing it straight to PostgREST makes
  // Postgres try to cast `""` to boolean and 400 the WHOLE query, emptying the
  // table. Only apply the filter when it actually carries a value.
  if (filters.is_active !== undefined && filters.is_active !== '') {
    query = query.eq('is_active', filters.is_active === true || filters.is_active === 'true');
  }
  if (filters.search) {
    query = query.or(`full_name.ilike.%${filters.search}%,nic_no.ilike.%${filters.search}%`);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1).order('created_at', { ascending: false });
  if (error) throw error;
  return { rows: data || [], total: count };
}

export async function getById(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      nic_no,
      full_name,
      email,
      role,
      department_id,
      designation,
      section_name,
      is_active,
      is_central_clerk,
      created_at,
      updated_at,
      department:departments!department_id(id,name,code)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Call one of the account Edge Functions as the signed-in administrator.
 *
 * The functions verify the CALLER, not the anon key, so the request must carry
 * the admin's session access token rather than the publishable key. Both extra
 * headers are required: `Authorization` is what the function reads, `apikey` is
 * what the Supabase gateway checks before the function ever runs.
 */
async function callFunction(name, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const expired = new Error('Your session has expired. Sign in again.')
    expired.status = 401
    throw expired
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const problem = await response.json().catch(() => ({}))
    // The status is attached so `normaliseError` classifies a 403 as forbidden
    // and a 400 as validation, rather than filing everything a bare Error
    // carries as an unreachable server.
    const error = new Error(problem.error || 'The request could not be completed')
    error.status = response.status
    throw error
  }

  return response.json()
}

/**
 * Step 1 of onboarding: create the LOGIN only (auth.users).
 *
 * No public.profiles row is written here. The account then appears in
 * `listUnprofiled()` for an administrator to select and turn into a person via
 * `createProfile()`.
 */
export async function createLogin({ email, password, nic_no }) {
  return callFunction('create-user', { email, password, nic_no })
}

/** Auth accounts that do not yet have a public.profiles row. */
export async function listUnprofiled() {
  const { rows } = await callFunction('list-unprofiled-users')
  return rows || []
}

/**
 * Step 2 of onboarding: write the public.profiles row for an account.
 *
 * The row's `id` must equal the auth user's id (the table's foreign key). RLS
 * (`profiles_admin_write`) authorises the insert because the caller is an admin,
 * so this goes straight to PostgREST rather than through an Edge Function.
 */
export async function createProfile(fields) {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: fields.id,
      nic_no: fields.nic_no,
      full_name: fields.full_name,
      email: fields.email,
      role: fields.role || 'SUBJECT_CLERK',
      designation: fields.designation || '',
      department_id: fields.department_id ?? null,
      section_name: fields.section_name || null,
      is_central_clerk: fields.is_central_clerk === true,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function update(id, fields) {
  const updates = {};
  const allowed = ['full_name','email','role','department_id','designation','section_name','is_active','is_central_clerk'];
  for (const key of allowed) {
    if (fields[key] !== undefined) updates[key] = fields[key];
  }
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deactivate(id) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Undo a deactivation.
 *
 * Deactivation is reversible on purpose — a deactivated row keeps its history
 * and its audit attribution (D23), so bringing someone back is a flag flip and
 * not a re-creation. There is no "last active administrator" guard here: unlike
 * deactivating the final admin, turning one BACK ON can only widen access.
 */
export async function reactivate(id) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: true })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
