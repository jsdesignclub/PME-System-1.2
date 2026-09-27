/**
 * Phase 0 shell.
 *
 * This exists to prove exactly one thing: that the ministry theme tokens in
 * index.css are wired up and the dev server is serving. It is deliberately not
 * a login form, a dashboard, or any module UI — Phase 0 contains no
 * application logic, and a Phase 0 build that grows a feature screen has failed
 * Phase 0. Phase 1 replaces this file wholesale.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs tracking-widest text-slate-300 uppercase">
              Provincial Ministry
            </p>
            <h1 className="text-xl font-semibold">Enterprise Management System</h1>
          </div>
          <span className="rounded-full bg-gold px-3 py-1 text-xs font-medium text-navy">
            Phase 0
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Foundation is in place</h2>
          <p className="mt-2 text-slate-600">
            The API is reachable at <code className="text-slate-800">/api/v1/health</code>.
            Requests from this page are forwarded to the backend by the Vite dev
            server proxy, so the browser sees a single origin and CORS does not
            apply during development.
          </p>

          <button
            type="button"
            className="mt-6 rounded-md bg-gold px-4 py-2 font-medium text-navy transition hover:brightness-95"
          >
            Primary action
          </button>
        </div>

        <dl className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Frontend', value: 'localhost:5173' },
            { label: 'API', value: 'localhost:4000' },
            { label: 'Database', value: 'MySQL80 :3306' },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 bg-white p-4"
            >
              <dt className="text-xs tracking-wide text-slate-500 uppercase">
                {label}
              </dt>
              <dd className="mt-1 font-mono text-sm text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  )
}
