# Phase 0 — Environment & Foundation: Detailed Plan

**Parent plan:** `EXECUTION_PLAN.md` (Phase 0 of 9)
**Status:** Planning only — nothing implemented
**Date:** 2026-09-27

---

## 1. Objective

Produce a machine state where two processes start cleanly and talk to a third, with zero application logic:

- MySQL 8.0.34 running as the local `MySQL80` Windows service, with an empty `pme_system` database in `utf8mb4`
- Express server running on port 4000, serving `GET /api/v1/health` → `200`
- Vite React dev server running on port 5173, rendering an empty shell styled with the ministry palette

Phase 0 exists so that **Phase 1 can be verified, not just written.** Every later phase assumes a live database and a bootable server. If that is not true on day one, "it works" becomes unverifiable and defects accumulate silently.

## 2. Scope

**In scope:** repository initialization, dependency installation, database provisioning, environment configuration, connection pooling, health endpoint, frontend scaffold with theme tokens, migration runner, ignore files, documentation skeleton.

**Out of scope — explicitly not built in Phase 0:** any table beyond the empty database, any auth logic, any real UI, any module feature, Dockerizing the app or the database, CI/CD, HTTPS/TLS termination, production deployment. A Phase 0 build that contains a login form has failed Phase 0.

## 3. Prerequisites

Verified on the current machine on 2026-09-27, before any task ran:

| Prerequisite | Required | Current status | Action if missing |
| :-- | :-- | :-- | :-- |
| Node.js | v18+ (spec §10.1) | **v22.3.0 — present** | None |
| npm | 9+ | **v10.8.1 — present** | None |
| MySQL Server | 8.0+ | **8.0.34 — present and running** as Windows service `MySQL80` | None |
| MySQL Workbench | Any recent | **8.0 — present** | None |
| `mysql.exe` on PATH | For CLI verification | **Not on PATH — present at** `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe` | Task 0.1 prepends it, or use Workbench |
| Port 3306 | Free and listening | **Listening — confirmed** | Task 0.1 verifies the owning process is `mysqld` |
| Docker Desktop | — | **Not required.** Q1 is answered: local MySQL only | None |
| Git | Any | **Not initialized** | Task 0.2 |

**Q1 is answered — local MySQL, no Docker.** The whole of §6.1, §7, and the failure-mode tables below are written for a locally installed server. No `docker-compose.yml` exists and none is planned.

**Open credential issue — must be resolved before Task 0.1 finishes.** The `root` password supplied for this task does **not** authenticate:

```text
mysql -u root --password=****  ->  ERROR 1045 (28000): Access denied for user 'root'@'localhost'
mysql -u root --skip-password  ->  ERROR 1045 (28000): Access denied for user 'root'@'localhost'
```

Both a password and a password-less login are rejected, so the password is not the only thing in question. The owning process of port 3306 was confirmed to be `mysqld` (PID 4440) and the service `MySQL80` reports `Running`, so the server is genuinely the local install and not a stray container or a second instance. Resolution is one of:

1. Confirm the intended `root` password in MySQL Workbench's saved connection profile and re-run the check.
2. If the password is unknown, reset it with the official `mysqld --skip-grant-tables` procedure, then re-run the check.
3. If Workbench connects successfully but the CLI does not, the difference is the credential store, not MySQL — use the Workbench-verified value.

**Do not proceed past the `SELECT VERSION()` step in Task 0.1 until one of these lands.** Every downstream verification in §9 depends on it.

## 4. Decisions Taken in This Phase

