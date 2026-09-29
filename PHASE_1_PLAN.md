# Phase 1 — Authentication, RBAC & User Directory: Detailed Plan

**Parent plan:** `EXECUTION_PLAN.md` (Phase 1 of 9) · **Predecessor:** `PHASE_0_PLAN.md`
**Status:** 📋 Planned — not started
**Date:** 2026-09-29 (written)

---

## 1. Objective

Produce a state where **no request reaches a business endpoint without a valid token and the correct role**, and where **every change to a user or department is attributable to a named person at a named IP**:

- `users` and `departments` exist exactly per spec §5.1, plus `refresh_tokens` and `audit_logs`
- `POST /api/v1/auth/login` returns a signed access token and a rotating refresh token
- `authMiddleware` + `roleMiddleware` gate every route except `/health` and `/auth/login`
- All **8** personas from spec §5.1's role `ENUM` can log in with a documented demo credential
- Admin can manage users and departments; every such mutation writes an `audit_logs` row
- `backend/tests/` proves the above against a real database, with no new test dependency

Phase 1 is the security substrate. Phases 2 and 3 consume it and cannot be built without it — which is exactly why it is verified against a live database rather than "written and assumed".

## 2. Scope

**In scope:** migrations `001`–`004`; password hashing; access/refresh token issuance, rotation and revocation; token and role middleware; the permission map; user and department CRUD; the audit substrate and its query endpoint; demo seeds; the test suite; README updates.

**Out of scope — explicitly NOT built in Phase 1:**

| Deferred to | What | Why |
| :-- | :-- | :-- |
| Phase 2 | Any `mail_records` / `official_minutes` / `officer_duties` table, day-stamp generator, duty matcher, workflow state machine | Module 1 content. Phase 1 ships **zero** mail rows. |
| Phase 3 | **The entire frontend.** No `LoginPage`, no `AuthContext`, no router guards | Parent plan assigns these to Phase 3 (tasks 3.1–3.4, 3.11). Phase 1 touches no file under `frontend/src/`. |
| Phase 4 | Rate limiting on `/auth/login`, `helmet`, global validation middleware, CSV audit export, backups | Parent plan tasks 4.1–4.10. Phase 1 does enough validation to keep its own endpoints safe (D41) and leaves the rest. |

**A Phase 1 build containing a login form has failed Phase 1**, for the same reason a Phase 0 build containing one failed Phase 0.

## 3. Prerequisites

| Prerequisite | Required | Status as of 2026-09-29 | Action if missing |
| :-- | :-- | :-- | :-- |
| `MySQL80` service | Running | ✅ Running (Phase 0 §9 check 1) | `Start-Service MySQL80` — needs an elevated prompt |
| `pme_system` database | Empty, `utf8mb4` | ✅ Exists, still holds only `schema_migrations` (0 rows) | Re-run `database/bootstrap.sql` as root |
| `pme_user` grant | `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES` on `pme_system.*` | ✅ Verified in Phase 0 §9 check 2 | Re-run `bootstrap.sql`; note D42 — no `TRIGGER` privilege is granted |
| `backend/.env` | Complete, no `change-me` | ✅ Present, git-ignored | Copy `.env.example` and fill in |
| `JWT_SECRET` | 48 random bytes | ✅ Present in `.env` | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| Node.js | `>=18` (spec §10.1) | ⚠️ **v22.3.0** — fine for the backend, still below Vite 8's floor | Carried over from Phase 0 §3a / Q11. **Phase 1 does not need a newer Node** — no Vite build runs in this phase. Resolve before Phase 3. |
| npm deps | the seven spec §10.1 packages | ✅ Installed in Phase 0; `jsonwebtoken` and `bcryptjs` are present and still unused | none |
| `database/migrations/`, `database/seeds/` | Empty, tracked | ✅ `.gitkeep` only | none |

**No new runtime dependency is added in Phase 1.** In particular there is no `zod`/`joi` for validation, no `supertest` for HTTP tests, and no `helmet`. The test runner stays `node --test` (Phase 0 choice) and validation is hand-rolled (D41). This keeps `backend/package.json` matching spec §10.1, which Phase 0 §9 verified and Phase 1 must not quietly break.

## 4. Decisions Taken in This Phase

Numbering continues from `PHASE_0_PLAN.md` §4 so the two documents read as one series. D1–D16 there are still binding and are **not** re-litigated here.

