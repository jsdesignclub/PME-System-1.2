# PME System — Execution Plan

**Project:** Provincial Ministry Enterprise Management System (ERP)
**Source of truth:** `system_architecture_technical_specification.md`
**Status:** Planning only — no implementation started
**Date:** 2026-09-26

**Detailed phase plans:** [PHASE_0_PLAN.md](PHASE_0_PLAN.md)

---

## 1. Objective

Execute the full system defined in the technical specification: a **modular monolith** ERP for Sri Lankan provincial ministries consisting of a Node.js/Express + MySQL 8 REST API, a desktop-first React web SPA, and a React Native (Expo) mobile client for executives.

Success means a ministry officer can log a physical letter on arrival, receive a day stamp, have a Secretary endorse written minutes, have a Subject Clerk route it via duty-chart keyword matching to the correct Action Officer, track it to completion with a printable minute slip, and have every step captured in an immutable audit trail.

## 2. Scope

**In scope — all four enterprise modules plus both clients:**

| # | Module | Client | Phase |
| :-- | :-- | :-- | :-- |
| 1 | Mail & Minutes (registry, minutes, duty matching) | Web + Mobile | 1 |
| 2 | Vehicle Allocation (pool booking, drivers, trip logs) | Web | 2 |
| 3 | Staff Transfers (appeals, approvals, service history) | Web | 2 |
| 4 | Asset & Inventory Ledger (stock issue/return) | Web | 2 |
| — | Auth, RBAC, user directory, audit logging | Web + Mobile | 1 |

**Out of scope for v1:** SMS/email gateways, biometric hardware on desktop, external ERP integrations, Sinhala/Tamil i18n beyond data storage (Sinhala/Tamil text is stored and printed correctly, but the UI chrome is English in v1), offline mobile sync.

## 3. Key Decisions and Assumptions

These were not fully specified in the source document. Each is recorded here with its rationale so it can be revisited.

| # | Decision | Rationale |
| :-- | :-- | :-- |
| D1 | **MySQL 8 provided via Docker Compose** (`docker-compose.yml` with `mysql:8.0`), connection details supplied through `backend/.env`. | MySQL was not found installed on this machine. Docker gives a reproducible, resettable MySQL 8 matching the spec without modifying the host. Fallback: point `DB_HOST`/`DB_PORT`/`DB_USER` at an existing local or XAMPP MySQL — no code change, environment only. |
| D2 | **Seed script creates one user per role** (all 8 roles) with known NIC and password, **plus realistic demo letters, minutes, and duty charts** so the dashboard, registry, and duty-matching demo are populated on first run. | The spec defines 8 distinct personas with a strict workflow; testing the workflow requires at least one account per role. Demo data makes the duty-matching algorithm demonstrable immediately. |
| D3 | **Backend first, web second, mobile last.** Each layer is verified before the next begins. | The workflow is server-driven (status transitions, RBAC, audit). Building the API first means the UI is a thin, low-risk layer over a verified contract. |
| D4 | **Vehicles / Transfers / Inventory get complete backend + minimal web UI**, not full feature parity with Mail. | Mail is the spec's Phase 1 target and the deepest requirement. The other three modules share the same auth, RBAC, and audit substrate, so they are cheaper after Module 1 exists. |
| D5 | **Migrations are plain versioned SQL files** run by a small Node script, not a migration framework. | Keeps the dependency list matching the spec (`mysql2`, `express`, `jsonwebtoken`, `bcryptjs`, `multer`, `dotenv`) with no unlisted libraries. |
| D6 | **Schema extends the spec where the spec is silent.** New tables (audit log, vehicles, transfers, inventory, etc.) follow the spec's existing conventions: `InnoDB`, `utf8mb4`, `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, `ON DELETE SET NULL` for user references, `ON DELETE CASCADE` for owned children, explicit `INDEX` declarations. | The spec's schema covers only Modules 0–1. Consistency matters more than novelty. |
| D7 | **Access tokens are short-lived JWTs (2h); a `refresh_tokens` table issues rotating refresh tokens (14d) stored in `localStorage` (web) and `expo-secure-store` (mobile).** | The spec only mandates JWT via `localStorage`. Refresh tokens avoid forcing re-login every 2 hours during a working day. |
| D8 | **Duty matching runs server-side** in `dutyModel.js`; the `suggestOfficerForLetter` function from spec §8 lives there, exposed via `useDutyMatcher` on the client. | The spec places the algorithm in a JS snippet and a client hook, but matching must read `officer_duties` and must not be spoofable from the browser. Same function, server-side. |

## 4. Target Repository Layout

