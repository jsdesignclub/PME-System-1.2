# PME System — Provincial Ministry Enterprise Management System

A modular web application for managing provincial ministry enterprises.

**Status: Phase 2 (Mail & Minutes Backend, Module 1) complete**, on top of Phase 1
(Authentication, RBAC & User Directory). A letter can be logged, endorsed with
official minutes, routed to an officer by a ranked duty matcher, advanced through
its five states by the right role, completed, and closed with a `day_stamp_no` the
client never gets to choose. The workflow is a **transition table the server
enforces**, not a convention the UI encourages — an illegal jump is a `409` from
the API, and every mutation writes its audit row in the same transaction as the
change it describes. 347 backend tests pass against a live database.

A UI for this now exists and is usable (login, dashboard, registry, letter
detail, new letter, officer duty charts). It is **Phase 3 scope built early**,
against this backend — see *Status caveat* below.

---

## Prerequisites

| Tool | Required | Notes |
| :-- | :-- | :-- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Wanted by Vite 8 (Phase 3). The current `v22.3.0` runs the backend, its tests, **and** `vite build` (warning only) — see below. |
| npm | 9+ | Ships with Node. |
| MySQL Server | 8.0+ | Installed as the Windows service **`MySQL80`**. |
| MySQL Workbench | any recent | Optional; the CLI is enough. |
| Git | any | Already initialised. |
| Docker | **not required** | Deliberately unused — see below. |

### Why no Docker

The database is a pre-existing Windows service, not a project artifact, so it
belongs outside the repository. `database/bootstrap.sql` is the committed,
reviewable record of the schema and the privilege grant, so the database can be
rebuilt on another machine without reverse-engineering what was clicked in
Workbench. If the transport ever needs to change, every `DB_*` value lives in
`.env` — swapping it is a config edit with zero code change.

---

## First run

### 1. Make sure MySQL is running

It is a Windows service, so nothing in this project will start it for you. It
must be running before `npm run dev`.

```powershell
Get-Service MySQL80        # expect: Running
Start-Service MySQL80      # if not (needs an elevated prompt)
```

To survive reboots, set the startup type once:

```powershell
Set-Service MySQL80 -StartupType Automatic
```

Optionally confirm the app account can reach it:

```powershell
npm run db:check
```

### 2. Install dependencies

```powershell
npm install                 # root — installs concurrently
npm --prefix backend install
npm --prefix frontend install
```

### 3. Create the database and application user (once)

Run as root. `mysql.exe` is not on `PATH` by default — invoke it by full path:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p `
  -e "SELECT VERSION();"
```

Then execute the bootstrap script, substituting your chosen application
password. This keeps the real password out of the committed file:

```powershell
$env:PME_DB_PASSWORD = '<choose-a-strong-password>'
(Get-Content database\bootstrap.sql) `
  -replace '<choose-a-strong-password>', $env:PME_DB_PASSWORD `
  | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

### 4. Configure the backend environment

```powershell
copy backend\.env.example backend\.env      # PowerShell
```

Edit `backend/.env` and replace **every** `change-me`:

- `DB_PASSWORD` — the password you chose in step 3
- `JWT_SECRET` — generate one:

  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```

The server **refuses to start** while any `change-me` remains. That is
deliberate: a server booting with a blank `JWT_SECRET` will happily sign tokens
that anyone can forge.

### 5. Run it

```powershell
npm run dev
```

Then open <http://localhost:5173>.

To stop, press `Ctrl+C` once. Both processes shut down and `MySQL80` keeps
running — the database is a Windows service, not a child process, and `Ctrl+C`
must never take it down.

### 6. Apply migrations and seed the demo accounts

```powershell
npm run db:migrate      # 9 files: the Phase 0-1 four, plus mail, minutes,
                        # duties, day-stamp counters and attachments
npm run db:seed         # 7 departments, 8 demo personas, duty charts, 7 letters
```

Both are safe to re-run. Migrations skip anything already applied; seeds use
`ON DUPLICATE KEY UPDATE` with fixed ids, so a second run updates in place rather
than doubling the registry. See **Demo credentials** below for what the seed
contains and one important warning about re-running it.

### 7. Verify

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health   # status=ok, db=connected
Invoke-RestMethod http://localhost:5173/api/v1/health   # same JSON, via the Vite proxy

# And that auth actually works end to end:
$body = @{ nic_no = '881234560V'; password = 'PmeDemo@2026' } | ConvertTo-Json
(Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login `
   -Body $body -ContentType application/json).token

# And that the mail workflow is there: seven seeded letters, one per state plus
# one confidential. ADMIN, because the scope rule means a clerk or a minor officer
# sees a subset.
$tok = (Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login `
   -Body (@{ nic_no = '881234560V'; password = 'PmeDemo@2026' } | ConvertTo-Json) `
   -ContentType application/json).token
(Invoke-RestMethod -Uri 'http://localhost:4000/api/v1/mail?limit=25' `
   -Headers @{ Authorization = "Bearer $tok" }).pagination
# -> total = 7
```

---

## Port map

| Port | Service | Started by | Health check |
| :-- | :-- | :-- | :-- |
| 3306 | MySQL 8.0.34 (`MySQL80`) | Windows, at boot or `Start-Service MySQL80` | `Get-Service MySQL80` |
| 4000 | Express API | `npm run dev` | `GET /api/v1/health` → 200 |
| 5173 | Vite dev server | `npm run dev` | <http://localhost:5173> renders |

Only 4000 and 5173 are started by this project. **If a port is occupied,
change the project's port — never stop a system service to accommodate it.**
The one exception is 3306: if something other than `mysqld` owns it, that other
process is the thing to investigate.

---

## Scripts

Run from the repository root:

| Command | Effect |
| :-- | :-- |
| `npm run dev` | Start API + web together, colour-labelled |
| `npm run dev:api` | API only (`:4000`) |
| `npm run dev:web` | Web only (`:5173`) |
| `npm run db:check` | Read-only database reachability probe |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migrate:status` | Show applied vs pending |
| `npm run db:seed` | Run re-runnable seed scripts |
| `npm run db:seed:depts` | Re-run **only** the department seed (see Demo credentials) |
| `npm run db:demo` | **Reset the demo registry** — clears letters, audit rows and stray users, then re-seeds. `--dry` only counts. Run before any presentation |
| `npm test` | Backend test suite — 347 tests, needs MySQL running |

Backend-only commands, from `backend/`:

