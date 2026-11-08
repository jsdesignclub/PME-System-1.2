import { supabase } from './supabaseClient.js';
import { mimeTypeFor, withCanonicalType } from '../utils/fileTypes.js';

/**
 * The HRM records attached to a profile.
 *
 * `profiles` is identity and posting; these tables hold the fields an HR file
 * needs that the mail workflow never reads. `employee_details` is optional
 * (a missing record is `null`); qualifications and experience are child lists
 * and an empty list is a normal answer.
 *
 * Every write is administrator-only by RLS. The UI hides the controls for other
 * roles, but the policy is the enforcement.
 */

const DETAIL_FIELDS = [
  'officer_user_id',
  'date_of_birth',
  'gender',
  'marital_status',
  'nationality',
  'permanent_address',
  'residential_address',
  'phone',
  'personal_email',
  'join_date',
  'confirmation_date',
  'retirement_date',
  'employment_type',
  'service_grade',
  'salary_scale',
  'blood_group',
  'emergency_contact_name',
  'emergency_contact_phone',
  'notes',
  'created_at',
  'updated_at',
].join(',');

const QUALIFICATION_FIELDS = [
  'id',
  'officer_user_id',
  'level',
  'title',
  'institution',
  'year_completed',
  'grade',
  'certificate_path',
  'created_at',
  'updated_at',
].join(',');

const EXPERIENCE_FIELDS = [
  'id',
  'officer_user_id',
  'employer',
  'designation',
  'from_date',
  'to_date',
  'description',
  'created_at',
  'updated_at',
].join(',');

const SERVICE_FIELDS = [
  'id',
  'officer_user_id',
  'designation',
  'workplace',
  'grade',
  'from_date',
  'to_date',
  'remarks',
  'created_at',
  'updated_at',
].join(',');

