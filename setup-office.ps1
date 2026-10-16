#Requires -Version 5.1
<#
.SYNOPSIS
  Configure the PME System on a machine that has never run it before.

.DESCRIPTION
  Runs the whole first-run sequence for a fresh Windows PC, in the order the
  layers actually depend on each other, and stops at the first thing that is
  genuinely wrong instead of pressing on:

      1. preflight      Node, npm, the project files
      2. dependencies   npm install for root, backend, frontend
      3. database       MySQL service running, mysql.exe located
      4. environment    backend/.env written or reused
      5. reachability   proved with the project's own `npm run db:check`
      6. schema         bootstrap.sql as root, then the tables
      7. demo data      optional, and only if you ask for it

  Re-running it is safe. If the database already answers, step 6 is skipped
  entirely and nothing is created, dropped or re-passworded.

  Why it stops instead of continuing: every step below is a precondition for the
  next one, and a wrong password in step 6 surfaces in step 8 as a 403 about
  something that is not permissions. Failing at the real step is the difference
  between a two-minute fix and an afternoon.

.PARAMETER SkipInstall
  Assume node_modules is already present. Useful on a second run, and on an
  offline PC where the dependencies were copied across.

.PARAMETER Seed
  Seed the demo departments, accounts and letters without being asked. Off by
  default because `db:seed` RESETS the password of every account in
  002_seed_demo_users.sql back to PmeDemo@2026.

.PARAMETER RestoreFrom
  Path to a mysqldump file taken from another machine. When given, the schema is
  restored from it instead of being built by migrations + seed, which is how you
  bring real letters across rather than demo data.

.PARAMETER WhatMysql
  Full path to mysql.exe, for a PC where the automatic search cannot find it --
  an unusual install root, or a 32-bit install under Program Files (x86).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-office.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-office.ps1 -RestoreFrom D:\pme_system.sql
