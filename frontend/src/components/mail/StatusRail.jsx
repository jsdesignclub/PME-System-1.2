/**
 * The six states as a track, with the current one marked.
 *
 * Shown even when it carries no information, because "where is this letter in
 * the process" is the first question anyone asks about a piece of
 * correspondence that has been passed between four people.
 *
 * The minutes marker sits on `Forwarded to Subject`, immediately after the
 * `Forwarded to AO` stop, and that placement is D60's point rather than a visual
 * detail. Recording the endorsement is what performs the forward — the clerk
 * does both in one step — so the marker is drawn at the seam between those two
 * stops, not at either end.
 *
 * The current index is looked up rather than assumed: a status this build does
 * not know renders the whole track as "not reached" rather than pretending the
 * letter is in the first state, which is the safe direction to be wrong in.
 */
import { STATES } from '../../context/MailContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';

export function StatusRail({ status, hasMinutes, availableActions = [], endorserRole = null, branch = false }) {
  const { t } = useLanguage();
  const currentIndex = STATES.indexOf(status);
  const unknown = currentIndex === -1;

  // The states are drawn verbatim (D48), but 'Forwarded to AO' names the wrong
  // person for a letter that arrived at a branch: that stop is waiting on the
  // branch's Department Head. `endorser_role` tells the two apart once the
  // forward is made; `branch` covers a freshly logged branch letter, before the
  // marker exists. See StatusBadge for why the status value itself is not
  // renamed.
  const branchStop = branch || endorserRole === 'DEPARTMENT_HEAD';

  return (
    <ol
      className="no-print flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-surface p-2 shadow-sm"
      aria-label={t('status.railLabel')}
    >
      {STATES.map((state, index) => {
        const done = !unknown && index < currentIndex;
        const active = !unknown && index === currentIndex;
        const minutesHere = hasMinutes && index === 2;

        return (
          <li
            key={state}
            aria-current={active ? 'step' : undefined}
            className={`flex-1 rounded-btn px-3 py-2 text-center text-xs font-medium ${
              active
                ? 'bg-brand text-ink'
                : done
                  ? 'bg-brand-50 text-brand-400'
                  : 'bg-slate-50 text-slate-400'
            }`}
          >
            <span className="mr-1.5 font-mono">{index + 1}</span>
            {branchStop && state === 'Forwarded to AO'
              ? t('status.Forwarded to Branch Head')
              : state}
            {done && ' ✓'}
            {minutesHere && (
              <span
                className="ml-1.5 rounded bg-ink/10 px-1 py-0.5 text-[0.6rem] text-ink"
                title={t('status.railMinutes')}
              >
                ✎ minutes
              </span>
            )}
          </li>
        );
      })}

      <li className="w-full pt-1 text-center text-xs text-slate-500">
        {unknown
          ? t('status.unknown', { status })
          : availableActions.length > 0
            ? t('rail.available', { labels: availableActions.map((a) => a.label).join(', ') })
            : t('rail.noneAvailable')}
      </li>
    </ol>
  );
}
