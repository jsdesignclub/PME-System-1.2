import { supabase } from './supabaseClient.js';

/**
 * The completion-document approval workflow.
 *
 * A letter is no longer completed by its officer directly. The officer forwards
 * a "completion document" to the AO, the Secretary or their own Department Head;
 * the letter moves to 'Pending Approval', and only that approver's decision
 * finishes it. Both transitions are single SECURITY DEFINER RPCs —
 * `submit_completion` and `decide_completion` — because each is really two
 * writes (the submission and the letter) that must commit together. See
 * patch_completion_approval.sql.
 *
 * The file bytes live in the same private `mail-attachments` bucket as ordinary
 * scans, under the letter's own folder, so the existing storage policies apply
 * unchanged and a completion document is not a second class of object.
 */

const BUCKET = 'mail-attachments';

/**
 * Forward a completion document and move the letter to 'Pending Approval'.
 *
 * The upload happens FIRST and the RPC second, matching `mailApi.create`: the
 * row the RPC inserts stores `document_path`, so the object has to exist before
 * the row can name it. If the RPC fails the orphaned object is removed, so a
 * refused submission does not quietly leave a file in the bucket.
 */
export async function submit(mailId, { approverRole, note, file }) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const path = `${mailId}/completion-${crypto.randomUUID()}-${file.name}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc('submit_completion', {
    p_mail_id: mailId,
    p_approver_role: approverRole,
    p_document_name: file.name,
    p_document_path: path,
    p_mime_type: file.type,
    p_size_bytes: file.size,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    // Best effort: the submission was refused, so the uploaded object is dead
    // weight. A failure to remove it is not worth masking the real error.
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }

  return data;
}

/**
 * Approve or reject a pending completion document.
 *
 * `decision` is 'Approved' or 'Rejected'. The server rejects a decision from a
 * caller who is neither the addressed role nor an admin override, and returns
 * the letter row so the caller can react to its new status without a refetch.
 */
export async function decide(submissionId, decision, note) {
  const { data, error } = await supabase.rpc('decide_completion', {
    p_submission_id: submissionId,
    p_decision: decision,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) throw error;
  return data;
}

/**
 * Fetch the bytes of one completion document, named and authorised the same way
 * ordinary attachments are. The `error` MUST be checked: a refused download
 * would otherwise become a `blob: null`, which renders as a corrupt file rather
 * than the storage-policy refusal it actually is.
 */
export async function download(submission) {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(submission.document_path);
  if (error || !blob) {
    throw error ?? new Error('The stored file could not be read.');
  }
  return { ...submission, blob };
}
