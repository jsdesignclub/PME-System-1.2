/**
 * Which queue a letter is in while its status reads 'Forwarded to AO'.
 *
 * The stored status value is shared by two different steps: a ministry letter
 * waits on the Administrative Officer, while a letter that arrived at a branch
 * waits on that branch's Department Head. `mail_records.endorser_role` records
 * the difference once the forward has happened, but a newly logged letter has
 * no marker yet, and older rows may predate it. In both cases the clerk who
 * logged the letter identifies a branch letter: a non-central SUBJECT_CLERK.
 *
 * Keeping the fallback here means the badge, the rail, the registry and the
 * printed slip all answer "AO or branch head?" the same way.
 */
export function isBranchLetter(letter) {
  if (!letter) return false;
  if (letter.endorser_role === 'DEPARTMENT_HEAD') return true;
  if (letter.endorser_role === 'AO') return false;

  const creator = letter.created_by;
  return creator?.role === 'SUBJECT_CLERK' && creator?.is_central_clerk !== true;
}

/** The i18n key for a letter's status, naming the branch queue when it applies. */
export function statusLabelKey(letter) {
  const status = letter?.status;
  if (status === 'Forwarded to AO' && isBranchLetter(letter)) {
    return 'status.Forwarded to Branch Head';
  }
  return `status.${status}`;
}