```
PME System/
├── docker-compose.yml               # MySQL 8 service + optional adminer
├── EXECUTION_PLAN.md                # This file
├── system_architecture_technical_specification.md
├── README.md                        # Setup + run instructions (written at end of Phase 0)
│
├── database/
│   ├── migrations/
│   │   ├── 001_create_departments_users.sql
│   │   ├── 002_create_mail_records.sql
│   │   ├── 003_create_official_minutes.sql
│   │   ├── 004_create_officer_duties.sql
│   │   ├── 005_create_audit_logs.sql
│   │   ├── 006_create_vehicles.sql
│   │   ├── 007_create_transfers.sql
│   │   ├── 008_create_inventory.sql
│   │   ├── 009_create_refresh_tokens_notifications.sql
│   │   └── 010_seed_departments.sql
│   ├── seeds/
│   │   ├── seed_users.sql            # One user per role (D2)
│   │   ├── seed_duty_charts.sql
│   │   └── seed_demo_mail.sql        # Letters, minutes, assignments
│   └── migrate.js                   # Runner: applies *.sql in order, tracks applied set
│
├── backend/
│   ├── config/
│   │   ├── db.js                     # mysql2/promise pool
│   │   └── jwt.js                    # Secret, access/refresh expiry
│   ├── controllers/                  # auth, mail, minutes, officer, vehicle, transfer, inventory, audit, dashboard
│   ├── middleware/                   # authMiddleware, roleMiddleware, uploadMiddleware, errorHandler, auditMiddleware
│   ├── models/                       # user, mail, minutes, duty, vehicle, transfer, inventory, audit models
│   ├── routes/                       # auth, mail, officer, vehicle, transfer, inventory, audit, dashboard routes
│   ├── validators/                   # Per-route request body validation
│   ├── utils/                        # dayStampGenerator, dutyMatcher, pagination, asyncHandler
│   ├── uploads/letters/              # multer disk storage target
│   ├── tests/                        # Node test runner: unit + API integration
│   ├── .env.example
│   ├── package.json
│   └── server.js
│
├── frontend/                         # Vite + React + Tailwind (spec §9.2 structure)
└── mobile/                           # Expo SDK 50+ (spec §11.2 structure)
```

## 5. Phase Roadmap

Nine phases. Phases 0–5 deliver a usable ministry system; 6–8 complete the enterprise scope.

```
P0 Foundation ──► P1 Auth & RBAC ──► P2 Mail Backend ──► P3 Web Mail UI
                                                        │
                        P6 Vehicle Module ◄─────────────┤
                        P7 Transfer Module ◄────────────┤
                        P8 Inventory Module ◄────────────┘
                        P5 Mobile Client (after P3)
```

Critical path: **P0 → P1 → P2 → P3**. P5 depends on P3. P6–P8 depend only on P1 (auth) and can be reordered or parallelized once P3 is stable.

---

### Phase 0 — Environment & Foundation

**Goal:** A running MySQL 8, a bootable Express server, and a bootable Vite React app with Tailwind configured. Nothing user-facing yet.

| # | Task | Output |
| :-- | :-- | :-- |
| 0.1 | Create `docker-compose.yml` with `mysql:8.0` (utf8mb4, `MYSQL_DATABASE=pme_system`), a named volume, and port 3306 exposed | MySQL reachable at `localhost:3306` |
| 0.2 | Verify Docker is installed and running; if absent, install Docker Desktop or fall back to a local/XAMPP MySQL (D1) | Database provider confirmed |
| 0.3 | Scaffold `backend/`: `npm init`, install `express mysql2 jsonwebtoken bcryptjs multer dotenv cors`; add `nodemon` as dev dependency | `backend/server.js` responds to `GET /api/v1/health` |
| 0.4 | Write `backend/.env.example` (PORT, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_EXPIRES_IN, UPLOAD_DIR) and `backend/.env` | Server reads config from env only |
| 0.5 | Build `backend/config/db.js` connection pool; wire `server.js` with JSON body parser, CORS, and route registration stub | Pool connects or fails loudly with a clear message |
| 0.6 | Scaffold `frontend/` with Vite React template; install and configure Tailwind CSS, Lucide React, Axios, React Router | Dev server renders a blank shell at :5173 |
| 0.7 | Apply the spec §9.1 palette to `tailwind.config.js`: navy slate `#0f172a`, gold/amber `#f59e0b` | Theme tokens available as Tailwind colors |
| 0.8 | Create `database/migrations/`, `database/seeds/`, and `database/migrate.js` runner | `npm run migrate` applies 000 files cleanly |
| 0.9 | Add root `README.md` skeleton: prerequisites, DB start command, install and run steps | Setup reproducible from a clean clone |

