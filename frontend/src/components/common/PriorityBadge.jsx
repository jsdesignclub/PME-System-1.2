/**
 * Priority → colour, per spec §9.2: Normal grey, Urgent red, Confidential
 * purple.
 *
 * The three values are spec §5.2's ENUM (D48) and the same strings the server
 * validates, so this is a display map and not a policy. Which letters carry
 * `Confidential` is decided server-side by `mailScope` (Q7/D69) — a badge
 * appearing on a row means the caller is permitted to see that row, not that
 * they may read its body.
 *
 * Q21 answered 2026-09-30: the badge IS shown to every scope that can see the
 * row, including `MINOR_STAFF`. `priority` is readable by all of them, and
 * hiding a classification from the clerk who applied it would leave them
 * responsible for a marking they cannot see.
 */

import { useLanguage } from '../../context/LanguageContext.jsx';

const PRIORITY_CLASS = {
  Normal: 'bg-slate-200 text-slate-600 ring-slate-400',
  Urgent: 'bg-red-100 text-red-600 ring-red-300',
  Confidential: 'bg-purple-100 text-purple-600 ring-purple-300',
};

/** Distinct from StatusBadge's: a wrong value here is a security-relevant clue. */
const UNKNOWN_PRIORITY_CLASS = 'bg-amber-100 text-amber-600 ring-amber-400';

export function PriorityBadge({ priority }) {
  const { t } = useLanguage();
  const known = Object.hasOwn(PRIORITY_CLASS, priority);

  return (
    <span
      title={known ? undefined : t('priority.unknown', { priority })}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${
        known ? PRIORITY_CLASS[priority] : UNKNOWN_PRIORITY_CLASS
      }`}
    >
      {priority ? t(`priority.${priority}`) : '—'}
    </span>
  );
}
