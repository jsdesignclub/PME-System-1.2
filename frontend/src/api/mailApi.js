import { supabase } from './supabaseClient.js';
import { mimeTypeFor, withCanonicalType } from '../utils/fileTypes.js';

export async function list(filters = {}, paging = {}, options = {}) {
  const limit = paging.limit || 25;
  const offset = paging.offset || 0;
  let query = supabase
    .from('mail_records')
    .select(`
      *,
      created_by:profiles!created_by_user_id(nic_no,full_name,email,role,department_id,designation,section_name),
      assigned_officer:profiles!assigned_officer_id(nic_no,full_name,email,role,department_id,designation,section_name),
      department:departments(id,name,code)
    `, { count: 'exact' });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.category) query = query.ilike('category', `%${filters.category}%`);
  if (filters.department_id) query = query.eq('department_id', filters.department_id);
  if (filters.assigned_officer_id) query = query.eq('assigned_officer_id', filters.assigned_officer_id);
  if (filters.from) query = query.gte('receipt_date', filters.from);
  if (filters.to) query = query.lte('receipt_date', filters.to);
  if (filters.open) query = query.neq('status', 'Completed');
  if (filters.overdue) query = query.and(`and(status.neq.Completed,created_at.lt.${30})`); // simplified
  if (filters.search) {
    query = query.or(`subject.ilike.%${filters.search}%,sender_name.ilike.%${filters.search}%,letter_ref_no.ilike.%${filters.search}%,day_stamp_no.ilike.%${filters.search}%`);
  }

  // Apply department filter for users with READ_DEPARTMENT_MAIL but not READ_ALL_MAIL
  // (Subject Clerks, etc.) - this acts as a fallback if RLS policies aren't configured
  if (options.departmentId && !options.canReadAllMail) {
    query = query.eq('department_id', options.departmentId);
  }

  const sortBy = filters.sort_by || 'created_at';
  const sortDir = filters.sort_dir === 'asc' ? false : true;
  query = query.order(sortBy, { ascending: sortDir });

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;
  return { rows: data || [], total: count };
}

/**
 * Every row the filters match, for an export rather than a page.
 *
 * The registry shows 25 rows, but a printout and a CSV are asked to hold the
 * whole result set, so this pages through `list` until the rows run out.
 *
 * The loop stops on the FIRST short page, not on `total`: PostgREST caps rows
 * per request, so a page can be shorter than `pageSize` without being the last
 * one - but the cap is always >= our `pageSize` at the sizes this app uses, and
 * a short page is the only signal that is reliable across a stripped `count`.
 * Checking `total` as well keeps a capped server from looping forever.
 */
export async function listAll(filters = {}, options = {}, pageSize = 500) {
  const rows = [];
  let offset = 0;
  for (;;) {
    const page = await list(filters, { limit: pageSize, offset }, options);
    const batch = page.rows ?? [];
    rows.push(...batch);
    offset += pageSize;
    if (batch.length < pageSize) break;
    if (page.total != null && rows.length >= page.total) break;
  }
  return rows;
}

const ACTION_LABELS = Object.freeze({
  add_minutes: 'Add minutes',
  forward_to_ao: 'Forward to AO',
  forward: 'Forward',
  edit: 'Edit',
  delete: 'Delete',
  assign: 'Assign officer',
  start: 'Start',
  submit_completion: 'Forward completion document',
  approve_completion: 'Approve completion',
  reject_completion: 'Reject completion',
});