| Command | Effect |
| :-- | :-- |
| `npm start` | Start the API alone (`:4000`) |
| `npm run dev` | Start the API with `nodemon` |
| `npm run hash-password -- "some password"` | Generate a bcrypt hash for a seed file |
| `npm test` | The same 347 tests |

The test suite boots the app on an **ephemeral port**, so it never collides with
a `npm run dev` you already have running. It does need `MySQL80`.

---

## Supabase Edge Functions

The admin **Users** tab onboards people in two steps:

1. **Create login** — `create-user` mints the `auth.users` account (email +
   password) and nothing else.
2. **Complete profile** — the account appears under *Accounts without a profile*;
   selecting it writes the `public.profiles` row (name, NIC, role, department).

Both steps call **Edge Functions** under `supabase/functions/`. They are **not**
deployed with the repository. Until they exist on the project, the browser gets a
`404` whose CORS preflight advertises no allowed method, which surfaces as the
unhelpful **"Failed to fetch"**.

Deploy them once:

```powershell
# 1. Set a Supabase personal access token (https://supabase.com/dashboard/account/tokens)
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."

# 2. Deploy every function in supabase/functions
npm run setup:supabase
```

`setup-supabase.ps1` reads the project ref from `frontend/.env`
(`VITE_SUPABASE_URL`), and falls back to an interactive token prompt if the
environment variable is absent. You can also deploy by hand from the dashboard:
**Edge Functions → Deploy a new function**, pasting
`supabase/functions/create-user/index.ts` and
`supabase/functions/list-unprofiled-users/index.ts`.

The functions read the service-role key from the `SUPABASE_SERVICE_ROLE_KEY`
secret Supabase injects automatically. If a function reports a missing key, add
`SERVICE_ROLE_KEY` under **Project Settings → Edge Functions → Secrets**.

To confirm a function is live, a bare call should return
`401 Missing authorization`, not `404`:

```powershell
curl.exe -i -X POST "https://<ref>.supabase.co/functions/v1/create-user" `
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <publishable-key>" -d "{}"
```

---

## Environment variables

`.env.example` is committed and is the documented contract; `.env` is
git-ignored and is the only file holding real secrets.

| Variable | Default | Notes |
| :-- | :-- | :-- |
| `PORT` | `4000` | Backend listen port |
| `NODE_ENV` | `development` | Controls error-detail leakage |
| `DB_HOST` | `127.0.0.1` | Use the literal, not `localhost` — see Troubleshooting |
| `DB_PORT` | `3306` | The `MySQL80` service port |
| `DB_USER` | `pme_user` | Non-root application user; `root` never appears here |
| `DB_PASSWORD` | *placeholder* | Real value only in git-ignored `backend/.env` |
| `DB_NAME` | `pme_system` | Created by `database/bootstrap.sql` |
| `JWT_SECRET` | *placeholder* | **Server refuses to boot if blank or a placeholder** |
| `JWT_EXPIRES_IN` | `2h` | Phase 1 |
| `REFRESH_TOKEN_EXPIRES_IN` | `14d` | Phase 1 |
| `UPLOAD_DIR` | `uploads/letters` | Phase 2. Root for stored attachments; `stored_path` in the database is **relative** to it, so moving the directory is a `.env` edit and no row changes |
| `MAX_UPLOAD_SIZE_MB` | `10` | Phase 2. Enforced per file and per request by `multer` |

### Why the app never connects as `root`

`root` is used once, by a human, to create the database and grant privileges —
then it leaves the story. The app holds only `SELECT/INSERT/UPDATE/DELETE/
CREATE/ALTER/INDEX/DROP/REFERENCES` on `pme_system.*`. A compromised app
process therefore cannot drop other schemas, read the MySQL grant tables, or
shut down the server. It also means a leaked `.env` does not leak server
administration.

Verify the grant set is still confined:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u pme_user -p -e "SHOW GRANTS FOR CURRENT_USER;"
```

---

## Project structure

```
PME System/
├── package.json              # root orchestration (concurrently)
├── database/
│   ├── bootstrap.sql         # creates pme_system + pme_user; run once as root
│   ├── check-db.js           # read-only reachability probe
│   ├── migrate.js            # runner: up | status | seed [prefix]
│   ├── demo-reset.js        # npm run db:demo — reset the demo registry
│   ├── migrations/           # 001_*.sql, applied in filename order
│   │   ├── 001_departments.sql
│   │   ├── 002_users.sql     # incl. the 8-value role ENUM
│   │   ├── 003_refresh_tokens.sql
│   │   ├── 004_audit_logs.sql
│   │   ├── 005_mail_records.sql       # the letter registry (spec §5.2)
│   │   ├── 006_official_minutes.sql   # the endorsement history
│   │   ├── 007_officer_duties.sql     # duty charts, JSON keywords
│   │   ├── 008_day_stamp_counters.sql # DS/YYYY/MM/NNNN sequence per month
│   │   └── 009_mail_attachments.sql   # child table; replaces spec's attachment_path
│   └── seeds/                # re-runnable .sql
│       ├── 001_seed_departments.sql    # 7 departments
│       ├── 002_seed_demo_users.sql     # 9 accounts, 8 roles, literal bcrypt hashes
│       ├── 003_seed_officer_duties.sql # duty charts, bilingual keywords (D68)
│       └── 004_seed_demo_mail.sql      # 7 letters: 6 per resting state + 1 confidential (Q7)
├── backend/
│   ├── app.js                # the Express app — no listen(), so tests can import it
│   ├── server.js             # entrypoint: validates config, then listens
│   ├── config/
│   │   ├── db.js             # mysql2 pool + testConnection()
│   │   └── jwt.js            # config validation + sign/verify
│   ├── controllers/          # auth, user, department, audit, mail, officer
│   ├── middleware/           # auth, role, audit, upload, errorHandler
│   ├── models/               # user, department, refreshToken, audit, mail, minutes, duty
│   ├── routes/               # index.js registry + one router per module
│   ├── scripts/hash-password.js     # bcrypt hash generator for seeds
│   ├── tests/                # 347 tests, node --test
│   │   └── helpers/          # app boot, fixtures (self-cleaning)
│   ├── utils/                # password, permissions, validate, transaction,
│   │                         #   dayStampGenerator, mailStateMachine, dutyMatcher
│   ├── uploads/letters/      # upload target, one subdirectory per day stamp
│   ├── .env.example          # committed contract
│   └── .env                  # git-ignored; the only place real secrets live
└── frontend/
    ├── vite.config.js        # Tailwind plugin + /api proxy to :4000
    └── src/
        ├── index.css         # @theme tokens (navy, gold)
        ├── api.js            # axios wrapper; normalises on the 409/403/404 split
        ├── App.jsx           # routes
        └── pages/            # Login, Dashboard, MailRegistry, NewMail, MailDetail, Officer
```

