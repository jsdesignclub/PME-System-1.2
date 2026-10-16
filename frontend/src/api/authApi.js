import { supabase } from './supabaseClient.js';

export async function login(identifier, password) {
  const trimmedIdentifier = identifier.trim();
  const isEmail = trimmedIdentifier.includes('@');

  let email;
  if (isEmail) {
    email = trimmedIdentifier;
  } else {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('nic_no', trimmedIdentifier)
      .single();

    if (profileError || !profile) {
      throw new Error('Invalid login credentials');
    }
    email = profile.email;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  const fullProfile = await fetchProfile(data.user.id);
  return {
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: fullProfile.id,
      nic_no: fullProfile.nic_no,
      full_name: fullProfile.full_name,
      email: fullProfile.email,
      role: fullProfile.role,
      department_id: fullProfile.department_id,
      designation: fullProfile.designation,
      section_name: fullProfile.section_name,
      is_active: fullProfile.is_active,
      is_central_clerk: fullProfile.is_central_clerk,
    },
  };
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * The role -> permission table.
 *
 * Permissions are a pure function of the role, so the same table serves both the
 * server round trip in `permissions()` and the offline fallback in AuthContext.
 * Keeping it in one place means a transient network failure cannot hand a signed
 * in user a different permission set than a fresh fetch would.
 */
const ROLE_PERMISSIONS = {
  ADMIN: ['CREATE_MAIL','READ_PUBLIC_MAIL','READ_ASSIGNED_MAIL','READ_DEPARTMENT_MAIL','READ_ALL_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_ACTION_STATUS','CLOSE_MAIL_FILE','UPDATE_DUTY_CHART','APPROVE_VEHICLE','APPROVE_TRANSFER','MANAGE_USERS','MANAGE_DEPARTMENTS','VIEW_AUDIT'],
  SECRETARY: ['CREATE_MAIL','READ_PUBLIC_MAIL','READ_ASSIGNED_MAIL','READ_DEPARTMENT_MAIL','READ_ALL_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_ACTION_STATUS','CLOSE_MAIL_FILE','UPDATE_DUTY_CHART','APPROVE_VEHICLE','APPROVE_TRANSFER'],
  // The AO records the primary minute on a letter the clerk forwarded to them;
  // the letter then returns to the clerk. READ_ALL_MAIL here does NOT mean the
  // AO reads every letter — the RLS mail_read policy still scopes the registry
  // and each letter to the AO's forwarded queue. It grants the ministry-wide
  // PROGRESS view (the admin/secretary dashboard) whose figures come from the
  // role-gated mail_stats_rows() function. No FORWARD_MAIL (only the clerk
  // forwards to the AO) and no ASSIGN_OFFICER (the clerk assigns).
  AO: ['READ_ALL_MAIL','WRITE_MINUTES'],
  CHIEF_CLERK: ['CREATE_MAIL','READ_PUBLIC_MAIL','READ_ASSIGNED_MAIL','READ_DEPARTMENT_MAIL','READ_ALL_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_ACTION_STATUS','CLOSE_MAIL_FILE','UPDATE_DUTY_CHART'],
  SUBJECT_CLERK: ['CREATE_MAIL','READ_PUBLIC_MAIL','READ_ASSIGNED_MAIL','READ_DEPARTMENT_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_DUTY_CHART'],
  OFFICER: ['READ_ASSIGNED_MAIL','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'],
  TRANSPORT_OFFICER: ['READ_ASSIGNED_MAIL','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'],
};

export function rolePermissions(role) {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Re-read the signed-in user's profile.
 *
 * Returns `null` when there is genuinely no session, and THROWS when the lookup
 * itself fails. The distinction matters: a caller may quietly sign out on `null`,
 * but a transport error (Wi-Fi not up yet when a tab is restored) must not be
 * mistaken for a logout.
 */
export async function me() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) return null;
  const profile = await fetchProfile(user.id);
  return {
    id: profile.id,
    nic_no: profile.nic_no,
    full_name: profile.full_name,
    email: profile.email,
    role: profile.role,
    department_id: profile.department_id,
    designation: profile.designation,
    section_name: profile.section_name,
    is_active: profile.is_active,
    is_central_clerk: profile.is_central_clerk,
  };
}

/**
 * Permissions for the signed-in user.
 *
 * `null` means "no session" (sign out), a thrown error means "could not ask right
 * now" (keep the cached session).
 */
export async function permissions() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) return null;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profileError && profileError.code !== 'PGRST116') throw profileError;
  return rolePermissions(profile?.role);
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}