export async function getById(id) {
  const { data, error } = await supabase
    .from('mail_records')
    .select(`
      *,
      created_by:profiles!created_by_user_id(nic_no,full_name,email,role,department_id,designation,section_name),
      assigned_officer:profiles!assigned_officer_id(nic_no,full_name,email,role,department_id,designation,section_name),
      department:departments(id,name,code),
      minutes:official_minutes(*),
      attachments:mail_attachments(*),
      completion_submissions:completion_submissions(*)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;

  // Minutes are ordered here rather than in the select, because the print slip
  // shows the FIRST minute and the order PostgREST returns is not guaranteed.
  // A letter can carry more than one minute now that a clerk may record on the
  // AO's behalf, so "the first one" has to mean the earliest one, every time.
  data.minutes = [...(data.minutes ?? [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: actions } = await supabase.rpc('mail_available_actions', {
      p_mail_id: id,
      p_user_id: user.id,
    });
    data.available_actions = (actions ?? []).map((action) => ({
      action,
      label: ACTION_LABELS[action] ?? action,
    }));
  } else {
    data.available_actions = [];
  }

  return data;
}

export async function stats() {
  // `mail_records` SELECT is RLS-scoped, so reading the table here would hand a
  // monitoring role a dashboard of its own queue. `mail_stats_rows` is a
  // SECURITY DEFINER function: ministry-wide by design, and it refuses anyone
  // outside ADMIN / SECRETARY / CHIEF_CLERK / AO. The aggregation stays here so
  // the figures and the chart shapes are defined in one place.
  const { data: all, error } = await supabase.rpc('mail_stats_rows');
  if (error) throw error;
  if (!all) return { by_status: {}, by_priority: {}, by_category: {}, by_sender_type: {}, daily_intake: [], overdue: 0, totals: { all: 0, open: 0, completed: 0 } };

  const byStatus = {};
  const byPriority = {};
  const byCategory = {};
  const bySenderType = {};
  const dailyIntake = {};
  let overdue = 0;
  let allCount = all.length;
  let openCount = 0;
  let completedCount = 0;

  for (const row of all) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    bySenderType[row.sender_type] = (bySenderType[row.sender_type] || 0) + 1;
    const day = row.created_at.split('T')[0];
    dailyIntake[day] = (dailyIntake[day] || 0) + 1;
    if (row.status !== 'Completed' && new Date(row.created_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) overdue++;
    if (row.status === 'Completed') completedCount++;
    else openCount++;
  }

  return { by_status: byStatus, by_priority: byPriority, by_category: byCategory, by_sender_type: bySenderType, daily_intake: Object.entries(dailyIntake).map(([date, count]) => ({ date, count })), overdue, totals: { all: allCount, open: openCount, completed: completedCount } };
}

export async function suggestions(mailId) {
  const mail = await getById(mailId);
  if (!mail) throw new Error('Mail not found');
  const { data: duties } = await supabase.from('officer_duties').select('*, officer:profiles!officer_user_id(nic_no,full_name,email,role,department_id,designation,section_name)');
  if (!duties) return [];
  const keywords = (mail.subject + ' ' + mail.sender_name + ' ' + mail.category).toLowerCase().split(/\s+/);
  return duties.map(duty => {
    const text = (duty.duty_description + ' ' + JSON.stringify(duty.keywords)).toLowerCase();
    const score = keywords.reduce((s, k) => s + (text.includes(k) ? 1 : 0), 0);
    return { ...duty, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function officers({ limit = 100, departmentId, includeClerks = false } = {}) {
  // `includeClerks` adds SUBJECT_CLERK to the list so a letter can be routed to a
  // BRANCH subject clerk instead of straight to an officer: the main clerk either
  // grants the job to an officer, or hands the paper to the branch clerk, who then
  // assigns one of their own branch's officers. The officer-duty-chart screens
  // leave this off, so they keep listing executing officers only.
  const roles = includeClerks
    ? ['OFFICER','TRANSPORT_OFFICER','SUBJECT_CLERK']
    : ['OFFICER','TRANSPORT_OFFICER'];
  let query = supabase.from('profiles').select('id,nic_no,full_name,email,role,department_id,designation,section_name,is_central_clerk,department:departments(id,name,code)').in('role', roles);
  if (departmentId) query = query.eq('department_id', departmentId);
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * The executives who may be named as the author of a minute.
 *
 * A minute on a physical letter is written by an AO (or the Secretary), so when
 * the main subject clerk enters it on their behalf they must say WHICH one
 * wrote it. `mail_records` has no `assigned_ao_id` — the AO queue is shared by
 * every active AO — so there is no server-side pointer to read the author off;
 * the clerk has to name them, and the list of possible names has to come from
 * somewhere.
 *
 * `profiles_read` is open to every signed-in user, so this needs no permission
 * of its own. The role filter is applied HERE rather than by the client, so the
 * dropdown holds executives and nobody else.
 */
export async function minuteAuthors() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, designation, section_name, is_active')
    .in('role', ['AO', 'SECRETARY', 'CHIEF_CLERK', 'ADMIN'])
    .eq('is_active', true)
    .order('full_name');
  if (error) throw error;
  return data || [];
}

export async function officer(id) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,nic_no,full_name,email,role,department_id,designation,section_name,department:departments(id,name,code)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function officerDutyChart(officerId) {
  const { data: duties, error } = await supabase
    .from('officer_duties')
    .select('*')
    .eq('officer_user_id', officerId);
  if (error) throw error;

  const officerProfile = await officer(officerId);

  // Group duties by section
  const dutyChart = {};
  let dutyCount = 0;
  const sections = new Set();

  for (const duty of duties || []) {
    const section = duty.section_name || 'Unassigned';
    sections.add(section);
    dutyCount++;
    if (!dutyChart[section]) dutyChart[section] = [];
    dutyChart[section].push(duty);
  }

  return {
    officer: officerProfile,
    duty_chart: dutyChart,
    duty_count: dutyCount,
    section_count: sections.size,
  };
}

export async function addDuty(officerUserId, fields) {
  const keywords = (fields.keywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
  const { data, error } = await supabase.from('officer_duties').insert({
    officer_user_id: officerUserId,
    section_name: fields.section_name,
    duty_description: fields.duty_description,
    keywords,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateDuty(officerUserId, dutyId, fields) {
  const keywords = (fields.keywords || []).map(k => k.toLowerCase().trim()).filter(Boolean);
  const { data, error } = await supabase.from('officer_duties').update({
    section_name: fields.section_name,
    duty_description: fields.duty_description,
    keywords,
  }).eq('id', dutyId).eq('officer_user_id', officerUserId).select().single();
  if (error) throw error;
  return data;
}

export async function removeDuty(officerUserId, dutyId) {
  const { error } = await supabase.from('officer_duties').delete().eq('id', dutyId).eq('officer_user_id', officerUserId);
  if (error) throw error;
}

export async function create(fields, file) {
  const stamp = await generateDayStamp();
  const record = {
    id: crypto.randomUUID(),
    day_stamp_no: stamp,
    letter_ref_no: fields.letter_ref_no,
    receipt_date: fields.receipt_date,
    sender_type: fields.sender_type,
    sender_name: fields.sender_name,
    subject: fields.subject,
    priority: fields.priority || 'Normal',
    category: fields.category || 'General Administration',
    department_id: fields.department_id,
    created_by_user_id: (await supabase.auth.getUser()).data.user.id,
    status: 'Logged',
  };
  const { data, error } = await supabase.from('mail_records').insert(record).select().single();
  if (error) throw error;
  if (file) {
    try {
      await uploadAttachment(data.id, file);
    } catch (uploadError) {
      // A letter and its scan are one thing. The letter is written first,
      // because the scan's metadata row names the letter — but a refused
      // upload must not leave the letter behind. The clerk is told the filing
      // failed and types the letter again, so an orphaned row would put two
      // letters in the register, one of them with no scan at all. The row is
      // still at 'Logged' and still names this caller, so `mail_delete` allows
      // it to be removed.
      await supabase.from('mail_records').delete().eq('id', data.id);
      throw uploadError;
    }
  }
  return data;
}

export async function addMinutes(
  id,
  { instruction_type, minutes_text, department_id, author_user_id, author_role, author_name, quick_note } = {}
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const profile = await fetchProfile(user.id);
  if (!profile) throw new Error('User profile not found');

  const isCentralClerkRecordingOnBehalf =
    profile.role === 'SUBJECT_CLERK' &&
    profile.is_central_clerk &&
    author_user_id &&
    author_user_id !== user.id;

  const insertPayload = {
    mail_record_id: id,
    author_user_id: isCentralClerkRecordingOnBehalf ? author_user_id : user.id,
    author_role: isCentralClerkRecordingOnBehalf ? author_role || profile.role : profile.role,
    author_name: isCentralClerkRecordingOnBehalf ? author_name || profile.full_name : profile.full_name,
    instruction_type,
    minutes_text,
  };

  // `quick_note` is sent ONLY when there is one. A key that is absent from the
  // body is a column Postgres never sees, so a minute with no note still inserts
  // on a database where the column has not been added yet — which keeps the
  // note from being a hard dependency of every other path into this table.
  if (quick_note?.trim()) {
    insertPayload.quick_note = quick_note.trim();
  }

  if (isCentralClerkRecordingOnBehalf) {
    insertPayload.recorded_by_user_id = user.id;
  }

  const { data, error } = await supabase.from('official_minutes').insert(insertPayload).select().single();
  if (error) {
    console.error('addMinutes: official_minutes insert error', error);
    throw error;
  }

  // Recording the minute hands the letter back to the clerk, who then assigns.
  // The move is CONDITIONAL on the letter still being at 'Forwarded to AO': that
  // is the only state a minute may be recorded in, so if the letter has moved
  // since the insert then somebody else got there first, and writing
  // 'Forwarded to Subject' over their state would undo their work.
  const updates = { status: 'Forwarded to Subject' };
  if (department_id !== undefined) updates.department_id = department_id;

  const { data: updatedRecords, error: updateError } = await supabase
    .from('mail_records')
    .update(updates)
    .eq('id', id)
    .eq('status', 'Forwarded to AO')
    .select();
  if (updateError) {
    console.error('addMinutes: mail_records update error', updateError);
    throw updateError;
  }
  if (!updatedRecords || updatedRecords.length === 0) {
    throw new Error('Failed to forward letter. You may not have permission to update this letter, or it may have been moved by another user.');
  }
  return data;
}

/**
 * A read-back after a conditional write, without `.single()`.
 *
 * `.single()` turns a write that matched no rows into PGRST116 ("Cannot coerce
 * the result to a single JSON object"), which reads like a transport failure and
 * says nothing about why. A conditional write that matched no rows is a fact
 * worth stating plainly: the letter moved, or the caller may not touch it.
 */
function requireOneRow(data, message) {
  if (!data || data.length === 0) {
    const error = new Error(message);
    error.status = 409;
    throw error;
  }
  return data[0];
}

export async function forwardToAo(id) {
  const { data, error } = await supabase
    .from('mail_records')
    .update({ status: 'Forwarded to AO' })
    .eq('id', id)
    .eq('status', 'Logged')
    .select();
  if (error) throw error;
  return requireOneRow(
    data,
    'The letter could not be forwarded to the AO. It may have been moved by another user, or your role may not permit changing it.',
  );
}

export async function assign(id, officerUserId) {
  const { data, error } = await supabase.from('mail_records').update({
    assigned_officer_id: officerUserId,
    assigned_date: new Date().toISOString(),
    status: 'Assigned',
  }).eq('id', id).eq('status', 'Forwarded to Subject').select();
  if (error) throw error;
  return requireOneRow(
    data,
    'The letter could not be assigned. It may have been moved by another user, or your role may not permit changing it.',
  );
}

/**
 * Route a letter to a BRANCH subject clerk instead of an officer.
 *
 * Two deliberate differences from `assign`:
 *
 *  1. The status STAYS at 'Forwarded to Subject'. That is the state the branch
 *     clerk's own assign step runs from; moving to 'Assigned' would consume the
 *     state and leave the branch clerk with nothing to do.
 *  2. The letter's department moves to the branch clerk's department. The branch
 *     clerk then sees the letter in their own registry (department match) and,
 *     crucially, keeps seeing it AFTER they forward it on to one of their
 *     officers — otherwise the letter would vanish from their registry the moment
 *     they handed it off.
 *
 * `assigned_officer_id` is reused as the routing pointer. The RLS update policy
 * names a SUBJECT_CLERK on that column so the branch clerk may write the letter
 * while it sits with them.
 */
export async function routeToClerk(id, clerk) {
  const updates = {
    assigned_officer_id: clerk.id,
    assigned_date: new Date().toISOString(),
    status: 'Forwarded to Subject',
  };
  if (clerk.department_id) updates.department_id = clerk.department_id;

  const { data, error } = await supabase
    .from('mail_records')
    .update(updates)
    .eq('id', id)
    .eq('status', 'Forwarded to Subject')
    .select();
  if (error) throw error;
  return requireOneRow(
    data,
    'The letter could not be routed to the branch clerk. It may have been moved by another user, or your role may not permit changing it.',
  );
}

export async function changeStatus(id, action, note) {
  // `complete` is deliberately absent: a letter is finished only by an
  // approver's decision (see completionApi.submit / completionApi.decide), never
  // by the officer setting the status directly.
  const statusMap = { start: 'In Progress' };
  const next = statusMap[action];
  if (!next) throw new Error('Invalid action');
  const updates = { status: next };
  if (note?.subject_clerk_note) updates.subject_clerk_note = note.subject_clerk_note;
  if (note?.officer_status_note) updates.officer_status_note = note.officer_status_note;
  const { data, error } = await supabase.from('mail_records').update(updates).eq('id', id).select();
  if (error) throw error;
  return requireOneRow(
    data,
    'The letter could not be updated. It may have been moved by another user, or your role may not permit changing it.',
  );
}

export async function updateNotes(id, field, value) {
  const updates = {};
  if (field === 'subject_clerk_note') updates.subject_clerk_note = value;
  else if (field === 'officer_status_note') updates.officer_status_note = value;
  const { data, error } = await supabase.from('mail_records').update(updates).eq('id', id).select();
  if (error) throw error;
  return requireOneRow(
    data,
    'The note could not be saved. It may have been moved by another user, or your role may not permit changing it.',
  );
}

export async function addAttachments(id, files) {
  const results = [];
  for (const file of files) {
    results.push(uploadAttachment(id, file));
  }
  return Promise.all(results);
}

async function uploadAttachment(mailId, file) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const path = `${mailId}/${crypto.randomUUID()}-${file.name}`;
  // The Content-Type is stated explicitly, from the file's extension. Left to
  // itself the browser sends `file.type`, which is the operating system's guess
  // at the extension — and that guess differs from desk to desk, so the same
  // scan is accepted on one machine and refused by the bucket's mime allowlist
  // on another. The extension is what the clerk chose and what the allowlist
  // already validated, so it is the answer storage is given.
  const contentType = mimeTypeFor(file);
  const { error: uploadError } = await supabase.storage
    .from('mail-attachments')
    .upload(path, withCanonicalType(file), { contentType });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from('mail_attachments').insert({
    mail_record_id: mailId,
    original_name: file.name,
    stored_name: file.name,
    stored_path: path,
    mime_type: contentType,
    size_bytes: file.size,
    uploaded_by: user.id,
  }).select().single();
  if (error) {
    // The bytes are in the bucket but nothing points at them. Removing them is
    // best effort: the object is unreachable either way, and failing to remove
    // it must not mask the error that caused this.
    await supabase.storage.from('mail-attachments').remove([path]);
    throw error;
  }
  // Update has_attachment flag
  await supabase.from('mail_records').update({ has_attachment: true }).eq('id', mailId);
  return data;
}

export async function downloadAttachment(mailId, attachmentId) {
  const { data, error } = await supabase.from('mail_attachments').select('*').eq('id', attachmentId).eq('mail_record_id', mailId).single();
  if (error) throw error;
  // The `error` from `download` MUST be checked. On failure Supabase returns
  // `{ data: null, error }`; destructuring only `data` and returning it let a
  // refused download become `blob: null`, which `useObjectUrl` then wrapped as
  // `new Blob([null])` — a four-byte file containing the text "null". Chrome
  // rendered that as "Failed to load PDF document", hiding the real cause
  // (a storage policy refusal) behind a message about a corrupt file.
  const { data: blob, error: downloadError } = await supabase.storage.from('mail-attachments').download(data.stored_path);
  if (downloadError || !blob) {
    throw downloadError ?? new Error('The stored file could not be read.');
  }
  return { ...data, blob };
}

export async function update(id, fields) {
  const { data, error } = await supabase.from('mail_records').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function remove(id) {
  const { error } = await supabase.from('mail_records').delete().eq('id', id);
  if (error) throw error;
}

async function generateDayStamp() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data, error } = await supabase.rpc('next_day_stamp', { p_year_month: yearMonth });
  if (error) throw error;
  return data;
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
