/**
 * The officer's start move, plus their note and certificate.
 *
 * Completion is NOT here. The officer no longer closes a letter directly; they
 * forward a completion document for approval (see `CompletionApprovalPanel`),
 * so this panel offers `start` alone.
 *
 * Every button here comes from `available_actions` — the array the server
 * computes from the same transition table it enforces with. Nothing is derived
 * from `status` and `role` in the browser (D61), and the reason is specific
 * rather than theoretical: a client-side copy of that table is a second source
 * of truth that offers a button the server will refuse, and it fails SILENTLY —
 * the button appears, the press 409s, and the user concludes the application is
 * broken. A rule encoded once on the server and returned per request cannot
 * disagree with itself.
 *
 * The two refusals this panel must distinguish (D62):
 *
 *   409  somebody else moved the letter. Nothing is wrong with the user. A
 *        Refresh WILL fix it, so one is offered.
 *   403  the caller is not this letter's officer. Retrying cannot help, so no
 *        Refresh is offered.
 *
 * IT DOES NOT RENDER THE ATTACHMENTS. It used to, and that was the bug that hid
 * the letter from the Secretary: `AttachmentList` was mounted ONLY here, and this
 * panel only renders when `start` is available — `officerOnly: true`, gated on
 * UPDATE_ACTION_STATUS, which SECRETARY does not hold. So the one component that can show a letter's scan was unreachable
 * for the one role whose whole task is to read the letter and endorse it. The
 * list is now rendered by `MailDetailPage` for every role that can open the
 * letter, above the minutes form; keeping a second copy here would show an
 * officer the same files twice on one screen.
 */
import { useState } from 'react';

import * as mailApi from '../../api/mailApi.js';
import { useApiError } from '../../hooks/useApiError.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Card } from '../common/Card.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

/**
 * `actions` is a SEPARATE prop, and that separation is the fix.
 *
 * This panel used to read `letter.available_actions`. But `available_actions` is
 * not a field of the letter — `mail_records` has no such column. The controller
 * puts it on the DETAIL RESPONSE as a sibling of `mail`:
 *
 *     data: { mail, minutes, attachments, audit, available_actions, current_state }
 *
 * so `letter.available_actions` was `undefined`, `?? []` swallowed it, and every
 * button in this panel was permanently unreachable. The panel rendered its
 * "The next step belongs to another role in the workflow" fallback to the one
 * person it exists for: the assigned officer holding an `Assigned` letter. The
 * server was returning `available_actions: ['start']` correctly the whole time;
 * the panel was looking in the wrong object.
 *
 * The failure was silent in the worst way — it looked like a permissions problem,
 * because "belongs to another role" is exactly what a permissions problem looks
 * like. The page itself reads the same field correctly for `canAssign`, which is
 * why assigning worked while advancing did not.
 *
 * It is passed in rather than merged onto `mail` (`letter={{...mail, ...}}`)
 * because a synthesised letter object invites the same mistake back: the next
 * reader sees `letter.available_actions` in a component and reasonably assumes
 * it came off the row.
 */
export function OfficerActionPanel({ letter, actions = [], onChanged }) {
  const { t } = useLanguage();
  const [progressNote, setProgressNote] = useState(letter.officer_status_note ?? '');
  const { failure, run, clear } = useApiError(t('officerPanel.actionFailed'));

  async function advance(action) {
    clear();
    await run(() => mailApi.changeStatus(letter.id, action, progressNote.trim() || undefined));
    onChanged();
  }

  async function saveNote() {
    clear();
    await run(() => mailApi.updateNotes(letter.id, 'officer_status_note', progressNote.trim()));
    onChanged();
  }

  const start = actions.find((a) => a.action === 'start');

  return (
    <div className="space-y-5">
      {start && (
        <Card title={t('officerPanel.progress')}>
          <p className="text-sm text-slate-600">{t('officerPanel.startHelp')}</p>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-slate-700">{t('officerPanel.progressLabel')}</span>
            <textarea
              rows={3}
              value={progressNote}
              onChange={(event) => setProgressNote(event.target.value)}
              placeholder={t('officerPanel.notePlaceholder')}
              className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {start && (
              <button
                type="button"
                onClick={() => advance('start')}
                className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                {start.label}
              </button>
            )}

            <button
              type="button"
              onClick={saveNote}
              className="rounded-btn border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-brand hover:text-white"
            >
              {t('officerPanel.saveNote')}
            </button>
          </div>

          {failure && (
            <div className="mt-3">
              {/* A Refresh only where it can help. Offering it on a 403 invites
                  the user to press it again for the same answer. */}
              <ErrorNote
                remedy={failure.remedy}
                onRetry={failure.retryable ? onChanged : undefined}
                retryLabel="Refresh this letter"
              >
                {failure.message}
              </ErrorNote>
            </div>
          )}
        </Card>
      )}

      {!start && (
        <Card title={t('officerPanel.yourActions')}>
          <p className="text-sm text-slate-600">
            {letter.status === 'Completed'
              ? t('officerPanel.closed')
              : t('officerPanel.otherRole')}
          </p>
        </Card>
      )}

      <p className="text-xs text-slate-500">{t('attachment.certificateHint')}</p>
    </div>
  );
}