**Acceptance criteria:** `docker compose up -d` starts MySQL; `npm run dev` in `backend/` serves `GET /api/v1/health` → `200 {"status":"ok","db":"connected"}`; `npm run dev` in `frontend/` serves the Vite shell; all three run concurrently without port conflicts (3306 / 4000 / 5173).

---

### Phase 1 — Authentication, RBAC & User Directory

**Goal:** Nobody reaches a module endpoint without a valid token and the right role. Builds the security substrate every later phase reuses.

| # | Task | Output |
| :-- | :-- | :-- |
| 1.1 | Migration `001`: `departments` and `users` tables exactly per spec §5.1 (8-value role `ENUM`, NIC unique, `department_id` FK, `idx_user_role`, `idx_user_nic`) | Schema matches spec |
| 1.2 | `models/userModel.js`: raw SQL for find-by-NIC, find-by-ID, create, list with department join, update, deactivate | Parameterized queries only |
| 1.3 | `POST /api/v1/auth/login` — validate NIC + password, `bcryptjs.compare`, sign access token (2h) + refresh token (14d), persist refresh token hash | Spec §7.1 response shape |
| 1.4 | `GET /api/v1/auth/me` and `POST /api/v1/auth/refresh` and `POST /api/v1/auth/logout` | Session lifecycle complete |
| 1.5 | Migration `009` (partial): `refresh_tokens` table (user_id, token_hash, expires_at, revoked_at) | Rotation + revocation possible |
| 1.6 | `middleware/authMiddleware.js` — verify Bearer token, load user, reject inactive users, attach `req.user` | Protected route baseline |
| 1.7 | `middleware/roleMiddleware.js` — `requireRole('SECRETARY','AO')` factory per spec §10.2 | Reusable RBAC gate |
| 1.8 | Permission map (`utils/permissions.js`) translating each spec §4.1 permission string to roles | Single source of truth for authorization |
| 1.9 | Admin user CRUD: `GET/POST/PATCH/DELETE /api/v1/users`, admin-only, cannot delete self, cannot deactivate last ADMIN | User lifecycle managed |
| 1.10 | Department CRUD: `GET/POST/PATCH /api/v1/departments` | Shared directory |
| 1.11 | Migration `005`: `audit_logs` table per spec §13.1 (user_id, action, entity_type, entity_id, action_delta JSON, ip_address, created_at) | Immutable audit substrate |
| 1.12 | `middleware/auditMiddleware.js` + `models/auditModel.js` — write audit rows for all mutations | Every write traceable |
| 1.13 | `GET /api/v1/audit` — admin-only paginated audit viewer with filters | Audit is inspectable, not write-only |
| 1.14 | Seed `departments` (e.g. `SEC`, `ADMIN`, `EDU`, `ENG`, `FIN`, `HEALTH`, `TRANSPORT`) | FK targets exist |
| 1.15 | Seed one user per role (D2): ADMIN, SECRETARY, AO, CHIEF_CLERK, SUBJECT_CLERK, OFFICER, MINOR_STAFF, TRANSPORT_OFFICER — bcrypt-hashed, documented NIC + password | Every persona loginable |
| 1.16 | Integration tests: login success/failure, wrong-role rejection, inactive user rejection, refresh rotation, audit row written on user update | Auth proven before it is depended on |

**Acceptance criteria:** All 8 seeded personas can log in and receive a token; a MINOR_STAFF token receives `403` on an admin-only route; a deactivated user's token is rejected; every user mutation appears in `audit_logs` with actor and IP.

---

### Phase 2 — Mail & Minutes Backend (Module 1)

**Goal:** The complete six-state mail workflow enforced server-side, plus the duty-matching algorithm. This is the heart of the system.

