/**
 * The language switch.
 *
 * ============================================================================
 * THE BUTTON NAMES THE TARGET, NOT THE CURRENT STATE
 * ============================================================================
 *
 * A control reading "English" while the app is in English reads as "you are
 * looking at English" and gives no clue that pressing it does anything. So the
 * button always names the language you will GET by pressing it, and its
 * `aria-label` says which one that is.
 *
 * With two languages this is unambiguous. It stops being unambiguous at three,
 * at which point the toggle should become a listbox showing all languages with
 * the current one marked — worth knowing before a third language is added
 * rather than after.
 *
 * ============================================================================
 * BOTH SCRIPTS ON THE LABEL, DELIBERATELY
 * ============================================================================
 *
 * The button shows the target language in its own script AND names it in
 * English underneath. Two reasons:
 *
 *   1. A reader who cannot read the other script still learns what the button
 *      does. A label in a script the user does not read is a label they cannot
 *      use.
 *   2. The pairing teaches that this app speaks two languages, which a lone
 *      "සිංහල" does not.
 *
 * `lang` is set per span so a screen reader switches voice for the native name
 * instead of attempting to read Sinhala with an English synthesiser.
 */
import { Languages } from 'lucide-react';

import { useLanguage, LANGUAGE_LABELS } from '../../context/LanguageContext.jsx';

export function LanguageToggle({ className = '' }) {
  const { language, languages, toggle, t } = useLanguage();

  // With one language there is nothing to switch to, so the control is not
  // rendered at all rather than rendered inert.
  if (languages.length < 2) return null;

  const target = languages.find((code) => code !== language) ?? languages[0];
  const targetLabel = LANGUAGE_LABELS[target] ?? { native: target, english: target };

  return (
    <button
      type="button"
      onClick={toggle}
      title={t('lang.switchTo', { language: targetLabel.english })}
      aria-label={t('lang.switchTo', { language: targetLabel.english })}
      className={`flex items-center gap-2 rounded-btn border border-slate-300 px-2.5 py-1.5 text-left transition hover:border-brand hover:bg-brand-50 ${className}`}
    >
      <Languages className="size-4 shrink-0 text-ink" aria-hidden="true" />

      <span className="flex flex-col leading-tight">
        <span lang={target} className="text-xs font-semibold text-ink">
          {targetLabel.native}
        </span>
        <span className="text-[0.65rem] text-slate-500">{targetLabel.english}</span>
      </span>
    </button>
  );
}