| # | Decision | Rationale |
| :-- | :-- | :-- |
| D1 | MySQL 8.0.34 from the **local `MySQL80` Windows service**, no Docker anywhere in the stack | The spec requires MySQL 8.0+, and 8.0.34 is already installed, already running, and already listening on 3306. Docker would add a second MySQL, a second copy of the data, and a port conflict, in exchange for reproducibility this project does not yet need. All `DB_*` values remain in `.env`, so swapping the transport later is still a config edit with **zero code change** — the escape hatch Docker would have provided is retained. |
| D2 | The application connects as a dedicated **`pme_user`**, not as `root` | `root` is used once, by a human, to create the database and grant privileges — then it leaves the story. The app then holds only `SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/INDEX/DROP` on `pme_system.*`. This bounds the damage from any injection or bug in a way that `DB_USER=root` cannot: a compromised app process cannot drop other schemas, read the MySQL grant tables, or `SHUTDOWN` the server. It also means a leaked `.env` does not leak server administration. |
| D3 | No secret is written into any committed file | `PHASE_0_PLAN.md`, `.env.example`, and `README.md` carry placeholders only. The real values live solely in the git-ignored `backend/.env`. A planning document that is under version control is a permanent record; a password pasted into it cannot be un-leaked by a later `git rm`. |
| D9 | **Tailwind CSS v4** with theme tokens declared via `@theme` in `index.css`, installed through `@tailwindcss/vite` | The spec's §9.2 directory listing references `tailwind.config.js`, which is Tailwind v3-era. v4 is the current major and drops the JS config file in favour of CSS-first `@theme`. Following the spec literally would pin the project to a superseded major version. **Flagged as Q8** — if you want literal `tailwind.config.js` compliance instead, we install v3 and use the spec's exact file. |
| D10 | Migration runner is a hand-written Node script using `mysql2` only | Keeps the dependency set exactly as the spec lists it (§10.1). No `knex`, `sequelize`, or `umzug`. |
| D11 | Root `package.json` with `concurrently` as a dev convenience, running both application processes via one command | A ministry developer should type `npm run dev` once, not open three terminals. Purely local DX; adds no runtime dependency to `backend/`. MySQL is a Windows service, not a child process, so it is **not** a `concurrently` target — Windows services are not `SIGINT`-propagating and killing the service on Ctrl+C would be a bug, not a feature. |
| D12 | `.env` is git-ignored; `.env.example` is committed | Standard secret hygiene. `.env.example` is the documented contract; `.env` is local state. |
| D13 | The root orchestration script checks MySQL's reachability instead of starting it | `npm run dev` must not silently start a service, and must not require one. A preflight that reports the DB state and then proceeds is honest; a script that fails because a service is stopped is annoying. The connection test in Task 0.5 already proves the same thing more precisely. |

## 5. Target Filesystem State at End of Phase 0

```
PME System/
├── .gitignore                       # NEW  — node_modules, .env, uploads, backups
├── package.json                     # NEW  — root: concurrently dev orchestration
├── EXECUTION_PLAN.md                # exists
├── PHASE_0_PLAN.md                  # NEW  — this file
├── system_architecture_technical_specification.md
│
├── database/
│   ├── bootstrap.sql                # NEW  — creates pme_system + pme_user (root only, run once)
│   ├── check-db.js                  # NEW  — read-only reachability probe for npm run db:check
│   ├── migrations/                  # NEW  — empty, ready for 001_*.sql in Phase 1
│   ├── seeds/                       # NEW  — empty, ready for seed_users.sql in Phase 1
│   └── migrate.js                   # NEW  — migration + seed runner
│
├── backend/
│   ├── config/
│   │   ├── db.js                    # NEW  — mysql2/promise pool
│   │   └── jwt.js                   # NEW  — placeholder, fully used in Phase 1
│   ├── middleware/
│   │   └── errorHandler.js          # NEW  — global error handler
│   ├── routes/
│   │   └── index.js                 # NEW  — route registry (health only in Phase 0)
│   ├── uploads/letters/             # NEW  — empty dir + .gitkeep
│   ├── tests/                       # NEW  — empty, bootstrapped in Phase 1
│   ├── .env.example                 # NEW
│   ├── .env                         # NEW  — git-ignored, holds the real pme_user password
│   ├── .gitignore                   # NEW
│   ├── package.json                 # NEW
│   └── server.js                    # NEW  — Express entrypoint
│
└── frontend/                        # NEW  — Vite React app
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx                  # minimal shell, navy/gold theme proof
        └── index.css                # @theme tokens (D9)
```

**File count:** ~24 new files. **No file in this list contains business logic.**

**There is no `docker-compose.yml` in this list, and there is no reason for one.** The database is a pre-existing Windows service, not a project artifact, so it belongs outside the repository. What *is* in the list is `database/bootstrap.sql` — the committed, reviewable record of the D2 privilege grant, so the database can be rebuilt on another machine without reverse-engineering what was clicked in Workbench.

## 6. Task Breakdown

### Task 0.1 — Verify the local MySQL 8 service and create the database and application user

**Goal:** a running, reachable, empty `pme_system` database in `utf8mb4`, plus a `pme_user` account the app can actually authenticate as (D2).

**No Docker in this task.** The server is already installed and already running. The work is verification plus one `CREATE DATABASE` and one `CREATE USER`.

**Steps:**

1. Confirm the service is up and the port belongs to the expected process:

   ```powershell
   Get-Service MySQL80
   Get-NetTCPConnection -LocalPort 3306 -State Listen
   Get-Process -Id (Get-NetTCPConnection -LocalPort 3306 -State Listen).OwningProcess
   ```

   Expect: `MySQL80` → `Running`; the port present; the owning process named `mysqld`. Already confirmed on 2026-09-27 (PID 4440). If the owner is *not* `mysqld`, something else has claimed 3306 and every later step will fail confusingly — stop and identify it first.