| # | Decision | Rationale |
| :-- | :-- | :-- |
| **D17** | Migrations are renumbered to a **dense, dependency-ordered** sequence: `001_departments`, `002_users`, `003_refresh_tokens`, `004_audit_logs` | The parent plan numbers them `001` (departments+users), `009` (refresh_tokens) and `005` (audit_logs). That is internally inconsistent — `005` sorts *before* `009` yet is authored later — and the gaps imply a reservation scheme that no document defines. `migrate.js` sorts by filename (`database/migrate.js:33`), so ordering *is* dependency ordering. Dense numbers make the FK chain self-evident in `ls`. |
| **D18** | **`server.js` is split into `app.js` (builds and exports the app) + `server.js` (bootstrap only)** | `server.js` currently calls `assertConfigIsComplete()` and `start()` at module top level, so importing it *starts a server*. Tests therefore cannot import the app. There is no `require.main` equivalent in ESM, and the alternatives (an env flag, a `globalThis` sentinel) are worse than a file split. This is the one structural deviation from Phase 0's file list, and it is what makes Task 1.17 possible at all. |
| **D19** | **Every model function takes an optional trailing `executor` argument defaulting to `pool`** — `findByNic(nic, executor = pool)` | Audit rows are written in the *same transaction* as the mutation they describe (D20), which is only possible if a caller can thread one connection through several model calls. This signature is what makes that mechanical rather than a rewrite later. It is also how the last-admin guard gets a function-level test (D23). |
| **D20** | **An audit row and the change it describes commit together or not at all** | Writing the audit row after the mutation commits means an audit failure leaves an invisible, unattributable change — the one outcome an audit trail exists to prevent. Fire-and-forget loses rows; a best-effort catch is worse than none, because it looks like coverage. Transactional coupling makes the guarantee real. Cost: mutations that audit must not use `pool.query` directly. |
| **D21** | **The access token carries only `{ sub, role, type }`. No `department_id`, no permissions** | Anything time-varying in a token is stale from the moment it is minted, and a 2-hour stale `department_id` silently mis-scopes every authorization decision made with it. `authMiddleware` loads the fresh user row on each request instead, which also makes deactivation take effect immediately rather than after token expiry — parent plan task 1.6 requires exactly that. One indexed `SELECT` by primary key on a ministry LAN is not a performance concern; a 2-hour authorization cache is a correctness one. |
| **D22** | **Access and refresh tokens are distinguished by a `type` claim and share `JWT_SECRET`** | A separate `JWT_REFRESH_SECRET` adds a second secret to provision, rotate and leak, and buys only defence-in-depth against a specific bug. Verifying `type` on every use closes the actual attack — a refresh token presented as a Bearer credential — with one claim. Task 1.17 tests that case explicitly. |
| **D23** | **`DELETE /api/v1/users/:id` deactivates (`is_active = FALSE`); it never deletes the row** | `mail_records.created_by_user_id` and `official_minutes.author_user_id` both `REFERENCES users(id)` with no `ON DELETE` clause, i.e. `RESTRICT`. A hard delete of any user who has ever logged a letter would fail with `ER_ROW_IS_REFERENCED_2` — and one who has not would silently destroy audit attribution. Deactivation is also what "cannot deactivate last ADMIN" implies guarding, so one soft-delete endpoint covers both phrasings. |
| **D24** | **The last-active-ADMIN guard runs inside the caller's transaction under `SELECT ... FOR UPDATE`** | "Is there another active admin?" followed by an update is a TOCTOU race: two concurrent deactivations both observe one admin and both proceed, leaving the system with no administrator and no way back in through the UI. Locking the candidate rows serialises the two requests. |
| **D25** | **`utils/permissions.js` is the single source of truth, and the frontend consumes it over HTTP** | The frontend is a separate npm package and cannot import from `backend/` without a shared workspace or a build step — either is new infrastructure this project does not have. `GET /api/v1/auth/permissions` returns the caller's resolved permission list, so a permission change takes effect without a frontend rebuild. |
| **D26** | **`FULL_SYSTEM_ACCESS` is expanded at resolution time, never checked as a wildcard by consumers** | `resolvePermissions(role)` returns the full set; `hasPermission(role, perm)` and the endpoint all go through it. Otherwise every consumer needs the two-step check, and one that forgets it locks the administrator out of a feature. One rule, one place. |
| **D27** | **Spec §4.1's `ENGINEER` and `LEGAL_OFFICER` are *not* roles.** Engineers and legal officers are `OFFICER` rows with `designation` set accordingly | Spec §4.1 lists them as officer personas, but spec §5.1's `role` `ENUM` has exactly 8 values and neither is among them. The `ENUM` is the schema and parent plan task 1.1 specifies it as "8-value role ENUM". `designation` and `section_name` already exist to carry this distinction. Following §4.1 literally would require an `ALTER TABLE` in Phase 2 when the first engineer is created. |
| **D28** | **`TRANSPORT_OFFICER` receives the officer permission set** | Spec §4.1 assigns no permissions to this persona, yet it is one of the 8 `ENUM` values and parent plan task 1.15 requires it to be a loginable persona. An officer with no permissions could log in and reach nothing, which makes the seeded persona useless and would read as a bug. Transport officers are action officers, so they get `READ_ASSIGNED_MAIL`, `UPDATE_ACTION_STATUS`, `CLOSE_MAIL_FILE`. Flagged as a spec gap resolved by decision, not an oversight. |
| **D29** | **Login returns the same 401 body for an unknown NIC and a wrong password; a deactivated account gets 403** | Differentiating them turns `/auth/login` into a user-enumeration oracle. The 403 is safe *and* necessary: it is only reachable after a correct password, so it discloses nothing an attacker did not already have, and a legitimate user locked out of the system needs to know why. |
| **D30** | **An unknown NIC still costs one bcrypt comparison**, against a fixed dummy hash | Without it, "user not found" returns in ~1 ms and "wrong password" in ~300 ms. The timing difference enumerates accounts just as effectively as the message does, and D29's identical bodies would be pointless without it. The dummy hash is a module constant in `utils/password.js` — not a real user's. |
| **D31** | **Demo personas are seeded as literal bcrypt hashes in a `.sql` file, generated by `backend/scripts/hash-password.js`** | A bcrypt hash cannot be computed in SQL, and Phase 0's D10 fixes the seed runner as a plain multi-statement executor. The alternatives were changing `migrate.js` to run JS seeds, or hand-pasting a hash. A documented generator script keeps the seed declarative, keeps the runner proven, and makes the hash reproducible at a known cost factor. The plaintext appears only as a comment in the seed file and in the README — it is a published demo credential by design, never a real one. |
| **D32** | **The audit serializer redacts `password_hash` and any `*_hash` / `*token*` field before writing `action_delta`** | An audit trail that stores password hashes is a credential store with a timestamp column and no access control. The redaction lives in the serializer, not at each call site, so a future caller cannot forget it. Task 1.17 asserts a hash never reaches an audit row. |
| **D33** | **Phase 1 ships no login rate limiting, and says so** | Parent plan task 4.3 assigns it to Phase 4, and inventing it here would add a dependency or a homegrown limiter that Phase 4 would replace. The absence is a real, dated risk (§11), not an oversight. |
| **D34** | **No `.env` variables are added.** `BCRYPT_ROUNDS` is a constant, not a config value | Lowering the cost factor is a security decision, not a deployment knob — an environment that can weaken its own password hashing will eventually do so quietly. One exported constant in `utils/password.js` puts the decision in one reviewable place. `JWT_EXPIRES_IN` and `REFRESH_TOKEN_EXPIRES_IN`, both present since Phase 0, simply become live. |
| **D41** | **Validation is hand-rolled in `utils/validate.js`; no schema library** | Spec §10.1 fixes the dependency list and Phase 0 §9 verified `backend/package.json` against it; adding `zod` breaks that check on day one of Phase 1. Parent plan task 4.1 is where global validation is scheduled, so Phase 1 writes only enough to keep its own endpoints safe, behind a single module that Phase 4 can swap without touching call sites. |
| **D42** | **Audit immutability is enforced in the API layer, and the database enforcement is declined for now** | Phase 0 D2 granted `pme_user` `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES` — and **`TRIGGER` is not among them.** A `BEFORE UPDATE` / `BEFORE DELETE` trigger that `SIGNAL`s is the only way MySQL itself can make `audit_logs` immutable, and creating one needs either `root` or an amended `GRANT` in `database/bootstrap.sql`. A migration that fails on a clean clone is worse than an honest boundary, so `auditModel` exports no update or delete path and Phase 4 task 4.6 closes the rest. See Task 1.4. |
| **D43** | **A refresh token carries a random `jti` claim in addition to `{ sub, type }`** | `signRefreshToken` adds `jti: randomUUID()`; `verifyToken` ignores it | Found by the test suite, not by review. `iat` has **one-second** resolution, so a refresh token minted in the same second as the token it replaces is byte-identical — same user, same claims, same expiry. Its SHA-256 then collides with `uq_refresh_token_hash` and rotation returns **500**. This breaks the most common flow there is: a client that logs in and immediately refreshes. D21's minimal payload is preserved for the *access* token, which is stateless and has no row to collide with; only the refresh token needs per-issuance uniqueness. The `jti` is read by nothing — rotation is tracked by the revoked row, not by comparing `jti`s. |
| **D44** | **A deactivated account is `401` on every auth endpoint, including `POST /auth/refresh`** | `refresh` returns `401 "Account is deactivated"`, not `403` | `login` returns `403` for the same condition (D29) and that asymmetry is deliberate: reaching login's branch requires the correct password, so naming the reason leaks nothing. `refresh` has no such guarantee to fall back on, and its caller is holding a valid token. The reason the two differ is a *client* concern, and it is not a small one: a client that must treat `401` as "clear the session, go to the login page" and `403` as "show an error" needs two rules on the same screen. Since both statuses mean the same thing here, they return the same status. |
| **D45** | **`POST /api/v1/users` reads its password hash from a dedicated model function** | `userModel.findByCredentials(nic)` exists alongside `findByNic(nic)` | `PUBLIC_COLUMNS` omits `password_hash` on purpose (the plan's §Task 1.14 "excluded by the select list, not deleted in JavaScript"), which is what makes a stray `SELECT *` harmless. That omission also means `findByNic` **cannot** serve the login path — the first version of `authController.login` called it and every login returned 401. The fix is a second function whose name is greppable and unmistakably about credentials, rather than a `findByNic({ withHash: true })` flag that would hide the dangerous call site in review. It appears in exactly one place: the login path. |
| **D46** | **`ALL_PERMISSIONS` excludes the wildcard** | `resolvePermissions('ADMIN')` returns concrete permissions only | Also found by the test suite. `ALL_PERMISSIONS` was built by flattening every role's list, and `ADMIN`'s list *is* `[WILDCARD]` — so the wildcard was in the expanded output, and the expansion handed consumers the very marker D26 says they must never see. D26's guarantee ("no consumer ever has to know the wildcard exists") was documented in the file and false in the code. The filter is one `.filter()` and the test now asserts the wildcard is absent from the resolved list. |
| **D47** | **Test fixtures register their own cleanup** | `createUser` records the NIC in a module-level registry; `cleanup()` drains it. `track(nic)` covers users created through the API | The first version had each file push NICs into a local array for `after()` to delete, and it leaked: three call sites created a user and forgot to track it, leaving 77 orphans in the database across runs — one of which was a seeded demo persona, deactivated, which then failed acceptance check 4. A registry the fixture populates itself removes the opportunity to forget, which is the whole failure mode. The plan's §Task 1.16 already asked for "namespaced fixtures, per-test cleanup, seeded personas never touched"; it did not say *how*, and the how matters. |

### 4a. Deviations from the parent plan's literal task text

Decisions **D41** and **D42** close the table above; **D35**–**D40** are collected here, so the two sub-tables are not in numeric order. Read both — D35–D40 are places this plan knowingly departs from `EXECUTION_PLAN.md`'s wording, and D41–D42 are decisions those departures depend on.

| # | `EXECUTION_PLAN.md` says | What this plan does instead | Why |
| :-- | :-- | :-- | :-- |
| **D35** | Task 1.5: "Migration **009** (partial)"; task 1.11: "Migration **005**" | `003_refresh_tokens.sql`, `004_audit_logs.sql` (D17) | See D17. Also note task 1.5's "(partial)" — there is no complete version to defer to; the `ENUM` and FK set are settled here. |
| **D36** | Task 1.1: `users` with `INDEX idx_user_nic (nic_no)` alongside `nic_no VARCHAR(20) UNIQUE` | `idx_user_nic` **omitted**; `idx_user_role` kept | A `UNIQUE` index is already a usable index on that column, so `idx_user_nic` is a pure duplicate — extra write cost on every login for a second b-tree to maintain. `idx_user_role` is kept: it is the index behind every role-scoped query in Phases 2–3. |
| **D37** | Spec §5.1 `users` has `created_at` but no `updated_at` | `updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` added | Task 1.2 requires update operations, and the admin UI (Phase 3, task 3.20) needs to show when a row last changed. `audit_logs` records *who* changed a row; `updated_at` records *when the row itself* last changed, which is different for a `PATCH` that sets the same value. One column, and it is a deviation — say the word and it is dropped. |
| **D38** | Spec §5.1 tables end `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` | Each table also names `COLLATE=utf8mb4_unicode_ci` explicitly | Phase 0 D14 established that this project's collation is load-bearing, and `database/migrate.js:54` already names it on `schema_migrations`. Relying on the database default makes every table's collation a property of `bootstrap.sql` rather than of the migration that defines it. |
| **D39** | Spec §7.1 login response is `{ success, token, user }` | Response also carries `refresh_token` | Without it the client cannot refresh, and parent plan task 1.4 requires a refresh endpoint — the two cannot both be satisfied. The spec's shape is preserved as a subset. |
| **D40** | `routes/` contains only the six module routers of spec §10.2 | Adds `userRoutes.js`, `departmentRoutes.js`, `auditRoutes.js` | Spec §10.2 predates Phase 1's task list, which needs admin CRUD endpoints for entities the spec's tree has controllers for but no routes for. `authRoutes.js` matches the spec's naming exactly. `routes/index.js` remains the registry, as established in Phase 0. |

## 5. Target Filesystem State at End of Phase 1

Everything in the Phase 0 tree is retained. Additions and edits:

```
PME System/
├── database/
│   ├── migrate.js                  # EDIT — optional seed-file filter argument (Task 1.15)
│   ├── migrations/
│   │   ├── .gitkeep
│   │   ├── 001_departments.sql     # NEW
│   │   ├── 002_users.sql           # NEW
│   │   ├── 003_refresh_tokens.sql  # NEW
│   │   └── 004_audit_logs.sql      # NEW
│   └── seeds/
│       ├── .gitkeep
│       ├── 001_seed_departments.sql   # NEW — 7 departments
│       └── 002_seed_demo_users.sql    # NEW — 8 personas, one per ENUM value
│
├── backend/
│   ├── app.js                      # NEW  — builds + exports express app (D18)
│   ├── server.js                   # EDIT — bootstrap only: config check, DB check, listen
│   ├── config/
│   │   ├── db.js                   # unchanged
│   │   └── jwt.js                  # EDIT — add sign/verify helpers (Task 1.5)
│   ├── controllers/
│   │   ├── authController.js       # NEW
│   │   ├── userController.js       # NEW
│   │   ├── departmentController.js # NEW
│   │   └── auditController.js      # NEW
│   ├── middleware/
│   │   ├── authMiddleware.js       # NEW
│   │   ├── roleMiddleware.js       # NEW
│   │   ├── auditMiddleware.js      # NEW
│   │   └── errorHandler.js         # unchanged
│   ├── models/
│   │   ├── userModel.js            # NEW
│   │   ├── departmentModel.js      # NEW
│   │   ├── refreshTokenModel.js    # NEW
│   │   └── auditModel.js           # NEW
│   ├── routes/
│   │   ├── index.js                # EDIT — compose the four routers
│   │   ├── authRoutes.js           # NEW
│   │   ├── userRoutes.js           # NEW
│   │   ├── departmentRoutes.js     # NEW
│   │   └── auditRoutes.js          # NEW
│   ├── scripts/
│   │   └── hash-password.js        # NEW
│   ├── utils/
│   │   ├── password.js             # NEW
│   │   ├── permissions.js          # NEW
│   │   └── validate.js             # NEW
│   └── tests/
│       ├── helpers/app.js          # NEW
│       ├── helpers/db.js           # NEW
│       ├── helpers/fixtures.js     # NEW
│       ├── auth.test.js            # NEW
│       ├── permissions.test.js     # NEW
│       ├── users.test.js           # NEW
│       ├── departments.test.js     # NEW
│       └── audit.test.js           # NEW
│
└── frontend/src/                   # UNTOUCHED — the UI is Phase 3 (D25, §2)
```

**File count:** ~24 new, 4 edited. **No file under `frontend/` changes.**

## 6. Task Breakdown

### Task 1.1 — Migration `001`: `departments`

**Goal:** the FK target for `users.department_id`, exactly as spec §5.1.

```sql
CREATE TABLE IF NOT EXISTS departments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  code       VARCHAR(20)  UNIQUE NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`CREATE TABLE IF NOT EXISTS` so a re-run against a partially-created database is harmless. `code` is `VARCHAR(20) UNIQUE` under `utf8mb4_unicode_ci`, so `SEC` and `sec` collide — codes are case-insensitively unique, which is what a user typing a code expects.

**Verification:** `npm --prefix backend run migrate` → `applied 001_departments.sql`; re-run → `skipped`.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `error in your SQL syntax ... near '<BOM>CREATE TABLE'` | A UTF-8 BOM, if authored via PowerShell `Out-File -Encoding utf8` | Already handled — `migrate.js:44` strips it. If seen, the file was edited by a tool that bypassed the runner |
| `ER_DUP_ENTRY` on `code` | A previous partial run left a row | `SELECT * FROM departments;` then resolve; the runner is not transactional for DDL (Phase 0 §6 Task 0.6) |
| Table created in `utf8mb4_general_ci` | The `COLLATE` clause was dropped from the file | Check `SHOW CREATE TABLE departments`; re-apply by corrective migration, never by editing an applied file |

---

### Task 1.2 — Migration `002`: `users`

**Goal:** spec §5.1's `users` table, with D27 applied to the `ENUM` and D36/D37/D38 applied to the indexes and columns.

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nic_no        VARCHAR(20)  NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','SECRETARY','AO','CHIEF_CLERK','SUBJECT_CLERK','OFFICER',
            'MINOR_STAFF','TRANSPORT_OFFICER') NOT NULL,
  department_id INT          NULL,
  designation   VARCHAR(150) NOT NULL,
  section_name  VARCHAR(150) NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,          -- D37
  UNIQUE KEY uq_users_nic  (nic_no),
  UNIQUE KEY uq_users_email (email),
  INDEX      idx_user_role (role),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id)
    REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Four points that are not obvious:

- **`nic_no` and `email` are `UNIQUE` with an explicit name** (`uq_users_nic`, `uq_users_email`) rather than inline, so a corrective migration can drop them by name and `ON DELETE SET NULL` on a future change stays predictable.
- **Case-insensitive uniqueness is free and intended.** Under `utf8mb4_unicode_ci`, `881234567V` and `881234567v` are the same account. Sri Lankan NICs are written both ways; this is the correct behaviour, and Task 1.17 tests that a lowercase suffix logs in.
- **`ON DELETE SET NULL`** is kept from the spec: a deleted department must orphan its users, not delete them. Since users are never hard-deleted (D23), this fires only from a deliberate database operation.
- **`is_active BOOLEAN NOT NULL DEFAULT TRUE`** — the spec writes it nullable. `NOT NULL` means "is this user active" is always answerable, and `authMiddleware` never has to distinguish `NULL` from `FALSE` (D21's fresh-row load depends on that).

**Verification:** `SHOW CREATE TABLE users` matches the block above; `SELECT COUNT(*) FROM users` → `0`.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `ER_DUP_ENTRY` on `uq_users_nic` at seed time | Two personas given the same NIC | Each persona gets a distinct serial; the seed uses `INSERT ... ON DUPLICATE KEY UPDATE` so re-running is safe |
| `ER_ROW_IS_REFERENCED_2` dropping `departments` | `users` rows exist and the FK is `RESTRICT` | Expected until `001` runs; order is enforced by filename sort (`migrate.js:33`) |
| `Data too long for column 'nic_no'` | A full 12-digit NIC plus suffix exceeds `VARCHAR(20)`? It does not — but a pasted value with a trailing space or newline does | Trim in `utils/validate.js` (Task 1.13) before it reaches SQL |

---

### Task 1.3 — Migration `003`: `refresh_tokens`

**Goal:** make refresh-token rotation and revocation possible (parent plan task 1.5). **Not in the spec** — designed here, following D3's reasoning that only the *hash* is stored.

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT           NOT NULL,
  token_hash       CHAR(64)      NOT NULL,          -- sha256 hex, never the token
  replaced_by_hash CHAR(64)      NULL,              -- set on rotation
  issued_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME      NOT NULL,
  revoked_at       DATETIME      NULL,
  ip_address       VARCHAR(45)   NULL,              -- 45 = max IPv6 length
  user_agent       VARCHAR(255)  NULL,
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  INDEX idx_refresh_user    (user_id),
  INDEX idx_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- **Only the SHA-256 hash is stored.** A database leak must not hand over 14 days of live sessions. SHA-256 (not bcrypt) is correct here: this is a high-entropy random token being looked up by equality, not a low-entropy secret being brute-forced. `CHAR(64)` is exact for hex, so there is no trailing-space ambiguity.
- **`replaced_by_hash` records the rotation chain**, which is what makes reuse of a rotated token detectable rather than merely expired.
- **`ON DELETE CASCADE`** — unlike `users.department_id`, a refresh token has no meaning without its user, and hard-deleting a user is already impossible (D23).

**Verification:** table exists; `npm run migrate:status` shows all four applied.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `ER_NO_REFERENCED_ROW_2` | `002_users.sql` did not apply | `npm run migrate:status`; the runner orders by filename |
| Every refresh fails with "not found" | The token was stored plaintext and is being looked up hashed (or the reverse) | One convention, enforced in `refreshTokenModel` only; the tests in Task 1.17 pin it |
| `refresh_tokens` grows without bound | Expired rows are never purged | `purgeExpired()` called on each login, keyed by `idx_refresh_expires` (Task 1.12) |

---

### Task 1.4 — Migration `004`: `audit_logs`

**Goal:** the immutable record required by spec §13.1. **The spec names the fields in prose only** (`user_id`, `timestamp`, `ip_address`, `action_delta`) and gives no DDL, so the table is designed here.

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NULL,        -- NULL for unauthenticated events (failed logins)
  action      VARCHAR(64)  NOT NULL,    -- LOGIN_SUCCESS, USER_UPDATED, ...
  entity_type VARCHAR(64)  NOT NULL,    -- 'user', 'department', 'auth'
  entity_id   VARCHAR(64)  NULL,        -- VARCHAR, not INT: ids are not uniformly numeric
  action_delta JSON        NULL,        -- { "before": {...}, "after": {...} }, redacted (D32)
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_user   (user_id),
  INDEX idx_audit_time   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- **`user_id` is nullable** so a failed login can be recorded. A login attempt against a nonexistent NIC is exactly the event an auditor wants, and making the column `NOT NULL` would mean recording it somewhere less useful.
- **`entity_id` is `VARCHAR(64)`** because `audit_logs` will outlive Phase 1 and Phase 2's `mail_records.id` is a `VARCHAR(36)` UUID. An `INT` column here would have to change before mail audit rows could be written.
- **`action_delta` is JSON, not two text columns.** "What changed" for a `PATCH /users/:id` is a partial object; `{"before": {...}, "after": {...}}` over `JSON_EXTRACT`-able columns is queryable, and MySQL 8 validates JSON on write.
- **There is no `updated_at`.** An audit row is written once. This is enforced in the API layer — `auditModel` exports `insert` and `list` and nothing else — and it is *not* enforced in the database, because of D42 below.

> **D42 — audit immutability is application-enforced, and cannot be database-enforced under the current grant.** Phase 0 D2 granted `pme_user` `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES`. The `TRIGGER` privilege is **not** among them, and a `BEFORE UPDATE` / `BEFORE DELETE` trigger that `SIGNAL`s an error is the only way to make the table genuinely immutable in MySQL. Creating one therefore requires either `root`, or adding `TRIGGER` to the `GRANT` in `database/bootstrap.sql` and re-running it. **This plan does not do either**: a migration that fails on a clean clone because of a missing privilege is worse than an honest boundary. The API exposes no update or delete path for `audit_logs`, and Phase 4 task 4.6 is the right place to close the remaining gap. Recorded in §11 as a live risk, not hidden.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `Invalid JSON text` at insert | A JS value serialised to `undefined` | `JSON.stringify` guards in `auditModel.insert`; `undefined` is stored as `NULL` |
| `ER_TRUNCATED_WRONG_VALUE` on `action_delta` | Non-UTF8 bytes in a legacy name | The connection is `UTF8MB4_UNICODE_CI` (Phase 0 D14), so this means the value came from a non-`utf8mb4` table, not from MySQL |
| Audit writes fail with `ER_DUP_ENTRY` on `uq_*` | Wrong table named in a model's error | Check `action_delta` redaction is not swallowing the error; the model wraps the cause (Phase 0 `db.js:77` sets the precedent) |

---

### Task 1.5 — Password and token primitives

**Goal:** give Phase 1 exactly two modules that touch secrets, so no controller ever calls `bcrypt` or `jsonwebtoken` directly.

**`backend/utils/password.js`**

```js
export const BCRYPT_ROUNDS = 12;   // D34
export const DUMMY_HASH = '$2b$12$...';   // D30 — a hash of a value nobody holds
export const hashPassword(plain)   // -> promise<string>
export const verifyPassword(plain, hash)  // -> promise<boolean>
export const DUMMY_VERIFY = () => verifyPassword(randomString(), DUMMY_HASH);
```

Cost 12 is ~300 ms on modern hardware and is the factor parent plan task 4.4 names. It makes the eight persona seeds slow to hash and the test suite slower to run; that is the price of not building the thing you will later deploy, and it is paid deliberately rather than by lowering the factor in dev.

**`backend/config/jwt.js`** — extend, do not replace. `getJwtConfig()` stays exactly as Phase 0 wrote it, because `server.js` calls it in `assertConfigIsComplete()` and the startup-fails-loudly behaviour is a Phase 0 acceptance check.

```js
export const ACCESS  = 'access';
export const REFRESH = 'refresh';

export function signAccessToken(user)   // { sub, role, type: 'access' } + JWT_EXPIRES_IN   (D21)
export function signRefreshToken(user)  // { sub, type: 'refresh' }    + REFRESH_TOKEN_EXPIRES_IN
export function verifyToken(token, expectedType)  // throws on bad signature/expiry/wrong type (D22)
```

`verifyToken` takes the expected type as an argument so a caller cannot forget to check it. A refresh token presented as a Bearer credential fails here, with one message, rather than at three call sites.

**Verification:** a scratch script signs and verifies round-trip; a token signed with `type: 'refresh'` is rejected by `verifyToken(t, 'access')`; `server.js` still refuses to start on a blanked `JWT_SECRET`.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `jwt malformed` | Double-encoded token, or `Bearer` prefix left on | Strip the scheme in exactly one place, `authMiddleware` |
| Tokens valid for 60 s | `expiresIn` received a number, not a string like `'2h'` | `jsonwebtoken` treats a number as seconds; keep the string in `.env` |
| Seeding 8 users takes >10 s | Cost 12 × 8 | Expected. Hash once and reuse, or accept it — do not lower the factor |
| `DUMMY_VERIFY` is measurably faster than a real verify | The dummy hash is malformed and `bcrypt.compare` returns early | Assert in a test that `verifyPassword('x', DUMMY_HASH)` returns `false` rather than throwing |

---

### Task 1.6 — The permission map

**Goal:** one file that answers "may this role do this?", used by the backend now and by the frontend in Phase 3 (D25).

```js
export const ROLES = Object.freeze([ /* exactly the 8 ENUM values, same order */ ]);
export const PERMISSIONS = Object.freeze({
  MINOR_STAFF:       ['CREATE_MAIL', 'READ_PUBLIC_MAIL'],
  SECRETARY:         EXECUTIVE,
  AO:                EXECUTIVE,
  CHIEF_CLERK:       EXECUTIVE,
  SUBJECT_CLERK:     ['READ_DEPARTMENT_MAIL', 'ASSIGN_OFFICER', 'UPDATE_DUTY_CHART'],
  OFFICER:           OFFICER_SET,
  TRANSPORT_OFFICER: OFFICER_SET,     // D28
  ADMIN:             [WILDCARD],      // 'FULL_SYSTEM_ACCESS', expanded at resolve (D26)
});
export const resolvePermissions(role)   // -> string[]  (ADMIN gets the full set)
export const hasPermission(role, perm)  // -> boolean
```

`SECRETARY`, `AO` and `CHIEF_CLERK` share one frozen `EXECUTIVE` array — spec §4.1 gives them identical permission lists, and three separate copies would be three places to forget.

**The drift test is the point of this task.** `tests/permissions.test.js` reads the `ENUM` out of `information_schema.COLUMNS` and asserts that `ROLES` matches it exactly, in order. That converts the single most likely Phase 2 defect — a role added to the schema and not to the map, or vice versa — from a runtime 403 nobody can explain into a red test at build time.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Admin gets 403 on an admin route | `requireRole('ADMIN')` used where `hasPermission` was meant | Role checks for identity, permission checks for capability; do not mix |
| `hasPermission('ADMIN', 'WRITE_MINUTES')` is false | The wildcard is not being expanded | Use `resolvePermissions(role)` output, never the raw array (D26) |
| A role in the `ENUM` is missing from the map | Spec change landed in the migration but not here | The drift test fails. That is what it is for |

---

### Task 1.7 — `models/userModel.js`

**Goal:** every SQL statement touching `users`, all parameterized, all taking the trailing `executor` from D19.

| Function | Notes |
| :-- | :-- |
| `findByNic(nic, executor = pool)` | Joins `departments` for the department name. Returns inactive users too — the login path must be able to tell "wrong password" from "deactivated" (D29) |
| `findById(id, executor = pool)` | The `authMiddleware` load (D21) |
| `list({ role, departmentId, isActive, search, limit, offset }, executor)` | `search` covers `full_name` and `nic_no` with `LIKE ?` and a caller-supplied `%…%` — never string-concatenated |
| `create(user, executor = pool)` | Throws a typed error on `ER_DUP_ENTRY`, distinguishing NIC from email |
| `update(id, patch, executor = pool)` | Builds `SET` from an **allowlist** of column names, never from `Object.keys(patch)` — otherwise a `PATCH` body containing `role` or `id` rewrites them |
| `deactivate(id, executor = pool)` | Sets `is_active = FALSE`. The only "delete" (D23) |
| `countActiveAdmins(excludingId, executor)` | Under `SELECT ... FOR UPDATE` (D24) |

`create`/`update` must never see `password_hash` in `patch` as a raw string; they call `utils/password.hashPassword`. A caller that hashes and a caller that does not is one forgotten call site away from storing a plaintext password in a `VARCHAR(255)` that accepts it happily.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| A `PATCH` changed a column nobody sent | `SET` built from `Object.keys(patch)` | Allowlist of updatable columns |
| `ER_DUP_ENTRY` surfaces as a 500 | Driver error not translated | Map to a 409 with a message naming which unique key; `errorHandler` passes through `err.status` (`errorHandler.js:36`) |
| User list is slow | `search` with a leading `%` cannot use an index | Acceptable at ministry scale (hundreds of users); noted, not optimised prematurely |

---

### Task 1.8 — The remaining three models

| File | Functions | Notes |
| :-- | :-- | :-- |
| `models/departmentModel.js` | `list`, `findById`, `findByCode`, `create`, `update` | Small. `create`/`update` map `ER_DUP_ENTRY` on `uq_code` to 409 |
| `models/refreshTokenModel.js` | `insert`, `findByHash`, `revoke`, `rotate`, `purgeExpired`, `revokeAllForUser` | The only module that knows tokens are stored as SHA-256 (Task 1.3). `rotate` sets `revoked_at` **and** `replaced_by_hash` in one statement |
| `models/auditModel.js` | `insert`, `list({ userId, entityType, entityId, action, from, to, limit, offset })` | `insert` applies the D32 redaction internally. **No `update` and no `delete` are exported** — that is the whole of the immutability guarantee, and it is enforced by absence |

`list` returns rows plus a total count for the paginated viewer, via `SELECT … LIMIT ? OFFSET ?` and a parallel `COUNT(*)`.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Refresh always "not found" | Lookup hashes and the stored value is plaintext, or vice versa | The two call sites in `authController` are the only readers; both go through the model |
| `audit_logs` count wrong | `COUNT(*)` and the page query disagree under concurrent inserts | Read the count in the same transaction as the page, or accept a moving target and document it |
| A password hash appears in `action_delta` | The redaction list missed a field name | D32's test asserts absence on both a `create` and an `update` |

---

### Task 1.9 — `middleware/authMiddleware.js`

**Goal:** the single gate. Everything except `/health` and `/auth/login` passes through it.

```
Authorization: Bearer <token>
   -> verifyToken(token, 'access')          // D22: a refresh token cannot pass
   -> SELECT * FROM users WHERE id = sub     // D21: fresh row, every request
   -> if !user.is_active -> 401 "Account is deactivated"
   -> req.user = { id, nic_no, full_name, role, department_id, designation, section_name }
   -> next()
```

All four failure modes return **401** with a generic body, except the deactivated case which is a 401 here and only becomes a 403 at login (D29) — at this point the caller has a valid signature and is asking about *themselves*, so naming the reason helps and leaks nothing.

The fresh-row load is one indexed primary-key query (D21). It costs a query per request and buys two things that are not available any other way: a deactivated user's token stops working **immediately** rather than after up to 2 hours, and a role or department change takes effect on the next request rather than the next login. Parent plan task 1.6 requires both.

**Verification:** with a valid token `next()` is reached and `req.user` is populated; with a garbage, expired, or refresh-typed token the response is 401 and `req.user` is never set.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Every request 401s after a role change | The role is only in the token | It is not — D21's fresh load is the fix. If you find yourself adding `role` to the payload, do not |
| `jwt malformed` on valid-looking tokens | Trailing newline from a file read, or a doubled `Bearer` | Trim; strip the scheme once |
| Latency on every request | The lookup is `WHERE nic_no = ?` instead of `WHERE id = ?` | `sub` is the user id; the NIC lookup is only for login |
| `Cannot set property user of #<IncomingMessage>` on Express 5 | `req` is a getter-defined prototype in Express 5 | Assign to a defined property only; if a future middleware needs to hang state on `req`, use a symbol or a namespaced key |

---

### Task 1.10 — `middleware/roleMiddleware.js`

**Goal:** spec §10.2's `requireRole('SECRETARY','AO')` factory.

```js
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());            // fail closed
    if (allowed.includes(req.user.role)) return next();
    next(forbidden(`Requires one of: ${allowed.join(', ')}`));   // 403
  };
}
```

Two rules that are easy to get backwards:

- **401 before 403.** No `req.user` means the request never authenticated — that is 401. A wrong role on an authenticated request is 403. Returning 403 for both tells a legitimate user with an expired session that their password is wrong.
- **The allowed set is empty by default only if you pass nothing.** `requireRole()` with no arguments returns a middleware that permits nobody. That is the correct fail-closed default and it is what `requirePermission()` builds on.

`requirePermission(perm)` is added here too, backed by `hasPermission` from Task 1.6, so Phase 2 can gate on capabilities (`WRITE_MINUTES`) rather than re-deriving role sets at each route. Task 1.9 must be registered before this on every protected router — a `requireRole` with no `req.user` fails closed, so the mistake is safe, but it is still a mistake.

**Verification:** `requireRole('ADMIN')` admits an ADMIN token, rejects a SUBJECT_CLERK token with 403, and rejects a request with no `Authorization` header with 401.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Always 403 for everyone | Middleware registered before `authMiddleware` | Order is `authenticate, requireRole` on every protected route |
| 403 for an admin | `requireRole` used where a permission was meant, or the role string typo'd | Role strings must match the `ENUM` exactly; `ROLES` from Task 1.6 is the source |
| 401 on a request that has a valid token | The token is a refresh token | Correct behaviour (D22); the client must call `/auth/refresh` |

---

### Task 1.11 — `middleware/auditMiddleware.js`

**Goal:** every mutation writes its audit row, transactionally (D20).

Two shapes, because a `DELETE`/`PATCH` has no meaningful "after" body to re-derive:

| Approach | How |
| :-- | :-- |
| **Declarative** (default) | `router.patch('/:id', requireRole('ADMIN'), audit('user', 'USER_UPDATED'), handler)` — captures `req.params.id` as `entity_id` and hands the controller the before/after |
| **Explicit** (when the delta matters) | The controller calls `auditModel.insert(...)` inside its own transaction, where it holds both the before and after rows |

`auditMiddleware` attaches `req.audit = { action, entityType, entityId }` and a `record(before, after)` helper. It does **not** open a transaction itself: the controller owns the transaction, because the controller knows what constitutes one unit of work (D20). A middleware that began and committed a transaction around `next()` would commit before the controller's async work finished.

Requesting an audit row and then failing the request is the one case where the audit row should survive its own failure — a rejected authorization attempt is a legitimate audit event. `auditModel.insert` is therefore callable on the pool directly for failures, and inside the transaction for successes.

`ip_address` comes from `req.ip`, which reads `trust proxy` — already set at `server.js:68`. **Reordering that line silently changes every recorded IP.**

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Audit rows exist for failures but not successes | The controller is not in a transaction, so its insert is on a different connection | D19's `executor` parameter threaded through the model calls |
| `req.ip` is `::1` or the proxy's address | `trust proxy` changed, or a proxy is not in front | In development, direct to Express, `req.ip` is the real client |
| Every `PATCH` writes a row even when nothing changed | No comparison before insert | Compare the before/after objects and skip an identical delta |
| `action_delta` is huge | Whole rows captured rather than changed fields | Diff to `{ before: {...changed}, after: {...changed} }` |

---

### Task 1.12 — Auth endpoints

**Goal:** the complete session lifecycle, spec §7.1's shape.

| Method | Path | Auth | Success | Notes |
| :-- | :-- | :-- | :-- | :-- |
| `POST` | `/api/v1/auth/login` | none | `200` | spec §7.1 + `refresh_token` (D39) |
| `GET` | `/api/v1/auth/me` | Bearer | `200` | `{ success, user, permissions }` — fresh row (D21) |
| `POST` | `/api/v1/auth/refresh` | none | `200` | body `{ refresh_token }` → new pair; old one revoked |
| `POST` | `/api/v1/auth/logout` | Bearer | `200` | revokes the presented refresh token; idempotent |
| `GET` | `/api/v1/auth/permissions` | Bearer | `200` | `{ permissions: [...] }` — the Phase 3 handoff (D25) |

**Login sequence**, in order, because the order is the security property:

1. Validate the body. Missing or non-string `nic_no`/`password` → `400`.
2. Normalise the NIC: trim, uppercase.
3. `findByNic` — including inactive users.
4. If no user: `DUMMY_VERIFY()` (D30), then `401` with the generic body.
5. `verifyPassword`.
6. If the password is wrong: `401`, same body as step 4 (D29). Audit `LOGIN_FAILED` with the NIC, never the password.
7. If `!is_active`: `403` with a clear message. Safe because the password was correct (D29).
8. Purge expired refresh tokens (housekeeping, indexed).
9. Sign both tokens. Insert the refresh hash.
10. Audit `LOGIN_SUCCESS`. Respond.

**Refresh:** verify signature and `type`, look up the hash, reject if `revoked_at IS NOT NULL` or `expires_at < NOW()`, then **rotate** — revoke the old row with `replaced_by_hash` set, insert the new one, respond with a new pair. Presenting an already-rotated token is rejected, which is what makes a stolen-then-used refresh token detectable rather than merely expired.

**Logout** revokes only the presented token. Concurrent sessions are allowed deliberately: a ministry desk with a shared machine should not have a colleague's session killed by a logout, and `revokeAllForUser` exists in the model for the Phase 4 "sign out everywhere" requirement.

**Failures to return, not throw:** an empty `Authorization` header, a `Bearer` with no token, a JWT signed by a different secret, a refresh token presented as a Bearer, an already-rotated refresh token, and a refresh token for a user who has since been deactivated.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Login ~1 ms for unknown NICs, ~300 ms for known ones | `DUMMY_VERIFY` missing | D30; the timing oracle is as effective as the message oracle |
| Refresh works twice with one token | Rotation not revoking the old row | `rotate()` in one `UPDATE`; Task 1.17 asserts single use |
| `401` says "user not found" | The two error paths diverged | D29 — one shared constant for both |
| `me` returns a stale role | The role was read from the token | D21's fresh load; the token carries no role for this purpose |

---

### Task 1.13 — Validation helpers

**Goal:** no unvalidated value reaches SQL, without adding a dependency (D41).

`utils/validate.js` provides `requireString`, `requireEnum`, `requireEmail`, `requireInt`, `optionalString`, `requirePassword`, `normalizeNic`, plus a `rejectUnknownFields(body, allowed)` helper. Failures throw an error with `status = 400` and a message naming the offending field; `errorHandler` (`errorHandler.js:36`) passes `err.status` through, so nothing extra is needed to produce a clean 400.

`normalizeNic` is one function, used by the model layer and the validator alike: trim, collapse internal whitespace, uppercase. Phase 2 will register letters with the same rule.

**Why hand-rolled rather than `zod`:** spec §10.1 fixes the dependency list, and parent plan task 4.1 is where global validation is scheduled. Writing ~80 lines now keeps Phase 1's own endpoints safe, and Phase 4 can replace the module without touching call sites if a schema library is judged worth the dependency.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| A `PATCH` silently ignores an unknown field | No `rejectUnknownFields` | Call it; a silently-dropped field reads as a bug in the client |
| 500 instead of 400 on bad input | The thrown error has no `status` | Every validator sets `error.status = 400` |
| Validation duplicated in two layers | Controller and model both validating | Validate at the edge; models trust their caller |

---

### Task 1.14 — User, department and audit endpoints

| Method | Path | Guard | Notes |
| :-- | :-- | :-- | :-- |
| `GET` | `/api/v1/users` | `requirePermission('FULL_SYSTEM_ACCESS')` | Paginated, filterable by role/department/active, `search` on name + NIC |
| `POST` | `/api/v1/users` | admin | Hashes the password; 409 on duplicate NIC or email |
| `GET` | `/api/v1/users/:id` | admin | Never returns `password_hash` — the select list omits it, it is not filtered in the controller |
| `PATCH` | `/api/v1/users/:id` | admin | Cannot change their own `role` — a self-promotion path |
| `DELETE` | `/api/v1/users/:id` | admin | Deactivates (D23). `400` if `id` is the caller's own. `409` if the target is the last active ADMIN (D24) |
| `GET` | `/api/v1/departments` | any authenticated | The shared picker; every signed-in user needs it |
| `POST` | `/api/v1/departments` | admin | 409 on duplicate `code` |
| `PATCH` | `/api/v1/departments/:id` | admin | 409 on duplicate `code` |
| `GET` | `/api/v1/audit` | admin | Paginated, filters by user, entity, action, date range |
| `GET` | `/api/v1/audit/:id` | admin | One row, `action_delta` parsed |

Two guards worth stating outright:

- **`password_hash` is excluded by the SQL select list**, not deleted in JavaScript. A serializer that strips it is one `SELECT *` away from leaking it, and `SELECT *` is what someone will type at 5 pm.
- **Self-demotion is blocked** for the same reason self-deletion is: an admin who removes their own admin role strands the system. `role` is excluded from the `PATCH` allowlist for a user editing themselves, and the last-active-ADMIN guard (D24) covers the other direction.

`GET /api/v1/audit` is the requirement that an audit trail is *inspectable*. A write-only log answers "did this happen" for the person who did it, and nothing for anyone else.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `403` on `/users` for a correct admin | Guarded by permission string while `requireRole` was expected | Either works; the drift test keeps the strings honest |
| An admin locks themselves out | Self-role-change or last-admin deactivation not blocked | D24 plus the self-`PATCH` exclusion; the recovery path is a direct `UPDATE` in the MySQL CLI, and the README will say so |
| `409` on a duplicate email is wrong | Comparing case-sensitively in JS | The column is `utf8mb4_unicode_ci`; let the database decide and translate `ER_DUP_ENTRY` |
| Audit viewer is slow | `action_delta` selected for a list | Select without it, or `JSON_EXTRACT` only what the table shows |

---

### Task 1.15 — Seeds

**`seeds/001_seed_departments.sql`** — 7 rows, re-runnable:

| `code` | `name` |
| :-- | :-- |
| `SEC` | Provincial Secretary's Office |
| `ADMIN` | Administration |
| `EDU` | Education |
| `ENG` | Engineering |
| `FIN` | Finance |
| `HEALTH` | Health |
| `TRANSPORT` | Transport |

Written as `INSERT INTO departments (name, code) VALUES (...) ON DUPLICATE KEY UPDATE name = VALUES(name)` so a re-run updates rather than fails.

**`seeds/002_seed_demo_users.sql`** — one user per `ENUM` value (D27, D28):

| Role | NIC | Designation | Department |
| :-- | :-- | :-- | :-- |
| `ADMIN` | `881234560V` | System Administrator | `ADMIN` |
| `SECRETARY` | `881234561V` | Provincial Secretary | `SEC` |
| `AO` | `881234562V` | Assistant Officer | `SEC` |
| `CHIEF_CLERK` | `881234563V` | Chief Clerk | `ADMIN` |
| `SUBJECT_CLERK` | `881234564V` | Subject Clerk | `EDU` |
| `OFFICER` | `881234565V` | District Officer | `EDU` |
| `MINOR_STAFF` | `881234566V` | Front Desk Clerk | `SEC` |
| `TRANSPORT_OFFICER` | `881234567V` | Transport Officer | `TRANSPORT` |

One shared demo password, `PmeDemo@2026`, satisfying parent plan task 4.4's 10-character minimum. It is **published on purpose** — these are local demo accounts on a developer machine, and a hidden demo password is just an undocumented one. It is stated in the README with the warning that `npm run seed` overwrites the password of any user with a matching NIC.

Hashes are generated with `backend/scripts/hash-password.js` (D31), which prints a ready-to-paste literal:

```powershell
npm --prefix backend run hash-password -- "PmeDemo@2026"
# $2b$12$.......................................................
```

The seed file carries the hash as a literal with the plaintext and the cost factor in a comment. `bcrypt.compare` is what reads it, so nothing needs to be re-derived at seed time.

**One small addition to `migrate.js`:** an optional second argument filters which seed files run, so the department seed can be refreshed without resetting everyone's password:

```
node database/migrate.js seed              # all seeds
node database/migrate.js seed 001          # only 001_seed_departments.sql
```

The filter is a prefix match on the filename, defaults to "all" when absent, and changes no existing behaviour. It is worth the six lines because the alternative — advising a developer to hand-edit a seed file to avoid clobbering their own password — is how demo data gets deleted.

**Verification:** `npm run seed` twice leaves 7 departments and 8 users; all 8 log in; a fresh `pme_system` reproduces both from scratch.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `ER_DUP_ENTRY` seeding users | Plain `INSERT` into a table that already has them | `ON DUPLICATE KEY UPDATE`, matching the departments seed |
| `ER_DATA_TOO_LONG` on `password_hash` | A plaintext password was pasted where the hash goes | `hash-password.js` output is 60 characters; a plaintext one is not |
| `Invalid password` for a seeded user | The hash was generated at a different cost, or hand-edited | Regenerate; never hand-edit a hash |
| A developer's own password is reset | `npm run seed` with no filter | `node database/migrate.js seed 001` |
| `ON DUPLICATE KEY UPDATE` also resets `is_active` | The `UPDATE` clause lists every column | List only the columns a seed owns; never `is_active` |

---

### Task 1.16 — Test suite

**Goal:** parent plan task 1.16, on `node --test` with no new dependency.

**Harness** (`tests/helpers/`): `app.js` boots `app.js` (D18) on port `0` and returns the base URL plus a `request(method, path, { token, body })` helper; `db.js` provides the pool and a `truncateAudit()`; `fixtures.js` creates users with a unique suffix per run and removes them in `after()`.

**Every test row is namespaced** (`test_<pid>_<counter>` in NICs and emails) and torn down. The seeded personas are never touched — a test suite that mutates the demo data makes the next `npm run seed` a debugging session.

**Tests that must exist, and what each proves:**

| File | Proves |
| :-- | :-- |
| `auth.test.js` | Valid login → 200, and the body matches spec §7.1's shape plus `refresh_token`. Wrong password → 401. **Unknown NIC → a byte-identical 401 body** (D29). Deactivated user with the right password → 403. Lowercase NIC suffix → 200 (CI collation). Missing fields → 400. A SQL-injection string as `nic_no` → 401 and the `users` table unchanged |
| `auth.test.js` | `/auth/me` with an access token → 200. With a **refresh** token → 401 (D22). With garbage → 401. **After deactivating the user, the same access token is rejected** (D21 — the behaviour task 1.6 exists for) |
| `auth.test.js` | `/auth/refresh` → a new pair. **The old refresh token is then rejected** (single use). `/auth/logout` → 200, and its refresh token is rejected afterwards. Logout twice → 200 |
| `permissions.test.js` | `ROLES` equals the `ENUM` read from `information_schema`, in order. `resolvePermissions('ADMIN')` contains every permission. `hasPermission('MINOR_STAFF', 'WRITE_MINUTES')` is false. `DUMMY_VERIFY()` returns `false` rather than throwing |
| `users.test.js` | ADMIN can list/create/update. **MINOR_STAFF gets 403** on the same route. No token → 401, not 403. Self-delete → 400. Self-role-escalation via `PATCH` is ignored. No response body contains `password_hash` |
| `users.test.js` | The last-active-ADMIN guard, as a **function-level** test with its own transaction that it rolls back (D19 makes this possible, and an HTTP-level test cannot control global admin state deterministically) |
| `departments.test.js` | List is open to any authenticated user. Create/patch are admin-only. Duplicate `code` → 409. Case-differing `code` → 409 (CI collation) |
| `audit.test.js` | A `PATCH /users/:id` writes exactly one row, with the acting user's id, the request IP, and a delta naming the changed field. A `DELETE` writes a `before` with no `after`. **No `action_delta` contains `password_hash`** (D32). A failed login writes a row with `user_id = NULL`. A `403` is audited. `/api/v1/audit` is 403 for a non-admin, 200 for an admin |
| any | A route with no `Authorization` header and a refresh token in the body still 401s — middleware order, not controller logic, is what stopped it |

**The suite needs a live database.** When `MySQL80` is stopped it fails with the `Start-Service MySQL80` hint, rather than skipping. A suite that silently passes because it could not reach the database is worse than no suite, and Phase 0 D13 established that principle for the root orchestrator.

**Running them:** `npm --prefix backend test`. At cost 12, the suite takes roughly 15–25 seconds; that is the honest cost of testing real password hashing and is stated here so it is not mistaken for a hang.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Suite hangs | The app is listening and the process will not exit | `server.close()` plus `pool.end()` in `after()`, as `server.js:116-123` already does for shutdown |
| Port 4000 already in use | Tests share the port with a running dev server | Tests listen on port `0` |
| Tests pass in one order, fail in another | Shared state | Namespaced fixtures, per-test cleanup, no `Math.random`-derived collisions |
| `403` tests fail once the frontend exists | CORS | The tests use `fetch` from Node, so there is no `Origin` header and CORS does not fire |

---

### Task 1.17 — README and documentation

**Goal:** the README must describe the system that now exists, not the one that was planned.

1. Replace **Demo credentials** — "None yet" becomes the 8 accounts, their roles, the shared password, and the warning that these are local demo credentials
2. Rewrite **Coming Next — Phase 1** as **What Phase 1 Added**, with the endpoint map
3. Add the auth endpoints to the API section, and the seed/migrate commands
4. Add a **Recovering from lockout** note: if the last admin is deactivated by direct SQL, restore with `UPDATE users SET is_active = TRUE WHERE role = 'ADMIN'` as `pme_user`
5. Add a **Security notes** subsection: no login rate limiting until Phase 4 (D33), audit immutability is application-enforced (Task 1.4's D42 note), and the shared demo password
6. Carry forward every failure-mode row from this document, as Phase 0 Task 0.9 did
7. Update `PHASE_0_PLAN.md` §9 check 3's expected output — it says `0 migrations applied`, which becomes `4 migrations applied` on a migrated database

## 7. Endpoint and Route Map

| Method | Path | Auth | Phase |
| :-- | :-- | :-- | :-- |
| `GET` | `/api/v1/health` | none | 0 |
| `POST` | `/api/v1/auth/login` | none | **1** |
| `POST` | `/api/v1/auth/refresh` | none | **1** |
| `POST` | `/api/v1/auth/logout` | Bearer | **1** |
| `GET` | `/api/v1/auth/me` | Bearer | **1** |
| `GET` | `/api/v1/auth/permissions` | Bearer | **1** |
| `GET` | `/api/v1/users` | admin | **1** |
| `POST` | `/api/v1/users` | admin | **1** |
| `GET` | `/api/v1/users/:id` | admin | **1** |
| `PATCH` | `/api/v1/users/:id` | admin | **1** |
| `DELETE` | `/api/v1/users/:id` | admin | **1** |
| `GET` | `/api/v1/departments` | any authenticated | **1** |
| `POST` | `/api/v1/departments` | admin | **1** |
| `PATCH` | `/api/v1/departments/:id` | admin | **1** |
| `GET` | `/api/v1/audit` | admin | **1** |
| `GET` | `/api/v1/audit/:id` | admin | **1** |

`/health` and the two unauthenticated `POST`s are the complete unauthenticated surface. Everything else passes through `authenticate`, and every non-`GET` except `/auth/logout` and `/auth/refresh` is admin-only. This list is the phase's whole public surface; if an endpoint is not on it, it does not exist in Phase 1.

## 8. Environment Variable Reference

**No variables are added** (D34). Two that Phase 0 committed become live:

| Variable | Default | Phase 1 behaviour |
| :-- | :-- | :-- |
| `JWT_SECRET` | *(in `.env` only)* | Now signs and verifies both token types. Still validated at startup by `assertConfigIsComplete` — unchanged |
| `JWT_EXPIRES_IN` | `2h` | Access-token lifetime. A string: a bare number is read by `jsonwebtoken` as **seconds** |
| `REFRESH_TOKEN_EXPIRES_IN` | `14d` | Refresh-token lifetime, and the value written to `refresh_tokens.expires_at` |

`DB_*`, `PORT`, `NODE_ENV`, `UPLOAD_DIR` and `MAX_UPLOAD_SIZE_MB` are unchanged. `UPLOAD_DIR` and `MAX_UPLOAD_SIZE_MB` remain Phase 2 variables — `multer` stays installed and unused, as Phase 0 installed it.

## 9. Acceptance Test — Phase 1 Exit Criteria

Run in order. **All twelve must pass.** Start the API with `npm run dev` (or `npm --prefix backend run dev`) and leave it running for steps 4–12.

| # | Check | Command | Expected |
| :-- | :-- | :-- | :-- |
| 1 | Migrations applied | `npm --prefix backend run migrate:status` | `4 applied, 0 pending` |
| 2 | Migrations are idempotent | `npm --prefix backend run migrate` | `0 migrations applied (nothing to do)` |
| 3 | Seeds are re-runnable | `npm --prefix backend run seed` twice | `2 seed(s) applied` both times (the runner counts *files*, not rows — 2 files, 7 departments, 8 users) |
| 4 | All 8 personas log in | `1..8 \| ForEach { Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login -Body (@{ nic_no = "88123456$_`V"; password = "PmeDemo@2026" } \| ConvertTo-Json) -ContentType application/json }` | 8 responses, each with `token` and `refresh_token` |
| 5 | Wrong password is refused | Login as `881234560V` with a wrong password | `401`, body identical to an unknown NIC's |
| 6 | Unknown NIC is refused the same way | Login as `999999999V` | `401`, byte-identical body to check 5 |
| 7 | A refresh token is not an access token | `GET /api/v1/auth/me` with `Authorization: Bearer <refresh_token>` | `401` |
| 8 | Deactivation is immediate | Login as a persona, `UPDATE users SET is_active=FALSE` as `pme_user`, re-use the **same** access token on `/auth/me` | `401` |
| 9 | Role is enforced | `MINOR_STAFF` token on `GET /api/v1/users` | `403` |
| 10 | No token is 401, not 403 | `GET /api/v1/users` with no `Authorization` header | `401` |
| 11 | Mutations are audited | `PATCH /api/v1/users/:id` as ADMIN, then read the newest row — see the note below | One row, `action = USER_UPDATED`, the actor's id, the request IP, a delta naming the changed field, and **no `password_hash` anywhere in the body** |
| 12 | The suite is green | `npm --prefix backend test` | All tests pass, no skips |

**Check 11 needs `GET /audit/:id`, not the list.** The list projection (`auditModel.list`) deliberately omits `action_delta` — an audit list of 200 rows with a JSON blob on each is a large payload, and the summary view does not need it. The single-row projection includes it. So the sweep must take the newest id from the list and then fetch that row individually. Reading `action_delta` off a list row yields an empty string, which looks like "the delta was not recorded" and is really "you asked the wrong endpoint".

**Additional hygiene checks:** `git status` clean; `git check-ignore backend/.env` still confirms the secret is ignored; `git log -p --all | Select-String "PmeDemo@2026"` returns **only** the seed file and the README — the demo password is public by design, unlike the database password, so the sweep is expected to find it in exactly two places; `backend/package.json` still lists exactly the seven spec §10.1 runtime dependencies and nothing more.

## 10. Windows-Specific Considerations

Everything in `PHASE_0_PLAN.md` §10 still applies. Phase 1 adds:

| Concern | Detail | Handling |
| :-- | :-- | :-- |
| The path contains a space | `E:\React project\PME System` | `npm --prefix "E:\React project\PME System\backend" test` if not using the root scripts. The tests use port `0`, so they never collide with a running dev server |
| **Long test output** | `node --test` prints a TAP line per assertion; a suite of ~80 assertions scrolls past the interesting failures | `node --test --test-reporter=spec` for readable names, or `--test-name-pattern` to run one file |
| Console encoding | Node writes UTF-8; the Windows console may not render it, so a `full_name` with Sinhala text prints as `?` | Cosmetic only. Set `chcp 65001` or use a UTF-8 terminal. The **database** is unaffected — it is `utf8mb4` (Phase 0 D14) |
| `%` in generated SQL | `LIKE '%x%'` in a `.sql` seed or a PowerShell string | `$`-safe in PowerShell; use `LIKE CONCAT('%', ?, '%')` when a parameter is involved, never string interpolation |
| `bcryptjs` cost 12 | Each hash is ~300 ms; the suite is visibly slow | Expected. Do not "fix" it by lowering the cost |
| Exit codes under `npm test` | A failing `node --test` returns non-zero and `npm` reports `ERR!` | That is the intended signal. Do not pipe through anything that masks the code |

## 11. Risks

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| **No login rate limiting** (D33) | `/auth/login` is an unthrottled password-guessing endpoint on a LAN | Phase 4 task 4.3. The window is bounded: cost-12 bcrypt makes each guess ~300 ms, so ~200/minute per connection. Documented in the README, not hidden |
| **Audit immutability is not enforced by the database** (Task 1.4's D42) | `pme_user` has `UPDATE` and `DELETE` on `pme_system.*`, so anything running as the app can alter `audit_logs` | `auditModel` exports no update or delete path. The stronger fix needs `TRIGGER` added to the D2 grant in `bootstrap.sql` — flagged for Phase 4 task 4.6, with the privilege implication stated there |
| **Password hashes in `action_delta`** (D32) | An audit trail becomes a credential store | Redaction in the serializer, not at call sites; asserted by two tests. The `users` select list also omits `password_hash`, so the controller never holds it |
| **A deactivation race empties the admin set** (D24) | Two concurrent requests leave zero admins and no UI path back | `SELECT … FOR UPDATE` inside the transaction. The test is function-level precisely because an HTTP-level test cannot reproduce the interleaving reliably |
| **Role drift between the `ENUM` and `permissions.js`** (D27) | A role exists in the schema with no permissions, so its users log in and reach nothing | The `information_schema` drift test fails at build time. This is the single most likely Phase 2 defect, converted into a red test |
| **The spec's §4.1 and §5.1 disagree about roles** (D27, D28) | Implementing §4.1 literally requires an `ALTER TABLE` mid-Phase 2 | The `ENUM` is treated as authoritative; `designation` carries Engineer/Legal Officer. Both decisions are recorded here rather than discovered later |
| **A developer is locked out by the last-admin guard** | Cannot log in to reverse it through the UI | The README documents the `UPDATE … SET is_active = TRUE` recovery as `pme_user`, so the fix needs no `root` |
| **`npm run seed` overwrites a developer's password** | Confusion, and a demo account left in a known state | The seed-file filter (Task 1.15), a README warning, and a comment in the seed file. `is_active` is never in the `ON DUPLICATE KEY UPDATE` clause |
| **The suite mutates demo data** | The next `npm run seed` becomes a debugging session | Namespaced fixtures, per-test cleanup, seeded personas untouched |
| **A token-authorization change is felt as a latency regression** | Per-request user load (D21) is a deliberate trade | One primary-key lookup on a LAN. Measured in the acceptance run; if it ever matters, a short-lived cache keyed on `users.updated_at` is the fix — not a token with stale claims |
| **Scope leakage into Phase 2 or 3** | Phase 1 loses its checkpoint value | §2 states the out-of-scope list; a Phase 1 that touches `frontend/` or creates a `mail_records` row has failed |

## 12. Definition of Done

- [ ] Migrations `001`–`004` applied, ordered by filename, and idempotent on re-run
- [ ] `users.role` is the 8-value `ENUM` from spec §5.1, and `ROLES` matches it (drift test)
- [ ] `refresh_tokens` stores SHA-256 hashes only; rotation is recorded via `replaced_by_hash`
- [ ] `audit_logs` accepts nullable `user_id` and JSON `action_delta`; `auditModel` exports no update or delete
- [ ] `server.js` no longer starts a server on import (D18); `app.js` exports the app
- [ ] `bcrypt` cost is 12, as one exported constant (D34)
- [ ] Login returns spec §7.1's shape plus `refresh_token` (D39)
- [ ] Unknown NIC and wrong password return a **byte-identical** 401 body (D29)
- [ ] A refresh token presented as a Bearer credential is rejected (D22)
- [ ] A rotated refresh token cannot be reused
- [ ] Deactivating a user invalidates their existing access token on the **next** request (D21)
- [ ] `DELETE /api/v1/users/:id` deactivates and never deletes a row (D23)
- [ ] The last active ADMIN cannot be deactivated, including under concurrent requests (D24)
- [ ] Self-deletion and self-role-escalation are both refused
- [ ] No response anywhere contains `password_hash`; no audit `action_delta` contains one (D32)
- [ ] Every user and department mutation writes an audit row **in the same transaction** (D20)
- [ ] Audit rows carry the actor, the action, the entity, the delta, and `req.ip`
- [ ] `GET /api/v1/audit` is admin-only, paginated, and filterable
- [ ] All 8 personas can log in with the documented demo credential
- [ ] `npm run seed` is re-runnable, and the seed filter prevents an accidental password reset
- [ ] `node --test` passes with no skips and no new dependency
- [ ] `backend/package.json` still lists exactly the seven spec §10.1 runtime dependencies
- [ ] No file under `frontend/src/` is modified
- [ ] No `mail_records`, `official_minutes` or `officer_duties` table exists
- [ ] README documents the 8 demo credentials, the auth endpoints, the lockout recovery, and the security notes
- [ ] All twelve §9 checks pass

**Verified, not assumed.** The three claims easiest to tick without proving, and how each is proved:

- **Error-message non-enumeration (D29)** is tested by asserting the two 401 bodies are deep-equal, not merely similar — a differing `message` string is a successful enumeration even when the status matches.
- **Immediacy of deactivation (D21)** is tested by deactivating a user mid-test and re-using the token they already hold. Anything that re-checks expiry from the token alone fails this, which is the entire justification for the per-request user load.
- **Audit redaction (D32)** is tested against the row actually stored, not the controller's in-memory object. The serialiser is where the mistake would be, and only the stored row proves it did not happen.

## 13. Open Questions

| # | Question | Blocks | Status / default |
| :-- | :-- | :-- | :-- |
| **Q2** | *(inherited)* Confirm the 8 seed accounts' demo NICs and password, or accept generated placeholders? | Task 1.15 | **OPEN — user's call.** Default if unanswered: the NICs and the shared password in Task 1.15, documented in the README as demo credentials. Only the NIC scheme and the password string need confirming; the roles and departments are fixed by the `ENUM` and §12.3 |
| **Q12** | *(new)* Should the audit `BEFORE UPDATE`/`BEFORE DELETE` trigger be added, accepting a `TRIGGER` grant for `pme_user` in `database/bootstrap.sql`? | Nothing in Phase 1 | **DEFERRED to Phase 4 task 4.6.** Phase 1 enforces immutability in the API layer only (D42). Say the word and it moves into this phase |
| **Q13** | *(new)* Should `users.updated_at` (D37) be added, deviating from spec §5.1's literal DDL? | Nothing | **DEFAULT: added.** One column; the alternative is that `PATCH /users/:id` cannot report when the row last changed |
| **Q14** | *(new)* Should `GET /api/v1/departments` be open to every authenticated user, or admin-only? | Task 1.14 | **DEFAULT: open.** Every signed-in user needs the department picker; the data is a name and a code, not sensitive. Change to admin-only if the ministry disagrees |
| **Q15** | *(inherited from `PHASE_0_PLAN.md` §3a)* Node v22.3.0 is below Vite 8's floor. Upgrade the machine install, or accept the warning? | Nothing in Phase 1 | **STILL OPEN.** Phase 1 runs no Vite build, so this does not block it. It must be resolved before Phase 3. The interim workaround (portable v22.22.3) is verified |
| **Q16** | *(inherited)* `EXECUTION_PLAN.md` still describes `docker-compose.yml` in four places, which Q1 overturned | Documentation | **OPEN.** Not rewritten, for the reason given in `PHASE_0_PLAN.md` §12. Task 1.17 touches the README, not the parent plan |

## 14. Execution Sequence

```
1.1  001_departments          ──┐
1.2  002_users                ──┤ pure schema, no dependencies on each other
1.3  003_refresh_tokens       ──┤
1.4  004_audit_logs           ──┘
1.5  utils/password.js + config/jwt.js signing helpers
1.6  utils/permissions.js  ────────── the drift test in 1.16 depends on this
1.7  models/userModel.js  ─┐
1.8  the other three models ─┴─ all take the D19 executor parameter
1.9  middleware/authMiddleware.js  ─┐
1.10 middleware/roleMiddleware.js  ─┤ must exist before any route
1.11 middleware/auditMiddleware.js ─┘
1.13 utils/validate.js
1.12 auth endpoints          ─── first end-to-end proof
1.14 users / departments / audit endpoints
1.15 seeds  ───────────────────── Q2 must be answered, or the defaults used
1.16 test suite
1.17 README + PHASE_0_PLAN.md §9 correction
───  run §9 acceptance checks  ───
───  commit: "feat: phase 1 auth, rbac and user directory"
───  proceed to Phase 2
```

Tasks 1.1–1.4 are independent of each other and can be written in any order; 1.5 and 1.6 depend on nothing but each other's conventions. **1.7–1.11 are the critical path** — the executor parameter (D19) and the transaction-owns-audit rule (D20) are structural, and retrofitting them after 1.14 would mean rewriting every model call. 1.12 is the first end-to-end proof and should be reached before 1.14, so a working login exists before admin CRUD is layered on top.

**One hard sequencing constraint that the diagram hides:** 1.15 cannot be verified without 1.12, and 1.16's persona tests need 1.15. So a working login is proven with a hand-created user before the seeds exist — which is the right order anyway, because it means the seed is written against a login that is already known to work.