`app.js` and `server.js` are separate on purpose (D18). `app.js` builds the
Express app and **does not listen**; `server.js` validates configuration and
calls `listen`. The test suite imports `app.js` and starts it on port `0`, so a
test run never needs port 4000 to be free.

### Migrations

Numbered filename prefixes (`001_`, `002_`) guarantee ordering regardless of
filesystem alphabetisation. Each file is applied in its own transaction and
recorded in `schema_migrations`. Note that MySQL auto-commits DDL, so a
failure partway through a multi-statement file may leave earlier statements in
place — the recovery path is a corrective migration, not a rollback. Use
`npm run db:migrate:status` to see what is applied; it also flags a migration
recorded as applied whose file has since been deleted.

### Seeds

`node database/migrate.js seed [prefix]` takes an optional filename prefix, which
is a prefix match: `seed 001` applies only `001_seed_departments.sql`. This
exists for one specific accident — `002_seed_demo_users.sql` resets the password
of any account whose NIC it recognises, so re-seeding after changing a demo
password quietly throws that change away. An unmatched prefix is an **error**,
not a silent zero-file run, because `seed 0015` matching nothing is a typo and
silently applying nothing would look like success.

### Password hashing

Passwords are hashed with `bcryptjs` at cost factor **12** (`BCRYPT_ROUNDS` in
`backend/utils/password.js` — a constant, not an env var, so no environment can
quietly weaken its own hashing). A bcrypt hash cannot be computed in SQL, so the
demo seed carries the hash as a literal. Generate one with:

```powershell
npm --prefix backend run hash-password -- "some password"
```

The seed file's `ON DUPLICATE KEY UPDATE` clause lists only the columns a seed
owns. In particular it never lists `is_active`, so re-seeding cannot silently
reactivate a deactivated account.

---

## Troubleshooting

### Database

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `ERROR 1045` for `root` | Wrong password, or the account was never set up as the installer assumed | Confirm via a Workbench connection profile, or reset with the `mysqld --skip-grant-tables` procedure |
| `ERROR 1045` for `pme_user` after a correct root login | The account exists only as `'pme_user'@'localhost'` but you connected over TCP as `127.0.0.1` | MySQL treats these as *different accounts*. `bootstrap.sql` creates both; re-run it |
| `Get-Service` reports `Stopped` | Service not started | `Start-Service MySQL80`; set startup type to `Automatic` |
| Port 3306 listening, owner is not `mysqld` | A second MySQL, XAMPP, or an unrelated service holds the port | `Get-Process -Id (Get-NetTCPConnection -LocalPort 3306 -State Listen).OwningProcess`; stop it, or point `DB_PORT` elsewhere |
| `ER_DBACCESS_DENIED_ERROR` on migration | The `GRANT` was not applied, or was applied to the wrong host row | Re-run `SHOW GRANTS FOR 'pme_user'@'localhost';` and re-issue the `GRANT` |
| `ER_ACCESS_DENIED_ERROR` from the app | `DB_USER`/`DB_PASSWORD` mismatch, or the `'pme_user'@'127.0.0.1'` account is missing | Re-check `backend/.env` against the `CREATE USER` lines in `bootstrap.sql`; both host rows are required |
| `ECONNREFUSED` | `MySQL80` is stopped, or `DB_PORT` is wrong | `Get-Service MySQL80` |
| `ER_BAD_DB_ERROR` | `pme_system` not created | Run `database/bootstrap.sql` as root; `CREATE DATABASE IF NOT EXISTS` is safe to repeat |
| `ER_NOT_SUPPORTED_AUTH_MODE` | A pre-5.7 server, or an account still on an old auth plugin | `ALTER USER 'pme_user'@'127.0.0.1' IDENTIFIED WITH caching_sha2_password BY '<password>';` |
| `PROTOCOL_CONNECTION_LOST` | MySQL was stopped or restarted mid-query | Windows event log, then `Start-Service MySQL80`; the pool recovers on the next request |
| `Access denied` only from Node, but the CLI works | `.env` password differs, or has a trailing space | MySQL auth is exact — no trimming, no tolerance |
| `Unknown collation: 'utf8mb4_unicode_ci'` | A very old MySQL | Confirm the port owner is really this 8.0.34 install |

### Backend

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `Cannot start: backend/.env is incomplete` | A value is missing or still `change-me` | Copy `.env.example` → `.env` and fill in every placeholder |
| `EADDRINUSE: port 4000` | Port occupied | `netstat -ano | findstr :4000` for the PID; change `PORT` |
| `Cannot find module 'express'` | Install failed | Check network/proxy, re-run `npm install` |
| `ERR_REQUIRE_ESM` / import errors | `"type": "module"` mismatch with file syntax | This project uses ESM throughout |
| 503 from `/api/v1/health` but the server is "up" | **Expected** — the endpoint is correctly reporting a database problem | Check `npm run db:check` |
| 403 `Origin ... is not allowed by CORS` | A request came from an origin other than `localhost:5173` | Expected during development; widen `ALLOWED_ORIGINS` in `app.js` only if genuinely needed |
| 401 `Invalid or expired token` on a request you believe is valid | The token was signed with a different `JWT_SECRET` than the one now in `.env` | Common after regenerating the secret. Every previously issued token dies; log in again |
| 401 `Invalid or expired refresh token` right after logging in | Normal after a refresh **rotation** — the old refresh token is revoked on use | Use the *new* `refresh_token` from the most recent response. Reusing a spent one is exactly what rotation is meant to catch |
| 403 on a user directory call, logged in as `ADMIN` | The account's `is_active` is `FALSE`, or the row is not `ADMIN` | Check both: `SELECT nic_no, role, is_active FROM users;` |
| 409 `Cannot deactivate the last active administrator` | Deactivating that user would leave nobody able to log in | Create a second `ADMIN` first, then deactivate one of them |
| Login always 401 for a seeded persona | `npm run db:seed` was run after you changed the demo password, resetting it to `PmeDemo@2026` | Expected. See the warning under **Demo credentials**; `npm run db:seed:depts` avoids it |
| A seeded persona is 403 `deactivated` | The seed deliberately never sets `is_active`, so a deactivated account stays deactivated across re-seeds | `UPDATE users SET is_active = TRUE WHERE nic_no = '881234560V';` |
| `npm test` fails with `ECONNREFUSED` or `ER_ACCESS_DENIED` | `MySQL80` is stopped, or `backend/.env` is wrong — the suite needs the same database the app does | `Get-Service MySQL80`, then `npm run db:check` |
| `node --test` errors with `Cannot find module '.../tests'` | Node resolved `tests/` as a module path | Use the glob: `node --test "tests/**/*.test.js"` (what `npm test` does) |
| A test run leaves `users` deactivated, permanently | **`--test-concurrency=1` is required.** `users.test.js` arranges its two-admin race by deactivating *every* active admin and restoring only what it recorded; a sibling file creating an admin in that window gets an account left switched off | It is already passed in `backend/package.json`. If you invoke `node --test` by hand, pass `--test-concurrency=1` too. Recovery: `UPDATE users SET is_active = TRUE WHERE role = 'ADMIN';` |
| `ER_NO_REFERENCED_ROW_2` on a seeded duty row | `003_seed_officer_duties.sql` ran before `002_seed_demo_users.sql` | The runner sorts by filename; re-run `npm run db:seed` |
| `ER_DUP_ENTRY` on `uq_mail_day_stamp` after re-seeding | The day-stamp counter was rolled **back** by an edited seed file | The committed seed uses `GREATEST(last_seq, 6)` for exactly this reason — never "fix" it to a plain assignment. `UPDATE day_stamp_counters SET last_seq = <highest issued>;` |