#>
[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$Seed,
  [string]$RestoreFrom,
  [string]$WhatMysql
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Paths
#
# Resolved from this file's own location, never from the shell's working
# directory, so the script behaves identically whether it is double-clicked,
# run from the repository root, or started from a scheduled task. Same rule as
# database/migrate.js.
# ---------------------------------------------------------------------------
$Root        = $PSScriptRoot
$EnvExample  = Join-Path $Root 'backend\.env.example'
$EnvFile     = Join-Path $Root 'backend\.env'
$BootstrapSql= Join-Path $Root 'database\bootstrap.sql'

$script:StepNo = 0

function Write-Step {
  param([string]$Message)
  $script:StepNo++
  Write-Host ''
  Write-Host ("=" * 74) -ForegroundColor DarkCyan
  Write-Host (" STEP {0}  {1}" -f $script:StepNo, $Message) -ForegroundColor Cyan
  Write-Host ("=" * 74) -ForegroundColor DarkCyan
}

function Write-Ok   { param([string]$m) Write-Host "  [ok]   $m" -ForegroundColor Green }
function Write-Info { param([string]$m) Write-Host "  [info] $m" -ForegroundColor Gray }
function Write-Warn { param([string]$m) Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Write-Err  { param([string]$m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

# Run a native command and abort the whole script if it reports failure.
#
# PowerShell does NOT throw on a non-zero exit code from an external program --
# $ErrorActionPreference has no effect on it -- so every call has to be checked
# by hand or a failed `npm install` sails straight through to the next step.
#
# This reports through Stop-With rather than `throw`. A throw would be caught by
# nothing, and $ErrorActionPreference='Stop' would turn it into a PowerShell
# stack trace with the script's own line numbers in it -- technically accurate,
# and useless to someone standing at an unfamiliar PC. Stop-With prints the
# reason and the specific things to check, which is the entire reason this script
# exists.
function Invoke-Checked {
  param(
    [Parameter(Mandatory)][string]$FilePath,
    [Parameter(Mandatory)][string[]]$Arguments,
    [string]$What,
    [string[]]$Hints = @()
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Stop-With "$What failed (exit code $LASTEXITCODE)." $Hints
  }
}

function Stop-With {
  param([string]$Message, [string[]]$Hints = @())
  Write-Host ''
  Write-Host ' SETUP STOPPED' -ForegroundColor Red
  Write-Host " $Message" -ForegroundColor Red
  if ($Hints.Count -gt 0) {
    Write-Host ''
    Write-Host ' What to check:' -ForegroundColor Yellow
    foreach ($h in $Hints) { Write-Host "   - $h" -ForegroundColor Yellow }
  }
  Write-Host ''
  exit 1
}

# ---------------------------------------------------------------------------
# STEP 1 — preflight
# ---------------------------------------------------------------------------
Write-Step 'Checking prerequisites'

if (-not (Test-Path -LiteralPath $EnvExample)) {
  Stop-With "backend\.env.example is missing, so this does not look like the project root ($Root)." @(
    'Run the script from inside the PME System folder.',
    'If you copied only some folders, copy backend\ and database\ as well.'
  )
}
if (-not (Test-Path -LiteralPath $BootstrapSql)) {
  Stop-With 'database\bootstrap.sql is missing.' @(
    'The whole database setup depends on it. Re-copy the database\ folder.'
  )
}
Write-Ok "Project root: $Root"

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Stop-With 'Node.js is not installed, or not on PATH.' @(
    'Install Node.js LTS from https://nodejs.org and reopen PowerShell.',
    'This script cannot help until node and npm exist.'
  )
}

$nodeVersion = (& node -v) -replace '^v', ''
Write-Ok "Node.js $nodeVersion"

# npm resolves to npm.ps1 under PowerShell, and that shim is a common casualty of
# the default execution policy. npm.cmd is the same program without the shim, so
# it is preferred here and removes a whole class of "npm.ps1 cannot be loaded".
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue)
if ($npmCmd) { $npm = $npmCmd.Source }
else {
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npmCmd) {
    Stop-With 'npm is not installed, or not on PATH.' @(
      'It ships with Node.js. Reinstall Node.js, or add it to PATH.'
    )
  }
  $npm = $npmCmd.Source
  Write-Warn 'npm.cmd not found; falling back to npm. If you see an execution-policy error, use npm.cmd.'
}
Write-Ok "npm $(& $npm -v)"

# ---------------------------------------------------------------------------
# STEP 2 — dependencies
# ---------------------------------------------------------------------------
Write-Step 'Installing dependencies'

if ($SkipInstall) {
  Write-Warn 'Skipped because -SkipInstall was given.'
  foreach ($p in @('node_modules', 'backend\node_modules', 'frontend\node_modules')) {
    $full = Join-Path $Root $p
    if (-not (Test-Path -LiteralPath $full)) {
      Stop-With "-SkipInstall was given but $p does not exist." @(
        'Drop -SkipInstall and let the script install, or copy node_modules across manually.'
      )
    }
  }
  Write-Ok 'node_modules present in all three.'
} else {
  Write-Info 'This is the slow part on a USB drive. It can take several minutes.'
  Write-Info 'Defender scanning a deep node_modules on a removable disk is usually why.'
  foreach ($p in @('', 'backend', 'frontend')) {
    $label = if ($p) { $p } else { 'root' }
    Write-Host ''
    Write-Host "  -> npm install ($label)" -ForegroundColor Cyan
    if ($p) {
      Invoke-Checked -FilePath $npm -Arguments @('--prefix', $p, 'install', '--no-audit', '--no-fund') `
        -What "npm install ($label)"
    } else {
      Invoke-Checked -FilePath $npm -Arguments @('install', '--no-audit', '--no-fund') `
        -What 'npm install (root)'
    }
    Write-Ok "$label installed"
  }
}

# ---------------------------------------------------------------------------
# STEP 3 — the database server
# ---------------------------------------------------------------------------
Write-Step 'Checking the MySQL server'

$mysqlService = Get-Service -Name 'MySQL*' -ErrorAction SilentlyContinue |
  Select-Object -First 1

if (-not $mysqlService) {
  Stop-With 'No MySQL service is installed on this PC.' @(
    'Install MySQL Server 8.0 (the SERVER installer, not MySQL Workbench).',
    'During setup: set a root password, and keep the service name MySQL80.',
    'Then run this script again.'
  )
}
Write-Ok "Found service '$($mysqlService.Name)' ($($mysqlService.Status))"

if ($mysqlService.Status -ne 'Running') {
  Write-Info 'Service is not running; trying to start it.'
  try {
    Start-Service -Name $mysqlService.Name -ErrorAction Stop
  } catch {
    Stop-With 'Could not start the MySQL service.' @(
      "This usually means PowerShell is not running as Administrator.",
      'Right-click PowerShell > Run as administrator, then run this script again.',
      "Or start it in Services.msc: $($mysqlService.Name)"
    )
  }
  Start-Sleep -Seconds 3
  $mysqlService = Get-Service -Name $mysqlService.Name
  if ($mysqlService.Status -ne 'Running') {
    Stop-With "The MySQL service did not reach Running (it is $($mysqlService.Status))." @(
      'Check the Windows Event Viewer, or MySQL error log, for why it aborted.',
      "Data dir: C:\ProgramData\MySQL\$($mysqlService.Name)\Data"
    )
  }
}
Write-Ok 'MySQL is running.'

# Locate mysql.exe. Hardcoding "MySQL Server 8.0" breaks on any other version,
# and the office PC may well have 8.4, or a different install root entirely.
if ($WhatMysql) {
  if (-not (Test-Path -LiteralPath $WhatMysql)) {
    Stop-With "-WhatMysql was given but the file does not exist: $WhatMysql" @(
      'Give the full path to mysql.exe, ending in \bin\mysql.exe.'
    )
  }
  $mysqlExe = (Resolve-Path -LiteralPath $WhatMysql).Path
  Write-Ok "mysql.exe (from -WhatMysql): $mysqlExe"
} else {
  $mysqlExe = Get-ChildItem 'C:\Program Files\MySQL' -Recurse -Filter 'mysql.exe' `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.DirectoryName -like '*bin*' } |
    Select-Object -First 1 -ExpandProperty FullName

  if (-not $mysqlExe) {
    # A 32-bit install lands outside "Program Files", and the recursive search
    # under Program Files (x86) is shallow on purpose -- a deep scan of a whole
    # Program Files tree is slow enough to look like a hang.
    $mysqlExe = Get-ChildItem 'C:\Program Files (x86)\MySQL' -Recurse -Filter 'mysql.exe' `
      -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $mysqlExe) {
    $mysqlExe = Get-ChildItem 'C:\Program Files' -Recurse -Depth 4 -Filter 'mysql.exe' `
      -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  }
  if (-not $mysqlExe) {
    Stop-With 'Found the MySQL service but not mysql.exe.' @(
      'It is normally under C:\Program Files\MySQL\MySQL Server <version>\bin.',
      'Find it, then re-run with:  -WhatMysql "C:\path\to\mysql.exe"'
    )
  }
  Write-Ok "mysql.exe: $mysqlExe"
}

# Is anything actually answering on 3306? The service can be Running with the
# server still initialising, and the first connection attempt would then fail
# with a confusing protocol error rather than a connection error.
$portReady = $false
foreach ($attempt in 1..10) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('127.0.0.1', 3306, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(2000) -and $client.Connected) {
      $portReady = $true
      break
    }
  } catch {
    # not up yet; fall through to the sleep
  } finally {
    $client.Close()
  }
  Start-Sleep -Seconds 2
}
if (-not $portReady) {
  Stop-With 'The MySQL service is running but nothing is listening on 127.0.0.1:3306.' @(
    'Another program may own port 3306:',
    '  Get-NetTCPConnection -LocalPort 3306 -State Listen',
    'MySQL also writes why it failed to C:\ProgramData\MySQL\<service>\Data\*.err'
  )
}
Write-Ok 'Port 3306 is accepting connections.'

# ---------------------------------------------------------------------------
# STEP 4 — backend\.env
# ---------------------------------------------------------------------------
Write-Step 'Preparing backend\.env'

# Read a single key out of an existing .env. Returns $null when the file or key
# is absent, or when the value is still the placeholder -- which is the case
# that matters, because a `change-me` password must never be mistaken for a
# working one.
function Get-EnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } |
    Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -split '=', 2)[1].Trim()
  if ($value -eq '' -or $value -like '*change-me*') { return $null }
  return $value
}

$existingDbPassword = Get-EnvValue -Path $EnvFile -Key 'DB_PASSWORD'
$existingJwtSecret = Get-EnvValue -Path $EnvFile -Key 'JWT_SECRET'

if ($existingDbPassword) {
  Write-Ok 'backend\.env already holds a real DB_PASSWORD; it will be reused.'
  $dbPassword = $existingDbPassword
} else {
  Write-Info 'No usable DB_PASSWORD in backend\.env yet.'
  $suggestion = -join ((1..32) | ForEach-Object { '0123456789abcdef'[(Get-Random -Maximum 16)] })
  Write-Host ''
  Write-Host "  Suggested password: $suggestion" -ForegroundColor White
  Write-Host '  Press Enter to use it, or type your own.' -ForegroundColor Gray
  $typed = Read-Host '  App database password'
  $dbPassword = if ($typed) { $typed.Trim() } else { $suggestion }
  if ($dbPassword.Length -lt 12) {
    Write-Warn 'That is shorter than 12 characters. Acceptable for a demo, weak for real use.'
  }
}

if (-not $existingJwtSecret) {
  Write-Info 'Generating a new JWT_SECRET.'
  $jwtSecret = & node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
} else {
  Write-Ok 'Reusing the existing JWT_SECRET from backend\.env.'
  $jwtSecret = $existingJwtSecret
}

# ---------------------------------------------------------------------------
# STEP 5 — is the database already usable?
# ---------------------------------------------------------------------------
Write-Step 'Testing the existing configuration'

# `npm run db:check` is the project's own probe, and it is used here in
# preference to a hand-rolled mysql call for one reason: it reads backend\.env
# the same way the server does. A hand-rolled test can pass while the app still
# fails, which is a worse outcome than not testing.
$alreadyConfigured = $false
if ($existingDbPassword) {
  Write-Info 'Probing with the credentials already in backend\.env ...'
  & $npm run --silent db:check 2>&1 | ForEach-Object { Write-Host "       $_" -ForegroundColor DarkGray }
  $alreadyConfigured = ($LASTEXITCODE -eq 0)
}

if ($alreadyConfigured) {
  Write-Ok 'The database already answers with these credentials. Nothing to create.'
} else {
  Write-Info 'The database does not answer yet. It will be created.'

  Write-Host ''
  Write-Host '  MySQL will now ask for the ROOT password.' -ForegroundColor Yellow
  Write-Host '  That is the one you chose while installing MySQL Server.' -ForegroundColor DarkGray
  Write-Host '  It is NOT the application password above, and nothing is typed back.' -ForegroundColor DarkGray
  Write-Host ''

  # Literal .Replace(), not -replace. The replacement operand of -replace treats
  # `$` as a capture-group reference, so a password containing `$` is silently
  # mangled into a different password than the one written to backend\.env --
  # which then fails at step 6 with an authentication error about a password
  # that looks correct on screen. .Replace() is literal in both operands.
  #
  # ReadAllText rather than Get-Content, because Get-Content -Raw can hand the
  # UTF-8 BOM through as a character and MySQL then reports a syntax error
  # pointing at the first line of a file that is visibly fine.
  $bootstrapSqlText = [System.IO.File]::ReadAllText($BootstrapSql)
  $bootstrapSqlText = $bootstrapSqlText.Replace('<choose-a-strong-password>', $dbPassword)

  $bootstrapSqlText | & $mysqlExe --default-character-set=utf8mb4 -u root -p
  if ($LASTEXITCODE -ne 0) {
    Stop-With 'bootstrap.sql failed.' @(
      'Most often a wrong root password. MySQL prints ERROR 1045 if so.',
      'If the database exists but the user does not, re-run this script; it is safe to repeat.',
      'If you cancelled the password prompt, nothing was created.'
    )
  }
  Write-Ok 'Database pme_system and user pme_user created.'

  # bootstrap.sql uses CREATE USER IF NOT EXISTS, which does NOT change the
  # password of an account that already exists. On a machine where pme_user is
  # present from an earlier attempt with a different password, the GRANT would
  # therefore be applied to an account the app still cannot log into -- and the
  # symptom is ER_ACCESS_DENIED_ERROR with a .env that is provably correct.
  # Forcing the password here is what makes this script idempotent.
  Write-Info 'Setting the application password to match backend\.env ...'
  $setPasswordSql = @"
ALTER USER 'pme_user'@'localhost' IDENTIFIED BY '$dbPassword';
ALTER USER 'pme_user'@'127.0.0.1'  IDENTIFIED BY '$dbPassword';
FLUSH PRIVILEGES;
"@
  $setPasswordSql | & $mysqlExe --default-character-set=utf8mb4 -u root -p
  if ($LASTEXITCODE -ne 0) {
    Stop-With 'Could not set the pme_user password.' @(
      'This step needs the root password again; it should have been requested a second time.',
      'Check the password for a trailing space -- MySQL does not trim it.'
    )
  }
  Write-Ok 'Application password set on both host rows.'
}

# Write .env only when something is missing, so a re-run never rewrites a file
# an administrator has hand-tuned. The content comes from .env.example, which is
# the committed contract, rather than being assembled line by line here -- that
# way a new variable added to the project reaches new installations for free.
if (-not (Test-Path -LiteralPath $EnvFile)) {
  Copy-Item -LiteralPath $EnvExample -Destination $EnvFile
  Write-Ok 'Created backend\.env from .env.example.'
}

$envText = [System.IO.File]::ReadAllText($EnvFile)

# `[ \t]` and not `\s`, in every one of these. `\s` matches newlines as well as
# spaces, so `(?m)^\s*KEY\s*=` is allowed to start matching at a blank line above
# the key and consume it -- quietly deleting blank lines from the file on every
# run, and in principle merging an unrelated line into the match. The leading
# class only ever needs to absorb indentation.
$envText = [regex]::Replace($envText, '(?m)^[ \t]*DB_PASSWORD[ \t]*=.*$',   "DB_PASSWORD=$dbPassword")
$envText = [regex]::Replace($envText, '(?m)^[ \t]*JWT_SECRET[ \t]*=.*$',    "JWT_SECRET=$jwtSecret")
$envText = [regex]::Replace($envText, '(?m)^[ \t]*DB_HOST[ \t]*=.*$',       'DB_HOST=127.0.0.1')
$envText = [regex]::Replace($envText, '(?m)^[ \t]*DB_USER[ \t]*=.*$',       'DB_USER=pme_user')
$envText = [regex]::Replace($envText, '(?m)^[ \t]*DB_NAME[ \t]*=.*$',       'DB_NAME=pme_system')
$envText = [regex]::Replace($envText, '(?m)^[ \t]*NODE_ENV[ \t]*=.*$',      'NODE_ENV=development')
[System.IO.File]::WriteAllText($EnvFile, $envText)
Write-Ok 'backend\.env written.'

# ---------------------------------------------------------------------------
# STEP 6 — prove it
# ---------------------------------------------------------------------------
Write-Step 'Confirming the app can reach the database'

& $npm run db:check
if ($LASTEXITCODE -ne 0) {
  Stop-With 'The database is still not usable.' @(
    'DB_PASSWORD in backend\.env does not match what MySQL has.',
    'MySQL auth is exact: no trimming, no tolerance for a trailing space.',
    'Both host rows are required: ''pme_user''@''localhost'' AND ''pme_user''@''127.0.0.1''.',
    'To inspect what MySQL thinks:  npm run db:check  prints the target it tried.'
  )
}

# ---------------------------------------------------------------------------
# STEP 7 — the schema
# ---------------------------------------------------------------------------
Write-Step 'Applying the schema'

if ($RestoreFrom) {
  if (-not (Test-Path -LiteralPath $RestoreFrom)) {
    Stop-With "-RestoreFrom was given but the file does not exist: $RestoreFrom" @(
      'Check the path. It should point at the .sql produced by mysqldump.'
    )
  }
  $restoreSqlText = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $RestoreFrom))
  Write-Info 'Restoring from the dump. This replaces the demo data with the real registry.'
  $restoreSqlText | & $mysqlExe --default-character-set=utf8mb4 -u pme_user "-p$dbPassword" pme_system
  if ($LASTEXITCODE -ne 0) {
    Stop-With 'The dump failed to import.' @(
      'The dump must be taken WITHOUT --databases, so it does not try to',
      'CREATE DATABASE as a user that has no rights outside pme_system.',
      'utf8mb4 must survive the dump: use --default-character-set=utf8mb4.'
    )
  }
  Write-Ok 'Dump imported.'
} else {
  Write-Info 'Applying migrations. Already-applied files are skipped, so this is safe to repeat.'
  Invoke-Checked -FilePath $npm -Arguments @('run', '--silent', 'db:migrate') -What 'db:migrate' -Hints @(
    'A failure here is almost always one of two things:',
    '',
    '  "Duplicate column name" or "Duplicate key name"',
    '    A migration was applied to the schema without being recorded in',
    '    schema_migrations -- so the runner tries to apply it a second time.',
    '    Common when a database was restored from a mysqldump taken before a',
    '    migration was recorded, or when the file was run by hand.',
    '    See what is recorded:',
    '      npm run db:migrate:status',
    '',
    '  "ER_DBACCESS_DENIED_ERROR"',
    '    The GRANT from bootstrap.sql was not applied to pme_user.',
    '',
    'Run `npm run db:migrate:status` first -- it lists applied, pending, and any',
    'migration recorded as applied whose file is missing.'
  )
  Write-Ok 'Schema is up to date.'

  if ($Seed) {
    Write-Info 'Seeding demo data.'
    Invoke-Checked -FilePath $npm -Arguments @('run', '--silent', 'db:seed') -What 'db:seed'
    Write-Ok 'Demo departments, accounts and letters created.'
  } else {
    Write-Host ''
    Write-Host '  Demo data was NOT seeded.' -ForegroundColor Yellow
    Write-Host '  To add it later:' -ForegroundColor Gray
    Write-Host '    npm run db:seed' -ForegroundColor White
    Write-Host '  Sign in as 881234560V / PmeDemo@2026' -ForegroundColor DarkGray
    Write-Host '  To bring REAL letters across instead, re-run with:' -ForegroundColor Gray
    Write-Host '    -RestoreFrom D:\pme_system.sql' -ForegroundColor White
  }
}

# ---------------------------------------------------------------------------
# STEP 8 — done
# ---------------------------------------------------------------------------
Write-Step 'Setup complete'

$lanIp = $null
try {
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254*' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
} catch {
  # Not being able to read the local IP is cosmetic; do not fail a good setup.
}

Write-Host ''
Write-Host '  Start the application:' -ForegroundColor Cyan
Write-Host '    npm run dev' -ForegroundColor White
Write-Host ''
Write-Host '  Then open:' -ForegroundColor Cyan
Write-Host '    http://localhost:5173' -ForegroundColor White
if ($lanIp) {
  Write-Host "    http://$lanIp`:5173   (other devices on this network)" -ForegroundColor DarkGray
}
Write-Host ''
Write-Host '  Stop it with Ctrl+C. MySQL keeps running -- it is a Windows service,' -ForegroundColor DarkGray
Write-Host '  not a child of this project.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  The database password is in backend\.env. Do not commit that file.' -ForegroundColor DarkGray
Write-Host ''
exit 0