2. Put `mysql.exe` on PATH for this session. It is installed but not on the machine PATH:

   ```powershell
   $env:Path += ";C:\Program Files\MySQL\MySQL Server 8.0\bin"
   ```

   Preferable to doing this once: add that directory to the user `Path` permanently, so the commands below work in a fresh terminal. MySQL Workbench is an alternative client and needs no PATH change.

3. **Resolve the credential blocker from §3 before continuing.** The supplied `root` password returns `ERROR 1045`, and so does a password-less login. Confirm the real password — Workbench's saved connection profile is the fastest source of truth — then verify:

   ```powershell
   & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root --password=<your-root-password> -e "SELECT VERSION();"
   ```

   Prefer `--password` over a `-p` prompt when scripting. Do **not** use the `MYSQL_PWD` environment variable as a habit: it is readable by any process of the same user and shows up in the process environment of everything you subsequently launch.

4. Write `database/bootstrap.sql` — the committed record of what the next two steps do:

   ```sql
   -- Run once, as root. Safe to re-run.
   CREATE DATABASE IF NOT EXISTS pme_system
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;

   CREATE USER IF NOT EXISTS 'pme_user'@'localhost' IDENTIFIED BY '<choose-a-strong-password>';
   CREATE USER IF NOT EXISTS 'pme_user'@'127.0.0.1' IDENTIFIED BY '<choose-a-strong-password>';

   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
     ON pme_system.* TO 'pme_user'@'localhost';
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
     ON pme_system.* TO 'pme_user'@'127.0.0.1';

   FLUSH PRIVILEGES;
   ```

   Notes that matter: both `localhost` and `127.0.0.1` rows exist because MySQL treats them as *different accounts* — creating only one and then connecting via the other produces a confusing `ERROR 1045` that reads like a wrong password when the password is in fact correct. `GRANT` is scoped to `pme_system.*`, so `pme_user` cannot touch `mysql`, `sys`, or any other schema (D2). The `CREATE USER IF NOT EXISTS` form makes re-running harmless.

5. Execute it. Either paste into a Workbench SQL window connected as root, or:

   ```powershell
   & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root --password=<your-root-password> < database\bootstrap.sql
   ```

6. Verify **as `pme_user`**, not as root. Testing with the account the app will use is the whole point of D2 — a root-only success would leave the real failure unproven:

   ```powershell
   & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u pme_user --password=<chosen-password> -e "SELECT VERSION(), @@character_set_database; SHOW GRANTS FOR CURRENT_USER;"
   ```

   Expect `8.0.34`, `utf8mb4`, and a grant set confined to `pme_system.*`.

7. Confirm the charset and collation are correct at the server level, not only per-database, so migrations in Phase 1 inherit the right defaults:

   ```sql
   SHOW VARIABLES WHERE Variable_name IN ('character_set_server','collation_server','default_authentication_plugin');
   ```

   If `character_set_server` is not `utf8mb4`, either fix it in the MySQL config file and restart `MySQL80`, or rely on the explicit per-database charset set in step 4 — which is sufficient, since every migration will name its charset.

**Why D13 matters here:** MySQL is a Windows service, so it is either running or it is not, and the app does not own its lifecycle. Task 0.5's boot-time `SELECT 1` is the single source of truth for "is the database reachable" — better than a script that pretends to manage a service it cannot.

**Artifacts:** `database/bootstrap.sql` (committed), `backend/.env` (ignored, written in Task 0.4)

**Verification:** `SELECT VERSION()` → `8.0.34`; `@@character_set_database` → `utf8mb4`; `SHOW GRANTS FOR CURRENT_USER` shows only `pme_system.*`.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `ERROR 1045` for `root` | Wrong password, or the account was never set up as the installer assumed | See §3. Confirm via a Workbench connection profile, or reset with the `mysqld --skip-grant-tables` procedure |
| `ERROR 1045` for `pme_user` after a correct root login | The account exists only as `'pme_user'@'localhost'` but you connected over TCP as `127.0.0.1` | Add the second `CREATE USER` line from step 4; the two hosts are separate accounts |
| `Get-Service` reports `Stopped` | Service not started | `Start-Service MySQL80`; set startup type to `Automatic` so it survives reboots |
| Port 3306 listening, owner is not `mysqld` | A second MySQL, XAMPP, or an unrelated service holds the port | `Get-Process -Id <pid>` to identify it; stop it, or point `DB_PORT` at the other instance |
| `ER_DBACCESS_DENIED_ERROR` on migration | The `GRANT` was not applied, or was applied to the wrong host row | Re-run `SHOW GRANTS FOR 'pme_user'@'localhost';` and re-issue the `GRANT` |
| `Unknown collation: 'utf8mb4_unicode_ci'` | A very old MySQL | Should not occur on 8.0.34; confirm the port owner is really this install |
| `Access denied` only from Node, but the CLI works | `.env` password differs from the one used to create the user, or a stray space | Re-copy the value; check for trailing whitespace. MySQL auth is exact — no trimming, no tolerance |

