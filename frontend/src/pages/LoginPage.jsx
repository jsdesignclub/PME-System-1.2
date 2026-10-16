import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { errorMessage } from '../api/axiosClient.js';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
// The ministry mark, shared with the signed-in header. See the note at the mark
// below on why this is an import rather than a second inline copy.
import { Emblem } from '../components/common/Header.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useLanguage } from '../context/LanguageContext.jsx';

/**
 * ============================================================================
 * NO DEMO ACCOUNTS ON THIS PAGE
 * ============================================================================
 *
 * Earlier versions of this file printed all eight seeded personas and their
 * shared password, each a button that filled the form. They are gone, and the
 * removal is deliberate rather than cosmetic.
 *
 * Every one of those accounts is a real row in `users` with a real
 * `password_hash` and a real set of RBAC permissions. `881234560V` is an ADMIN
 * with the full permission set. Printing its password on the sign-in page means
 * that anything able to read this screen — a screenshot in a slide deck, a
 * shoulder-surfer, a screen left open on a reception counter, a support ticket
 * screenshot — is an administrator account.
 *
 * The seeded accounts still exist and still work. They are documented in
 * README.md, which is where a demo operator needs them and which is not served to
 * the public. That is the right place for a published credential: in the
 * operator's own notes, not painted on the door.
 *
 * What replaced the cards is a single quiet line telling the operator where to
 * look, so nobody demoing this has to go hunting.
 */
export default function LoginPage() {
  const { t } = useLanguage();
  const { signIn, session, loading } = useAuth();
  const navigate = useNavigate();

  const [nic, setNic] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Checked only once the session load has finished. A signed-in user who hard-
  // refreshes this URL has a token in localStorage but an empty session until
  // `/auth/me` answers; redirecting on `!session` during that window would flash
  // this form at someone who is already signed in, and the flash is what makes a
  // working app look broken.
  if (!loading && session?.token) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(nic.trim(), password);
      navigate('/', { replace: true });
    } catch (failure) {
      setError(errorMessage(failure, 'Sign-in failed.'));
      // Clear the password on failure. A stale password left in a field is what a
      // shoulder-surfer reads, and after a wrong guess the user is about to retype
      // it anyway.
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-canvas">
      {/*
        Decorative only. `aria-hidden` because it is a background wash with no
        meaning — a screen reader announcing "decorative gradient" is noise.
        `pointer-events-none` so it can never intercept a click meant for the form.
        The page clips X only: on a short landscape phone the content is taller
        than the viewport and it must still be scrollable, which `overflow-hidden`
        on both axes would prevent.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(115,87,237,0.28)_0%,transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(79,140,255,0.16)_0%,transparent_50%)]"
      />

      {/*
        The ministry mark: centred horizontally and pinned to the top of the page.

        This is the SAME `Emblem` the signed-in header draws, imported rather than
        re-made. Two hand-kept copies of a government mark are two chances to ship
        different ones, and the one on the sign-in page is the one a stranger
        judges the system by.
      */}
      <div className="relative flex shrink-0 flex-col items-center gap-3 px-4 pt-8 text-center sm:pt-12">
        <Emblem className="size-12 sm:size-14" />
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-wide text-white sm:text-base">
            {t('app.ministry')}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
            {t('app.title')}
          </p>
        </div>
      </div>

      {/*
        The form, centred in the space the mark leaves. `flex-1 items-center` is
        what centres it vertically WITHOUT a fixed offset that breaks when the
        content reflows — an error message appearing must not push the fields off
        the optical centre, and `justify-center` on a `min-h-*` wrapper with
        `overflow-hidden` would clip them on a short viewport instead.

        Top padding is deliberately much smaller than the bottom. Centring splits
        the leftover space evenly, so matching padding on both sides re-opens a
        gap under the mark that the mark's own top padding was meant to define.
        Bottom padding stays generous so a short form does not sit on the edge.
      */}
      <div className="relative flex flex-1 items-center justify-center px-4 pt-3 pb-8 sm:px-6 sm:pt-5 sm:pb-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {t('auth.signIn')}
          </h2>
          <p className="mt-1.5 text-sm text-slate-400">
            {t('auth.tagline')}
          </p>

          <form className="mt-6 space-y-5 sm:mt-8" onSubmit={submit}>
            <div>
              <label htmlFor="nic" className="block text-sm font-medium text-slate-500">
                {t('auth.nic')}
              </label>
              <input
                id="nic"
                name="nic"
                value={nic}
                onChange={(event) => setNic(event.target.value)}
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck="false"
                required
                placeholder="881234564V"
                className="mt-2 w-full rounded-btn border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-600 transition outline-none focus:border-brand/60 focus:bg-white/10 focus:ring-2 focus:ring-brand/25"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-500">
                {t('auth.password')}
              </label>
              <div className="relative mt-2">
                <input
                  id="password"
                  name="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-btn border border-white/10 bg-white/5 px-4 py-3 pr-12 text-base text-white transition outline-none focus:border-brand/60 focus:bg-white/10 focus:ring-2 focus:ring-brand/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  // aria-pressed, not just a title: this is a toggle button and
                  // assistive tech should report its state, so a screen-reader user
                  // knows whether the password is currently visible.
                  aria-pressed={showPassword}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 transition hover:text-white"
                >
                  <EyeIcon shown={showPassword} />
                </button>
              </div>
            </div>

            {/* `min-h` reserves the row so the form does not jump down when an
                error appears. A layout that reflows under the user's cursor while
                they are mid-click is the classic cause of a mis-click. */}
            <div className="min-h-[1.5rem]">
              <ErrorNote>{error}</ErrorNote>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-btn bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Spinner />}
              {busy ? t('login.signingIn') : t('auth.signIn')}
            </button>
          </form>

          {/*
            The demo hint, reduced to a single line with no credentials on it.
            See the note at the top of the file for why the accounts and their
            password are documented in README.md instead.
          */}
          <p className="mt-8 border-t border-white/10 pt-6 text-center text-xs leading-relaxed text-slate-500">
            Demo operator: the seeded accounts and their shared password are listed in
            {' '}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-slate-400">
              README.md
            </code>
            {' '}
            under “Demo credentials”.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A 20x20 open/closed eye.
 *
 * Kept inline, and the ORIGINAL reason no longer holds: `lucide-react` is a
 * dependency and ships an `Eye` / `EyeOff` pair. The reason it stayed is that
 * this one glyph needs a `strokeWidth` and an `aria-pressed`-driven slash that
 * both states share one outline for, and swapping to the library pair here would
 * trade a stroke-line change for two component imports to draw the same shape.
 *
 * Not worth it for two glyphs — which is the same argument that said a library
 * was not worth it for the whole sidebar, and that one was wrong. The difference
 * is scale, not principle.
 */
function EyeIcon({ shown }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      {shown && <path d="m3 3 18 18" />}
    </svg>
  );
}

/** A spinner for the submit button's busy state. */
function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
