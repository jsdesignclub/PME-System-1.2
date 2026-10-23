/**
 * The minute slip — the printed artefact this whole system exists to produce.
 *
 * ============================================================================
 * WHAT THE SPEC ACTUALLY SPECIFIES
 * ============================================================================
 *
 * Four things, and no more: a "Print Engine" (§3), a "Printable Minute Slip
 * Generated" at COMPLETED & ARCHIVED (§6), `@media print` on this component
 * (§9.2), and a native print-dialog trigger (§9.2). Everything below — A4,
 * portrait, 15mm margins, the header layout, the three signature blocks — is
 * this project's decision and is recorded as D67 rather than presented as
 * something the spec asked for.
 *
 * ============================================================================
 * THE THING THAT MAKES IT WORK
 * ============================================================================
 *
 * The slip is ALWAYS MOUNTED, hidden on screen, and revealed by `@media print`.
 * It is not assembled when Print is pressed. That is the whole trick: a print
 * dialog opened against a document that has not finished rendering prints what
 * is on screen at that instant, and a conditionally-mounted slip is a race the
 * user wins on a fast machine and loses on a slow one. Always-mounted means
 * there is nothing to wait for.
 *
 * The same reason puts `no-print` on the header, sidebar, filter bar, action
 * buttons and toasts. A minute slip with the application's navigation printed
 * across the top is not a document an office will staple to a file, and the
 * failure is invisible in a screenshot of the screen.
 *
 * ============================================================================
 * WHAT IS NOT CLAIMED
 * ============================================================================
 *
 * Exactly one page. A long subject or a long endorsement decides that, and no
 * CSS can promise otherwise. The guarantee is `break-inside: avoid` on the
 * minutes and the signature blocks, so no block is split across a page break —
 * an orphaned heading at the foot of a page is the artefact that actually looks
 * like a mistake.
 *
 * Q20 answered 2026-09-30: printable at EVERY state, not only `Completed`. Spec
 * §6 ties the slip to COMPLETED & ARCHIVED, but a clerk mid-routing has a
 * legitimate need to see the draft endorsement. The slip therefore carries the
 * letter's own status on its face, so an early print cannot be mistaken for the
 * file copy.
 */
import { useState } from 'react';

import { STATES } from '../../context/MailContext.jsx';
import { formatDate, formatDateTime } from '../../utils/dateUtils.js';
import { statusLabelKey } from '../../utils/mailStatus.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { printDocument } from '../../utils/printUtils.js';
import { Emblem } from '../common/Header.jsx';

/**
 * The three ruled signature blocks (spec §4.1's three signatures).
 *
 * Signature BLOCKS, not e-signatures. The word "signature" appears nowhere in
 * the spec; what a printed minute slip needs is a line for each party to sign,
 * and a cryptographic signature is Phase 4 audit work. Labelled by ROLE rather
 * than by name, because the officer is not named until they are assigned, and a
 * block pre-filled with the wrong name is worse than an empty one.
 */
const SIGNATURE_ROLES = [
  { role: 'Endorsing officer', hint: 'Secretary or Administrative Officer' },
  { role: 'Subject clerk', hint: 'Routing' },
  { role: 'Action officer', hint: 'Execution' },
];

