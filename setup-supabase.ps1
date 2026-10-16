#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy the PME System Edge Functions to the Supabase project.

.DESCRIPTION
  The admin dashboard's "create a login, then complete the profile" flow relies
  on two Edge Functions that live under supabase\functions. They are NOT
  deployed automatically — until they exist on the project, the browser gets a
  404 whose CORS preflight has no allowed method, which surfaces as the
  thoroughly unhelpful "Failed to fetch".

  This script deploys every function in supabase\functions in one command. It
  needs a Supabase personal access token, which it reads from (in order):

      1. the -AccessToken parameter
      2. the SUPABASE_ACCESS_TOKEN environment variable
      3. an interactive prompt

  Get a token at https://supabase.com/dashboard/account/tokens.

  The project ref is read from frontend\.env (VITE_SUPABASE_URL) so the same
  script follows a project without being edited; -ProjectRef overrides it.

.PARAMETER AccessToken
  Supabase personal access token. Prefer the environment variable or the prompt
  so the token does not end up in your shell history.

.PARAMETER ProjectRef
  Supabase project ref, e.g. "rkypeinboaeixisysrtn". Defaults to the ref in
  frontend\.env.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-supabase.ps1

.EXAMPLE
  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."; npm run setup:supabase
#>
[CmdletBinding()]
param(
  [string]$AccessToken,
  [string]$ProjectRef
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

function Write-Step {
  param([string]$Message)
  Write-Host ''
  Write-Host ("=" * 74) -ForegroundColor DarkCyan
  Write-Host " $Message" -ForegroundColor Cyan
  Write-Host ("=" * 74) -ForegroundColor DarkCyan
}
function Write-Ok   { param([string]$m) Write-Host "  [ok]   $m" -ForegroundColor Green }
function Write-Info { param([string]$m) Write-Host "  [info] $m" -ForegroundColor Gray }
function Write-Warn { param([string]$m) Write-Host "  [warn] $m" -ForegroundColor Yellow }
function Write-Err  { param([string]$m) Write-Host "  [FAIL] $m" -ForegroundColor Red }

function Stop-With {
  param([string]$Message, [string[]]$Hints = @())
  Write-Host ''
  Write-Host ' DEPLOY STOPPED' -ForegroundColor Red
  Write-Host " $Message" -ForegroundColor Red
  if ($Hints.Count -gt 0) {
    Write-Host ''
    Write-Host ' What to check:' -ForegroundColor Yellow
    foreach ($h in $Hints) { Write-Host "   - $h" -ForegroundColor Yellow }
  }
  Write-Host ''
  exit 1
}

function ConvertTo-PlainText {
  param([Security.SecureString]$Secure)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# ---------------------------------------------------------------------------
# Preflight — npx (ships with Node) and the functions folder
# ---------------------------------------------------------------------------
Write-Step 'Checking prerequisites'

$supabaseDir = Join-Path $Root 'supabase'
$functionsDir = Join-Path $supabaseDir 'functions'
$configFile = Join-Path $supabaseDir 'config.toml'

if (-not (Test-Path -LiteralPath $functionsDir)) {
  Stop-With "supabase\functions is missing, so this does not look like the project root ($Root)." @(
    'Run the script from inside the PME System folder.'
  )
}
if (-not (Test-Path -LiteralPath $configFile)) {
  Stop-With 'supabase\config.toml is missing.' @(
    'It is committed to the repository. Restore it, or run `npx supabase init`.'
  )
}
Write-Ok "Project root: $Root"

# npx.cmd rather than npx.ps1, for the same execution-policy reason npm.cmd is
# preferred in setup-office.ps1.
$npxCmd = Get-Command npx.cmd -ErrorAction SilentlyContinue
if ($npxCmd) { $npx = $npxCmd.Source }
else {
  $npxCmd = Get-Command npx -ErrorAction SilentlyContinue
  if (-not $npxCmd) {
    Stop-With 'npx is not installed, or not on PATH.' @(
      'It ships with Node.js. Install Node.js LTS from https://nodejs.org.'
    )
  }
  $npx = $npxCmd.Source
}
Write-Ok "npx: $npx"

# ---------------------------------------------------------------------------
# Project ref — from -ProjectRef, else frontend\.env
# ---------------------------------------------------------------------------
Write-Step 'Resolving the Supabase project'

if (-not $ProjectRef) {
  $envFile = Join-Path $Root 'frontend\.env'
  if (-not (Test-Path -LiteralPath $envFile)) {
    Stop-With 'frontend\.env is missing, so the project cannot be inferred.' @(
      'Create frontend\.env with VITE_SUPABASE_URL=https://<ref>.supabase.co,',
      'or pass the ref explicitly:  -ProjectRef <ref>'
    )
  }
  $urlLine = Get-Content -LiteralPath $envFile -ErrorAction Stop |
    Where-Object { $_ -match '^\s*VITE_SUPABASE_URL\s*=' } |
    Select-Object -First 1
  if (-not $urlLine) {
    Stop-With 'frontend\.env has no VITE_SUPABASE_URL.' @(
      'Add VITE_SUPABASE_URL=https://<ref>.supabase.co, or pass -ProjectRef <ref>.'
    )
  }
  $url = ($urlLine -split '=', 2)[1].Trim().Trim('"')
  try {
    $ProjectRef = ([Uri]$url).Host.Split('.')[0]
  } catch {
    Stop-With "Could not parse a project ref from '$url'." @(
      'Expected a URL like https://<ref>.supabase.co.'
    )
  }
}
Write-Ok "Project ref: $ProjectRef"

# ---------------------------------------------------------------------------
# Access token — a parameter, the environment, or a prompt
# ---------------------------------------------------------------------------
Write-Step 'Resolving the access token'

$token = $AccessToken
if (-not $token) { $token = $env:SUPABASE_ACCESS_TOKEN }

if ($token) {
  Write-Ok 'Using the supplied access token.'
} else {
  Write-Info 'No token given. Create one at https://supabase.com/dashboard/account/tokens'
  $secure = Read-Host '  Paste your Supabase access token' -AsSecureString
  $token = ConvertTo-PlainText -Secure $secure
  if (-not $token) {
    Stop-With 'No access token was entered.'
  }
  Write-Ok 'Access token captured.'
}

# scoped to this process; nothing is written to disk
$env:SUPABASE_ACCESS_TOKEN = $token

# ---------------------------------------------------------------------------
# Deploy every function in supabase\functions
# ---------------------------------------------------------------------------
Write-Step 'Deploying Edge Functions'

Write-Info 'The first run downloads the Supabase CLI via npx and may take a minute.'
Write-Info 'Deploying: create-user, list-unprofiled-users'

# --use-api bundles the functions server-side, so this does not need Docker.
& $npx --yes supabase@latest functions deploy --project-ref $ProjectRef --use-api
if ($LASTEXITCODE -ne 0) {
  Stop-With "Deployment failed (exit code $LASTEXITCODE)." @(
    'A 401/403 here means the access token is wrong or lacks access to the project.',
    'If the CLI does not recognise --use-api, update it with: npx supabase@latest --version',
    'You can always deploy by hand instead: Supabase Dashboard > Edge Functions,',
    'paste supabase\functions\create-user\index.ts and list-unprofiled-users\index.ts.'
  )
}
Write-Ok 'Functions deployed.'

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Step 'Done'

Write-Host ''
Write-Host '  The admin flow is now live:' -ForegroundColor Cyan
Write-Host '    1. Admin > Users > Create login   (writes auth.users only)' -ForegroundColor Gray
Write-Host '    2. Complete the profile from the pending list (writes public.profiles)' -ForegroundColor Gray
Write-Host ''
Write-Host '  The functions read the service-role key from the SUPABASE_SERVICE_ROLE_KEY' -ForegroundColor DarkGray
Write-Host '  secret that Supabase injects automatically. If a function reports a missing' -ForegroundColor DarkGray
Write-Host '  key, add SERVICE_ROLE_KEY under Project Settings > Edge Functions > Secrets.' -ForegroundColor DarkGray
Write-Host ''
exit 0
