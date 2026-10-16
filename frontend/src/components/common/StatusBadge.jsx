/**
 * The chip shape shared by every badge.
 *
 * Not in spec §9.2's file list, and deliberately kept inside
 * `StatusBadge.jsx` rather than promoted to `components/common/Chip.jsx`. It is
 * a presentational primitive that no page uses directly, and a
 * `components/` directory that grows a file per two lines of styling is a worse
 * answer than one extra export in a file that already owns the concept.
 */

/**
 * Status → colour.
 *
 * Written as a total map over STATES rather than a lookup with a default,
 * because the default branch is where a newly added state would land: grey,
 * unreadable, and invisible in review. Adding a state to the workflow should
 * break this file loudly, not quietly.
 *
 * The five states need five DISTINGUISHABLE chips, and on the dark canvas they
 * are drawn from the semantic accents the design names — purple for the states
 * the workflow is driving towards, blue for the two in transit, amber for the
 * one that needs a person, grey for the state that means "nothing is happening
 * yet". Each chip is a DARK tint with LIGHT text (`-100` fill, `-600` label):
 * the light-theme reading of those steps is inverted, so `text-blue-600` is a
 * pale blue on a deep navy, not the other way round. See the ramp note in
 * index.css.
 *
 * These are the SAME colours `STATE_COLOURS` in charts/chartTheme.js gives the
 * donut slices, and they are kept in step by hand: a chip and the slice for the
 * same letter telling two different colour stories is the bug this pairing
 * exists to prevent.
 */
import { useLanguage } from '../../context/LanguageContext.jsx';

const STATUS_CLASS = {
  Logged: 'bg-slate-200 text-slate-600 ring-slate-400',
  'Forwarded to AO': 'bg-blue-100 text-blue-600 ring-blue-300',
  'Forwarded to Subject': 'bg-purple-100 text-purple-600 ring-purple-300',
  Assigned: 'bg-brand-100 text-brand-400 ring-brand-300',
  'In Progress': 'bg-amber-100 text-amber-600 ring-amber-300',
  'Pending Approval': 'bg-brand-200 text-brand-400 ring-brand-300',
  Completed: 'bg-green-100 text-green-600 ring-green-300',
};

/** Shown when the server sends a status this build does not know. */
const UNKNOWN_STATUS_CLASS = 'bg-amber-100 text-amber-600 ring-amber-400';

function Chip({ className, children, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * The workflow states, verbatim from spec §5.2 (D48).
 *
 * `Forwarded to Subject` is spelled with a space because the ENUM spells it that
 * way. The spec's own §9.2 comment says "Forwarded", which is a third thing and
 * matches nothing in the database — a badge keyed on the short form renders the
 * unknown branch, which is grey, for every forwarded letter in the registry.
 */
export function StatusBadge({ status }) {
  const { t } = useLanguage();
  const known = Object.hasOwn(STATUS_CLASS, status);

  // The label is translated by `t()`, keyed on the raw status string. That key
  // space is `status.<the value>` rather than `status.logged`, so the SAME table
  // that decides the colour also decides the lookup: a new status added to
  // STATUS_CLASS without a matching dictionary key renders in English rather
  // than looking up a key nobody wrote.
  return (
    <Chip
      className={known ? STATUS_CLASS[status] : UNKNOWN_STATUS_CLASS}
      title={known ? undefined : t('status.unknown', { status })}
    >
      {status ? t(`status.${status}`) : '—'}
    </Chip>
  );
}
