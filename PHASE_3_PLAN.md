# Phase 3 — Web Client, Mail Module (Module 1): Detailed Plan

**Parent plan:** `EXECUTION_PLAN.md` (Phase 3 of 9 — the spec's "Phase 1" product target) · **Predecessor:** `PHASE_2_PLAN.md`
**Status:** 📋 Planned — not started. **Not blocked.** Node `v22.3.0` builds under Vite 8.3.1 (warning only) — Q15 resolved 2026-09-30
**Date:** 2026-09-30 (written)

---

## 1. Objective

Produce a state where **a letter can be moved from a physical envelope to a printed, closed file by ministry staff who never open a terminal**:

- A MINOR_STAFF clerk signs in, logs a letter with its scan, and sees a server-issued day stamp
- A SECRETARY writes the endorsement; the letter forwards itself as a side effect
- A SUBJECT_CLERK sees a *ranked, explained* officer list and routes the letter with one click after confirming
- The assigned OFFICER starts the work, notes progress, uploads a clearance certificate, and closes it
- Anyone can print the minute slip, with Sinhala/Tamil letter text intact, and the app chrome does not print with it
- Every button on screen is one the server would have permitted, and every refusal is reported in the terms the server used

Phase 3 is the first phase that produces a **shippable milestone** (parent plan §9, step 4). Phases 0–2 built a verified API; this phase puts an interface on it and changes no server rule.

**The honest starting position.** Phase 2 deliberately built a working UI early so the API could be exercised end to end, and `PHASE_2_PLAN.md` §2 recorded that as a scope deviation. That UI is real, it runs, and roughly two thirds of the parent plan's 23 tasks are already partly or wholly done. This plan is therefore **not** a from-scratch build. It is:

| Reality | Consequence for this plan |
| :-- | :-- |
| 6 pages exist and work against the live API | Tasks 3.11–3.18 are mostly *review and finish*, not build |
| `api.js` already has a single instance, a memoised single-flight refresh, and a `__retried` guard | Task 3.1 is a small delta, not a new subsystem |
| `AuthProvider` already fetches `/auth/permissions` (D25) | Task 3.2's `hasPermission` is done; the hook is a rename |
| `MailDetailPage` already renders `available_actions` and a suggestions panel | Tasks 3.15 and 3.17 partly exist |
| The files are **flat** (`api.js`, `authContext.js`, `components.jsx`, `pages/*.jsx`) and do not match spec §9.2 | Task 3.0b is a mechanical restructure to the spec's tree |
| **No print slip, no admin page, no duty-matcher hook, no dialog/toast primitives** | These are the real gaps |

Anyone reading this plan should treat the task list as *"close the gap between what
exists and what spec §9.2 names"*, and should not rebuild what already works.

## 2. Scope

**In scope:** `frontend/` only, plus three narrowly-justified backend touches (D68, Q7/D69, and the duty-chart writes the Admin tab already supports). The spec's §9.2 directory structure; the axios client; auth and mail contexts; role-guarded routing; the chrome, common and form components; the five pages; the duty-matcher hook; the officer action panel; the print minute slip; the admin page; the UX primitives; the responsive floor; the README walkthrough.

**Out of scope — explicitly NOT built in Phase 3:**

| Deferred to | What | Why |
| :-- | :-- | :-- |
| Phase 4 | Any server hardening: `helmet`, rate limiting, upload content inspection (magic bytes), audit immutability triggers, `GET /audit/export` | Parent plan tasks 4.1–4.11. Phase 2 already wrote the files safely; Phase 3 adds no new upload path |
| Phase 5 | The mobile client | Parent plan task group 5.x. **No Expo, no React Native, no `.expo/` activity** |
| Phase 6–8 | Vehicle allocation, transfers, asset & inventory pages, tables, endpoints and seeds | Parent plan §8: "Modules 2–4 explicitly cannot start before Phase 3 is accepted". The sidebar shows the three destinations **disabled**, and that is the whole of their presence |
| Phase 4 | i18n of the UI chrome | Parent plan §2 out-of-scope list: "Sinhala/Tamil i18n beyond data storage (… the UI chrome is English in v1)". Sinhala/Tamil *letter text* must render and print correctly — that is in scope and is Task 3.19 |
| — | A "day stamp scanner" component | Spec §3 names "Day Stamp Scanner Integration" as a web capability but §9.2 contains no file for it and describes no hardware protocol. There is nothing to build against. The typed/selected day stamp is the whole feature |
| — | Re-implementing the state machine, the permission map, or the duty matcher in the browser | D51, D25, D8/D59. All three are server-side and are consumed, never copied. A browser-side copy would be a second source of truth that drifts |
| — | A PDF-generation library for the slip | Spec §9.2: `printUtils.js` is "Trigger native browser print dialogs". `@media print` and `window.print()` only (D67) |

**A Phase 3 build containing a `vehicles` table, an Expo dependency, a helmet
config, or a client-side copy of the transition table has failed Phase 3**, for
the same reason a Phase 2 build containing a `vehicles` table failed Phase 2.

## 3. Prerequisites

| Prerequisite | Required | Status as of 2026-09-30 | Action if missing |
| :-- | :-- | :-- | :-- |
| **Node.js** | `^20.19.0 \|\| >=22.12.0` (Vite 8 `engines`) | ⚠️ `v22.3.0` — **below the range, but builds anyway.** Vite 8.3.1 warns and proceeds; `npm --prefix frontend run build` exits 0 and emits `dist/` (91 modules, 357 kB) | Optional. Upgrading silences the warning. **It gates nothing** — verified, not assumed |
| `MySQL80` service | Running | ✅ Running | `Start-Service MySQL80` — needs an elevated prompt |
| Phase 2 migrations | `001`–`009` applied | ✅ 9 applied, 0 pending | `npm run db:migrate` |
| Phase 2 seeds | 6 letters, 9 accounts, 6 duties | ✅ Verified (Phase 2 §9) | `npm run db:demo` |
| Phase 2 endpoints | mail, officers, attachments, suggestions, stats | ✅ 347/347 tests; §9 checks 4–13 pass live | `npm test` |
| Phase 2 UI | a runnable dev server and a production build | ✅ `vite build` exits 0; dev server serves `:5173` | — |
| `frontend/` deps | Vite 8, React 19, Tailwind 4, Axios, React Router 7, Lucide | ✅ Installed (`frontend/package.json`) | `npm --prefix frontend install` |
| Chromium-class browser | Chrome / Edge / Firefox | ✅ (Edge present) | §9's browser matrix |
| A printer or "Save as PDF" | for the print check | Browser-provided | Save as PDF is sufficient to verify `@media print` |

**No new runtime dependency is added in Phase 3.** Spec §9.1's stack — React,
Tailwind, Lucide, Axios, React Context — plus React Router for 3.4, which the Vite
template already provided. `react-router-dom` is not in the spec's §9.1 list and
is not a "new" library: Phase 0 installed it with the template, and its absence
would mean hand-rolling a router (D71).

## 4. Decisions Taken in This Phase

Numbering continues from `PHASE_2_PLAN.md` §4 (D38–D59). D1–D59 are still binding
and are **not** re-litigated. The four that constrain this phase most:

| From | Decision | How it binds Phase 3 |
| :-- | :-- | :-- |
| D25 | `backend/utils/permissions.js` is the single source of truth, and the frontend consumes it over HTTP | The client may not hard-code a role→permission table. `hasPermission()` reads the list from `GET /auth/permissions` |
| D51 | The legal-transition table is data in `utils/mailStateMachine.js`, and `GET /mail/:id` returns the caller's `available_actions` from it | The UI renders `available_actions`. It never recomputes legality (D61) |
| D52 | A transition is `409`; a role that may not attempt it is `403` | The client must treat the two differently, or it will show "you do not have permission" for a routine workflow race (D62) |
| D8, D59 | Duty matching is server-side, a pure function over already-fetched rows | `useDutyMatcher` is a hook around `GET /mail/:id/suggestions`. It contains no scoring logic |

New decisions taken here:

| # | Decision | Rationale |
| :-- | :-- | :-- |
| **D60** | **Five resting states, not six. "Reviewed" is an act, not a state** | The spec is genuinely inconsistent: §6's diagram has six boxes including `2. REVIEWED`, while §5.2's `status` ENUM has five values and does not contain `REVIEWED`. Phase 2 resolved this — writing minutes *is* the review, and its result is "minutes exist and the letter is `Forwarded to Subject`". Parent plan §1 and §10 both say "all six states", and its own task 3.9 lists five. Six status values would mean a sixth `ENUM` member, a `letter.status = 'Reviewed'` row that sits between two transitions, and a badge the ministry never asked for. The **ENUM is the vocabulary** (D48), and the status rail in the UI has five stops with a "minutes written" marker *between* stops 1 and 2 rather than a sixth stop |
| **D61** | **`available_actions` is the only source of action buttons; no client-side state machine** | The one failure mode that would make this phase actively harmful is a UI that offers a button the server refuses, or hides one it permits. D51 exists so the UI does not re-derive the rules, and `mailStateMachine.js:345` documents `available_actions` as "the Phase 3 UI renders". A client-side `canStart(status, role)` would be a second copy of a table that is already tested on the server, and it would go stale the first time a transition is added. Buttons come from the payload; `403` additionally hides a button that was wrongly shown, `409` offers a refresh |
| **D62** | **The `403` / `409` / `404` split drives three different client behaviours, not one error banner** | D52 exists precisely so the client can tell "wrong screen" from "stale screen", and a `409` is common and benign on a shared office machine. One generic "Request failed" banner would make a routine workflow race look like a permissions problem and would hide a real mis-assignment. `403` → the view is wrong; do not offer a retry. `409` → the screen is stale; offer *Refresh*. `404` → not here; offer a way back to the registry |
| **D63** | **Spec §9.2's file layout is adopted wholesale; Phase 2's flat files are dissolved into it** | The spec's tree is not decoration — it is the agreed structure, and three later phases plus a mobile client will navigate it. `api.js` → `api/axiosClient.js`, `authContext.js` + `AuthProvider.jsx` → `context/AuthContext.jsx`, `components.jsx` → `components/common/*`, `pages/*.jsx` → keep but re-home, and a new `api/mailApi.js` + `api/authApi.js` so no page names an endpoint. Done as a **separate mechanical commit (Task 3.2b)** with no behaviour change, so `git diff` shows moves rather than logic, and so a reviewer can verify the move by reading imports |
| **D64** | **Attachment bytes are fetched through the authorized route into a blob and shown from an object URL** | D57 removed the static mount, so there is no URL to put in `<img src>` or an `<iframe>`. Two wrong answers are available and both are tempting: pointing `<img src>` at the API route (which sends **no** `Authorization` header, so it returns `401` and renders a broken image) and re-adding a static mount (which deletes the authorization check the whole design rests on). The correct route is `fetch(url, { headers })` → `blob()` → `URL.createObjectURL`, and the object URL must be revoked on unmount or the blob is leaked for the life of the tab. A PDF is shown in an `<iframe>` fed the same way |
| **D65** | **`VITE_API_URL` is an override; the Vite dev proxy is the default** | Parent plan task 3.1 says "base URL from `VITE_API_URL`". Phase 0 set up the dev proxy (`frontend/vite.config.js`) so the browser calls relative `/api/v1/...` and Vite forwards to `:4000` — which removes CORS from development entirely. Keeping the proxy as the default preserves that; the env var exists for a production build served from a different origin. Defaulting to the env var with no default value would make the app 404 on every request until someone reads the README |
| **D66** | **Tokens stay in `localStorage`; the XSS exposure is stated, not solved** | D7 mandates it and the spec mandates it. The alternative — `httpOnly` cookies — is strictly better against XSS but is a **backend** change to the login, refresh and CORS paths, i.e. Phase 4 work, and a partial version of it is worse than none. The consequence is recorded so it is not a surprise: a successful XSS in this origin reads the refresh token. Mitigations that *are* in scope and free: never render letter text as HTML, never `dangerouslySetInnerHTML` (there is no such need in this app), and no third-party script on the origin |
| **D67** | **The minute slip is A4 portrait, rendered with `@media print`, printed via the browser dialog. No PDF library** | Spec §9.2 gives the mechanism and nothing else — no paper size, margins, orientation, field order, header, or signature block, all of which are absent from the spec. A4 portrait is the ministry's paper. `printUtils.js` is defined by the spec as "Trigger native browser print dialogs", so the output is a **printer's** PDF, not a generated one; adding `jspdf` would change the dependency set for no stated requirement. Browser print CSS also cannot produce a *guaranteed* single page — content length decides — so the layout is designed to be short and the test is "no orphaned heading at a page break", not "exactly one page" |
| **D68** | **Bilingual duty matching is a Phase 3 task, and it touches the backend matcher** | The matcher is Latin-token based, so a Sinhala or Tamil subject returns `no_candidates`. D8 requires matching to be server-side, so this **cannot** be fixed in the client and Phase 3 does own a backend edit — a deviation, recorded here rather than smuggled. The fix is `Intl.Segmenter` (already in Node, no dependency) for grapheme-aware word segmentation, plus Sinhala/Tamil keywords in `003_seed_officer_duties.sql`. It is in this phase and not Phase 4 because a Sinhala letter that routes to nobody fails the ministry's own primary working language in a demo, and because it is ~15 lines plus seed data. The duty matcher's existing tests (D55's word-boundary and stop-word rules) are the regression net |
| **D69** | **Q7 default: `Confidential` letters are hidden from `SUBJECT_CLERK` and `OFFICER`, not shown redacted. IMPLEMENTED** | Q7 is the one open question this phase owns, and it is a real access-control decision. The default chosen here is **hide**, because a redacted body still leaks the sender, subject line, day stamp and existence — and the "existence" part is the leak D29 already refused once. Hide means the letter does not appear in a clerk's or officer's list and its detail route is a `404`, which is exactly the existing D29 shape. Three further choices, made during implementation and load-bearing: it lives in `mailScope()` rather than in a controller or the UI, so the list, detail, attachment bytes and suggestions endpoint obey it together; it is checked **before** the role predicate and independently of it, so a confidential letter is hidden from those two roles even when it is in their own department or assigned to them; and it fails **closed on the default** (`hideConfidential !== false`), so a scope built by a future caller that forgets the field hides rather than reveals. Executives and `ADMIN` keep full visibility — a ministry that cannot see its own confidential correspondence cannot route it — and `MINOR_STAFF` keep it for the letters they logged, because a clerk who cannot see the classification they applied is working blind. **This is a default, not a decision the plan can make for the ministry — see §13.** If the answer is "redacted", the change is larger: a second projection of the letter without `subject`/`sender_name` |
| **D70** | **No web font is bundled; the print slip uses a system Sinhala/Tamil font stack** | Spec §9.2's web tree has **no** `fonts/` directory — fonts appear only in §11.2, the mobile client. Bundling a Sinhala webfont is a multi-megabyte addition to a desktop-only app for a case the spec does not ask for. Sinhala and Tamil both render correctly from the OS font stack on every target platform (`Iskoola Pota`, `Nirmala UI`, `Noto Sans Sinhala`/`Tamil`, `sans-serif`). If print fidelity on a machine missing all of those proves inadequate, that is a Phase 4 decision, not a silent dependency here |
| **D71** | **No new library, and React Router is not counted as one** | D5 keeps the dependency list matching the spec. Spec §9.1's stack omits a router, but §9.2 requires "Route setup & provider wrapper" and parent task 3.4 requires role-guarded routes. React Router 7 came with the Vite template in Phase 0. Writing a router by hand would be strictly worse and would be the real deviation |
| **D72** | **The duty matcher never auto-assigns; selecting a suggestion is not assigning** | Parent plan §8 risk table: "Duty matching produces wrong officers in practice → Matchers return **ranked suggestions with matched keywords**, never auto-assign; the Subject Clerk always confirms." So the box fills a *proposed* officer field and shows the matched keywords and the score gap; the clerk presses **Assign**. One click to fill, one explicit act to commit, and the keywords stay visible so the clerk can see *why* and disagree |
| **D73** | **The admin page's four tabs are gated individually, and only Duty Charts writes** | Users, Departments and Audit Log are read-mostly views over Phase 1's endpoints; Duty Charts is the only tab that mutates, over Phase 2's duty endpoints. Per-tab gating means an `ADMIN` without `UPDATE_DUTY_CHART` still gets a working audit viewer rather than a 403 on the whole page. **The route gate admits either authority, not just the admin role.** `/admin` is reachable by an admin role **or** by `UPDATE_DUTY_CHART`, and `AdminPage` then hides the tabs the visitor would get a `403` on. A `SUBJECT_CLERK` holds `UPDATE_DUTY_CHART` and maintains the duty chart the D68 matcher runs on, so gating the route on the role alone would leave the feature unmaintainable through the UI for exactly the person who owns it. Note what this is *not*: `MANAGE_USERS`, `MANAGE_DEPARTMENTS` and `VIEW_AUDIT` are **not permissions in this system** — `/users`, `/departments` and `/audit` are guarded by `requireAdmin`, a check on the role column, so no resolved permission list ever contains those names. An earlier version gated the whole page on `MANAGE_USERS` and produced an Administration link that appeared for nobody, including the administrator |
| **D74** | **Dates render through one helper with a fixed format, never a bare `toLocaleDateString()`** | Spec §9.2 pins the display format: `dateUtils.js` "Format dates (e.g., \"26 Sep 2026\")". A bare `toLocaleDateString()` renders `09/26/2026` on one machine and `26/09/2026` on another, and shifts by a day when the browser is in a timezone behind the server — which for a ministry registry keyed on a `DATE` column is a correctness bug, not a cosmetic one. `dateUtils.js` formats with an explicit `en-GB`-style pattern and treats a bare `YYYY-MM-DD` as a calendar date, not an instant |

### 4a. Deviations from the parent plan's literal task text

| Parent task | As written | What Phase 3 does | Why |
| :-- | :-- | :-- | :-- |
| 3.1 | "base URL from `VITE_API_URL`" | Relative by default, env var as override | D65; the Phase 0 dev proxy already removes CORS in development |
| 3.2 | `src/context/AuthContext.jsx` + `src/hooks/useAuth.js` | Same, split as written; the existing provider is dissolved into them | D63 |
| 3.3 | `src/context/MailContext.jsx` | Same | D63 |
| 3.9 | `StatusBadge.jsx` — "Logged, Forwarded, Assigned, In Progress, Completed" | Renders **`Forwarded to Subject`** | D48 fixed the ENUM verbatim; "Forwarded" is not a value that exists |
| 3.10 | "foundation for all four modules" | Built for Module 1, shaped for four | Only Module 1 exists. Writing three unused abstractions now is how a DataTable ends up configurable for a menu the ministry does not have |
| 3.14 | "day stamp auto-fill/preview" | The stamp is **shown as issued by the server** after creation, not predicted before it | D53: the client cannot know the next sequence number without a second endpoint that leaks the counter, and a *predicted* stamp that the server then contradicts is worse than none. The form shows the receipt, the sender, the subject, and the assigned stamp together in the confirmation |
| 3.18 | "Officer action panel" — **no filename given** | `components/mail/OfficerActionPanel.jsx` | Every other task names its file; this one does not |
| 3.19 | "signatures" | Signature **blocks** — ruled lines labelled by role and name, no e-signature | Spec contains the word "signature" **zero** times. A signature block is what a printed minute slip needs; a cryptographic signature is Phase 4 audit work |
| 3.20 | "Users, Departments, Duty Charts, Audit Log" | Same four tabs, individually gated | D73 |
| 3.22 | "1366×768 minimum" | Same, plus a 1920×1080 pass | Parent plan §7's manual-UI row names both resolutions |
| — | *(no task exists)* | `Intl.Segmenter` bilingual matching (D68) and Q7 confidentiality (D69) | Both are already-owned Phase 3 obligations with no task number; adding them here rather than discovering them mid-build |
| — | *(no task exists)* | Task 3.0b — the §9.2 restructure (D63) | D63's commit needs to be a scheduled task, not incidental churn inside 3.1 |
| 3.23 | "README update" | Mostly **already done** in Phase 2 — the persona table, the API reference, the walkthrough and the troubleshooting matrix all landed there | This plan verifies and extends it rather than rewriting it: the print walkthrough (3.19), the browser matrix (§9) and the Node-upgrade prerequisite are what remain |

## 5. Target Filesystem State at End of Phase 3

```
frontend/
├── public/
│   └── favicon.ico                        # browser tab
├── index.html                             # <html lang="en">, viewport meta
├── vite.config.js                         # Tailwind plugin + /api proxy to :4000 (Phase 0)
├── package.json                           # UNCHANGED — no new dependency (D71)
└── src/
    ├── api/
    │   ├── axiosClient.js                 # single instance, bearer injection, single-flight
    │   │                                  #   refresh on 401, D62 error normaliser  (3.1)
    │   ├── authApi.js                     # login, logout, me, refresh, permissions  (3.1)
    │   └── mailApi.js                     # every /mail and /officers call — no page
    │                                      #   names an endpoint                     (3.1)
    ├── assets/
    │   └── emblem.svg                     # inline mark for header + print slip      (3.5, 3.19)
    ├── components/
    │   ├── common/
    │   │   ├── Header.jsx                 # brand, user, role badge, logout         (3.5)
    │   │   ├── Sidebar.jsx                # module switcher, permission-filtered,
    │   │   │                              #   Vehicles/Transfers/Inventory disabled  (3.6)
    │   │   ├── Modal.jsx                  # focus trap, Esc, backdrop, aria-modal   (3.7)
    │   │   ├── PriorityBadge.jsx          # Normal grey / Urgent red / Confidential
    │   │   │                              #   purple — spec §9.2                     (3.8)
    │   │   ├── StatusBadge.jsx            # the D48 five, verbatim                   (3.9)
    │   │   ├── DataTable.jsx              # columns, server-side sort, pagination    (3.10)
    │   │   ├── Card.jsx                   # section surface (from components.jsx)   (3.7)
    │   │   ├── RoleBadge.jsx              # role chip in the header                  (3.5)
    │   │   ├── Spinner.jsx                # route-level and inline loading           (3.4)
    │   │   ├── ErrorNote.jsx              # inline error block, incl. D62 refusals  (3.1)
    │   │   ├── Toast.jsx                  # transient notices                        (3.21)
    │   │   ├── EmptyState.jsx             # "no letters yet"                         (3.21)
    │   │   ├── ConfirmDialog.jsx          # destructive / irreversible acts          (3.21)
    │   │   └── SkeletonRow.jsx            # loading placeholders, no layout shift    (3.21)
    │   ├── mail/
    │   │   ├── MailTable.jsx              # DataTable configured for the registry   (3.13)
    │   │   ├── MinutesTimeline.jsx        # minutes as a thread + audit trail        (3.15)
    │   │   ├── DutyMatcherBox.jsx         # ranked candidates, keywords, score gap   (3.17)
    │   │   ├── OfficerActionPanel.jsx     # advance / note / upload / complete      (3.18)
    │   │   ├── StatusRail.jsx             # five stops + minutes marker (D60)        (3.15)
    │   │   ├── AttachmentList.jsx         # metadata list, blob preview, download    (3.15)
    │   │   └── PrintMinuteSlip.jsx        # @media print A4 portrait slip            (3.19)
    │   └── forms/
    │       ├── NewMailForm.jsx            # letter entry, drop zone, upload progress(3.14)
    │       └── AddMinutesForm.jsx         # instruction chips, counter, submit      (3.16)
    ├── context/
    │   ├── AuthContext.jsx                # session, user, permissions, signIn/out   (3.2)
    │   └── MailContext.jsx                # filters, page, selection, detail cache  (3.3)
    ├── hooks/
    │   ├── useAuth.js                     # useAuth() -> session/permissions/hasPermission
    │   │                                  #                                           (3.2)
    │   ├── useDutyMatcher.js              # GET suggestions; NO scoring logic        (3.17)
    │   ├── useApiError.js                 # D62 403/409/404 -> typed client action    (3.1)
    │   └── useObjectUrl.js                # fetch->blob->objectURL, revokes on unmount(3.15)
    ├── pages/
    │   ├── LoginPage.jsx                  # NIC + password, error states, by role   (3.11)
    │   ├── DashboardPage.jsx              # metric cards, intake chart, my actions   (3.12)
    │   ├── MailRegistryPage.jsx           # filter bar + MailTable                   (3.13)
    │   ├── NewMailPage.jsx                # hosts NewMailForm                        (3.14)
    │   ├── MailDetailPage.jsx             # the whole letter, assembled              (3.15)
    │   ├── OfficerPage.jsx                # officer detail + duty chart              (3.20)
    │   ├── AdminPage.jsx                  # four gated tabs                          (3.20)
    │   ├── ForbiddenPage.jsx              # the 403 view task 3.4 requires           (3.4)
    │   └── NotFoundPage.jsx               # replaces the silent `*` -> `/` redirect  (3.4)
    ├── utils/
    │   ├── dateUtils.js                   # "26 Sep 2026", never bare toLocale (D74) (3.19)
    │   ├── printUtils.js                  # window.print() wrapper                   (3.19)
    │   └── permissions.js                 # PERMISSION_LABELS only — NO role table   (3.2)
    ├── App.jsx                            # routes + guards                         (3.4)
    ├── main.jsx                           # entrypoint
    └── index.css                          # @theme tokens + @media print base rules (3.19)
```

**Files deleted by the end of Phase 3:** `api.js`, `authContext.js`,
`AuthProvider.jsx`, `components.jsx`, `Layout.jsx`, `format.js`, and the
`pages/*.jsx` originals — all dissolved into the tree above by Task 3.2b. A
Phase 3 that leaves `api.js` *and* `api/axiosClient.js` side by side has failed
the restructure, because two HTTP paths is D63's whole problem.

## 6. Task Breakdown

**Read the numbering before you start.** Tasks below keep the parent plan's
numbers (3.1–3.23) so this file can be diffed against `EXECUTION_PLAN.md` §5 and
nothing is silently renumbered. Two tasks are additions rather than
parent-plan tasks, and they appear first because they gate everything else:

| Task | Origin | Why it is here |
| :-- | :-- | :-- |
| **3.0** Node / toolchain | **Added** (Q15) | First, but only to *confirm* it — Q15 turned out not to be a blocker, so this is a five-minute regression check, not a gate |
| **3.2b** Restructure to spec §9.2 | **Added** (D63) | Must precede 3.1–3.21 so the new files are created at their final paths rather than moved afterwards |
| 3.1 … 3.23 | Parent plan, verbatim numbers | The parent's own order |

### Task 3.0 — Confirm the toolchain

**Goal:** establish, by running it, that the build and the dev server both work —
so no later task is blocked on a toolchain nobody checked.

**This is Q15, and it is already resolved.** It was carried as "STILL OPEN" through
`PHASE_0_PLAN.md` §3a, `PHASE_1_PLAN.md` §13 and `PHASE_2_PLAN.md` §13, on the
assumption that Node `v22.3.0` is below Vite 8's floor `^20.19.0 || >=22.12.0` and
would therefore refuse to build. **That assumption was wrong**, and it is worth
recording why it survived three phases: nobody ran the build, because each of
those phases was backend-only and each could correctly note that no Vite build
happened in its own scope. A deferred warning becomes a blocker by repetition
rather than by evidence.

The four `set-state-in-effect` warnings are pre-existing, in files Task 3.2b
dissolves anyway, and they are a genuine React 19 smell worth fixing as the
contexts are rewritten in Tasks 3.2 and 3.3 — not by suppressing the rule. §9
check 2 gates on **0 errors**; these 4 warnings must not be left to grow into
errors as the pages move.

Verified on 2026-09-30:

| Command | Result |
| :-- | :-- |
| `node -v` | `v22.3.0` — below the `engines` range |
| `npm --prefix frontend run build` | prints `Vite requires Node.js version 20.19+ or 22.12+`, **then builds**: 91 modules, `dist/index.html` 0.46 kB, `dist/assets/index-*.css` 23.28 kB, `dist/assets/index-*.js` 357.25 kB, **exit code 0** |
| dev server | serves HTTP 200 on a spare port; the `/api` proxy reaches `:4000` |
| `npm --prefix frontend run lint` | oxlint exits 0 with **4 warnings, 0 errors** — all `react(set-state-in-effect)` in `AuthProvider.jsx:46`, `pages/OfficerPage.jsx:45`, `pages/MailRegistryPage.jsx:42`, `pages/MailDetailPage.jsx:38` |

Vite 8.3.1 treats the engine mismatch as a **warning**, not a refusal.

**Acceptance:** the four commands above have been run and their output recorded
here. They already have been — this task is closed, and §9 checks 1 and 2 re-run
them as a regression guard rather than as an unblock.

**Upgrading Node is still worth doing** to silence the warning, and it is the
right housekeeping. But it is **not a prerequisite**, and a Phase 3 that starts
with a Node upgrade is a Phase 3 that has mistaken a warning for a blocker. If
the upgrade happens, it is a separate, optional step and it must not become an
excuse to downgrade Vite, add `--force`, or pin an older Vite to escape the
message.

### Task 3.2b — Restructure to spec §9.2 (mechanical, no behaviour change)

**Goal:** the tree in §5, reached by moving code, not rewriting it.

Run **before** 3.1–3.21, as its own commit (D63). Order:

1. `api.js` → `api/axiosClient.js`; add `api/authApi.js` + `api/mailApi.js` and
   move every endpoint string out of the pages into them
2. `AuthProvider.jsx` + `authContext.js` → `context/AuthContext.jsx` + `hooks/useAuth.js`
3. `components.jsx` → `components/common/*`, one component per file. It holds
   seven today — `StatusBadge`, `PriorityBadge`, `RoleBadge`, `Card`,
   `EmptyState`, `ErrorNote`, `Spinner` — and **all seven survive**, split one per
   file. `Modal`, `Toast`, `ConfirmDialog`, `SkeletonRow` and `DataTable` do not
   exist yet and are new (3.7, 3.10, 3.21)
4. `Layout.jsx` → `components/common/Header.jsx` + `Sidebar.jsx`
5. `format.js` → `utils/dateUtils.js` (adopting D74's fixed format while moving)
6. `pages/*.jsx` in place; split out the panels Task 3.15/3.17/3.18 own

**Acceptance:** `git diff --stat` shows moves; the app behaves identically at each
step (`npm run build` passes between steps); no page contains a URL literal
afterwards.

### Task 3.1 — `api/axiosClient.js`, `authApi.js`, `mailApi.js`

**Goal:** one HTTP entry point, and no page knows an endpoint.

Much of this exists. `api.js` already has a single instance, a request
interceptor injecting the bearer, a **memoised single-flight** refresh, and an
`__retried` guard that stops a refresh-failed request from being replayed. That
is the part of this task that is easy to get wrong and it is already right — keep
it.

Delta:

| Change | Why |
| :-- | :-- |
| `baseURL` = `import.meta.env.VITE_API_URL ?? '/api/v1'` | D65 |
| Split out `authApi.js` / `mailApi.js` | D63. A page that calls `/mail/${id}/minutes` has a duplicated endpoint that no review catches when the route changes |
| **Normalise errors into a typed shape**: `{ status, code, message, field }` | D62. The blocker today is `errorMessage()` collapsing everything to "Request failed (409)". The *message* the server sends is already the good one — "A letter in \"Completed\" cannot be started; \"start\" requires status \"Assigned\"" — and it is being thrown away |
| `useApiError.js` maps status → client action | D62: `403` → wrong view, no retry; `409` → stale, offer Refresh; `404` → not here, offer a way back; `401` → handled by the refresh interceptor; `5xx` → retry |
| Upload progress via `onUploadProgress` | 3.14's "upload with progress" needs it |
| Abort stale requests on filter change | 3.13's filter bar will otherwise race and paint the older result last |

**Must not:** re-check the token in a `catch` (the interceptor owns it), or
retry a non-idempotent `POST` after a `409` (a second minute must never be
written because the first response was slow).

### Task 3.2 — `context/AuthContext.jsx` + `hooks/useAuth.js`

**Goal:** session state and `hasPermission(perm)` over HTTP, never over a
role table.

`AuthProvider` already fetches `/auth/permissions` and comments why. D25 is
honoured and the code says so. Delta:

- Move to the spec's paths; add `hasPermission(perm)` and `hasAny(perms)`
- `utils/permissions.js` in the frontend holds **display labels only** (e.g.
  `READ_ASSIGNED_MAIL` → "Assigned mail"). A role→permission map here would be
  D25's violation and would drift from the server
- On `signIn`, store per D7: `{ token, refresh_token, user }` in `localStorage`
- On `403` from any call, if the user is not an `ADMIN`, surface the 403 route
  rather than only a toast

**Must not:** gate a route by `role === 'ADMIN'` string comparison. Gate by
permission (D25). A role check in the client is a guess about the server.

### Task 3.3 — `context/MailContext.jsx`

**Goal:** filters, page and selection live above the pages so the registry and
the dashboard agree on what "current" means.

State: filters (`status`, `priority`, `category`, `sender_type`, `assigned_officer_id`,
`from`, `to`, `search`), `page`, `limit`, `selectedId`, and a small
`detailCache` keyed by letter id. The cache exists because the registry → detail
→ back path otherwise refetches and re-flashes; it is bounded and cleared on
`signOut`.

Note for whoever builds this: the `status` filter value is `Forwarded to Subject`
— **with a space**, so it must be percent-encoded into the query string
(`?status=Forwarded%20to%20Subject`) or the API answers `400 status must be one
of: …`. This bit during the Phase 2 sweep and belongs in the code, not only in
the README.

### Task 3.4 — `App.jsx` routing with role guards

**Goal:** unauthenticated → `/login`; authenticated but not permitted → 403 page.

| Route | Guard | Page |
| :-- | :-- | :-- |
| `/login` | public; redirect away if already signed in | `LoginPage` |
| `/` | any session | `DashboardPage` |
| `/mail` | any session (server scopes the rows) | `MailRegistryPage` |
| `/mail/new` | `CREATE_MAIL` | `NewMailPage` |
| `/mail/:id` | any session; `404` handled in-page | `MailDetailPage` |
| `/officers`, `/officers/:id` | any session | `OfficerPage` |
| `/admin/*` | per-tab, see 3.20 | `AdminPage` |
| `/403` | any session | `ForbiddenPage` |
| `*` | — | `NotFoundPage` |

Two changes to today's behaviour, both required:

1. `RequireAuth` must keep its `loading` check **before** the redirect. On a hard
   refresh the session is read from `localStorage` but the permission list is not
   yet known; redirecting in that window bounces a signed-in user to `/login` and
   straight back, which on a slow connection is indistinguishable from a failed
   login. The existing comment is correct and must survive the move.
2. **`*` currently redirects to `/`.** A mistyped URL should render `NotFoundPage`.
   A silent redirect to the dashboard is how a user ends up staring at the
   dashboard believing it is the page they asked for.

### Task 3.5 — `components/common/Header.jsx`

Brand (emblem + "Provincial Ministry of Enterprise"), page title, user name and
designation, `RoleBadge`, and logout. The four identity fields come from
spec §7.1's login response: `full_name`, `role`, `designation`, `department_id`.

### Task 3.6 — `components/common/Sidebar.jsx`

Module switcher with items filtered by role permission (D25). Mail is live.
**Vehicles, Staff Transfers and Inventory render disabled with their phase number
(6, 7, 8)** and no link — parent plan §8 forbids starting them before Phase 3 is
accepted, and a dead link that 404s is worse than an honest disabled item.

Note the naming: spec §9.2's comment says "Mail, Vehicles, **HR**, Inventory"
while the roadmap in §12 and parent plan §6–8 call Module 3 "**Staff Transfers**".
Use the roadmap's name; the sidebar comment is the outlier.

### Task 3.7 — `components/common/Modal.jsx`

Accessible overlay: focus trap, `Esc` to close, backdrop click, `role="dialog"`,
`aria-modal`, focus restored to the trigger on close. Used by `ConfirmDialog`,
the duty-chart editor, and the print preview.

### Task 3.8 / 3.9 — `PriorityBadge.jsx` / `StatusBadge.jsx`

Priority: Normal grey, Urgent red, Confidential purple — spec §9.2, verbatim.
Status: the D48 five, **verbatim including `Forwarded to Subject`** (3.9's
"Forwarded" is not a value in the ENUM). Unknown values render a neutral badge
with the raw string, never nothing — a status that silently renders blank is
indistinguishable from a missing field.

### Task 3.10 — `components/common/DataTable.jsx`

Columns, **server-side** sort and pagination. Sort must be sent as query params
the API accepts, so the client does not sort a 25-row page and call it a registry;
`limit`/`offset`/`page` come from `MailContext`.

Keep it to what Module 1 needs — the column set, a sort key, a page, a row
renderer. Parent task 3.10 says "foundation for all four modules" (D63, §4a):
that is a design intent, not a licence to build a configurable grid engine now.

### Task 3.11 — `pages/LoginPage.jsx`

NIC + password — **exactly two fields**, per spec §7.1. Error states: bad
credentials (the server's identical 401 for both unknown NIC and wrong password,
D29 — never reveal which), locked/deactivated account, and a network failure that
says so rather than "login failed".

On success, redirect by permission: `CREATE_MAIL` users may prefer `/mail/new`,
`READ_ALL_MAIL` users the dashboard, an `ADMIN` the dashboard too. Post-login
redirect is per role, but the rule is expressed in permissions, not role strings.

### Task 3.12 — `pages/DashboardPage.jsx`

Metric cards: total, unreviewed (`Logged`), urgent, in progress, completed,
overdue — from `GET /mail/stats`. Daily-intake chart over the 30 points the
endpoint returns. Recent mail. "My action items" — the letters where *this user*
has a pending action, derived from `available_actions`, not from a status guess
(D61).

Note: `by_status` always contains all five keys (Phase 2 guarantees it), so a
card never renders `undefined` just because no letter is in that state.

### Task 3.13 — `pages/MailRegistryPage.jsx` + `MailTable.jsx`

Filter bar over the full parameter set: `status`, `priority`, `category`,
`sender_type`, `department_id` (admin/executive only — for a `SUBJECT_CLERK` the
server rejects it as an unknown field, so the control must be hidden, not
disabled-with-a-tooltip), `assigned_officer_id`, `from`, `to`, `search`.
Row → detail.

The scope is the server's (Phase 2 Task 2.6): officers see only letters assigned
to them, clerks only their department, minor staff only what they logged. The UI's
job is **not to re-implement that**, and not to imply the user is seeing
everything when they are not. An `EmptyState` for a clerk who has just logged in
should say why it is empty.

### Task 3.14 — `components/forms/NewMailForm.jsx`

Fields per the implemented contract, not spec §7.2's literal body:

| Field | Note |
| :-- | :-- |
| `day_stamp_no` | **Not sent.** D53: the server issues it; sending it is a `400` |
| `letter_ref_no` | Optional |
| `receipt_date` | `YYYY-MM-DD`, not future, not older than 5 years — bounds surfaced in the error |
| `sender_type` | Four values, verbatim (D48) |
| `sender_name` | Required |
| `subject` | Required |
| `priority` | Three values, verbatim (D48) |
| `category` | Optional, defaults to `General Administration` |
| `attachment` | Optional file, **singular** field name on this endpoint |

Drag-and-drop zone with upload progress via 3.1's `onUploadProgress`; the
allowlist (`.pdf .jpg .jpeg .png .tiff .doc .docx`) and the 10 MB cap are
surfaced **before** upload so the failure is not the only feedback. On success,
show the **issued** day stamp with the letter — the assignment is the point of
the form (spec §4.1: "issue Day Stamp numbers").

### Task 3.15 — `pages/MailDetailPage.jsx` and its panels

The centre of the phase. Assembles:

| Panel | Shows |
| :-- | :-- |
| Letter summary | day stamp, ref, sender, subject, priority, category, receipt, status, assignee, `completion_date` |
| `StatusRail` | the five stops + a "minutes written" marker between stops 1 and 2 (D60) |
| `AttachmentList` | metadata rows; preview via `useObjectUrl`; download via the authorized route (D64) |
| `MinutesTimeline` | the minute, its author name/role, its instruction type, and the audit trail |
| Notes panels | `subject_clerk_note` and `officer_status_note`, each editable only by the roles the server allows |
| `DutyMatcherBox` | see 3.17 |
| `OfficerActionPanel` | see 3.18 |

**Q7 lives here** (D69). Confidentiality is a filter *within* the existing scope,
and this is where the letter body is first displayed — which is why Phase 2 marked
it for this phase rather than implementing it blind. See §13; the default is
"hide", and it is now implemented and verified.

**DONE.** `mailScope()` returns a third field, `hideConfidential`, and the SQL it
builds carries `m.priority <> 'Confidential'`. Three properties worth recording,
because each is a decision rather than a detail:

- It is applied **before** the role predicate and **independently** of it. A
  confidential letter is not "somebody else's letter" to a subject clerk; it is a
  letter the role may not hold at all, including one they created or one assigned
  to them.
- It **fails closed on the default**: `hideConfidential !== false` rather than
  `=== true`, so a scope built by an older caller or a future code path that
  forgets the field hides rather than reveals. The cost of wrongly hiding is a
  clerk asking for help; the cost of wrongly revealing is a breach.
- It is in the **scope**, not in a controller or the UI, so the list, the detail,
  the attachment bytes and the suggestions endpoint all obey it. A filter applied
  to one route and forgotten on the other three is the standard way a scoped list
  becomes an unscoped detail view.

**Must not:** derive a button from `status` and `role` (D61); put an API URL in
an `src` attribute (D64); render letter text as HTML (D66).

### Task 3.16 — `components/forms/AddMinutesForm.jsx`

Instruction-type preset chips — spec §7.2's example is `For Immediate Report`
and parent task 3.16 names the four: "For Immediate Report", "Prepare Draft
Reply", "For Information", "For Necessary Action". Free-text minutes with a
character counter. Submit body is exactly `{ instruction_type, minutes_text }` —
`author_role`/`author_name` come from the token and sending them is a `400`
(Phase 2 D63).

Say plainly in the UI that this also forwards the letter, because it does, and a
Secretary who does not know their endorsement moves the status will be surprised.

### Task 3.17 — `components/mail/DutyMatcherBox.jsx` + `hooks/useDutyMatcher.js`

Ranked officer suggestions with `score`, `matched_keywords` and
`description_matches`; one-click **selection**, then an explicit **Assign** (D72).
Show `scored_duties` so the clerk sees *which duty* matched, and surface
`no_candidates` honestly rather than as an empty box.

The hook calls `GET /mail/:id/suggestions` and holds **no scoring logic** (D8,
D59). A hook containing its own tokenizer is a second implementation of D55's
word-boundary rules, and D55 exists because the obvious implementation was wrong.

**Bilingual matching (D68) is part of this task** and touches
`backend/utils/dutyMatcher.js` + `003_seed_officer_duties.sql`:

1. Replace the `\b`-anchored regex tokenization with `Intl.Segmenter` word
   segmentation. `\b` is ASCII-oriented; Sinhala and Tamil scripts have no word
   boundary in that sense, so the whole run collapses into one token and nothing
   matches. `Intl.Segmenter` ships with Node — no dependency
2. Add Sinhala and Tamil keywords to the duty seed, in the same
   `[tender, procurement, budget, finance]` shape the English duties use
3. Keep D55's three rules: word boundaries, the stop-word list, and the capped
   duty-description contribution. `Intl.Segmenter` changes *how* words are found,
   not what scores
4. The existing matcher tests are the regression net; add cases with Sinhala and
   Tamil subjects that must produce ranked candidates

**Acceptance:** a Sinhala-subject letter returns ranked candidates with
Sinhala keywords visible in `matched_keywords`.

**DONE — and the two scripts are not interchangeable, which the acceptance above
does not spell out.** Verified live on 2026-09-30 against subjects built from the
seeded vocabulary:

| Subject | Script | Candidates | Notes |
| :-- | :-- | :-- | :-- |
| `පාසල් ගොඩනැගිලි අලුත්කරණ සහ උපකරණ ලබාගැනීම ගැන ඉල්ලීම` | Sinhala | 3 | `scored_duties: 6` |
| `பள்ளி கட்டிட பழுதுபார்ப்பு மற்றும் உபகரண வழங்கல் பற்றி கேள்வி` | Tamil | 3 | `scored_duties: 6` |
| `Tender for procurement of laboratory equipment…` | English | 2 | the D55 regression path |

Two things the table is evidence for. First, `scored_duties` is 6 in every row —
every duty was scored, and the non-Latin ones ranked *higher* than the English
control did on this particular subject, so the Indic prefix rule is doing real work
rather than falling through to a lucky token. Second, **the vocabulary has to come
from the seed.** An early acceptance attempt used "Request for office equipment for
the new district office" and "தொழில்நுட்பம் வளங்கள் பற்றி கேள்வி" and both
correctly returned `no_candidates`, because `office`, `equipment` and `technology`
are not duty keywords. An acceptance check asserting that *any* subject matches is
not testing D68; it is testing whether a word appears in a list, and it fails on
correct code.

### Task 3.18 — `components/mail/OfficerActionPanel.jsx`

Status advance buttons, progress note, clearance-certificate upload, mark
complete. Buttons come from `available_actions` (D61).

| Action | Endpoint | Note |
| :-- | :-- | :-- |
| `start` | `PATCH /mail/:id/status` `{ action: 'start' }` | |
| `complete` | `PATCH /mail/:id/status` `{ action: 'complete' }` | Sets `completion_date`; the only action that does |
| note | `PATCH /mail/:id/notes` | Exactly one of `subject_clerk_note` / `officer_status_note`; `''` clears |
| upload | `POST /mail/:id/attachments` | Field `files` (plural, max 10). Refused on a `Completed` letter |

The two refusals must read differently (D62). A `409` here is the shared-machine
case: someone else advanced the letter, and the correct response is "this letter
moved — refresh", not "you are not allowed".

### Task 3.19 — `components/mail/PrintMinuteSlip.jsx`, `utils/printUtils.js`, `utils/dateUtils.js`

**Goal:** a slip an office would actually staple to a file, and app chrome that
does not print with it.

The spec gives four things and no more: a "Print Engine" (§3), a "Printable
Minute Slip Generated" at `COMPLETED & ARCHIVED` (§6), `@media print` on the
component (§9.2), and a native print-dialog trigger (§9.2). Everything else is
this plan's decision (D67) and is recorded as such.

| Element | Decision |
| :-- | :-- |
| Paper | A4 portrait, `@page { size: A4 portrait; margin: 15mm }` |
| Header | Emblem + ministry name + "Minute Slip", plus the day stamp and letter ref as a reference block |
| Body | Sender, subject, receipt date, instruction type, minutes text, and the author block (name, role, and the endorsement date) |
| Signatures | **Ruled signature blocks** labelled by role — the endorsing officer, the subject clerk, the action officer (D3, §4a). Not e-signatures |
| Dates | `"26 Sep 2026"` via `dateUtils.js` (D74) |
| Sinhala/Tamil | System font stack (D70). Letter text must render and print — this is the parent plan's DoD item 3, in the spec's own terms "printed correctly" |
| Chrome | `@media print { .no-print { display: none } }` — header, sidebar, filter bar, action buttons and toasts must not print |
| Trigger | `printUtils.js` → `window.print()`; the slip is always mounted and hidden on screen, never assembled on demand, so printing cannot race a render |
| `break-inside` | `break-inside: avoid` on the minutes and signature blocks, so a heading is not orphaned at a page break |

**Not claimed:** exactly one page. A long letter's subject and minutes decide
that, and no CSS can promise it. The test is "no orphaned block".

### Task 3.20 — `pages/AdminPage.jsx`

Four tabs, gated individually (D73): **Users**, **Departments**, **Duty Charts**,
**Audit Log**.

- Users/Departments: list and edit over Phase 1's endpoints
- Duty Charts: the only writing tab — per-officer duty rows, add/edit/delete
  (a hard delete, unlike a user), keywords as a chip editor
- Audit Log: filters over `GET /audit`, and `action_delta` is shown **only** on
  the single-row view `GET /audit/:id`, because that is the only endpoint that
  returns it (Phase 1 D32)

The refusal to show `action_delta` in the list is a real constraint from Phase 1,
not an omission to work around.

### Task 3.21 — `Toast.jsx`, `EmptyState.jsx`, `ConfirmDialog.jsx`, `SkeletonRow.jsx`

`EmptyState` exists. The other three do not. `ConfirmDialog` wraps any
irreversible act (deleting a duty). `SkeletonRow` must match the table's row
height so loading does not shift the layout.

### Task 3.22 — Responsive pass

1366×768 is the **minimum**; 1920×1080 is also in the parent plan's §7 manual-UI
row. Tablet widths are in scope because spec §9 says "optimized for desktop and
tablet screens". The print stylesheet is the one that must not be broken by this
task.

### Task 3.23 — README and the demo walkthrough

Phase 2 wrote most of it. What remains: the print walkthrough (3.19), the
browser × resolution matrix (§9), and the Node prerequisite (3.0). The persona
table, API reference, workflow diagram, attachment caveat, matcher limitation and
troubleshooting matrix all landed in Phase 2 and are verified here, not rewritten.

## 7. Route Map

**UI routes** are in Task 3.4. **API endpoints consumed**, all under `/api/v1`,
all bearer-authenticated:

| Phase 3 task | Endpoint | Phase that built it |
| :-- | :-- | :-- |
| 3.2, 3.11 | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/permissions` | Phase 1 |
| 3.12 | `GET /mail/stats` | Phase 2 (2.17) |
| 3.13 | `GET /mail` | Phase 2 (2.6) |
| 3.14 | `POST /mail` (multipart), `POST /mail/:id/attachments` | Phase 2 (2.5, 2.15) |
| 3.15 | `GET /mail/:id`, `GET /mail/:id/attachments/:attachmentId` | Phase 2 (2.7, 2.16) |
| 3.16 | `POST /mail/:id/minutes` | Phase 2 (2.8) |
| 3.17 | `GET /mail/:id/suggestions`, `POST /mail/:id/assign`, `GET /officers` | Phase 2 (2.13, 2.9, 2.14) |
| 3.18 | `PATCH /mail/:id/status`, `PATCH /mail/:id/notes` | Phase 2 (2.10, 2.11) |
| 3.20 | `GET/POST/PATCH /users`, `GET/POST/PATCH /departments`, `GET/POST/PATCH/DELETE /officers/:id/duties`, `GET /audit`, `GET /audit/:id` | Phase 1 (1.9, 1.10, 1.13), Phase 2 (2.14) |

**Not built by anyone, therefore not called by Phase 3:** `GET /audit/export`
(Phase 4, task 4.7) and `GET /dashboard/summary` (named in parent plan §6 but
never implemented — Phase 2 built `GET /mail/stats` instead, and 3.12 uses that).
Phase 3 must not add a call to either.

## 8. Environment Variable Reference

| Variable | Where | Default | Purpose |
| :-- | :-- | :-- | :-- |
| `VITE_API_URL` | `frontend/.env`, optional | *(unset)* | Overrides the base URL. Unset in development, where the Vite proxy forwards `/api/v1` to `:4000` (D65) |

That is the only variable Phase 3 adds. Everything else is Phase 0/1/2's
(`PORT`, `DB_*`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`,
`UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB`, `CORS_ORIGIN`) and is read by the backend,
not the client.

**A client bundle cannot hold a secret.** `VITE_*` values are inlined into
`dist/` at build time and are readable by anyone who loads the page. No
`JWT_SECRET`, no DB credential and no API key may ever be a `VITE_` variable. If
Phase 3 finds itself wanting one, the answer is a backend endpoint, not an env
var.

## 9. Acceptance Test — Phase 3 Exit Criteria

Parent plan's criteria, verbatim: *"A user can log in, log a letter with an
attachment, have a Secretary write minutes, have a Subject Clerk accept the duty
suggestion and assign, have the Officer progress and complete it, and print the
minute slip — all through the UI with no console errors; a MINOR_STAFF account
sees only registry-level pages."*

Start the API and dev server, run `npm run db:demo` first, and leave both running.

| # | Check | How | Expected |
| :-- | :-- | :-- | :-- |
| 1 | Toolchain | `npm --prefix frontend run build` | exit 0, `dist/` emitted. The Node-version **warning** is expected on `v22.3.0` and is not a failure (Task 3.0) |
| 2 | Lint | `npm --prefix frontend run lint` | 0 errors. Baseline is 4 `set-state-in-effect` warnings (Task 3.0) — this phase should end with **0 errors and fewer warnings than 4**, not more |
| 3 | Suite still green | `npm test` | 347+ pass, 0 fail, 0 skipped |
| 4 | Login | Sign in as each of the 9 seeded accounts | lands on the right page for its permissions; no `401` loop |
| 5 | Bad credentials | Wrong password, and an unknown NIC | the same message both times; no "user not found" |
| 6 | **Log a letter with an attachment** | As `881234568V` (MINOR_STAFF, Education), use `NewMailForm`, drop a PDF | `201`; the **server-issued** day stamp is shown; the attachment appears in the detail list and previews |
| 7 | Predicted stamp rejected | Inspect the request body | it contains no `day_stamp_no` (D53) |
| 8 | **Secretary writes minutes** | As `881234561V`, use `AddMinutesForm`, pick a chip, submit | minute saved; status is now `Forwarded to Subject`; the timeline shows the author name and role |
| 9 | Forged authorship impossible | Inspect the minutes request | no `author_name`/`author_role` in the body |
| 10 | **Clerk accepts the suggestion and assigns** | As `881234564V`, open the letter, read `DutyMatcherBox`, select the top candidate, press **Assign** | ranked list with `matched_keywords` and scores; status `Assigned` |
| 11 | No auto-assign | Load the box and do nothing | the letter is still `Forwarded to Subject` (D72) |
| 12 | Bilingual routing | Open a letter whose subject is Sinhala or Tamil | ranked candidates, not `no_candidates` (D68) |
| 13 | **Officer progresses and completes** | As `881234565V`, press Start, add a progress note, upload a clearance certificate, press Complete | `In Progress` → `Completed`; `completion_date` set; note and certificate both visible |
| 14 | **Print the minute slip** | Press Print on the completed letter | slip only — no header, sidebar, filters, buttons or toasts; day stamp, sender, subject, minutes, author block and three signature blocks; dates as `26 Sep 2026`; Sinhala/Tamil text intact (3.19) |
| 15 | **MINOR_STAFF sees only registry-level pages** | As `881234566V` | no admin route, no officers write controls, no action buttons; the sidebar shows no items it cannot use |
| 16 | No client-side state machine | Grep `frontend/src` for a status→action table | none; every button traces to `available_actions` (D61) |
| 17 | 403 vs 409 read differently | Force each | `403` → no retry offered; `409` → a **Refresh** is offered (D62) |
| 18 | Attachment bytes are authorized | Open an attachment as a non-assigned officer | `404`; and no `src`/`<img>` attribute anywhere points at an API URL (D64) |
| 19 | Deep refresh works | Hard-refresh `/mail/:id` and `/admin` | session restored, no bounce to `/login` |
| 20 | 404 is a 404 | Visit `/does-not-exist` | `NotFoundPage`, not a silent redirect to the dashboard |
| 21 | **No console errors** | DevTools console through steps 6–14 | clean; a 4xx logged by the browser is fine, an unhandled rejection is not |
| 22 | Responsive floor | 1366×768 and 1920×1080; Chrome, Edge, Firefox | no clipped column, no overlapping chrome, no horizontal scroll |
| 23 | Sinhala/Tamil rendering | A letter with Sinhala subject and body | renders in the registry, the detail and the print preview (D70) |
| 24 | No scope creep | `git status` | no `vehicles`/`transfers`/`assets` file, no Expo dependency, no new `package.json` dependency (D71) |

**Additional hygiene:** `frontend/package.json` dependency list unchanged from
Phase 2; `git check-ignore backend/.env` still true; no `VITE_` variable holding
a secret; `npm run db:demo` restores 6 letters afterwards.

### 9.1 Demo hygiene

Unchanged from Phase 2 §9.1 and still required: run `npm run db:demo`
immediately before any presentation, because a demo run moves the letter counts
and the audit table is never cleaned by the test suite.

Phase 3 adds one caution: **the browser `localStorage` is part of the demo state.**
A stale session from a previous run, or a token signed with a `JWT_SECRET` that
was since regenerated, produces a `401` → refresh → `401` loop that looks like a
broken login. The first thing to try is not the password — it is clearing the
site's storage for `localhost:5173`.

## 10. Windows-Specific Considerations

| Issue | Detail | Action |
| :-- | :-- | :-- |
| **Path with a space** | The workspace is `E:\React project\PME System` | Quote every path. This has bitten the shell repeatedly in earlier phases and is the single most common failure in this repo |
| **Long paths on upload** | `ENAMETOOLONG` past 260 chars | The upload directory sits under a path containing a space; enable Windows long-path support |
| **Node version manager** | `nvm-windows` is the usual route; a portable Node avoids touching the system install | Either is acceptable. What is not acceptable is downgrading Vite (Task 3.0) |
| **`Ctrl+C` must not kill MySQL** | `MySQL80` is a Windows service, not a child process | `Ctrl+C` once to stop both dev servers |
| Print dialog | `window.print()` opens the browser dialog; **Save as PDF** is a genuine verification of `@media print` | No printer needed to pass check 14 |
| Font availability for Sinhala/Tamil | D70 relies on the OS stack | Verify on the *actual* demo machine, not just the dev box — a print with tofu boxes fails check 23 |
| Antivirus and file locks | A scanner can hold a handle on a freshly written upload | Phase 2 logs this as orphaned garbage; the UI must not block on it |
| `Ctrl+Shift+I` / F12 | DevTools for check 21 | — |
| Case-insensitive paths | Windows will not catch a case typo in an import; Linux CI will | Run `npm run build` before declaring a task done |

## 11. Risks

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| **A deferred warning is mistaken for a blocker** | Phase 3 is stalled on a Node upgrade that changes nothing — or, worse, someone downgrades Vite to silence the message | Q15 was carried as "STILL OPEN" through three backend-only phases, each of which could truthfully say no Vite build ran in its scope. Running it in 2026-09-30 showed the build exits 0. §9 checks 1–2 re-run the build so the toolchain stays verified, and Task 3.0 says plainly that downgrading Vite, `--force`, or pinning an older Vite to escape the warning is a failure |
| The UI re-derives the state machine | The UI offers buttons the server refuses, and hides ones it permits — the phase makes the system *worse* | D61, D25, D51. `available_actions` is the only source; check 16 greps for a status→action table. A client-side copy of a tested server table is the failure that would survive the demo and appear in production |
| `403` and `409` collapse into one banner | A routine workflow race on a shared machine is reported as "you do not have permission" | D52, D62. `useApiError` maps status → client action; check 17 asserts the difference |
| Attachment preview bypasses authorization | Either a broken image (`<img src>` sends no bearer) or, worse, someone re-adds a static mount and deletes the check the design rests on | D57, D64. `useObjectUrl` is the only sanctioned path; check 18 asserts both halves |
| The restructure is mixed with behaviour changes | A 400-line diff nobody can review, and a regression impossible to bisect | D63. Task 3.2b is its own commit, `vite build` passes between steps, `git diff` shows moves |
| D68 changes the duty matcher and breaks D55's rules | The matcher's tests are the only guard on the ranking logic | `Intl.Segmenter` changes segmentation, not scoring. Existing tests are the net; new Sinhala/Tamil cases are added alongside |
| The print slip looks wrong on a machine without the fonts | D70 fails on the demo machine rather than the dev box | Check 23 verifies on the real machine. A webfont is a Phase 4 decision, not a silent dependency |
| Scope creep into Modules 2–4 | Module 1 never ships | Parent plan §8. The sidebar's three disabled items are the whole of their presence; check 24 greps for their tables |
| Q7 is answered late | Task 3.15 is built against the wrong default and reworked | §13. It must be answered before 3.15, and the default (D69) is at least a working answer if it is not |
| The letter list is paginated and the UI assumes 25 rows is everything | An officer or clerk silently believes their whole queue is on screen | `pagination.total` is rendered next to the page control; the sort is server-side so the total is real |
| `x-date` timezone shift | A letter appears under the wrong day | D74, `dateUtils.js`. A bare `YYYY-MM-DD` is a calendar date, never an instant |
| A dependency is added to "just handle" a table or a chart | The spec's dependency list is a stated constraint | D71, check 24. The intake chart is rendered with divs and a CSS height, as it already is |

## 12. Definition of Done

Verified items are marked **[x] with the date and the evidence**. Items left open
are open for a stated reason, not because nobody looked.

- [x] `npm --prefix frontend run build` exits 0 and `npm --prefix frontend run lint` reports 0 errors — **2026-09-30.** Build: 131 modules, `dist/` emitted. Lint: 0 errors, 17 warnings, all of them `only-export-components` (a fast-refresh convention) or `set-state-in-effect` on a `setLoading(true)` inside a fetch-on-mount. Neither is a correctness issue; both are recorded rather than silenced, because a project that suppresses warnings to reach zero reads as zero warnings when it later grows some
- [x] `npm test` passes with 0 failures and 0 skips, and the count has not fallen below 347 — **2026-09-30: 409 tests, 409 passed, 0 failed, 0 skipped.** The floor was raised by the Q7 and sorting work, not lowered
- [x] The `frontend/src` tree matches spec §9.2, and no file from Phase 2's flat layout survives alongside it — **2026-09-30.** Six orphans deleted after an import-graph check proved them unreachable: `api.js`, `authContext.js`, `components.jsx`, `format.js`, `AuthProvider.jsx`, `Layout.jsx`. `api.js` and `authContext.js` were still *imported* — by `AuthProvider.jsx` and `Layout.jsx`, which were themselves orphaned. A per-file import scan is what distinguishes "referenced" from "reachable"; deleting on the first test would have left two broken files behind
- [x] `frontend/package.json` dependencies are unchanged from Phase 2 — no dependency added at any point in this phase
- [ ] All 24 checks in §9 pass, with 6–14 performed **in the browser**, not via `curl` — **partially done. API-level checks are verified (56 assertions live, §9's HTTP-addressable items). The rendering, print and keyboard checks remain MANUAL** and need a human at a browser. See the list below
- [ ] The whole `Logged → Completed` journey is completable through the UI by four different seeded accounts — **API-level transitions are covered by the suite; the UI walk is MANUAL**
- [ ] A minute slip prints with no app chrome, correct dates, author block, signature blocks and intact Sinhala/Tamil text — **MANUAL.** The slip is code-complete and `dateUtils`/`printUtils` are unit-tested, but "prints correctly" is only answerable on paper
- [x] Every action button traces to `available_actions`; no client-side transition table exists — **2026-09-30.** `GET /mail/:id` returns `available_actions`; no role→status→action map exists anywhere in `frontend/src`
- [x] `403`, `409` and `404` each produce a different, correct client response — **2026-09-30, live.** `401` no token, `401` bad token, `403` `MINOR_STAFF`→`/users`, `403` `SUBJECT_CLERK`→`/audit`, `404` Q7-hidden and nonexistent-id (identical), `400` unknown create field, `400` `PATCH` with `nic_no`, `409` duplicate NIC
- [ ] Attachment bytes are reachable only through the authorized route, and no `src` attribute points at an API URL — **MANUAL.** `useObjectUrl` is the only sanctioned path and the Q7 gate covers the bytes, but this is a grep plus a browser check
- [x] A Sinhala and a Tamil subject both return ranked duty candidates (D68) — **2026-09-30, live.** Sinhala 3 candidates, Tamil 3, English control 2, `scored_duties: 6` throughout
- [x] A `Confidential` letter's visibility matches the §13 answer to Q7 — **2026-09-30, live, per persona.** 18 assertions: 5 roles see it, 2 roles are blind and get a `404` identical to a nonexistent id, no leak through the aggregate `total`
- [ ] A `MINOR_STAFF` account reaches no page or control it is not permitted — **MANUAL.** The API denies it correctly; walking the UI for a route that should not render is a browser check
- [ ] `NotFoundPage` renders for an unknown route; a hard refresh on any deep route keeps the session — **MANUAL**
- [x] `VITE_API_URL` is the only new variable, and no `VITE_` variable holds a secret — **2026-09-30.** Verified; the refresh token is in `localStorage` and sent only in a body
- [ ] `README.md` documents the print walkthrough, the browser × resolution matrix, and the Node prerequisite — **partially done.** The Node prerequisite and a Q7 walkthrough are written; the print walkthrough and the resolution matrix are still to do
- [x] `git status` shows no `vehicles`, `transfers` or `assets` file and no Expo dependency — **2026-09-30**

### Remaining manual checks

These are the §9 items that cannot be answered over HTTP, and they are the whole of
what stands between this phase and accepted. They need a browser and, for the print
one, paper or a print preview.

| Check | What to do |
| :-- | :-- |
| Print slip | Open a `Completed` letter → **Print**. No header, sidebar or buttons on the paper; dates correct; author block and both signature rules present; a Sinhala or Tamil subject renders in glyphs, not boxes |
| Deep-link refresh | Hard-refresh on `/mail/<id>` and on `/admin`. Session survives, no flash of the login page |
| Unknown route | Visit `/nonsense`. `NotFoundPage` renders, and a signed-in visitor can still sign out from it |
| MINOR_STAFF containment | Sign in as `881234566V`. `/admin` is absent from the sidebar and `/admin` in the URL is a `403` page, not a rendered tab |
| Subject-clerk duty chart | Sign in as `881234564V`. Administration is reachable, shows **only** the Duty Charts tab, and the writes succeed |
| Attachment bytes | Upload a file, preview it, then confirm the network request is the authorized route and no `<img src>` or `<a href>` points at `/api/v1` |
| Resolution floor | 1366×768 and 1920×1080. No horizontal scroll, no clipped table, sidebar intact |
| Whole journey | `Logged → Forwarded to Subject → Assigned → In Progress → Completed` through the UI, as four different personas |
- [ ] A `MINOR_STAFF` account reaches no page or control it is not permitted
- [ ] `NotFoundPage` renders for an unknown route; a hard refresh on any deep route keeps the session
- [ ] `VITE_API_URL` is the only new variable, and no `VITE_` variable holds a secret
- [ ] `README.md` documents the print walkthrough, the browser × resolution matrix, and the Node prerequisite
- [ ] `git status` shows no `vehicles`, `transfers` or `assets` file and no Expo dependency

## 13. Open Questions

Numbering continues from `PHASE_2_PLAN.md` §13 (Q1–Q19).

| # | Question | Needed by | Status |
| :-- | :-- | :-- | :-- |
| **Q7** | *(inherited from `PHASE_1_PLAN.md`)* Should `Confidential` letters be hidden from `SUBJECT_CLERK` and `OFFICER` entirely, or shown with a redacted body? | **Task 3.15** | **DEFAULT APPLIED 2026-09-30 — HIDDEN ENTIRELY (D69). Implemented and verified live.** Not the ministry's decision yet, so this is a default rather than an answer, and it is reversible. The implementation is in `mailScope()` — one predicate, applied *before* the role predicate and independently of it — plus the identical rule in `isVisible()` so the detail route returns a `404` rather than a `403`. Applied in SQL so it covers the list, the detail, the attachment bytes and the suggestions endpoint together. Verified live on 2026-09-30: `SUBJECT_CLERK` (`881234564V`) and `OFFICER` (`881234565V`) both omit the seeded confidential letter from `GET /mail` and get a `404` on its detail; `ADMIN`, `SECRETARY`, `AO`, `CHIEF_CLERK` and the creating `MINOR_STAFF` all see it; the hidden letter and a nonexistent id return an identical status and message. Demo letter `DS/2026/09/0007` was added to `004_seed_demo_mail.sql` so the rule is visible in a browser rather than only in tests. **Still needs the ministry's answer.** If the answer is "redacted", the change is a second projection without `subject`/`sender_name` |
| **Q15** | *(inherited from `PHASE_0_PLAN.md` §3a)* Node `v22.3.0` is below Vite 8's floor. Upgrade the machine install, or accept the warning? | was Task 3.0 | **RESOLVED 2026-09-30 — accept the warning.** Vite 8.3.1 warns and then builds: `npm --prefix frontend run build` exits 0 on `v22.3.0` and emits `dist/`. Verified by running it, which is what three backend-only phases never did. Upgrading Node remains worth doing to silence the warning; it blocks nothing |
| **Q20** | Should the minute slip be printable **only** at `Completed`, or from any state? | 3.19 | **DEFAULT: printable at every state.** Spec §6 generates the slip at `COMPLETED & ARCHIVED`, but a clerk mid-routing has a legitimate need to see the draft endorsement. Printing early prints a non-final document and the slip carries its status so it cannot be mistaken for the file copy |
| **Q21** | Is the `Confidential` **badge** purple (spec §9.2) on a row whose body a `MINOR_STAFF` user may see? | 3.8 | **DEFAULT: yes, show the badge.** `priority` is readable by every scope Phase 2 built. Hiding it would leak less but would also hide a classification from the staff who log the letter and are responsible for applying it correctly |
| **Q22** | Should the sidebar's three disabled modules be visible at all before their phases? | 3.6 | **DEFAULT: visible and disabled, labelled with their phase number.** An empty sidebar reads as "this is all there is", which is worse for a ministry that knows it has four modules coming |

## 14. Execution Sequence

Dependency-ordered. Tasks 3.0 and 3.2b come first; 3.1–3.3 are the substrate
everything else imports.

| Step | Task | Gate before the next step |
| :-- | :-- | :-- |
| 1 | **3.0** Confirm toolchain | `vite build` exits 0 (already does) |
| 2 | **3.2b** restructure to §9.2 | `vite build` green, `git diff` is moves |
| 3 | 3.1 axios + api modules + `useApiError` | a page makes every call through `mailApi` |
| 4 | 3.2 `AuthContext` + `useAuth` | `hasPermission` drives a real control |
| 5 | 3.3 `MailContext` | registry filters survive a page change |
| 6 | 3.4 routing + guards + `ForbiddenPage` + `NotFoundPage` | 3.4, 3.20, 3.21 |
| 7 | 3.5–3.10 chrome + common components | header, sidebar, badges, `DataTable` |
| 8 | 3.11 `LoginPage` | check 4, 5 |
| 9 | 3.13 registry + `MailTable` | check 6's list view |
| 10 | 3.14 `NewMailForm` | check 6, 7 |
| 11 | 3.12 dashboard | check 4 |
| 12 | **3.15** detail + panels | check 9, 18. **Needs Q7 answered first** |
| 13 | 3.16 `AddMinutesForm` | check 8, 9 |
| 14 | 3.17 `DutyMatcherBox` + hook, **then D68** bilingual matching | check 10, 11, 12 |
| 15 | 3.18 `OfficerActionPanel` | check 13 |
| 16 | **3.19** print slip + `dateUtils`/`printUtils` | check 14, 23 |
| 17 | 3.20 `AdminPage` | tab gating |
| 18 | 3.21 `Toast`/`ConfirmDialog`/`SkeletonRow` | — |
| 19 | 3.22 responsive pass | check 22 |
| 20 | 3.23 README | check the Node prerequisite is documented |
| 21 | §9 full sweep, all 24 checks | — |
| 22 | `npm run db:demo` | registry back to 6 letters |

**Exactly one step carries a decision dependency rather than just a code
dependency:** step 12 (Task 3.15) needs **Q7** answered, because it is the task
that implements confidential-letter visibility. Everything else can be built in
any order within its group.

**Q15 no longer appears here.** It sat in this list through the planning draft on
the belief that `v22.3.0` would prevent a Vite build. Running the build showed
otherwise, so it is a step-1 confirmation rather than a decision anyone has to
make. Twenty-one of the twenty-two steps are now unblocked, and step 1 is
already satisfied.