| # | Task | Output |
| :-- | :-- | :-- |
| 2.1 | Migration `002`: `mail_records` exactly per spec §5.2 (UUID PK, unique `day_stamp_no`, sender_type/priority/status ENUMs, `assigned_officer_id` FK, three indexes) | Schema matches spec |
| 2.2 | Migration `003`: `official_minutes` per spec §5.2 (author role/name snapshot, `instruction_type`, CASCADE on mail delete) | Minutes history |
| 2.3 | Migration `004`: `officer_duties` per spec §5.2 (JSON `keywords`, `section_name`, `duty_description`) | Duty charts storable |
| 2.4 | `utils/dayStampGenerator.js` — generate `DS/YYYY/MM/NNNN` sequence, per-year-per-month counter, collision-safe under concurrent inserts | Spec §2 registry format, automated |
| 2.5 | `POST /api/v1/mail` — MINOR_STAFF+, multipart for attachment, stores file under `uploads/letters/<day_stamp_no>/`, returns `201 {success, message, record_id}` per spec §7.2 | Letter logged |
| 2.6 | `GET /api/v1/mail` — paginated, filterable by status, priority, category, sender_type, department, date range, officer; free-text search on `day_stamp_no`, `letter_ref_no`, `subject`, `sender_name`; scoped by RBAC (all / department / assigned-only) | Registry query API |
| 2.7 | `GET /api/v1/mail/:id` — full record, attached minutes, audit trail, officer and department names resolved | Detail view data |
| 2.8 | `POST /api/v1/mail/:id/minutes` — SECRETARY/AO/CHIEF_CLERK, appends to `official_minutes`, transitions `Logged → Forwarded to Subject`, writes audit row | Spec §7.2 minutes endpoint |
| 2.9 | `POST /api/v1/mail/:id/assign` — SUBJECT_CLERK, sets `assigned_officer_id` + `assigned_date`, status → `Assigned`, audit row records old and new officer | Routing |
| 2.10 | `PATCH /api/v1/mail/:id/status` — validated state machine (§6). Enforce legal transitions only; OFFICER may only touch own assigned mail; sets `completion_date` on completion; audit row per transition | Workflow integrity server-side |
| 2.11 | `PATCH /api/v1/mail/:id/notes` — separate `subject_clerk_note` and `officer_status_note` writers, role-restricted | Progress notes |
| 2.12 | `utils/dutyMatcher.js` — port of spec §8 `suggestOfficerForLetter`, with word-boundary matching, stop-word filtering, and normalized scoring so duty-description tokens cannot outweigh direct keyword hits | Correct routing suggestions |
| 2.13 | `GET /api/v1/mail/:id/suggestions` — run the matcher over active officer duties, return ranked candidates with scores and matched keywords | Duty Matcher widget data |
| 2.14 | `GET/POST/PATCH/DELETE /api/v1/officers/:id/duties` and `GET /api/v1/officers` — duty chart maintenance, ADMIN + SUBJECT_CLERK per spec §4.1 | Duty charts manageable |
| 2.15 | `POST /api/v1/mail/:id/attachments` — additional files, mimetype and size allowlist, random filenames | Multi-file letters |
| 2.16 | `GET /api/v1/mail/:id/attachments/:fileId` — authorization-checked file streaming (never a public static path) | Secure attachment access |
| 2.17 | `GET /api/v1/mail/stats` — counts by status, priority, category, daily intake trend, overdue letters | Dashboard metrics |
| 2.18 | Seed `officer_duties` (procurement, finance, legal, engineering, transport, health) and demo `mail_records` + `official_minutes` spanning all six states (D2) | Demo data exercises every screen |
| 2.19 | Integration tests: full happy path Logged → Completed as four different users; illegal transition rejected; OFFICER cannot touch unassigned mail; duty matcher ranks expected officer first | Workflow proven |

**Acceptance criteria:** A letter can traverse all six states through the API using the correct role at each step; illegal jumps return `409`/`400`; the duty matcher returns the expected officer for a seeded subject; no attachment is reachable without authorization.

---

### Phase 3 — Web Client, Mail Module (Phase 1 target)

**Goal:** The desktop-first ministry operator interface for Module 1. Follows spec §9.2 exactly.

