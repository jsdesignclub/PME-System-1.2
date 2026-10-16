/**
 * An accessible modal overlay.
 *
 * Spec §9.2 names `Modal.jsx` with "focus trap, Esc, backdrop, aria-modal" and
 * this is all four, because a dialog a keyboard user cannot leave is worse than
 * no dialog at all.
 *
 * The focus handling has three parts and all three are needed:
 *
 *  1. On open, focus moves INTO the dialog. Without this, focus stays on the
 *     button that opened it, which is behind the overlay — so the next Tab
 *     walks the page underneath and the user is typing into an invisible form.
 *  2. Tab is trapped. The browser's own focus order would otherwise wrap out of
 *     the dialog into the page behind it.
 *  3. On close, focus returns to whatever opened it. Otherwise focus falls to
 *     `document.body` and a keyboard user has to Tab from the top of the page
 *     to get back to where they were.
 *
 * ============================================================================
 * THE ENTRANCE USES FRAMER MOTION, AND THE REDUCED-MOTION BRANCH IS THE POINT
 * ============================================================================
 *
 * The overlay fades in and the panel rises and scales slightly, which is what
 * makes a dialog read as having been PLACED over the page rather than as the
 * page having changed. This is the one animation in the app that framer-motion
 * earns its place for: the app's other entrants are CSS keyframes on elements
 * that mount with a page, where a keyframe is the smaller answer, but a dialog
 * mounts on a user action and a CSS transition would have nothing to transition
 * FROM — it needs an initial value and a next value on the same element.
 *
 * `useReducedMotion` rather than a `motion-reduce:` class, because these are
 * initial/animate props rather than styles: with the preference set both motion
 * objects are empty, the panel simply appears, and — this is the part that
 * matters — the focus trap above still runs, so the dialog remains fully usable
 * with the movement removed rather than with the dialog removed.
 */
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const panel = useRef(null);
  const opener = useRef(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return undefined;

    // Remember what had focus so it can be handed back on close. Captured in an
    // effect rather than during render: the trigger may not be mounted yet when
    // this component first renders.
    opener.current = document.activeElement;

    // Focus the first control, falling back to the panel itself when the dialog
    // has none — a dialog whose content is all text still needs to receive focus
    // so a screen reader announces it and so Esc works from inside it. Written as
    // an `if` rather than `first?.focus() ?? panel.current?.focus()` because that
    // was an unused expression: `focus()` returns undefined either way, so the
    // `??` always took the right-hand side and the first control was never
    // focused at all.
    const first = panel.current?.querySelector(FOCUSABLE);
    if (first) {
      first.focus();
    } else {
      panel.current?.focus();
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = Array.from(panel.current?.querySelectorAll(FOCUSABLE) ?? []);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      // Wrap at both ends. `!panel.current.contains(active)` covers the case
      // where focus has escaped the dialog entirely — which happens when the
      // user clicks the backdrop — and without it Tab would continue into the
      // page behind.
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);

    // The page behind must not scroll while a dialog is open. Without this, a
    // dialog taller than the viewport scrolls the content behind it on wheel,
    // and closing the dialog leaves the user somewhere they were not.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <motion.div
      {...(reduceMotion
        ? {}
        : {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            transition: { duration: 0.18, ease: 'easeOut' },
          })}
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(event) => {
        // Backdrop click closes, but only when the press STARTED on the
        // backdrop. Otherwise a text selection that ends outside the panel
        // would close the dialog, which is a bug users hit constantly when
        // copying a paragraph out of it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        {...(reduceMotion
          ? {}
          : {
              initial: { opacity: 0, y: 10, scale: 0.98 },
              animate: { opacity: 1, y: 0, scale: 1 },
              transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
            })}
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-panel bg-surface shadow-pop ${
          wide ? 'max-w-4xl' : 'max-w-lg'
        }`}
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-btn px-2 py-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </header>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
            {footer}
          </footer>
        )}
      </motion.div>
    </motion.div>
  );
}