export function PrintMinuteSlip({ mail, minutes }) {
  const { t } = useLanguage();
  const minute = minutes[0] ?? null;

  // Captured ONCE, on mount, rather than read from the clock during render.
  //
  // Two reasons. It is the honest reading of the field — the slip is opened, then
  // printed, and the two are minutes apart at most; a slip that says "Printed
  // 14:02:11" on one render and "14:04:37" on the next is a slip whose own metadata
  // moves under the reader. And `new Date()` during render is an impure read: any
  // re-render for an unrelated reason (a status change upstream, a resize, a
  // StrictMode double-invoke) produces a different printed timestamp, which is the
  // instability React's purity rule exists to prevent.
  const [printedAt] = useState(() => new Date());

  return (
    <div className="print-only">
      <article className="minute-slip">
        <header className="slip-header">
          <div className="slip-brand">
            <Emblem className="h-14 w-14" />
            <div>
               <p className="slip-ministry">{t('print.ministry')}</p>
               <h1 className="slip-title">{t('print.slipTitle')}</h1>
            </div>
          </div>

          <dl className="slip-reference">
            <div>
              <dt>{t('print.dayStamp')}</dt>
              <dd className="font-mono">{mail.day_stamp_no}</dd>
            </div>
            <div>
              <dt>{t('print.reference')}</dt>
              <dd className="font-mono">{mail.letter_ref_no ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('print.status')}</dt>
              <dd>{t(statusLabelKey(mail))}</dd>
            </div>
          </dl>
        </header>

        <section className="slip-section">
          <h2 className="slip-heading">{t('print.letter')}</h2>
          <dl className="slip-fields">
            <Row label={t('print.receivedOn')} value={formatDate(mail.receipt_date)} />
            <Row label={t('print.senderType')} value={mail.sender_type} />
            <Row label={t('print.sender')} value={mail.sender_name} />
            <Row label={t('print.subject')} value={mail.subject} wide />
            <Row label={t('print.category')} value={mail.category} />
            <Row label={t('print.priority')} value={mail.priority} />
            <Row label={t('print.loggedBy')} value={mail.created_by_name} />
            <Row label={t('print.registry')} value={mail.created_by_department_name ?? '—'} />
            <Row label={t('print.actionOfficer')} value={mail.assigned_officer_name ?? t('print.notYetAssigned')} />
            {mail.completion_date && (
              <Row label={t('print.completedOn')} value={formatDate(mail.completion_date)} wide />
            )}
          </dl>
        </section>

        <section className="slip-section slip-avoid-break">
          <h2 className="slip-heading">{t('print.endorsement')}</h2>
          {minute ? (
            <>
              <dl className="slip-fields">
                <Row label={t('print.instruction')} value={minute.instruction_type} />
                <Row label={t('print.recordedOn')} value={formatDateTime(minute.created_at)} />
              </dl>
              {/* The minutes text is rendered as TEXT. Sinhala and Tamil must
                  survive to paper, and `whitespace-pre-line` preserves the
                  clerk's line breaks without any markup at all. */}
              <p className="slip-minutes">{minute.minutes_text}</p>
              <p className="slip-author">
                {minute.author_name} · {String(minute.author_role).replaceAll('_', ' ')}
              </p>
              {minute.recorded_by_user_id && (
                <p className="slip-author">{t('minutes.recordedBy')}</p>
              )}
              {minute.quick_note && (
                <p className="slip-minutes" style={{ marginTop: '6pt', fontStyle: 'italic' }}>
                  {t('minutes.quickNoteLabel', { note: minute.quick_note })}
                </p>
              )}
            </>
          ) : (
            <p className="slip-minutes slip-empty">
              {t('print.noEndorsement')}
            </p>
          )}
        </section>

        <section className="slip-signatures">
          {SIGNATURE_ROLES.map((signature) => (
            <div key={signature.role} className="slip-avoid-break">
              <p className="slip-signature-rule" />
              <p className="slip-signature-role">{signature.role}</p>
              <p className="slip-signature-hint">{signature.hint}</p>
            </div>
          ))}
        </section>

        <footer className="slip-footer">
          {/* Printed on every copy, including an early one. This is what keeps
              Q20's "printable at any state" honest: a slip pulled mid-routing
              says so on its face. */}
          <span>
            {STATES.indexOf(mail.status) === STATES.length - 1
              ? t('print.fileCopy')
              : t('print.workingCopy', { status: t(statusLabelKey(mail)) })}
          </span>
          <span>Printed {formatDateTime(printedAt)}</span>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, wide = false }) {
  return (
    <div className={wide ? 'slip-field slip-field-wide' : 'slip-field'}>
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

/**
 * The Print button.
 *
 * `no-print`, obviously — a print button on the printed slip is the classic way
 * to end up with two of them on the paper.
 */
export function PrintButton() {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={printDocument}
      className="no-print rounded-btn border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-brand hover:text-white"
    >
      {t('print.button')}
    </button>
  );
}
