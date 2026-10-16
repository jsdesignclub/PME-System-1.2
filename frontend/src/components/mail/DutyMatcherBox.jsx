/**
 * The duty matcher's answer, with its reasoning.
 *
 * The score is shown NEXT TO the keywords that produced it, never on its own.
 * That is D54, and it is the difference between a suggestion and a guess: a
 * candidate presented as a number is a number a clerk stops checking after the
 * first time it is wrong. `scored_duties` is shown for the same reason — two
 * candidates out of fourteen duty rows is a different answer from two out of
 * two, and only the denominator tells them which.
 *
 * Selection is one click; assignment is a SEPARATE, explicit press (D72). A
 * matcher that assigns on selection would route a letter to an officer because
 * a clerk was reading the list, and the letter would be `Assigned` with no
 * decision having been made. Nothing here writes to the server.
 */
import { Card } from '../common/Card.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';
import { Spinner } from '../common/Spinner.jsx';

import { useLanguage } from '../../context/LanguageContext.jsx';

export function DutyMatcherBox({ result, loading, error, selected, onSelect, canAssign }) {
  const { t } = useLanguage();
  return (
    <Card
      title={t('matcher.title')}
      action={
        result ? (
          <span className="text-xs text-slate-500">{t('matcher.scored', { count: result.scored_duties })}</span>
        ) : null
      }
    >
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && <Spinner label={t('matcher.loading')} />}

      {!loading && !error && !result && (
        <EmptyState title={t('matcher.noSuggestion')}>{t('matcher.noSuggestionHint')}</EmptyState>
      )}

      {!loading && result && Array.isArray(result.candidates) && result.candidates.length === 0 && (
        <EmptyState title={t('matcher.noMatch')}>
          The matcher scores a letter against duty keywords only. Nothing in the
          current charts matches the words in this subject, so no officer is
          proposed — pick one by hand from the assign list.
        </EmptyState>
      )}

      {!loading && result && Array.isArray(result.candidates) && result.candidates.length > 0 && (
        <>
          <ol className="space-y-2">
            {result.candidates.map((candidate) => {
              const key = `${candidate.officer_user_id}-${candidate.duty_id}`;
              const chosen = selected === candidate.officer_user_id;

              return (
                <li key={key}>
                  <button
                    type="button"
                    // Selecting is NOT assigning. The `onSelect` callback only
                    // pre-fills the assign form; the POST happens on an explicit
                    // press of the Assign button (D72).
                    onClick={() => onSelect(candidate.officer_user_id)}
                    aria-pressed={chosen}
                    className={`w-full rounded-btn border p-3 text-left transition ${
                      chosen
                        ? 'border-brand bg-amber-50 ring-1 ring-brand'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{candidate.full_name}</p>
                        <p className="text-xs text-slate-500">{candidate.section_name}</p>
                      </div>
                      <span className="rounded-full bg-ink/10 px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                        {candidate.score}
                      </span>
                    </div>

                    {candidate.matched_keywords.length > 0 && (
                      <p className="mt-1.5 text-xs text-slate-600">
                        {t('matcher.matched')}
                        {candidate.matched_keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="mr-1 rounded bg-brand-50 px-1.5 py-0.5 text-brand-400"
                          >
                            {keyword}
                          </span>
                        ))}
                      </p>
                    )}

                    {candidate.description_matches.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        {t('matcher.descriptionMatches')}{candidate.description_matches.join(', ')}
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {canAssign ? (
            <p className="mt-3 text-xs text-slate-500">
              {t('matcher.notAssigned')}
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              {t('matcher.cannotAssign')}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