| # | Task | Output |
| :-- | :-- | :-- |
| 3.1 | `src/api/axiosClient.js` — base URL from `VITE_API_URL`, request interceptor injecting the bearer token, response interceptor on `401` attempting one refresh then redirecting to login, normalized error shape | Single HTTP entry point |
| 3.2 | `src/context/AuthContext.jsx` + `src/hooks/useAuth.js` — session state, `login`, `logout`, `refresh`, `hasPermission(perm)`, persistence to `localStorage` | Auth state per spec §9.1 |
| 3.3 | `src/context/MailContext.jsx` — active filters, pagination, selection, detail fetch | Mail state per spec §9.1 |
| 3.4 | `App.jsx` routing with role-guarded routes; unauthenticated → `/login`; authenticated but unauthorized → 403 page | Route-level RBAC |
| 3.5 | `components/common/Header.jsx` — ministry brand, user profile, role badge, logout | App chrome |
| 3.6 | `components/common/Sidebar.jsx` — module switcher; items filtered by role permission | Navigation |
| 3.7 | `components/common/Modal.jsx` — accessible overlay (focus trap, Esc, backdrop) | Reusable dialog |
| 3.8 | `components/common/PriorityBadge.jsx` — Normal grey, Urgent red, Confidential purple per spec §9.2 | Priority display |
| 3.9 | `components/common/StatusBadge.jsx` — Logged, Forwarded, Assigned, In Progress, Completed | Status display |
| 3.10 | `components/common/DataTable.jsx` + pagination + server-side sort — foundation for all four modules | Reusable table |
| 3.11 | `pages/LoginPage.jsx` — NIC + password, error states, redirect by role | Secure login screen |
| 3.12 | `pages/DashboardPage.jsx` — metric cards (total, unreviewed, urgent, in progress, completed, overdue), daily intake chart, recent mail, my-action-items list | Executive overview |
| 3.13 | `pages/MailRegistryPage.jsx` — filter bar (status, priority, category, sender type, date range, search), `MailTable.jsx`, row → detail | Full registry |
| 3.14 | `components/forms/NewMailForm.jsx` — day stamp auto-fill/preview, sender, subject, priority, category, drag-and-drop PDF/image upload with progress | Letter entry |
| 3.15 | `pages/MailDetailPage.jsx` — letter summary, attachment preview, status rail, `MinutesTimeline.jsx`, notes panels, role-conditional action buttons | Detail view |
| 3.16 | `components/forms/AddMinutesForm.jsx` — instruction-type preset chips ("For Immediate Report", "Prepare Draft Reply", "For Information", "For Necessary Action"), free-text minutes, character counter | Minutes entry |
| 3.17 | `components/mail/DutyMatcherBox.jsx` + `hooks/useDutyMatcher.js` — ranked officer suggestions with matched keywords, one-click assign | Routing assistance |
| 3.18 | Officer action panel — status advance buttons, progress note, clearance-certificate upload, mark complete | Officer workspace |
| 3.19 | `components/mail/PrintMinuteSlip.jsx` + `utils/printUtils.js` + `utils/dateUtils.js` — `@media print` slip with ministry header, letter details, minutes, signatures; dates as "26 Sep 2026" | Printable output per spec §9.2 |
| 3.20 | `pages/AdminPage.jsx` — tabs: Users, Departments, Duty Charts, Audit Log | Administration |
| 3.21 | `components/common/Toast.jsx`, `EmptyState.jsx`, `ConfirmDialog.jsx`, `SkeletonRow.jsx` | UX polish primitives |
| 3.22 | Responsive pass for tablet widths; 1366×768 minimum supported | Office hardware fit |
| 3.23 | `README` update: demo credentials per role, walkthrough script | Reproducible demo |

**Acceptance criteria:** A user can log in, log a letter with an attachment, have a Secretary write minutes, have a Subject Clerk accept the duty suggestion and assign, have the Officer progress and complete it, and print the minute slip — all through the UI with no console errors; a MINOR_STAFF account sees only registry-level pages.

---

### Phase 4 — Hardening, Security & Audit (runs after P3, before mobile)

**Goal:** Close the gaps that only appear once the happy path works end to end.

| # | Task | Output |
| :-- | :-- | :-- |
| 4.1 | Global input validation on every route (body, query, params); reject unknown fields | No unvalidated input reaches SQL |
| 4.2 | Confirm all SQL is parameterized; no string-concatenated user input | Injection surface closed |
| 4.3 | Rate-limit `/api/v1/auth/login` (e.g. 10 attempts / 15 min / IP + NIC) | Brute-force mitigation |
| 4.4 | Password policy (min 10 chars) + bcrypt cost 12; force change on seeded default password | Credential hygiene |
| 4.5 | Security headers (`helmet`), CORS restricted to the dev frontend origin, request body size cap | Hardened transport layer |
| 4.6 | Full audit coverage: minutes edits, status changes, reassignments, user changes, module approvals — every one carries actor, timestamp, IP, delta | Spec §13.1 satisfied |
| 4.7 | `GET /api/v1/audit/export` — CSV export of the audit trail | Audit portability |
| 4.8 | `scripts/backup.js` — `mysqldump` on a schedule/on demand to `backups/` with retention | Spec §4.5 backup responsibility |
| 4.9 | Uploads hardening: mimetype + extension allowlist, 10 MB cap, random filenames, path-traversal rejection | Malicious upload mitigation |
| 4.10 | Error handler normalization; no stack traces or SQL text in production responses | No internal leakage |
| 4.11 | Verification run of the full workflow in every browser-supported state | Regression baseline |

**Acceptance criteria:** A security review pass finds no unvalidated input, no public file paths, and no credential logging; every workflow mutation is present in the audit trail; a backup file is produced and restorable.

---

### Phase 5 — Mobile Client (Phase 2)

**Goal:** React Native / Expo client for Secretaries, AOs, and field officers. Follows spec §11.2.