---

### Task 0.2 — Initialize version control

**Goal:** a clean baseline commit so every later change is diffable and revertible.

**Steps:**
1. `git init`
2. Write root `.gitignore`:

```
node_modules/
dist/
build/
.env
.env.local
backend/uploads/letters/*
!backend/uploads/letters/.gitkeep
backups/
.expo/
*.log
.DS_Store
Thumbs.db
.idea/
.vscode/
```

3. Write `backend/.gitignore` (defence in depth for the secret-bearing directory)
4. `git add -A` and commit: `chore: initial project structure and phase 0 plan`

**Why this is first:** the plan document itself is the first artifact under version control. Committing before scaffolding means every generated file shows up as a reviewable diff.

**Verification:** `git log` shows one commit; `git status` is clean; `git check-ignore backend/.env` confirms the secret file is ignored.

---

### Task 0.3 — Scaffold the backend

**Goal:** an Express server that starts, parses JSON, and serves one route.

**Steps:**
1. `npm init -y` in `backend/`
2. Install runtime dependencies — **exactly the spec §10.1 set, nothing extra:**

| Package | Purpose | Why needed in Phase 0 |
| :-- | :-- | :-- |
| `express` | HTTP framework | Server itself |
| `mysql2` | MySQL driver (promise API) | Pool in `config/db.js` |
| `jsonwebtoken` | JWT sign/verify | Installed now, used in Phase 1 |
| `bcryptjs` | Password hashing | Installed now, used in Phase 1 |
| `multer` | File upload handling | Installed now, used in Phase 2 |
| `dotenv` | Load `.env` | Needed immediately for `DB_*` |
| `cors` | Cross-origin requests for Vite | Needed immediately (5173 → 4000) |

3. Install dev dependencies: `nodemon` (auto-restart), `concurrently` (root only)
4. Set `"type": "module"` and scripts:

```json
"scripts": {
  "start": "node server.js",
  "dev": "nodemon server.js",
  "migrate": "node ../database/migrate.js up",
  "migrate:status": "node ../database/migrate.js status",
  "seed": "node ../database/migrate.js seed",
  "test": "node --test tests/"
}
```

5. Write `server.js`: load `dotenv`, create the app, `express.json()`, `cors()` restricted to `http://localhost:5173`, mount `routes/index.js`, attach `errorHandler`, listen on `PORT` (default 4000)

**Why install Phase 1/2 packages now:** it front-loads the one-time npm install and lets us catch a native-build or network problem while the project is still empty, rather than mid-feature.

**Artifacts:** `backend/package.json`, `backend/package-lock.json`, `backend/server.js`

**Verification:** `npm start` → `Server running on port 4000` in the console, no crash.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `EADDRINUSE: port 4000` | Port occupied | `netstat -ano | findstr :4000` to find the PID; change `PORT` in `.env` |
| `Cannot find module 'express'` | Install failed | Check network/proxy; rerun `npm install` |
| `ERR_REQUIRE_ESM` / import errors | `"type": "module"` mismatch with file syntax | Pick one style — this project uses ESM throughout |

---

### Task 0.4 — Environment configuration

**Goal:** all configuration externalized; no secrets in code.

**Steps:**
1. Write `backend/.env.example` — the committed contract:

```ini
PORT=4000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=pme_user
DB_PASSWORD=
DB_NAME=pme_system

JWT_SECRET=
JWT_EXPIRES_IN=2h
REFRESH_TOKEN_EXPIRES_IN=14d

UPLOAD_DIR=uploads/letters
MAX_UPLOAD_SIZE_MB=10
```

2. Copy to `backend/.env` and fill in real values. **This is the only file that holds the real `pme_user` password** (D3):

   ```ini
   PORT=4000
   NODE_ENV=development

   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=pme_user
   DB_PASSWORD=<the password chosen in Task 0.1 step 4>
   DB_NAME=pme_system
   ```

   `DB_HOST=127.0.0.1` rather than `localhost` is deliberate. `localhost` makes Node attempt an IPv6 connection first on some Windows configurations while the MySQL user table may only carry the `127.0.0.1` row — a mismatch that surfaces as an unexplained `ECONNREFUSED`. The explicit IPv4 literal is unambiguous.

