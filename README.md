# PME System — Provincial Ministry Enterprise Management System

A modular web application for managing provincial ministry enterprises.

**Status: Phase 1 (Authentication, RBAC & User Directory) complete.** You can log
in, and the API enforces role-based access against a real user directory with a
full audit trail behind it. There is still no application logic — no mail, no
minutes, no UI beyond the shell. Phase 1 exists so that everything later is
*verified*, not merely written.

---

## Prerequisites

| Tool | Required | Notes |
| :-- | :-- | :-- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Required by Vite 8 (Phase 3). The current `v22.3.0` runs the backend and its tests fine — see below. |
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
npm run db:migrate      # 4 files: departments, users, refresh_tokens, audit_logs
npm run db:seed         # 7 departments + 8 demo personas
```

Both are safe to re-run. Migrations skip anything already applied; seeds use
`ON DUPLICATE KEY UPDATE`. See **Demo credentials** below for what the seed
contains and one important warning about re-running it.

### 7. Verify

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health   # status=ok, db=connected
Invoke-RestMethod http://localhost:5173/api/v1/health   # same JSON, via the Vite proxy

# And that auth actually works end to end:
$body = @{ nic_no = '881234560V'; password = 'PmeDemo@2026' } | ConvertTo-Json
(Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/v1/auth/login `
   -Body $body -ContentType application/json).token
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
| `npm test` | Backend test suite — 73 tests, needs MySQL running |

Backend-only commands, from `backend/`:

| Command | Effect |
| :-- | :-- |
| `npm start` | Start the API alone (`:4000`) |
| `npm run dev` | Start the API with `nodemon` |
| `npm run hash-password -- "some password"` | Generate a bcrypt hash for a seed file |
| `npm test` | The same 73 tests |

The test suite boots the app on an **ephemeral port**, so it never collides with
a `npm run dev` you already have running. It does need `MySQL80`.

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
| `UPLOAD_DIR` | `uploads/letters` | Phase 2 |
| `MAX_UPLOAD_SIZE_MB` | `10` | Phase 2 |

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
│   ├── migrations/           # 001_*.sql, applied in filename order
│   │   ├── 001_departments.sql
│   │   ├── 002_users.sql     # incl. the 8-value role ENUM
│   │   ├── 003_refresh_tokens.sql
│   │   └── 004_audit_logs.sql
│   └── seeds/                # re-runnable .sql
│       ├── 001_seed_departments.sql   # 7 departments
│       └── 002_seed_demo_users.sql    # 8 personas, literal bcrypt hashes
├── backend/
│   ├── app.js                # the Express app — no listen(), so tests can import it
│   ├── server.js             # entrypoint: validates config, then listens
│   ├── config/
│   │   ├── db.js             # mysql2 pool + testConnection()
│   │   └── jwt.js            # config validation + sign/verify
│   ├── controllers/          # auth, user, department, audit
│   ├── middleware/           # auth, role, audit, errorHandler
│   ├── models/               # user, department, refreshToken, audit
│   ├── routes/               # index.js registry + one router per module
│   ├── scripts/hash-password.js     # bcrypt hash generator for seeds
│   ├── tests/                # 73 tests, node --test
│   │   └── helpers/          # app boot, fixtures (self-cleaning)
│   ├── utils/                # password, permissions, validate, transaction
│   ├── uploads/letters/      # upload target (Phase 2)
│   ├── .env.example          # committed contract
│   └── .env                  # git-ignored; the only place real secrets live
└── frontend/
    ├── vite.config.js        # Tailwind plugin + /api proxy to :4000
    └── src/
        ├── index.css         # @theme tokens (navy, gold)
        ├── App.jsx           # themed shell
        └── main.jsx
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

### Frontend and toolchain

| Symptom | Cause | Fix |
| :-- | :-- | :-- |
| Styles do not apply | Tailwind plugin not registered in `vite.config.js` | Restart the dev server — Vite needs a restart for plugin changes |
| Utility classes unrecognised | Missing `@import "tailwindcss"` | It must be the first line of `index.css` |
| Proxy returns 500 | Backend not running | Start `backend/` first, then reload |
| Port 5173 in use | Another Vite app | `npm run dev:web -- --port 5174` |
| `Cannot find native binding` / `@rolldown/binding-win32-x64-msvc` | Vite 8 uses rolldown, whose prebuilt native binary ships as an npm *optional* dependency; npm sometimes skips it ([npm#4828](https://github.com/npm/cli/issues/4828)) | `npm i -D @rolldown/binding-win32-x64-msvc@<version matching your rolldown>` |
| `Vite requires Node.js version 20.19+ or 22.12+` | Node is older than Vite 8 supports | See below |
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

> **This does not block Phase 1 or 2.** `v22.3.0` runs the API and all 73 backend
> tests. It only blocks **Phase 3**, when Vite 8 first starts. Do it before
> starting Phase 3, not before continuing this one.

---

## Demo credentials

`npm run db:seed` creates **8 demo personas — one per role** — all sharing the
password **`PmeDemo@2026`**.

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

There is no login form yet — the frontend is still a shell. Use the API directly:

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

## API reference (Phase 1)

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

### Status codes worth knowing

| Code | Means |
| :-- | :-- |
| `401` + `Invalid NIC number or password` | Login failed. **Byte-identical** whether the NIC is unknown or the password is wrong, and both take the same time — the API does not tell you which accounts exist |
| `403` + `... deactivated ...` | Login reached *only* because the password was correct, so it can safely say why |
| `401` + `Account is deactivated` | A token that was valid until the account was switched off. Takes effect on the very next request |
| `401` vs `403` | `401` = "who are you / your session is over" → clear the session and go to the login page. `403` = "you are known, but not allowed" → show an error. No token is always `401`, never `403`, so a bad token never reveals whether a resource exists |

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

---

## Coming Next — Phase 2

Per `EXECUTION_PLAN.md`, expected to cover the mail register and the backend
module that Phase 3 will draw:

- Mail register, dispatch and file-close workflows
- Official minutes and duty-chart matching (the routing engine behind
  `SUBJECT_CLERK`)
- Document upload — `multer` and `backend/uploads/letters/` are already wired
- The Phase 3 frontend: login page, then the eight dashboards

**Before Phase 3:** Node must be upgraded to `^20.19.0 || >=22.12.0` for Vite 8.
The current `v22.3.0` is fine for the backend and its tests, but Vite 8 will
refuse to start. See **If `node -v` is older than Vite 8 requires** above.

---

## Licence

Unlicensed. Internal project.