| # | Task | Output |
| :-- | :-- | :-- |
| 5.1 | `npx create-expo-app mobile`; install React Navigation v6, axios, expo-secure-store, expo-notifications, expo-camera, expo-document-picker | Mobile toolchain |
| 5.2 | `src/config/constants.js`, `src/config/theme.js` — shared API base, timeouts, navy/gold palette | Mobile config |
| 5.3 | `src/utils/storageUtils.js` — SecureStore wrapper for tokens | Secure token storage |
| 5.4 | `src/api/client.js` — axios instance, SecureStore token injection, 401 refresh, offline detection with retry queueing | Resilient HTTP layer |
| 5.5 | `src/api/authApi.js`, `mailApi.js`, `notificationApi.js`; register Expo push token with backend | Mobile API contracts |
| 5.6 | `src/context/AuthContext.jsx`, `MailContext.jsx`, `NotificationContext.jsx` + hooks `useAuth`, `useMail`, `useBiometrics`, `usePushNotification` | Mobile state |
| 5.7 | `src/hooks/useBiometrics.js` — Touch ID / Face ID gate on sensitive screens | Spec §11.2 |
| 5.8 | `navigation/AppNavigator.jsx`, `AuthStack.jsx`, `MainTabNavigator.jsx` (Dashboard, Inbox, History, Profile), `MailStack.jsx` | Navigation |
| 5.9 | `screens/auth/LoginScreen.jsx` — NIC/password + biometric unlock | Mobile login |
| 5.10 | `screens/dashboard/DashboardScreen.jsx` — unreviewed count, urgent list, quick actions | Executive overview |
| 5.11 | `screens/mail/ExecutiveInboxScreen.jsx` + `components/mail/MailCard.jsx` | Executive feed |
| 5.12 | `screens/mail/MailDetailScreen.jsx` + `components/mail/DocumentViewer.jsx` (PDF/image modal) | Letter detail on the go |
| 5.13 | `screens/mail/AddMinutesScreen.jsx` + `components/mail/QuickMinuteSheet.jsx` + `components/forms/VoiceMinuteInput.jsx` | Fast minute endorsement |
| 5.14 | `screens/profile/ProfileScreen.jsx` — officer details, duty section, logout | Profile |
| 5.15 | Push notifications for urgent mail and minutes awaiting endorsement; backend notification dispatch | Executive alerts |
| 5.16 | `components/common/` set: CustomButton, PriorityBadge, StatusBadge, SearchBar, LoadingOverlay | Mobile UI kit |
| 5.17 | `components/forms/StatusUpdateForm.jsx` — progress note + photo from camera | Field status updates |
| 5.18 | Custom Sinhala/Tamil fonts bundled in `assets/fonts`; verify Sinhala/Tamil letter text renders in list and detail views | Script rendering |
| 5.19 | Build config: `app.json` permissions, EAS build profile, `README.md` run/build instructions | Deployable |

**Acceptance criteria:** On a physical device or Expo Go, a Secretary logs in with biometrics, sees urgent mail, writes minutes with a voice note, receives a push for a newly logged urgent letter, and updates field status with a photo.

---

### Phase 6 — Vehicle Allocation Module (Module 2)

| # | Task | Output |
| :-- | :-- | :-- |
| 6.1 | Migration `006`: `vehicles` (registration_no unique, type, make/model, year, fuel type, capacity, odometer, status enum), `vehicle_bookings` (vehicle_id, requester_id, purpose, destination, start_at, end_at, status enum `Pending/Approved/Rejected/Completed/Cancelled`, approver_id, approval_note), `vehicle_trips` (booking_id, driver_user_id, odometer_start, odometer_end, fuel_litres, trip_note) | Schema |
| 6.2 | `models/vehicleModel.js` + `controllers/vehicleController.js` + `routes/vehicleRoutes.js` | Data + API layer |
| 6.3 | `POST /api/v1/vehicles/:id/bookings` — requester; conflict detection against overlapping approved bookings | Booking with no double-booking |
| 6.4 | `POST /api/v1/vehicles/bookings/:id/approve` and `/reject` — SECRETARY/AO only; approval writes audit row | Approval chain |
| 6.5 | `GET /api/v1/vehicles/availability` — free vehicles for a date range | Availability view |
| 6.6 | Driver assignment (TRANSPORT_OFFICER or ADMIN) and trip log capture | Trip records |
| 6.7 | Web: `pages/VehicleBookingPage.jsx`, `VehicleFleetPage.jsx`, `VehicleApprovalPage.jsx`, `TripLogPage.jsx`; sidebar entry; dashboard widget | Full web UI |
| 6.8 | Maintenance fields: next service date, service log | Fleet upkeep |
| 6.9 | Tests: overlap rejection, non-approver blocked, odometer validation | Module proven |

