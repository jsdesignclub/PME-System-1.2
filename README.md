# PME System — Provincial Ministry Enterprise Management System

A modular web application for managing provincial ministry enterprises.

**Status: Phase 0 (Environment & Foundation) complete.** The database, backend
API, and frontend shell all start and talk to each other. There is no
application logic yet — no auth, no modules, no real UI. Phase 0 exists so that
Phase 1 can be *verified*, not merely written.

---

## Prerequisites

| Tool | Required | Notes |
| :-- | :-- | :-- |
| Node.js | `^20.19.0 \|\| >=22.12.0` | Required by Vite 8. Check with `node -v`. |
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

### 6. Verify

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health   # status=ok, db=connected
Invoke-RestMethod http://localhost:5173/api/v1/health   # same JSON, via the Vite proxy
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
│   ├── migrate.js            # migration + seed runner (up | status | seed)
│   ├── migrations/           # 001_*.sql, applied in filename order
│   └── seeds/                # re-runnable .sql
├── backend/
│   ├── server.js             # entrypoint; validates config, then listens
│   ├── config/db.js          # mysql2 pool + testConnection()
│   ├── config/jwt.js         # JWT config validation
│   ├── middleware/errorHandler.js
│   ├── routes/index.js       # mounts GET /api/v1/health
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

### Migrations

Numbered filename prefixes (`001_`, `002_`) guarantee ordering regardless of
filesystem alphabetisation. Each file is applied in its own transaction and
recorded in `schema_migrations`. Note that MySQL auto-commits DDL, so a
failure partway through a multi-statement file may leave earlier statements in
place — the recovery path is a corrective migration, not a rollback. Use
`npm run db:migrate:status` to see what is applied; it also flags a migration
recorded as applied whose file has since been deleted.

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
| 403 `Origin ... is not allowed by CORS` | A request came from an origin other than `localhost:5173` | Expected during development; widen `ALLOWED_ORIGINS` in `server.js` only if genuinely needed |

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

---

## Demo credentials

None yet. Phase 0 creates an empty database — there are no users to log in
with, and no login form to log in to. User accounts, roles, password hashing,
and JWT issuance arrive in **Phase 1**, seeded by `database/seeds/`.

---

## Coming Next — Phase 1

Per `EXECUTION_PLAN.md`, expected to cover authentication and the core schema:

- First migration set: users, roles, and permissions
- Password hashing (`bcryptjs`) and login
- JWT access + refresh token issuance
- Auth middleware and role-based route protection
- `seed_users.sql` and the first real demo accounts
- Backend test suite bootstrap in `backend/tests/`

---

## Licence

Unlicensed. Internal project.
