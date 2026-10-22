/**
 * Intake: send the logged letter to whoever writes its primary minute.
 *
 * The step is stored as 'Forwarded to AO', but that name describes a MINISTRY
 * letter only. A letter that arrived at a branch never goes to the AO: the
 * branch clerk carries it to their own Department Head, who endorses it, and
 * types the head's minute afterwards. `endorser_role` on the letter records
 * which of the two is true, and this panel chooses its words from the caller's
 * profile — the same profile the server marks the letter from.
 *
 * WHY THIS PANEL EXISTS. The intake workflow is:
 *
 *     SUBJECT_CLERK logs the letter            (Logged)
 *       -> forwards the paper to the AO         (Forwarded to AO)
 *       -> the AO handwrites the primary minute on the paper;
 *          the AO — or the MAIN subject clerk, on the AO's behalf —
 *          types it into the system              (Forwarded to Subject)
 *       -> the clerk assigns an officer         (Assigned)
 *
 * The first step needs a button, and until this panel was added there was not
 * one. `mail_available_actions` returned `forward_to_ao` for a `Logged` letter
 * and `mailApi.forwardToAo()` had been written, but no component called it — so
 * the status rail honestly read "Available to you: Forward to AO" while the page
 * offered no way to do it. The clerk filed a letter and then watched it sit.
 *
 * The button comes from `available_actions`, never from `status` and `role`
 * (D61): the server computes that array from the same transition table it
 * enforces with, so a button can never appear for a move that would 409.
 *
 * THIS ONLY MOVES THE PAPER. The AO handwrites the minute; typing it into the
 * system is the next step, and that step belongs to the AO or — when the AO has
 * not had time to log in — to the main subject clerk. Either way the letter is
 * back on the clerk's desk the moment the minute is recorded, which is why no
 * field other than the button belongs here.
 */
import { useState } from 'react';

import * as mailApi from '../../api/mailApi.js';
import { useApiError } from '../../hooks/useApiError.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Card } from '../common/Card.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

export function ForwardToAoPanel({ letter, notify, onChanged }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  // A letter that arrived at a BRANCH is endorsed by that branch's Department
  // Head, not by the ministry AO: the clerk carries the paper to their own head
  // and types the head's minute afterwards. The server marks the letter that way
  // from this same profile (see `forwardToAo`), so the wording here and the
  // policy agree without the client sending a thing.
  const branch = user?.role === 'SUBJECT_CLERK' && !user?.is_central_clerk;
  const titleKey = branch ? 'forward.branchTitle' : 'forward.title';
  const helpKey = branch ? 'forward.branchHelp' : 'forward.help';
  const submitKey = branch ? 'forward.branchSubmit' : 'forward.submit';
  const sentKey = branch ? 'forward.branchSent' : 'forward.sent';
  const failedKey = branch ? 'forward.branchFailed' : 'forward.failed';

  const { failure, run, clear } = useApiError(t(failedKey));

  async function forward() {
    clear();
    setBusy(true);
    const result = await run(() => mailApi.forwardToAo(letter.id));
    setBusy(false);

    if (result) {
      notify?.(t(sentKey), 'success');
      onChanged();
    }
  }

  return (
    <Card title={t(titleKey)}>
      <p className="text-sm text-slate-600">{t(helpKey)}</p>

      {failure && (
        <div className="mt-3">
          {/* A Refresh only where it can help: a 409 means the letter moved
              under the clerk (shared intake desk), a 403 means this role may not
              move it and retrying cannot change that. */}
          <ErrorNote
            remedy={failure.remedy}
            onRetry={failure.retryable ? forward : undefined}
            retryLabel={t('forward.retry')}
          >
            {failure.message}
          </ErrorNote>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={forward}
        className="mt-3 w-full rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink transition hover:brightness-95 disabled:opacity-50"
      >
        {busy ? t('forward.sending') : t(submitKey)}
      </button>
    </Card>
  );
}