3. Generate a strong `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
4. Add a startup check in `server.js` that **exits loudly** if `JWT_SECRET` or any `DB_*` value is missing — or is still the literal placeholder from `.env.example`

**Design point:** the loud exit matters. A server that boots with a blank `JWT_SECRET` will happily sign tokens that anyone can forge. Failing at startup is the correct behaviour.

**Artifacts:** `backend/.env.example` (committed), `backend/.env` (ignored)

**Verification:** `.env` is git-ignored; the server refuses to start with a deliberately blanked secret.

---

### Task 0.5 — Database connection pool and health endpoint

**Goal:** prove the server can talk to MySQL, and prove it in one HTTP call.

**Steps:**
1. Write `config/db.js`: a `mysql2/promise` pool — `connectionLimit: 10`, `waitForConnections: true`, `queueLimit: 0`, `charset: 'utf8mb4'`, `timezone: 'Z'`, `namedPlaceholders: true`
2. Export both the pool and a `testConnection()` helper that runs `SELECT 1`
3. Write `middleware/errorHandler.js`: single Express error-handling middleware, maps errors to `{ success: false, message }`, never leaks stack traces when `NODE_ENV=production`
4. Write `routes/index.js` mounting `GET /api/v1/health`:

```js
// returns 200 {"status":"ok","db":"connected","timestamp":"..."}
// returns 503 {"status":"degraded","db":"unreachable"} if SELECT 1 fails
```

5. Wire the pool into `server.js` and call `testConnection()` at boot, logging success or exiting on failure

**Why pool, not a single connection:** concurrent requests in Express would otherwise serialize on one connection. `connectionLimit: 10` is sized for a ministry office, not a data centre.

**Artifacts:** `backend/config/db.js`, `backend/config/jwt.js`, `backend/middleware/errorHandler.js`, `backend/routes/index.js`

**Verification:**

```powershell
Invoke-RestMethod -Uri http://localhost:4000/api/v1/health
# expected: status=ok, db=connected
```

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `ER_ACCESS_DENIED_ERROR` | `DB_USER`/`DB_PASSWORD` mismatch, or the `'pme_user'@'127.0.0.1'` account is missing | Re-check `backend/.env` against the `CREATE USER` lines in `database/bootstrap.sql`; both host rows are required |
| `ECONNREFUSED` | `MySQL80` service is stopped, or `DB_PORT` is wrong | `Get-Service MySQL80`; `Get-NetTCPConnection -LocalPort 3306 -State Listen` |
| `ER_BAD_DB_ERROR` | `pme_system` not created | Run `database/bootstrap.sql` as root; `CREATE DATABASE IF NOT EXISTS` is safe to repeat |
| `ER_NOT_SUPPORTED_AUTH_MODE` | A pre-5.7 server is answering, or a user still has an old auth plugin | Confirm the port owner is `mysqld` 8.0.34; `ALTER USER 'pme_user'@'localhost' IDENTIFIED WITH caching_sha2_password BY '<password>'` |
| `PROTOCOL_CONNECTION_LOST` | The MySQL service was stopped or restarted mid-query | Windows event log, then `Start-Service MySQL80`; the pool recovers on the next request |
| 503 from health but server is "up" | Expected | The endpoint is correctly reporting a database problem |

---

### Task 0.6 — Build the migration and seed runner

**Goal:** a repeatable, ordered, idempotent way to evolve the schema.

**Steps:**
1. Write `database/migrate.js` supporting three commands: `up`, `status`, `seed`
2. `up` behaviour:
   - Connect using `DB_*` from `backend/.env`
   - `CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
   - Read `migrations/*.sql`, sort ascending by filename
   - Skip anything already in `schema_migrations`
   - Apply each remaining file, each inside its own transaction, recording it on success
   - Print a per-file `applied` / `skipped` line
3. `status` prints applied vs pending
4. `seed` runs `seeds/*.sql` in order; seeds are written to be re-runnable (upserts, not blind inserts)
5. Create `migrations/` and `seeds/` as empty directories (with `.gitkeep`) so the runner has something to scan and git tracks them

**Why numeric filename prefixes:** `001_`, `002_` guarantees order regardless of the filesystem's alphabetization behaviour across Windows and Linux. Alphabetical ordering of descriptive names is fragile; numeric prefixes are not.

**Artifacts:** `database/migrate.js`, `database/migrations/.gitkeep`, `database/seeds/.gitkeep`

**Verification:** `npm run migrate` → `0 migrations applied (nothing to do)`; `npm run migrate:status` → all pending.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `ER_NO_SUCH_TABLE` on a foreign key | Referenced table not yet migrated | Migration order must respect FK dependencies |
| Partial migration applied | DDL is not transactional in MySQL | MySQL auto-commits DDL; `migrate.js status` plus a corrective migration is the recovery path, not rollback |
| `.env` not found | Wrong working directory | Runner resolves the path relative to `backend/`, never the shell's cwd |

---

### Task 0.7 — Scaffold the frontend

**Goal:** a running Vite React app with the ministry theme applied.