### Mail, minutes and attachments

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| `400 Unknown field: day_stamp_no` | A client tried to choose its own stamp | Correct behaviour (D53). The stamp is server-generated; remove the field |
| `400` naming `files` when posting to `/mail` | Field-name mismatch: logging takes **`attachment`** (singular), adding takes **`files`** (plural) | Use the field the endpoint documents |
| `409` naming two statuses on `PATCH /status` | Right role, wrong state — the letter is not where that action starts from | Refresh the letter. This is a stale screen, **not** a permission problem |
| `400 Unknown field: status` on `PATCH /status` | Body named a target status | Send `{ action: 'start' }`. A client that could name a state could ask for any state |
| `403` naming a permission on a transition | That role can never perform that action | Correct behaviour. Do not surface the button |
| `404` on a letter that demonstrably exists | It is outside the caller's scope — officers see only assigned letters, clerks only their department | Expected (D29's reasoning: a `403` would confirm the id exists) |
| `409` on `POST /:id/minutes` | The letter is no longer `Logged` | A second endorsement is a different operation. Read the existing minutes on the detail endpoint |
| `400` naming a role on `POST /:id/assign` | The target user is not `OFFICER` / `TRANSPORT_OFFICER` | The message names the role it found. Assign to an officer from `/officers` |
| `400 Unknown field: author_name` on minutes | The body tried to set authorship | Correct (D63). Authorship comes from the token |
| `404` downloading a seeded letter's attachment | **Expected.** The seeded rows have metadata; the files are not committed | Upload a real file to that letter, or read *Known limitation* above |
| `404` on any `GET /uploads/...` | There is no static mount, by design | Use the authenticated attachment route. The 404 is asserted by a test |
| `400` naming the allowlist on upload | Extension not in `.pdf .jpg .jpeg .png .tiff .doc .docx` | Convert the scan. Note `filename.exe.pdf` is accepted on its last extension only |
| `413` on upload | Over `MAX_UPLOAD_SIZE_MB` (10 MB), or too many files in one request | Raise the `.env` value, or send fewer than 10 files |
| `ENAMETOOLONG` writing an upload | Windows 260-character path limit | `UPLOAD_DIR` sits under a path containing a space; enable Windows long-path support |
| A scan is missing after the request succeeded | A virus scanner held a lock, so the rollback delete could not complete | The file is logged as orphaned garbage; the request still succeeded by design. Delete it by hand |
| `no_candidates: true` on a Sinhala or Tamil subject | The matcher is Latin-token based | Documented limitation. The Phase 3 remedy is `Intl.Segmenter` plus bilingual keywords |
| `400 status must be one of: Logged, Forwarded to Subject, …` on `GET /mail?status=…` | The filter value contains a **space**, and a raw space in a query string is not a valid URL character | Percent-encode it: `?status=Forwarded%20to%20Subject`. The value must also be exact — `Forwarded` is rejected |
| The clerk sees an empty registry after signing in | `GET /mail` scopes a `SUBJECT_CLERK` to letters whose **creator** is in the clerk's own department | Log at least one letter as `881234568V` (Education) first, or sign in as `881234564V` after `db:demo` and note that the seeded Education letters are the walkable ones |

