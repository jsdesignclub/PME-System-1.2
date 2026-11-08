/**
 * Branch desk: hand a MINUTED letter back to the clerk's own Department Head for
 * a new minute.
 *
 * The letter is at 'Forwarded to Subject' because the AO (or another branch)
 * has already endorsed it and the main clerk routed it to this branch. The
 * branch head has not seen the paper yet, and this branch cannot act until the
 * head has minuted it. One press sends it back to the head's queue; the branch
 * clerk records the head's minute on the next step, exactly as they record the
 * minute on a letter that arrived straight at the branch.
 *
 * The button comes from `available_actions`, never from `status` and `role`
 * (D61): the server only offers `send_to_branch_head` when the letter is
 * minuted, in this clerk's department, and this branch has not already put its
 * head's minute on it.
 */
import { useState } from 'react';

import * as mailApi from '../../api/mailApi.js';
import { useApiError } from '../../hooks/useApiError.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Card } from '../common/Card.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

export function SendToBranchHeadPanel({ letter, notify, onChanged }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const { failure, run, clear } = useApiError(t('branchHead.failed'));

  async function send() {
    clear();
    setBusy(true);
    const result = await run(() => mailApi.sendToBranchHead(letter.id));
    setBusy(false);

    if (result) {
      notify?.(t('branchHead.sent'), 'success');
      onChanged();
    }
  }

  return (
    <Card title={t('branchHead.title')}>
      <p className="text-sm text-slate-600">{t('branchHead.help')}</p>

      {failure && (
        <div className="mt-3">
          <ErrorNote
            remedy={failure.remedy}
            onRetry={failure.retryable ? send : undefined}
            retryLabel={t('forward.retry')}
          >
            {failure.message}
          </ErrorNote>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={send}
        className="mt-3 w-full rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink transition hover:brightness-95 disabled:opacity-50"
      >
        {busy ? t('branchHead.sending') : t('branchHead.submit')}
      </button>
    </Card>
  );
}