**Steps:**
1. `npm create vite@latest frontend -- --template react`
2. Install dependencies: `axios`, `react-router-dom`, `lucide-react`
3. Install Tailwind (per D9: `tailwindcss @tailwindcss/vite`; per Q8 alternative: `tailwindcss@3 postcss autoprefixer`)
4. Register the Tailwind Vite plugin in `vite.config.js`
5. Set up the dev-server proxy so the frontend calls `/api/...` and Vite forwards to `localhost:4000` — this removes CORS from the equation during development entirely
6. Write `src/index.css` with `@import "tailwindcss"` and a `@theme` block defining the spec §9.1 palette:

| Token | Value | Use |
| :-- | :-- | :-- |
| `navy` | `#0f172a` | Headers, sidebar, primary surfaces |
| `gold` | `#f59e0b` | Accents, primary action buttons, active nav |
| `slate` | Tailwind default scale | Body text, borders, muted surfaces |

7. Write a minimal `App.jsx` proving the theme: navy header bar, gold button, slate body text
8. Delete Vite boilerplate assets that Phase 1 will not use

**The proxy in step 5 is the important one.** Without it, every development request is cross-origin and depends on CORS behaving correctly. With it, the browser sees a single origin and CORS only matters at deployment.

**Artifacts:** `frontend/` (Vite scaffold + configured Tailwind + themed shell)

**Verification:** `npm run dev` → `http://localhost:5173` renders navy/gold text with no console errors; `GET http://localhost:5173/api/v1/health` proxies through and returns the backend's JSON.

**Failure modes:**

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Styles do not apply | Tailwind plugin not registered in `vite.config.js` | Restart the dev server; Vite needs a restart for plugin changes |
| Utility classes unrecognized | Missing `@import "tailwindcss"` | Add it as the first line of `index.css` |
| Proxy returns 500 | Backend not running | Start `backend/` first |
| Port 5173 in use | Another Vite app | `npm run dev -- --port 5174` |

---

### Task 0.8 — Root orchestration and uploads directory

**Goal:** one command to start everything; upload target ready for Phase 2.

**Steps:**
1. Root `package.json` with `concurrently`, covering the two application processes:

   ```json
   "scripts": {
     "dev": "concurrently -n api,web -c green,magenta \"npm:dev:api\" \"npm:dev:web\"",
     "dev:api": "npm --prefix backend run dev",
     "dev:web": "npm --prefix frontend run dev",
     "db:check": "node database/check-db.js"
   }
   ```

   There is no `dev:db` and no `db` target. MySQL is a Windows service (D13), not a process this project spawns — Ctrl+C must not stop the developer's database server. `db:check` is a read-only reachability probe that reports, without changing anything.

2. Create `backend/uploads/letters/` with a `.gitkeep` so the directory survives in git
3. Create `backend/config/jwt.js` — constants only; the signing logic arrives in Phase 1
4. Create `backend/tests/` with a placeholder so the directory exists for Phase 1

**Why `concurrently` at the root only:** it must never become a dependency of `backend/` or `frontend/`, or their `package.json` files stop matching the spec's §10.1/§9.1 manifests.

**Artifacts:** root `package.json`, `database/check-db.js`, `backend/uploads/letters/.gitkeep`, `backend/config/jwt.js`

**Verification:** `npm run dev` from the root starts api + web with labelled, colour-coded output; Ctrl+C stops both cleanly and leaves `MySQL80` running.

---

### Task 0.9 — Documentation skeleton

**Goal:** a README that already works, so nobody is stuck during setup.

**Steps:**
1. Write `README.md` with: prerequisites, the local-MySQL setup path, step-by-step first run, the port map, the demo credential placeholder section, and a project-structure section
2. Include a **Troubleshooting** section carrying forward every row from the failure-mode tables in this document
3. State explicitly that the database is the `MySQL80` Windows service, that it must be running before `npm run dev`, and how to start it: `Start-Service MySQL80`
4. Leave a clearly marked `## Coming Next` section listing Phase 1

**Artifacts:** `README.md`

**Verification:** a reader starting from a clean clone can reach a running health endpoint using only the README. No undocumented step.

---

## 7. Port and Service Map

| Port | Service | Started by | Health check |
| :-- | :-- | :-- | :-- |
| 3306 | MySQL 8.0.34, Windows service `MySQL80` | The OS, at boot or `Start-Service MySQL80` | `Get-Service MySQL80` → `Running`; `SELECT 1` as `pme_user` |
| 4000 | Express API | `npm --prefix backend run dev` | `GET /api/v1/health` → 200 `db: connected` |
| 5173 | Vite dev server | `npm --prefix frontend run dev` | `http://localhost:5173` renders |

**Only 4000 and 5173 are started by this project.** 3306 predates it and is managed by Windows. If a port is occupied, the fix is to change the project's port, never to stop a system service to accommodate it — except for 3306, where the *other* owner of the port is the thing to investigate (Task 0.1, step 1).

## 8. Environment Variable Reference