**Acceptance criteria:** Two overlapping requests for the same vehicle cannot both be approved; only Secretary/AO can approve; completed trips persist odometer and fuel data and appear in the audit trail.

---

### Phase 7 — Staff Transfers Module (Module 3)

| # | Task | Output |
| :-- | :-- | :-- |
| 7.1 | Migration `007`: `transfer_requests` (applicant_id, from_department_id, to_department_id, requested_role, type enum `Transfer/Promotion/Deputation`, reason, supporting_document_path, status enum `Draft/Submitted/Under Review/Approved/Rejected/Completed`, reviewer_id, decision_note, decided_at) | Schema |
| 7.2 | `models/transferModel.js` + controllers + routes; applicant submits; SUBJECT_CLERK/SECRETARY review; ADMIN final approval | API |
| 7.3 | `GET /api/v1/transfers/:id/history` — append-only status history table `transfer_request_events` | Service history per spec §12.3 |
| 7.4 | On approval, optional side effect: update `users.department_id` and `designation`, wrapped in a transaction, audited | Directory stays consistent |
| 7.5 | Web: `pages/TransferRequestPage.jsx` (applicant), `TransferReviewPage.jsx` (reviewer), `TransferHistoryPage.jsx`; applicant-only visibility of own requests | Full web UI |
| 7.6 | Tests: applicant cannot approve own request; approval updates the user directory exactly once | Module proven |

**Acceptance criteria:** A request moves through the full chain with only the correct roles able to act at each step; the applicant's department in `users` reflects the approval; every transition is in the request history and the audit log.

---

### Phase 8 — Asset & Inventory Ledger (Module 4)

| # | Task | Output |
| :-- | :-- | :-- |
| 8.1 | Migration `008`: `assets` (asset_code unique, name, category, serial_no, purchase_date, purchase_value DECIMAL, warranty_expiry, condition enum, current_status enum `In Store/Issued/Under Repair/Disposed`, department_id, assigned_to_user_id), `stock_items` (item_code, name, unit, quantity, reorder_level), `stock_movements` (item_id, movement_type enum `Receipt/Issue/Return/Adjustment`, quantity, issued_to, issued_by, reference_note, created_at) | Schema |
| 8.2 | `models/inventoryModel.js` + controllers + routes; every movement is transactional and audited; asset assignment updates `current_status` and `assigned_to_user_id` in the same transaction | Data integrity |
| 8.3 | `GET /api/v1/inventory/low-stock` — items at or below reorder level | Replenishment view |
| 8.4 | `GET /api/v1/assets/:code/history` — full custody chain for an asset | Asset accountability |
| 8.5 | Web: `pages/InventoryLedgerPage.jsx`, `AssetRegisterPage.jsx`, `IssueAssetPage.jsx`; dashboard low-stock and asset-value widgets | Full web UI |
| 8.6 | Depreciation report: straight-line value by department | Financial reporting |
| 8.7 | Tests: negative stock rejected; return cannot exceed issued quantity; disposal requires ADMIN | Module proven |

**Acceptance criteria:** Issue → return cycles keep `quantity` and asset custody accurate; low-stock query returns correct items; disposal is admin-only and audited.

---

## 6. API Surface (target)

