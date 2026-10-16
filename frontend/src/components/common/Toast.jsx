/**
 * Transient notices.
 *
 * Rendered through a context so any component can report a success without the
 * message having to be threaded down as a prop from the page that happens to
 * own the state. Kept in `common/` because it is a page-level surface, not a
 * per-panel one.
 *
 * The provider is here rather than in its own file: spec §9.2 lists
 * `Toast.jsx` under `components/common/`, and the context object and its
 * provider are one concept here — unlike AuthContext, where the spec explicitly
 * puts the consumer in `hooks/`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

/** How long a notice stays before it removes itself. */
const DISMISS_AFTER_MS = 4000;

const TONE = {
  success: 'border-brand-300 bg-brand-50 text-brand-400',
  error: 'border-red-300 bg-red-50 text-red-900',
  info: 'border-slate-300 bg-surface text-slate-800',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = 'info') => {
      if (!message) return;
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      // A timer per toast, cleared on unmount. `error` notices are not
      // auto-dismissed: an error the user did not finish reading is an error
      // they will act on incorrectly, and the panel that raised it also shows it
      // inline with a Refresh where one is warranted.
      if (tone !== 'error') {
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>');
  return value;
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div
      // `no-print` so a confirmation does not end up stapled to a printed minute
      // slip — the failure is visible in the acceptance sweep as a stray white
      // box in the corner of the paper.
      className="no-print pointer-events-none fixed right-4 bottom-4 z-40 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-start justify-between gap-3 rounded-btn border px-3 py-2 text-sm shadow-lg ${
            TONE[toast.tone] ?? TONE.info
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 text-xs opacity-60 transition hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
