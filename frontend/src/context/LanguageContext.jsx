/**
 * Language: English / Sinhala.
 *
 * ============================================================================
 * WHY NO LIBRARY (the one decision this file exists to record)
 * ============================================================================
 *
 * `i18next` + `react-i18next` is the standard answer and would work. This is
 * ~90 lines instead, because the dependency list is treated as a closed set
 * (D71 — the same constraint that stopped a webfont being bundled), and because
 * the feature actually needed is small: two languages, a flat key namespace, and
 * `{placeholder}` interpolation. What i18next would be buying here is plural
 * rules and lazy-loaded namespaces, and the plural cases that exist in this app
 * are two.
 *
 * If the app ever needs a third language, per-locale date formatting, or RTL,
 * that is the point to reconsider — not before.
 *
 * ============================================================================
 * THE FALLBACK CHAIN, AND WHY IT IS THREE DEEP
 * ============================================================================
 *
 *     selected language -> English -> the key itself
 *
 * The middle step is what makes a half-finished translation safe rather than
 * broken. Sinhala coverage will be incomplete for a while — it is being written
 * alongside a proofread, not shipped complete — and a missing key must cost one
 * English label, never a blank button or a thrown render. The last step matters
 * too: a key rendered as its own name is obviously wrong in the UI, where an
 * empty string looks deliberate.
 *
 * ============================================================================
 * WHY THE KEY IS WRITTEN BACK ONTO <html lang>
 * ============================================================================
 *
 * Two reasons, and the second is the one people forget:
 *
 *   1. Screen readers pick pronunciation and voice from `lang`. Sinhala text
 *      announced with `lang="en"` is read by an English synthesiser and comes
 *      out mangled.
 *   2. `lang` also drives the browser's own font fallback for the Sinhala
 *      script. Setting the attribute is what lets the stack in index.css pick
 *      Iskoola Pota / Noto Sans Sinhala instead of a Latin default.
 *
 * It is written in an effect rather than during render because the provider
 * renders above the document element; a DOM side effect belongs in an effect.
 *
 * ============================================================================
 * STORAGE KEY: `pme.lang`, matching `pme.sidebar.collapsed`
 * ============================================================================
 *
 * Persisted rather than defaulted from the browser, deliberately: an office
 * machine is shared, and a clerk who has chosen Sinhala should not find it
 * silently reverted to English because someone else used the machine first. The
 * language is a per-user preference stored on that user's machine, not a
 * property of the machine.
 *
 * An unrecognised stored value falls back to English rather than throwing. A
 * corrupted key should cost the default language, not a white screen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { en } from '../i18n/en.js';
import { si } from '../i18n/si.js';

const DICTIONARIES = Object.freeze({ en, si });
const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'pme.lang';
const SUPPORTED = Object.freeze(Object.keys(DICTIONARIES));

const LanguageContext = createContext(null);

/**
 * Substitute `{name}` placeholders.
 *
 * A missing value renders as an empty string rather than as the literal
 * `{count}`, because a visible brace in the UI reads as a bug in a way that a
 * missing number does not — and the translation is still the right shape.
 */
function interpolate(template, values) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined || values[name] === null ? '' : String(values[name]),
  );
}

function readStoredLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return SUPPORTED.includes(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    // Private browsing, or storage disabled. The app works; the preference
    // simply will not survive a reload.
    return DEFAULT_LANGUAGE;
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(readStoredLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // As above — a failed write must not interrupt the session.
    }

    const root = document.documentElement;
    root.lang = language;
  }, [language]);

  const t = useCallback(
    (key, values) => {
      const selected = DICTIONARIES[language]?.[key];

      if (selected !== undefined) return interpolate(selected, values);

      const fallback = DICTIONARIES[DEFAULT_LANGUAGE][key];
      if (fallback !== undefined) {
        // Loud in development only. A silent gap is how a half-finished
        // translation reaches production looking finished.
        if (import.meta.env?.DEV) {
          console.warn(`[i18n] missing ${language} translation for "${key}"`);
        }
        return interpolate(fallback, values);
      }

      if (import.meta.env?.DEV) {
        console.warn(`[i18n] "${key}" is not defined in any language`);
      }
      return key;
    },
    [language],
  );

  const value = useMemo(
    () => ({
      language,
      languages: SUPPORTED,
      setLanguage,
      toggle: () => setLanguage((current) => (current === 'si' ? 'en' : 'si')),
      t,
    }),
    [language, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }

  return context;
}

/**
 * Language names in their OWN script, always.
 *
 * A toggle reading "English | සිංහල" is unreadable to someone who cannot read
 * the other script, which is the one thing a language selector must not be. The
 * alternative — "English | Sinhala" in Latin — is readable but gives no hint
 * that tapping it switches script, so both are shown: each language is labelled
 * in its own script and in English.
 */
export const LANGUAGE_LABELS = Object.freeze({
  en: Object.freeze({ native: 'English', english: 'English' }),
  si: Object.freeze({ native: 'සිංහල', english: 'Sinhala' }),
});