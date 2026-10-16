/**
 * The caller's role, as a chip in the header.
 *
 * A DISPLAY of `user.role`, and never a basis for a decision. Every gate in this
 * application asks `hasPermission(...)`; a `role === 'ADMIN'` comparison
 * anywhere in the client is a guess about the server that will be wrong the
 * moment a role is added (D25). This component exists so a person can see which
 * persona they are signed in as, which is a different question from what they
 * may do.
 */

import { useLanguage } from '../../context/LanguageContext.jsx';

/**
 * The role's display name.
 *
 * The enum values are SCREAMING_SNAKE (`SUBJECT_CLERK`) because they are stored
 * in a column and compared in queries, not displayed. Replacing underscores
 * with spaces is enough for English and is what this fell back to for months —
 * but "SUBJECT CLERK" is not how the ministry names the post, and it is the one
 * label every user sees next to their own name on every screen. The dictionary
 * carries the real titles.
 *
 * An unknown role falls through to the spaced form rather than showing the raw
 * enum: a new role added to the schema should still be readable in the UI, and
 * `t()` already logs the missing key in development.
 */
export function RoleBadge({ role }) {
  const { t } = useLanguage();

  if (!role) return null;

  const label = t(`role.${role}`);

  return (
    <span className="inline-flex items-center rounded-full bg-ink/10 px-2.5 py-0.5 text-xs font-medium tracking-wide text-ink ring-1 ring-ink/20 ring-inset whitespace-nowrap">
      {label === `role.${role}` ? role.replaceAll('_', ' ') : label}
    </span>
  );
}