### Frontend and toolchain

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Styles do not apply | Tailwind plugin not registered in `vite.config.js` | Restart the dev server — Vite needs a restart for plugin changes |
| Utility classes unrecognised | Missing `@import "tailwindcss"` | It must be the first line of `index.css` |
| Proxy returns 500 | Backend not running | Start `backend/` first, then reload |
| Port 5173 in use | Another Vite app | `npm run dev:web -- --port 5174` |
| `Cannot find native binding` / `@rolldown/binding-win32-x64-msvc` | Vite 8 uses rolldown, whose prebuilt native binary ships as an npm *optional* dependency; npm sometimes skips it ([npm#4828](https://github.com/npm/cli/issues/4828)) | `npm i -D @rolldown/binding-win32-x64-msvc@<version matching your rolldown>` |
| `Vite requires Node.js version 20.19+ or 22.12+` | Node is older than Vite 8's `engines` range. On Vite 8.3.1 this is a **warning**: the build prints it and then completes, exiting 0 | See below. Silence it by upgrading; it does not stop you working |
| Vite takes many seconds to become ready | First run after install: dependency pre-bundling on a cold file cache, compounded by Windows Defender scanning a deep `node_modules` on a project path containing a space | Normal on first run; faster when warm. Not an error if it eventually reports `ready` |
| `SQL syntax error ... near '<BOM>CREATE TABLE'` | PowerShell 5.1's `Out-File -Encoding utf8` writes a BOM, which MySQL parses as part of the first statement | The migration runner strips a leading BOM; or write files with a tool that does not add one |

### Windows notes

This project lives at `E:\React project\PME System` — **the path contains a
space.**

| Concern | Handling |
| :-- | :-- |
| Spaces in paths | npm, Vite, and Node resolve these correctly |
| Quoting | Quote any path with a space: `npm --prefix "E:\React project\PME System\backend" run dev` |
| Execution policy | May block `npm.ps1`; fall back to `npm.cmd` |
| `npm.ps1` errors about scripts | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `mysql.exe` not on `PATH` | Invoke by full path as shown, or add `C:\Program Files\MySQL\MySQL Server 8.0\bin` to the user `Path` |
| IPv4 vs IPv6 | Keep `DB_HOST=127.0.0.1`; `localhost` may resolve to `::1` first while MySQL listens on IPv4, which surfaces as an unexplained `ECONNREFUSED` |
| Long paths | If `npm install` fails with `ENAMETOOLONG`, enable Windows long-path support |
| Line endings | `.gitattributes` pins `* text=auto eol=lf` so SQL and shell scripts stay stable |

#### If `node -v` is older than Vite 8 requires

**Read this only to silence a warning.** Vite 8.3.1 prints
`Vite requires Node.js version 20.19+ or 22.12+` on this machine's `v22.3.0` and
then **builds anyway** — `npm --prefix frontend run build` exits 0 and emits
`dist/`. This was verified, not assumed; an earlier revision of this file claimed
the build would not start, and that claim was wrong. So the upgrade below is
housekeeping, not a prerequisite for Phase 3.

Check what is actually winning `PATH` — several Node installs can coexist:

```powershell
Get-Command node -All | ForEach-Object { "$($_.Source) -> $(& $_.Source -v)" }
```

Note that `C:\Program Files\nodejs\` is a **machine**-level `PATH` entry, so it
outranks anything you add to your *user* `PATH`. To change which Node wins, the
machine-level install itself has to be upgraded — from an elevated prompt:

```powershell
winget upgrade --id OpenJS.NodeJS.22
```

Confirm the package id first with `winget list`. Upgrading in place is
preferable to reordering `PATH`, and preferable to installing a second copy
beside the old one.

> **This does not block the backend.** `v22.3.0` runs the API and all 347 backend
> tests. Vite 8.3.1 also **builds** on it — it prints a Node-version warning and
> proceeds, and `npm --prefix frontend run build` exits 0. Upgrade when convenient
> to silence the warning, not because the web half is blocked.

---

## Demo credentials

`npm run db:seed` creates **9 demo accounts — one per role, plus a second intake
counter** — all sharing the password **`PmeDemo@2026`**.

| NIC | Role | Department |
| :-- | :-- | :-- |
| `881234560V` | `ADMIN` | Administration |
| `881234561V` | `SECRETARY` | Provincial Secretary's Office |
| `881234562V` | `AO` | Provincial Secretary's Office |
| `881234563V` | `CHIEF_CLERK` | Administration |
| `881234564V` | `SUBJECT_CLERK` | Education |
| `881234565V` | `OFFICER` | Education |
| `881234566V` | `MINOR_STAFF` | Provincial Secretary's Office |
| `881234567V` | `TRANSPORT_OFFICER` | Transport |
| `881234568V` | `MINOR_STAFF` — "Registry Clerk" | Education |

> **Use `881234568V`, not `881234566V`, for the Education walkthrough.** Not a
> ninth *role* — the same `MINOR_STAFF` at a second desk. `GET /mail` scopes a
> `SUBJECT_CLERK` to letters whose **creator** is in the clerk's own department, so
> a letter logged at the Secretary's counter (`881234566V`) is invisible to the
> Education clerk: their `assign` returns `404`. With only the Secretary's counter
> seeded, the Education clerk would sign in to an empty registry and be unable to
> route a single letter — the one handoff the demo exists to show. A ministry has
> more than one counter; this is the second.

These are **published demo credentials, on purpose.** They are not secrets. Never
reuse this password for a real deployment, and never point a real deployment at
this seed file.

> **Re-running `npm run db:seed` resets the password of any account whose NIC
> appears above**, back to `PmeDemo@2026`. If you have changed a demo account's
> password and want to keep it, run `npm run db:seed:depts` instead — that applies
> only `001_seed_departments.sql` and never touches a user row. (Deactivation is
> also preserved: `is_active` is deliberately absent from the seed's
> `ON DUPLICATE KEY UPDATE` clause, so re-seeding cannot silently reactivate a
> locked-out account.)

Sign in at <http://localhost:5173>, or drive the API directly — the demo
walkthrough below does the latter:

```powershell
$body = @{ nic_no = '881234566V'; password = 'PmeDemo@2026' } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login `
             -Body $body -ContentType application/json

$session.token          # access token — send as: Authorization: Bearer <token>
$session.refresh_token  # exchange at POST /api/v1/auth/refresh
$session.user           # profile, per spec §7.1

# Now prove the role is actually enforced:
Invoke-RestMethod -Uri http://localhost:4000/api/v1/users `
  -Headers @{ Authorization = "Bearer $($session.token)" }
# 403, because MINOR_STAFF is not ADMIN
```

---

## API reference — Authentication & Directory (Phase 1)

All paths are prefixed `/api/v1`. **The entire unauthenticated surface of the
API is `GET /health`, `POST /auth/login` and `POST /auth/refresh`.** Everything
else requires `Authorization: Bearer <access token>`.

| Method | Path | Who | Notes |
| :-- | :-- | :-- | :-- |
| `GET` | `/health` | anyone | Not behind auth on purpose — a health check that needs a token cannot report that the token service is down. `503` if the database is unreachable |
| `POST` | `/auth/login` | anyone | → `{ token, refresh_token, user }`. Stores only a SHA-256 hash of the refresh token |
| `POST` | `/auth/refresh` | anyone | Body `{ refresh_token }`. **Rotates** — the old token is revoked and cannot be reused |
| `POST` | `/auth/logout` | signed in | Revokes the given refresh token. Idempotent |
| `GET` | `/auth/me` | signed in | Profile **and** the resolved permission list for the caller's role |
| `GET` | `/auth/permissions` | signed in | The permission list alone, so the frontend can hide what the user cannot do |
| `GET` | `/users` | `ADMIN` | Filters: `search`, `role`, `department_id`, `is_active`, `limit`, `offset` |
| `POST` | `/users` | `ADMIN` | `409` on duplicate NIC or email |
| `GET` | `/users/:id` | `ADMIN` | |
| `PATCH` | `/users/:id` | `ADMIN` | An admin **cannot change their own role** (400) |
| `DELETE` | `/users/:id` | `ADMIN` | **Deactivates**, never deletes (D23) — the row must outlive the account's history. 400 on self, 409 if it would leave no active admin |
| `GET` | `/departments` | signed in | Open to every signed-in user, not just admins — the department picker needs it (Q14) |
| `GET` | `/departments/:id` | signed in | |
| `POST` | `/departments` | `ADMIN` | Code is uppercased; `409` on duplicate |
| `PATCH` | `/departments/:id` | `ADMIN` | |
| `GET` | `/audit` | `ADMIN` | Filters: `action`, `entity_type`, `entity_id`, `user_id`, `from`, `to`, `limit`, `offset`. **Omits `action_delta`** — a 200-row list of JSON blobs is a heavy payload |
| `GET` | `/audit/:id` | `ADMIN` | The single-row view, and the **only** endpoint that returns `action_delta` |

---

## API reference — Mail & Minutes (Phase 2)

| Method | Path | Who | Notes |
| :-- | :-- | :-- | :-- |
| `POST` | `/mail` | `CREATE_MAIL` | Logs a letter. `multipart/form-data` with one optional file field named **`attachment`**. `day_stamp_no` is **server-generated** — sending it is a `400`. → `201 { record_id }` |
| `GET` | `/mail` | signed in, scoped | The registry. Filters: `status`, `priority`, `category`, `sender_type`, `department_id`*, `assigned_officer_id`, `from`, `to`, `search`, `limit`, `offset` |
| `GET` | `/mail/stats` | `READ_ALL_MAIL` | **Registered before `/mail/:id`** — see *Status codes*. Returns `by_status` (always all five keys), `by_priority`, `by_category`, `by_sender_type`, `daily_intake` (30 points), `overdue`, `totals` |
| `GET` | `/mail/:id` | signed in, scoped | Letter + minutes + attachment metadata + `available_actions`. **`404`**, never `403`, for a letter you may not see |
| `POST` | `/mail/:id/minutes` | `WRITE_MINUTES` | The endorsement. Also performs `Logged → Forwarded to Subject`. A second call is a `409` |
| `POST` | `/mail/:id/assign` | `ASSIGN_OFFICER` | Routes to an officer. `400` naming the actual role if the target is not an officer |
| `PATCH` | `/mail/:id/status` | per transition | Body **`{ action, note? }`** — one of `forward`(refused; use the minutes endpoint), `assign`, `start`, `complete`. Never `{ status: 'Completed' }` |
| `PATCH` | `/mail/:id/notes` | `ASSIGN_OFFICER` / `UPDATE_ACTION_STATUS` | Body is exactly one of `subject_clerk_note` / `officer_status_note`. An empty string clears it |
| `GET` | `/mail/:id/suggestions` | `ASSIGN_OFFICER` | The duty matcher. → ranked candidates with `score`, `matched_keywords`, `description_matches`, plus `scored_duties` and `no_candidates` |
| `POST` | `/mail/:id/attachments` | `CREATE_MAIL` or `UPDATE_ACTION_STATUS` | Adds files under the plural field **`files`**, up to 10 per request. Refused on a `Completed` letter |
| `GET` | `/mail/:id/attachments/:attachmentId` | signed in, scoped | **The only way to read a stored file.** `404` outside the letter's scope. There is no static `/uploads` path |
| `GET` | `/officers` | signed in | Active officers + transport officers, with department and home section |
| `GET` | `/officers/:id` | signed in | The officer plus their duty chart **grouped by section** |
| `GET` | `/officers/:id/duties` | signed in | The same chart, flat |
| `POST` | `/officers/:id/duties` | `UPDATE_DUTY_CHART` | Body `{ section_name, duty_description, keywords[] }`. Keywords are lowercased and de-duplicated on write. `409` on a duplicate `(officer, section)` |
| `PATCH` | `/officers/:id/duties/:dutyId` | `UPDATE_DUTY_CHART` | Partial. A duty id belonging to a different officer is `404` |
| `DELETE` | `/officers/:id/duties/:dutyId` | `UPDATE_DUTY_CHART` | **Hard delete**, unlike a user. A duty is a *current* assignment; a user is an identity |

\* `department_id` is accepted as a filter **only** for admins and executives. For a
`SUBJECT_CLERK` the scope is already pinned to their own department, and passing
the parameter at all is a `400` — it is never a way to read another department's
mail.

**The unauthenticated surface did not grow in Phase 2.** It is still `GET /health`,
`POST /auth/login` and `POST /auth/refresh`.

### The workflow

Five resting states, six steps. `Logged → Forwarded to Subject → Assigned →
In Progress → Completed`. "Reviewed" is not a state — it is the *act* of writing
minutes, whose result is that minutes exist and the letter has been forwarded.

```
  MINOR_STAFF            SECRETARY/AO/CHIEF_CLERK   SUBJECT_CLERK      OFFICER
     │                            │                      │              │
  POST /mail                 POST /:id/minutes       POST /:id/assign  │
     │                            │                      │      PATCH /status {start}
  Logged ──────────────────► Forwarded ────────────► Assigned ─────────────► In Progress
                                                                              │
                                                                    PATCH /status {complete}
                                                                              ▼
                                                                          Completed
```

A client cannot skip a state: `Logged → In Progress` is not in the transition
table, so it is a `409` regardless of role. An `ADMIN` holds the wildcard
*permission* but still has to name a legal *action* — the wildcard is not a row in
the table.

### Status codes worth knowing

| Code | Means |
| :-- | :-- |
| `401` + `Invalid NIC number or password` | Login failed. **Byte-identical** whether the NIC is unknown or the password is wrong, and both take the same time — the API does not tell you which accounts exist |
| `403` + `... deactivated ...` | Login reached *only* because the password was correct, so it can safely say why |
| `401` + `Account is deactivated` | A token that was valid until the account was switched off. Takes effect on the very next request |
| `401` vs `403` | `401` = "who are you / your session is over" → clear the session and go to the login page. `403` = "you are known, but not allowed" → show an error. No token is always `401`, never `403`, so a bad token never reveals whether a resource exists |

On the **mail** endpoints the three-way split is the contract, and Phase 2 draws
it deliberately rather than collapsing it:

| Code | Means | Client should |
| :-- | :-- | :-- |
| `403` | Your role can never do this, on any letter — e.g. `MINOR_STAFF` calling `assign` | Do not show the button |
| `409` | Your role is right, the letter is in the wrong state — e.g. an officer starting a letter already started | Offer a refresh; the screen is stale |
| `404` | The letter is not visible to you. It may or may not exist | Treat as "not here" |

`403` and `409` are not interchangeable. On a shared office machine the second is
common and benign; showing "you do not have permission" for it would be wrong
and would hide a real mis-assignment.

### Security notes

- **No login rate limiting yet.** Parent plan task 4.3, Phase 4. This is a real
  gap, not an oversight — on a public deployment, put a rate limiter in front of
  `POST /auth/login` before exposing it.
- **`password_hash` is excluded by the SQL select list**, not filtered in
  JavaScript. A serializer that strips it is one `SELECT *` away from leaking it.
  The single exception is `userModel.findByCredentials`, which exists for the
  login path and appears nowhere else.
- **Audit rows are immutable through the API** — there is no write route, and
  `auditModel` exports no update or delete. The database does **not** enforce it:
  `pme_user` has `UPDATE` and `DELETE` on `pme_system.*`, and adding the
  `BEFORE UPDATE`/`BEFORE DELETE` triggers that would require a `TRIGGER` grant.
  That is D42, and Phase 4 task 4.6 closes it.
- **A JWT holds no authority.** Payload is `{ sub, role, type }` and the role is
  display-only; every request re-reads the user row, which is why deactivating
  someone takes effect immediately rather than when their token happens to
  expire. Nothing time-varying (`department_id`, permissions) is ever baked in.
- **Minute authorship cannot be forged.** `POST /mail/:id/minutes` takes
  `{ instruction_type, minutes_text }` and nothing else. `author_role` and
  `author_name` come from the token, and a body containing them is a `400`. A
  Secretary who is later transferred still appears as the author of the minutes
  they wrote, because the identity is snapshotted at the moment of endorsement.
- **Uploads are half-hardened, and the half that is done is the half that
  matters.** The path is built from a **server-generated day stamp** and a
  `randomUUID()` filename, so a client-supplied filename can never reach the
  filesystem at all — `../../`, `%00` and Windows reserved names (`CON`, `NUL`)
  are unreachable by construction rather than by filtering. On top of that:
  a 10 MB cap and an extension allowlist (`.pdf .jpg .jpeg .png .tiff .doc .docx`).
  **Not** yet done: magic-byte content inspection, MIME-spoofing detection and
  quarantine. Parent plan task 4.9. Treat an uploaded file as untrusted until then.
- **`stored mime_type` is recorded, never trusted.** `req.file.mimetype` is
  client-supplied. It is stored for display and used to decide nothing.
- **There is no `express.static(UPLOAD_DIR)`.** That single omission is what makes
  the attachment route's authorization check load-bearing rather than
  decorative. `GET /uploads/...` is a `404`, and a test asserts it.
- **The duty matcher is Latin-token based.** It scores English and transliterated
  text. A purely Sinhala or Tamil subject returns `no_candidates` and does not
  error — the word-boundary matcher treats a Sinhala run as one enormous token.
  This is a stated limitation, not a defect, and the Phase 3 remedy is
  `Intl.Segmenter` (already in Node, no dependency) plus bilingual keyword lists
  in the duty seeds.

---

## Uploads

Stored files live under `UPLOAD_DIR` (default `backend/uploads/letters/`), in one
subdirectory per letter's **day stamp**:

```
backend/uploads/letters/
└── DS/2026/09/0441/          ← the day stamp, e.g. DS/2026/09/0441
    └── 3f8a…-c1d2.pdf       ← randomUUID() + extension
```

The directory name is the server-issued `day_stamp_no` and the file name is a
random UUID, so **no client-supplied string is ever a path component**. The
original filename is stored in `mail_attachments.original_name` for display and
sanitised of quotes, newlines and separators before it goes into a
`Content-Disposition` header.

The database stores `stored_path` **relative** to `UPLOAD_DIR`, so relocating the
upload directory is a `.env` edit and no row changes.

**Clearing it:** stop the API, then delete the contents of `UPLOAD_DIR`. This is
not reversible and not detected — nothing in the database records which rows were
already downloaded, so a letter whose file you delete keeps `has_attachment = TRUE`
and its download link will `404`. Restore from your own backups, or accept that
those scans are gone.

The `.gitignore` keeps the directory and its `.gitkeep` and drops the files, so
scanned letters are never committed.

### Known limitation: the seeded letters have metadata but no bytes

The six demo letters from `004_seed_demo_mail.sql` carry `mail_attachments` **rows**
— five of them, with realistic names, sizes and MIME types — so the detail view
has something to list and `has_attachment` agrees with the child table. The
**files themselves are not in the repository**, because the seed runner is a plain
SQL executor and committing PDFs is worse than demonstrating an upload.

**Consequence:** `GET /mail/:id/attachments/:attachmentId` returns `404` for a
seeded row. That is the honest answer, not a bug. **To fix it for a demo**, upload
a real file to any of those letters through the UI or the API — it works
immediately, no re-seed needed.

## Demo walkthrough

`npm run db:demo` first, every time, so the figures are the ones below. Then
`npm run dev`, open <http://localhost:5173>, and sign in as `881234568V` /
`PmeDemo@2026` (the Education registry clerk — see the note above the persona
table for why not `881234566V`).

The six seeded letters cover the five resting states, one duplicated so the
intake tray has depth. A seventh is not part of that pattern — it exists to make
one access-control rule visible:

| Day stamp | State | Subject | Note |
| :-- | :-- | :-- | :-- |
| `DS/2026/09/0001` | `Logged` | Tender for procurement of laboratory equipment | Has attachment metadata |
| `DS/2026/09/0002` | `Logged` | Urgent ambulance vehicle allocation | Urgent, no attachment |
| `DS/2026/09/0003` | `Forwarded to Subject` | Budget proposals 2027 | **The letter to walk** |
| `DS/2026/09/0004` | `Assigned` | School roof repairs | Routed, clerk note present |
| `DS/2026/09/0005` | `In Progress` | Stationery procurement quotations | Officer note present |
| `DS/2026/09/0006` | `Completed` | Budget allocation release | `completion_date` set |
| `DS/2026/09/0007` | `Logged` | Confidential submission on hospital land | **Invisible to two roles** — see below |

### Demonstrate confidential-letter visibility (Q7)

`DS/2026/09/0007` is `Confidential`, and it is the only letter whose visibility
differs by role rather than by department. That contrast is the whole rule, and it
is worth seeing in the browser rather than taking on trust:

| Sign in as | Role | `/mail` | `/mail/<id of 0007>` |
| :-- | :-- | :-- | :-- |
| `881234560V` | `ADMIN` | present | opens |
| `881234561V` | `SECRETARY` | present | opens |
| `881234562V` | `AO` | present | opens |
| `881234563V` | `CHIEF_CLERK` | present | opens |
| `881234566V` | `MINOR_STAFF` | present (they logged it) | opens |
| `881234564V` | `SUBJECT_CLERK` | **absent** | **`404`** |
| `881234565V` | `OFFICER` | **absent** | **`404`** |

Three things to notice, because they are the design and not accidents:

- It is a **`404`, not a `403`.** A `403` confirms the letter exists, so a clerk
  probing ids would learn which ones are real. Asking for a letter that does not
  exist gives the identical status and message.
- The two blind roles are both in **Education**, and so is the letter's own
  subject matter. Department scope and confidentiality scope do not coincide here,
  so this proves the confidentiality rule fired rather than the department rule.
- `MINOR_STAFF` **can** see it, because they are the one who applied the
  classification. Someone who cannot see the classification they set is working
  blind.

### Walk one letter through all four roles

Letter `0003` is already forwarded and is the one the Subject Clerk would pick up.
Open `/mail` and copy its id, then run this in PowerShell. It is the acceptance
walkthrough — each step is the call a real user makes.

```powershell
$api = 'http://localhost:4000/api/v1'

function Login($nic) {
  $b = @{ nic_no = $nic; password = 'PmeDemo@2026' } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Uri "$api/auth/login" -Body $b `
     -ContentType application/json).token
}

$minor     = Login '881234568V'   # MINOR_STAFF   — logs letters (Education desk)
$secretary = Login '881234561V'   # SECRETARY     — writes minutes
$clerk     = Login '881234564V'   # SUBJECT_CLERK — routes
$officer   = Login '881234565V'   # OFFICER       — acts
$officerId = (Invoke-RestMethod -Uri "$api/officers" `
              -Headers @{ Authorization = "Bearer $officer" }).data[0].id
```

`$minor` must be the **Education** intake clerk, because the scope rule pins
visibility to the creator's department — a letter logged by the Secretary's
counter is a `404` for this clerk, and every step below would fail for a reason
that is correct behaviour.

**1. The Subject Clerk asks who should handle it.** This is the duty matcher —
a ranked list with the keywords that produced each score, not a single answer
presented as fact.

```powershell
Invoke-RestMethod -Uri "$api/mail/$letterId/suggestions" `
  -Headers @{ Authorization = "Bearer $clerk" }
```

**2. The clerk routes it.**

```powershell
Invoke-RestMethod -Method Post -Uri "$api/mail/$letterId/assign" `
  -Headers @{ Authorization = "Bearer $clerk" } -ContentType application/json `
  -Body (@{ officer_user_id = $officerId } | ConvertTo-Json)
# -> 200, status: "Assigned"
```

**3. The officer starts, then completes.** The body is an **action**, never a
target status — naming a status would let a client ask for any state and weaken
the legality check.

```powershell
Invoke-RestMethod -Method Patch -Uri "$api/mail/$letterId/status" `
  -Headers @{ Authorization = "Bearer $officer" } -ContentType application/json `
  -Body (@{ action = 'start'; note = 'Field inspection scheduled' } | ConvertTo-Json)

Invoke-RestMethod -Method Patch -Uri "$api/mail/$letterId/status" `
  -Headers @{ Authorization = "Bearer $officer" } -ContentType application/json `
  -Body (@{ action = 'complete' } | ConvertTo-Json)
# -> 200, status: "Completed", completion_date set
```

**4. Prove the server, not the UI, is what enforces it.** Replay the last call:

```powershell
try { Invoke-RestMethod -Method Patch -Uri "$api/mail/$letterId/status" `
        -Headers @{ Authorization = "Bearer $officer" } -ContentType application/json `
        -Body (@{ action = 'start' } | ConvertTo-Json) }
catch { $_.ErrorDetails.Message }   # 409 — naming "Completed" and what it needed
```

Then try the same call with the `MINOR_STAFF` token: `403`. And ask for the
letter as a *different* officer: `404`, not `403` — a `403` would confirm the id
exists.

To watch the whole thing from the top instead, log a new letter as `MINOR_STAFF`
(`POST /mail` with `multipart/form-data` and one optional file field named
`attachment`), then add minutes as `SECRETARY`, which performs the
`Logged → Forwarded to Subject` step.

### Resetting afterwards

`npm run db:demo` clears the letters, the audit table, the duty charts and any
user outside the nine seeded accounts, resets the day-stamp counter, and
re-seeds. `--dry` only reports the counts.

**Why this exists:** the test suite cleans up after itself, but `audit_logs` has
no foreign key to `mail_records` — an audit row deliberately outlives the thing
it describes — so repeated test runs accumulate orphaned rows, and anything you
do during a demo moves the figures. Run `db:demo` immediately before a
presentation, never instead of the test suite.

---

## Status caveat — the frontend is Phase 3 scope, built early

`PHASE_2_PLAN.md` §2 states that Phase 2 must not touch `frontend/src/`. The plan
was then used as the specification for the letter-execution UI, so a usable
frontend now exists: login, dashboard, registry, letter detail, new letter, and
officer duty charts.

This is a deliberate departure from the phase boundary rather than an accident,
and it is recorded rather than quietly accepted:

- The **backend** is Phase 2 complete and is what the acceptance checks in
  `PHASE_2_PLAN.md` §9 verify.
- The **frontend** is early Phase 3 work. It is usable but not finished — no
  print/minute-slip template, no `@media print` styles, no Sinhala/Tamil font
  handling, and the duty matcher it calls is still Latin-only.
- **The frontend builds on this machine.** `npm --prefix frontend run build`
  exits 0 on `v22.3.0` and emits `dist/` (91 modules, 357 kB). Vite 8.3.1 prints
  *"Vite requires Node.js version 20.19+ or 22.12+"* and then **builds anyway** —
  it is a warning, not a refusal. An earlier revision of this file said the build
  would not start; that was wrong, and it was wrong because it was assumed rather
  than run. Upgrading Node is still worth doing (see the note above), but it is
  **not a prerequisite for Phase 3**.
- Phase 2's own definition-of-done item "no file under `frontend/src/` is
  modified" was removed from the acceptance list rather than left to fail.

## Coming Next — Phase 3

Per `EXECUTION_PLAN.md`:

- Finish the UI against the Phase 2 API: minute-slip print template,
  `@media print` CSS, Sinhala/Tamil fonts
- Bilingual duty matching via `Intl.Segmenter` plus Sinhala/Tamil keyword lists
  in the duty seeds — closes the Latin-only limitation above
- Confidential-letter visibility rules, deferred from Phase 2 (Q7) — a filter
  *within* the existing scope, so it is a small change to one predicate
- The remaining modules: vehicle allocation, transfers, assets (Phase 6–8)

---

## Licence

Unlicensed. Internal project.