| Group | Endpoints |
| :-- | :-- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` |
| Users / Depts | `GET/POST/PATCH/DELETE /users`, `GET/POST/PATCH /departments` |
| Mail | `POST /mail`, `GET /mail`, `GET /mail/:id`, `PATCH /mail/:id/status`, `PATCH /mail/:id/notes`, `POST /mail/:id/minutes`, `POST /mail/:id/assign`, `POST /mail/:id/attachments`, `GET /mail/:id/attachments/:fileId`, `GET /mail/:id/suggestions`, `GET /mail/stats` |
| Officers | `GET /officers`, `GET/POST/PATCH/DELETE /officers/:id/duties` |
| Vehicles | `GET/POST/PATCH /vehicles`, `GET /vehicles/availability`, `POST /vehicles/:id/bookings`, `POST /vehicles/bookings/:id/approve`, `POST /vehicles/bookings/:id/reject`, `POST /vehicles/bookings/:id/trip` |
| Transfers | `GET/POST/PATCH /transfers`, `GET /transfers/:id/history` |
| Inventory | `GET/POST/PATCH /assets`, `GET/POST/PATCH /stock-items`, `POST /inventory/movements`, `GET /inventory/low-stock`, `GET /assets/:code/history` |
| Audit / System | `GET /audit`, `GET /audit/export`, `GET /health`, `GET /dashboard/summary` |

All routes are namespaced under `/api/v1`, require a bearer token except `/auth/login` and `/health`, and are gated by `roleMiddleware`.

## 7. Testing Strategy

| Layer | Tool | Coverage |
| :-- | :-- | :-- |
| Unit | Node built-in test runner | `dutyMatcher`, `dayStampGenerator`, `permissions` map, validation helpers |
| API integration | Node test runner + supertest against a dedicated test database | Every endpoint: happy path, RBAC denial, validation failure, illegal state transition |
| Workflow E2E | Scripted multi-role run | Full Logged → Completed journey as four different seeded users, asserting status, audit rows, and permissions at each hop |
| Manual UI | Checklist script in `README.md` | Every page at 1366×768 and 1920×1080; Chrome, Edge, Firefox |
| Mobile | Manual on device + Expo Go | Login, inbox, minutes, push, biometrics |

Test database is separate (`pme_system_test`), created and dropped by the test bootstrap so dev data is never at risk.

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| Docker not available on this machine | Blocks Phase 0 | Fallback path is environment-only (point `DB_*` at local/XAMPP MySQL); decide in task 0.2 |
| Workflow status model diverges from real ministry practice | Rework of the core state machine | Spec §6 is the contract; any change is a migration + test update, contained to `mail_records.status` and the transition validator |
| Duty matching produces wrong officers in practice | Trust failure in the feature | Matchers return **ranked suggestions with matched keywords**, never auto-assign; the Subject Clerk always confirms. Keywords stay editable in the Admin duty chart UI |
| Sinhala/Tamil text corrupted in DB, print, or mobile | Unusable for real letters | `utf8mb4` end to end, tested with real Sinhala/Tamil samples at every layer including the print slip and bundled fonts (task 5.18) |
| File upload abuse or path traversal | Security hole | Randomized filenames, mimetype allowlist, size cap, authorization-checked streaming, no public static mount (tasks 4.9, 2.16) |
| Scope creep across four modules | Never ships Module 1 | Hard phase gates with acceptance criteria; Modules 2–4 explicitly cannot start before Phase 3 is accepted |
| No device for mobile testing | Phase 2 unverifiable | Expo Go on any phone; desktop-only milestones are complete and shippable without it |

## 9. Execution Order (critical path)

```
1.  P0  Environment, repo scaffold, DB, dev servers running
2.  P1  Auth, RBAC, users, departments, audit substrate        ← everything depends on this
3.  P2  Mail + Minutes + duty matching backend, fully tested
4.  P3  Web client for Module 1, end-to-end demo achieved      ← first shippable milestone
5.  P4  Hardening, security review, backups
6.  P5  Mobile client
7.  P6  Vehicle Allocation
8.  P7  Staff Transfers
9.  P8  Asset & Inventory
10. Final: README, demo script, full regression pass
```

## 10. Definition of Done

The project is complete when all of the following hold:

- [ ] A letter moves through all six states (spec §6) entirely through the web UI, with each transition performed by a correctly-privileged role
- [ ] Duty matching returns a ranked, explainable officer suggestion that the Subject Clerk can act on in one click
- [ ] A minute slip prints with correct Sinhala/Tamil text, letter details, minutes, and signature blocks
- [ ] All four modules have working web UIs backed by transactional, audited APIs
- [ ] The mobile client lets an executive endorse minutes and update field status from a phone
- [ ] Every mutation in every module appears in `audit_logs` with actor, timestamp, and IP
- [ ] Role-denial tests pass for all 8 personas across all modules
- [ ] `npm run migrate && npm run seed` on a clean database reproduces the full demo environment
- [ ] A database backup is produced on demand and verified restorable
- [ ] `README.md` documents setup, demo credentials, and a click-through demo script

## 11. Open Questions

Resolve before the listed phase starts.

| # | Question | Needed by |
| :-- | :-- | :-- |
| Q1 | Is Docker Desktop installed, or should we use an existing local/XAMPP MySQL? | Phase 0 (0.2) |
| Q2 | Confirm the 8 seed accounts' demo NICs and password, or accept generated placeholders? | Phase 1 (1.15) |
| Q3 | Are the 5 `mail_records.status` values and 3 `priority` values final, or does the ministry use different wording? | Phase 2 (2.1) |
| Q4 | Does an officer need more than one active duty chart section, or exactly one `section_name` per officer? | Phase 2 (2.14) |
| Q5 | For Vehicle Allocation: is fuel/logbook tracking in v1 scope, or booking and approval only? | Phase 6 |
| Q6 | For Transfers: does final approval require Board-level sign-off as a distinct role, or is ADMIN sufficient? | Phase 7 |
| Q7 | Should confidential letters be hidden from SUBJECT_CLERK and OFFICER entirely, or shown with a redacted body? | Phase 3 (3.15) |
