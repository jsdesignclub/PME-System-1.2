/**
 * The endorsement, and the audit trail behind it.
 *
 * The author block is shown, not just the text. A minute is a decision with a
 * person attached to it, and "the subject is noted for necessary action" means
 * something different when the reader can see who endorsed it, in what capacity,
 * and when. The server derives `author_name` and `author_role` from the token
 * (Phase 2 D63), so what is displayed is who actually wrote it rather than who
 * claimed to.
 *
 * The text is rendered as TEXT — `whitespace-pre-line` and a plain `<p>`, never
 * `dangerouslySetInnerHTML` and never `html` (D66). Minutes are free text
 * written by an officer and printed into a government document; rendering them
 * as markup would let a letter contain a script tag that runs in an
 * administrator's session when the detail page is opened.
 */
import { formatDateTime } from '../../utils/dateUtils.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { EmptyState } from '../common/EmptyState.jsx';

export function MinutesTimeline({ minutes, audit }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <section>
        {minutes.length === 0 ? (
          <EmptyState title={t('minutes.noneYet')}>
            {t('minutes.forwardExplained')}
          </EmptyState>
        ) : (
          <ol className="space-y-4">
            {minutes.map((minute) => (
              <li key={minute.id} className="rounded-btn border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-medium text-ink">
                    {minute.instruction_type}
                  </span>
                  <span className="text-xs text-slate-500">{formatDateTime(minute.created_at)}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {minute.author_name} · {String(minute.author_role).replaceAll('_', ' ')}
                </p>
                {minute.recorded_by_user_id && (
                  <p className="mt-0.5 text-xs text-slate-500">{t('minutes.recordedBy')}</p>
                )}
                {minute.quick_note && (
                  <p className="mt-1 text-xs italic text-slate-600">
                    {t('minutes.quickNoteLabel', { note: minute.quick_note })}
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-700">
                  {minute.minutes_text}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{t('minutes.activity')}</h3>
        {audit.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">{t('minutes.noActivity')}</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {audit.map((entry) => (
              <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                <p className="text-sm font-medium text-slate-800">{entry.action}</p>
                <p className="text-xs text-slate-500">
                  {entry.user_id ? `User #${entry.user_id}` : 'System'} ·{' '}
                  {formatDateTime(entry.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
