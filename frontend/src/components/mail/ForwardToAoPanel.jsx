/**
 * Intake: send the logged letter to the Administrative Officer.
 *
 * WHY THIS PANEL EXISTS. The intake workflow is:
 *
 *     SUBJECT_CLERK logs the letter            (Logged)
 *       -> forwards the paper to the AO         (Forwarded to AO)
 *       -> AO handwrites the primary minute;
 *          the clerk types it                     (Forwarded to Subject)
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
 * THIS ONLY MOVES THE PAPER. The AO does not log in and does not type. The clerk
 * records what the AO wrote on the next step, which is why no field other than
 * the button belongs here — the letter is back on the clerk's desk the moment
 * the minute is typed.
 */
import { useState } from 'react';

import * as mailApi from '../../api/mailApi.js';
import { useApiError } from '../../hooks/useApiError.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Card } from '../common/Card.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

export function ForwardToAoPanel({ letter, notify, onChanged }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const { failure, run, clear } = useApiError(t('forward.failed'));

  async function forward() {
    clear();
    setBusy(true);
    const result = await run(() => mailApi.forwardToAo(letter.id));
    setBusy(false);

    if (result) {
      notify?.(t('forward.sent'), 'success');
      onChanged();
    }
  }

  return (
    <Card title={t('forward.title')}>
      <p className="text-sm text-slate-600">{t('forward.help')}</p>

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
        {busy ? t('forward.sending') : t('forward.submit')}
      </button>
    </Card>
  );
}