/** An empty form box becomes NULL, never an empty string in a nullable column. */
function optionalText(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** A blank year becomes NULL; a present one becomes a number. */
function optionalInt(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A blank date becomes NULL; a present one is sent as-is. */
function optionalDate(value) {
  return value === '' || value === null || value === undefined ? null : value;
}

export async function getEmployeeDetails(officerId) {
  if (!officerId) return null;

  const { data, error } = await supabase
    .from('employee_details')
    .select(DETAIL_FIELDS)
    .eq('officer_user_id', officerId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * The basic-information block as the database expects it.
 *
 * Only the fields the form owns are sent. `officer_user_id` is the identity and
 * is supplied separately by `saveEmployeeDetails`; `created_at`/`updated_at` are
 * the database's to write (`updated_at` is maintained by its trigger).
 */
function detailsPayload(fields) {
  return {
    date_of_birth: optionalDate(fields.date_of_birth),
    gender: optionalText(fields.gender),
    marital_status: optionalText(fields.marital_status),
    nationality: optionalText(fields.nationality),
    permanent_address: optionalText(fields.permanent_address),
    residential_address: optionalText(fields.residential_address),
    phone: optionalText(fields.phone),
    personal_email: optionalText(fields.personal_email),
    join_date: optionalDate(fields.join_date),
    confirmation_date: optionalDate(fields.confirmation_date),
    retirement_date: optionalDate(fields.retirement_date),
    employment_type: optionalText(fields.employment_type),
    service_grade: optionalText(fields.service_grade),
    salary_scale: optionalText(fields.salary_scale),
    blood_group: optionalText(fields.blood_group),
    emergency_contact_name: optionalText(fields.emergency_contact_name),
    emergency_contact_phone: optionalText(fields.emergency_contact_phone),
    notes: optionalText(fields.notes),
  };
}

/**
 * Create or update an officer's basic HR block.
 *
 * Upsert rather than insert/update by existence: the row is optional and an
 * employee filling their file for the first time has no row yet. `onConflict`
 * names the primary key, so a role with write access can never end up with two
 * HR rows for one person.
 */
export async function saveEmployeeDetails(officerId, fields) {
  const { data, error } = await supabase
    .from('employee_details')
    .upsert(
      { officer_user_id: officerId, ...detailsPayload(fields) },
      { onConflict: 'officer_user_id' },
    )
    .select(DETAIL_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

// ============================================================================
// Qualifications
// ============================================================================

export async function listQualifications(officerId) {
  if (!officerId) return [];

  const { data, error } = await supabase
    .from('employee_qualifications')
    .select(QUALIFICATION_FIELDS)
    .eq('officer_user_id', officerId)
    .order('year_completed', { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

function qualificationPayload(fields) {
  return {
    level: optionalText(fields.level),
    title: String(fields.title ?? '').trim(),
    institution: optionalText(fields.institution),
    year_completed: optionalInt(fields.year_completed),
    grade: optionalText(fields.grade),
  };
}

export async function createQualification(officerId, fields) {
  const { data, error } = await supabase
    .from('employee_qualifications')
    .insert({ officer_user_id: officerId, ...qualificationPayload(fields) })
    .select(QUALIFICATION_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateQualification(id, fields) {
  const { data, error } = await supabase
    .from('employee_qualifications')
    .update(qualificationPayload(fields))
    .eq('id', id)
    .select(QUALIFICATION_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function removeQualification(id) {
  const { error } = await supabase.from('employee_qualifications').delete().eq('id', id);
  if (error) throw error;
  // `true` distinguishes a successful delete from `useApiError.run`'s null.
  return true;
}

// ============================================================================
// Previous experience
// ============================================================================

export async function listExperience(officerId) {
  if (!officerId) return [];

  const { data, error } = await supabase
    .from('employee_experience')
    .select(EXPERIENCE_FIELDS)
    .eq('officer_user_id', officerId)
    .order('from_date', { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

function experiencePayload(fields) {
  return {
    employer: String(fields.employer ?? '').trim(),
    designation: optionalText(fields.designation),
    from_date: optionalDate(fields.from_date),
    to_date: optionalDate(fields.to_date),
    description: optionalText(fields.description),
  };
}

export async function createExperience(officerId, fields) {
  const { data, error } = await supabase
    .from('employee_experience')
    .insert({ officer_user_id: officerId, ...experiencePayload(fields) })
    .select(EXPERIENCE_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateExperience(id, fields) {
  const { data, error } = await supabase
    .from('employee_experience')
    .update(experiencePayload(fields))
    .eq('id', id)
    .select(EXPERIENCE_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function removeExperience(id) {
  const { error } = await supabase.from('employee_experience').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============================================================================
// Service history
// ============================================================================

export async function listServiceHistory(officerId) {
  if (!officerId) return [];

  const { data, error } = await supabase
    .from('employee_service_history')
    .select(SERVICE_FIELDS)
    .eq('officer_user_id', officerId)
    .order('from_date', { ascending: false, nullsFirst: false });

  if (error) throw error;
  return data || [];
}

function servicePayload(fields) {
  return {
    designation: String(fields.designation ?? '').trim(),
    workplace: optionalText(fields.workplace),
    grade: optionalText(fields.grade),
    from_date: optionalDate(fields.from_date),
    to_date: optionalDate(fields.to_date),
    remarks: optionalText(fields.remarks),
  };
}

export async function createServiceRecord(officerId, fields) {
  const { data, error } = await supabase
    .from('employee_service_history')
    .insert({ officer_user_id: officerId, ...servicePayload(fields) })
    .select(SERVICE_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateServiceRecord(id, fields) {
  const { data, error } = await supabase
    .from('employee_service_history')
    .update(servicePayload(fields))
    .eq('id', id)
    .select(SERVICE_FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function removeServiceRecord(id) {
  const { error } = await supabase.from('employee_service_history').delete().eq('id', id);
  if (error) throw error;
  return true;
}

// ============================================================================
// Documents
// ============================================================================

const DOCUMENT_FIELDS = [
  'id',
  'officer_user_id',
  'title',
  'document_type',
  'file_path',
  'file_name',
  'mime_type',
  'size_bytes',
  'uploaded_by',
  'created_at',
  'updated_at',
].join(',');

export async function listDocuments(officerId) {
  if (!officerId) return [];

  const { data, error } = await supabase
    .from('employee_documents')
    .select(DOCUMENT_FIELDS)
    .eq('officer_user_id', officerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function uploadDocument(officerId, fields) {
  const file = fields.file;
  if (!file) throw new Error('Choose a file to upload.');

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const path = `${officerId}/${crypto.randomUUID()}-${file.name}`;
  const contentType = mimeTypeFor(file);
  const { error: uploadError } = await supabase.storage
    .from('employee-documents')
    .upload(path, withCanonicalType(file), { contentType });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('employee_documents')
    .insert({
      officer_user_id: officerId,
      title: String(fields.title ?? '').trim() || file.name,
      document_type: optionalText(fields.document_type),
      file_path: path,
      file_name: file.name,
      mime_type: contentType,
      size_bytes: file.size,
      uploaded_by: user.id,
    })
    .select(DOCUMENT_FIELDS)
    .single();

  if (error) {
    await supabase.storage.from('employee-documents').remove([path]);
    throw error;
  }
  return data;
}

export async function downloadDocument(row) {
  const { data, error } = await supabase.storage
    .from('employee-documents')
    .download(row.file_path);
  if (error) throw error;
  return data;
}

export async function removeDocument(row) {
  const { error } = await supabase.from('employee_documents').delete().eq('id', row.id);
  if (error) throw error;
  await supabase.storage.from('employee-documents').remove([row.file_path]);
  return true;
}