| Variable | Default | Notes |
| :-- | :-- | :-- |
| `PORT` | `4000` | Backend listen port |
| `NODE_ENV` | `development` | Controls error-detail leakage |
| `DB_HOST` | `127.0.0.1` | Use the literal, not `localhost` — see Task 0.4 |
| `DB_PORT` | `3306` | The `MySQL80` service port |
| `DB_USER` | `pme_user` | Non-root application user (D2); `root` never appears here |
| `DB_PASSWORD` | *(placeholder in `.env.example`)* | Real value only in git-ignored `backend/.env` |
| `DB_NAME` | `pme_system` | Created by `database/bootstrap.sql` |
| `JWT_SECRET` | *(placeholder in `.env.example`)* | **Server refuses to boot if blank or still a placeholder** |
| `JWT_EXPIRES_IN` | `2h` | Phase 1 |
| `REFRESH_TOKEN_EXPIRES_IN` | `14d` | Phase 1 |
| `UPLOAD_DIR` | `uploads/letters` | Phase 2 |
| `MAX_UPLOAD_SIZE_MB` | `10` | Phase 2 |

## 9. Acceptance Test — Phase 0 Exit Criteria

Run in order. **All seven must pass.** `$mysql` below is `C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`; substitute your `root` / `pme_user` passwords at the prompt rather than embedding them in shell history.

| # | Check | Command | Expected |
| :-- | :-- | :-- | :-- |
| 1 | The service is running | `Get-Service MySQL80` | `Running` |
| 2 | App account authenticates, and is confined | `$mysql -u pme_user -p -e "SELECT VERSION(), @@character_set_database; SHOW GRANTS FOR CURRENT_USER;"` | `8.0.34`, `utf8mb4`, grants only on `pme_system.*` |
| 3 | Migrations run | `npm --prefix backend run migrate` | `0 migrations applied` (no errors) |
| 4 | API boots and reaches the DB | `Invoke-RestMethod http://localhost:4000/api/v1/health` | `status=ok`, `db=connected` |
| 5 | API fails loudly on bad config | Blank `JWT_SECRET`, restart | Non-zero exit, clear message |
| 6 | Frontend boots with theme | `npm --prefix frontend run dev`, open `:5173` | Navy/gold shell, no console errors |
| 7 | Proxy works | `Invoke-RestMethod http://localhost:5173/api/v1/health` | Same JSON as check 4 |

**Additional hygiene checks:** `git status` clean; `git check-ignore backend/.env` confirms the secret is ignored; `git log -p --all | Select-String "<the real password>"` returns nothing — proving D3 held and no secret entered history; `backend/package.json` lists exactly the seven spec §10.1 runtime dependencies and nothing more.

## 10. Windows-Specific Considerations

This project lives at `E:\React project\PME System` — **the path contains a space.** Most of the Node toolchain handles this, but:

| Concern | Detail | Handling |
| :-- | :-- | :-- |
| Spaces in paths | npm, Vite, and Node resolve these correctly | No action; noted because some third-party CLIs historically fail |
| Quoting | PowerShell requires quotes around any path with a space | `npm --prefix "E:\React project\PME System\backend" run dev` if not using the root orchestrator |
| Execution policy | May block `npm.ps1` shims | Fall back to `npm.cmd` |
| Path separators | Spec paths use `/` | Node handles both; `.env` paths use `/` consistently |
| Long paths | Deep `node_modules` trees | Enable Windows long-path support if `npm install` fails with `ENAMETOOLONG` |
| Line endings | Git `core.autocrlf` | Add a `.gitattributes` with `* text=auto eol=lf` to keep shell scripts and SQL stable |
| Service management | `MySQL80` may stop on idle or after a reboot | Set startup type to `Automatic`: `Set-Service MySQL80 -StartupType Automatic` |
| `mysql.exe` not on PATH | It is installed under `C:\Program Files\MySQL\MySQL Server 8.0\bin` but absent from the machine PATH | Add it to the user `Path`, or invoke it by full path as in §9 |
| Admin rights | `Start-Service` needs elevation; `Get-Service` does not | Run service commands from an elevated prompt, or ask an administrator to set the startup type once |
| IPv4 vs IPv6 | `localhost` may resolve to `::1` first while MySQL listens on IPv4 | Set `DB_HOST=127.0.0.1` explicitly |
| Password with special characters | `@`, `#`, `!`, and `%` are significant in `.ini`, URIs, and shell quoting | `.env` needs no escaping, but quote the value in any shell command; `%` in a PowerShell string is fine, in a `cmd` batch file it is not |

## 11. Risks

