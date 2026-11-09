/**
 * Scan-to-upload: the two calls either side of the QR code.
 *
 * `createTicket` is the DESKTOP side. It runs behind the signed-in session and
 * asks the `create-upload-ticket` Edge Function for a short-lived token bound to
 * one letter. `uploadUrl` turns that token into the address the QR encodes.
 *
 * `uploadFiles` is the PHONE side. It carries no bearer token at all — the
 * scanned token is the authorization — so it talks to `mobile-upload`, which is
 * deployed with `verify_jwt = false`. It still sends `apikey`, because the
 * Supabase functions gateway rejects a request without one before the function
 * ever runs.
 */
import { supabase } from './supabaseClient.js';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * The absolute URL the phone should open.
 *
 * Built from `BASE_URL` rather than a hard-coded path so it survives the GitHub
 * Pages sub-path (`/PME-System-1.2/`). A QR that points at `/m/upload/...` when
 * the app lives under a sub-path lands on the host's 404, which looks like the
 * feature is broken rather than mis-addressed.
 *
 * THE ORIGIN IS A REAL TRAP ON A LOCAL OFFICE MACHINE. If the clerk opens the
 * app at `http://localhost:5173`, `window.location.origin` is `localhost`, and
 * the phone resolves that to ITSELF, not to the office PC — the scan then lands
 * on a blank page. Either open the app on the desktop through the machine's LAN
 * address (`http://192.168.x.x:5173`, Vite already listens on all interfaces),
 * or set `VITE_PUBLIC_APP_URL` to the address the phone can reach (origin only,
 * e.g. `https://pme.example.gov.lk`). When set, it wins over `location.origin`.
 */
export function uploadUrl(token) {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const configured = import.meta.env.VITE_PUBLIC_APP_URL;
  const origin = configured
    ? configured.replace(/\/+$/, '')
    : window.location.origin;
  return `${origin}${prefix}m/upload/${encodeURIComponent(token)}`;
}

/** Mint a token for one letter. Returns `{ token, expires_at, ttl_seconds }`. */
export async function createTicket(mailRecordId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const expired = new Error('Your session has expired. Sign in again.');
    expired.status = 401;
    throw expired;
  }

  const response = await fetch(`${FUNCTIONS_URL}/create-upload-ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ mail_record_id: mailRecordId }),
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    const error = new Error(problem.error || 'The upload link could not be created.');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

/**
 * Upload one or more files from the phone.
 *
 * The status is attached to the thrown error so callers can tell "the link
 * expired" (410) from "the link was already used" (409) from a transport
 * failure, and word the message accordingly.
 */
export async function uploadFiles(token, files) {
  const body = new FormData();
  body.append('token', token);
  for (const file of files) body.append('files', file);

  const response = await fetch(`${FUNCTIONS_URL}/mobile-upload`, {
    method: 'POST',
    headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body,
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    const error = new Error(problem.error || 'The document could not be uploaded.');
    error.status = response.status;
    throw error;
  }

  return response.json();
}
