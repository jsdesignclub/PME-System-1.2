import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Mint a short-lived token that lets a phone upload a scan to one letter.
 *
 * The caller is the signed-in desktop user. This function:
 *   1. verifies their session (the gateway already did, but we re-check so the
 *      function is safe even if it is ever deployed with verify_jwt disabled);
 *   2. confirms they can SEE the letter, by reading it with THEIR token so RLS
 *      decides (confidential letters stay invisible, exactly as on the detail
 *      page);
 *   3. confirms their role may add attachments and the letter is not closed;
 *   4. stores only the SHA-256 hash of a fresh random token and returns the raw
 *      token to be drawn as a QR code.
 *
 * The raw token never touches the database, so a leak of this table cannot be
 * replayed as an upload link.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** How long the QR stays usable. Long enough to walk to a scanner, short enough
 * that a photographed screen is not a standing invitation. */
const TOKEN_TTL_SECONDS = 15 * 60

/**
 * Roles that may attach to a letter. This mirrors the frontend's
 * `CREATE_MAIL || UPDATE_ACTION_STATUS` check: the clerk who logged the letter
 * and the people who work it. AO and MINOR_STAFF are absent for the same reason
 * they see a read-only attachment list on the detail page.
 */
const ATTACH_ROLES = new Set([
  'ADMIN',
  'SECRETARY',
  'CHIEF_CLERK',
  'SUBJECT_CLERK',
  'DEPARTMENT_HEAD',
  'OFFICER',
  'TRANSPORT_OFFICER',
])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 256 bits of randomness, base64url so it is safe inside a URL. */
function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey =
      Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return json({ error: 'Missing authorization' }, 401)

    const admin = createClient(url, serviceKey)

    const { data: caller, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !caller?.user) {
      return json({ error: 'Invalid or expired session' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const mailRecordId = String(body?.mail_record_id ?? '').trim()
    if (!mailRecordId) {
      return json({ error: 'Missing mail_record_id' }, 400)
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.user.id)
      .single()

    if (!profile || profile.is_active === false) {
      return json({ error: 'Your account is not active.' }, 403)
    }
    if (!ATTACH_ROLES.has(profile.role)) {
      return json({ error: 'Your role may not add attachments to this letter.' }, 403)
    }

    // Read the letter AS THE CALLER, so RLS decides visibility. A confidential
    // letter is a 404 here for the same roles it is a 404 for on the detail page.
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: letter } = await asCaller
      .from('mail_records')
      .select('id, status')
      .eq('id', mailRecordId)
      .maybeSingle()

    if (!letter) {
      return json(
        { error: 'That letter does not exist, or is not visible to you.' },
        404,
      )
    }
    if (letter.status === 'Completed') {
      return json(
        { error: 'This letter is closed. Attachments can no longer be added.' },
        409,
      )
    }

    const rawToken = randomToken()
    const tokenHash = await sha256Hex(rawToken)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString()

    const { error: insertError } = await admin.from('upload_tickets').insert({
      mail_record_id: mailRecordId,
      created_by: caller.user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    if (insertError) {
      return json({ error: insertError.message }, 500)
    }

    return json({ token: rawToken, expires_at: expiresAt, ttl_seconds: TOKEN_TTL_SECONDS })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