| Risk | Impact | Mitigation |
| :-- | :-- | :-- |
| `root` password unknown or incorrect | Blocks Task 0.1 and every verification downstream | Flagged in §3 with three concrete resolutions; verified before proceeding rather than discovered at §9 check 4 |
| A second MySQL already holds port 3306 | `DB_*` point at the wrong server; migrations land in the wrong schema | Task 0.1 step 1 identifies the owning process by PID before anything is created |
| App run as `root` | A single injection owns the entire server | D2 — a scoped `pme_user`; §9 check 2 asserts the grant set |
| Secret committed to a tracked file | Permanent credential exposure | D3 — placeholders in tracked files; the `git log` sweep in §9 verifies it |
| Service stopped or not set to start automatically | `ECONNREFUSED` on a later day, mistaken for a code regression | Startup type set to `Automatic`; health endpoint reports `degraded` distinctly from a crash; §10 troubleshooting |
| Native build failure on `mysql2` | Backend cannot start | `mysql2` is pure JS with an optional native path; the promise API works without a compiler. Worst case, `npm install --omit=optional` |
| Port collisions with existing local software | Confusing startup failures | Port map in §7 plus the `netstat` command in each failure-mode table |
| Scope leakage into Phase 1 | Phase 0 loses its checkpoint value | §2 states the out-of-scope list explicitly; a Phase 0 build containing a login form is a failure |
| Scope leakage into Phase 1/2 dependencies | Deviation from spec §10.1 | §9 verifies the dependency list exactly |

## 12. Definition of Done

- [ ] `MySQL80` service running, `pme_system` database exists, `utf8mb4`
- [ ] `pme_user` created, scoped to `pme_system.*`, and verified by authenticating **as `pme_user`**
- [ ] `database/bootstrap.sql` committed, so the setup is reproducible without Workbench
- [ ] Git initialized, `.gitignore` in place, baseline commit made
- [ ] `backend/` installs exactly the seven spec §10.1 runtime dependencies
- [ ] `server.js` starts, serves JSON, and exits loudly on missing config
- [ ] `GET /api/v1/health` returns `200` with `db: connected`
- [ ] `.env` git-ignored, `.env.example` committed with all documented variables, no real secret in any tracked file
- [ ] Migration runner executes with zero migrations and reports status correctly
- [ ] `frontend/` runs on 5173 with the navy/gold theme applied and no console errors
- [ ] Vite proxy forwards `/api` to the backend
- [ ] `npm run dev` at the root starts api + web together and stops cleanly, leaving `MySQL80` untouched
- [ ] All seven acceptance checks in §9 pass
- [ ] `README.md` covers setup and troubleshooting; no undocumented step remains
- [ ] `backend/config/db.js` and `middleware/errorHandler.js` never leak stack traces or SQL in production mode
- [ ] No `docker-compose.yml` exists and no Docker command appears in any project script or documentation

## 13. Open Questions

| # | Question | Blocks | Status / default |
| :-- | :-- | :-- | :-- |
| **Q1** | Docker Desktop, or the local MySQL install? | Task 0.1 | **RESOLVED — local MySQL 8.0.34 via the `MySQL80` service. No Docker.** See D1. |
| **Q2** | What is the actual `root` password, and should it be reset to a known value? | Task 0.1 step 3 | **OPEN.** The supplied password returns `ERROR 1045`, as does a password-less login. Must be answered before Task 0.1 can complete. |
| **Q8** | Tailwind v4 CSS-first theme (recommended, current major) or v3 with the spec's literal `tailwind.config.js`? | Task 0.7 | v4 |
| **Q9** | Root `concurrently` orchestration, or two separate terminals? | Task 0.8 | Root orchestration, since the root orchestrator is additive and can be removed freely |
| **Q10** | Is `mysql.exe` to be added to the machine `PATH` permanently, or invoked by full path throughout? | Task 0.1 step 2 | Full path in docs; adding it to the user `PATH` is a one-time convenience and needs no project decision |

---

## 14. Execution Sequence

```
0.1  Verify MySQL80 + bootstrap.sql  ── blocked on Q2 (root password)
0.2  git init + .gitignore + commit  ── baseline before any scaffolding
0.3  Scaffold backend + install deps
0.4  .env.example + .env + secrets
0.5  db.js pool + errorHandler + /health   ── first real proof
0.6  migrate.js runner + empty dirs
0.7  Scaffold frontend + Tailwind theme
0.8  Root orchestration + uploads dir
0.9  README
───  run §9 acceptance checks  ───
───  commit: "chore: phase 0 foundation complete"
───  proceed to Phase 1
```

Tasks 0.4, 0.5, and 0.6 are independent of each other and can be done in any order once 0.3 lands. 0.7 is fully parallel to 0.3–0.6 and could be delegated.

**0.1 has a hard dependency on 0.2 that the ordering above hides:** the `pme_user` password must exist before `backend/.env` is written in 0.4, but 0.2 is what makes `.env` safe to write at all. If Q2 is still open when 0.2 lands, do 0.3 and 0.7 while waiting — they touch no credentials.
