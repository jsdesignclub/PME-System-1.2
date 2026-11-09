import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Public upload endpoint used by the phone that scanned the QR code.
 *
 * This function runs WITHOUT a user session (verify_jwt = false in config.toml)
 * because the phone is not signed in. Authorization comes entirely from the
 * single-use token minted by `create-upload-ticket`:
 *
 *   * the token must exist (matched by hash), be unused, and be unexpired;
 *   * it names exactly one letter and one `created_by` user, so the phone can
 *     upload only to that letter and the attachment is attributed to the clerk;
 *   * the same extension/size allowlist the desktop enforces is enforced here,
 *     so a phone cannot smuggle a disallowed file past the bucket rules.
 *
 * The service role is used to write storage and `mail_attachments`. That is safe
 * precisely because the token is the capability: without a valid token this
 * function does nothing.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Same formats the bucket and the web form accept. */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const BUCKET = 'mail-attachments'

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

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
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
    const admin = createClient(url, serviceKey)

    const form = await req.formData()
    const rawToken = String(form.get('token') ?? '').trim()
    const files = form
      .getAll('files')
      .filter((entry): entry is File => typeof entry !== 'string')

    if (!rawToken) {
      return json({ error: 'Missing upload token.' }, 400)
    }
    if (files.length === 0) {
      return json({ error: 'Choose at least one document to upload.' }, 400)
    }

    const tokenHash = await sha256Hex(rawToken)
    const { data: ticket } = await admin
      .from('upload_tickets')
      .select('id, mail_record_id, created_by, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (!ticket) {
      return json(
        { error: 'This upload link is not valid. Ask the office to show a new QR code.' },
        404,
      )
    }
    if (ticket.used_at) {
      return json(
        { error: 'This upload link has already been used. Ask the office to show a new QR code.' },
        409,
      )
    }
    if (new Date(ticket.expires_at).getTime() < Date.now()) {
      return json(
        { error: 'This upload link has expired. Ask the office to show a new QR code.' },
        410,
      )
    }

    // Validate the WHOLE batch before writing anything, so a bad third file does
    // not leave the first two in the bucket with no row pointing at them.
    for (const file of files) {
      const extension = extensionOf(file.name)
      if (!(extension in MIME_BY_EXTENSION)) {
        return json(
          {
            error: `"${file.name}" is not an accepted format. Allowed: ${Object.keys(
              MIME_BY_EXTENSION,
            ).join(', ')}.`,
          },
          400,
        )
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return json(
          { error: `"${file.name}" is larger than 10 MB.` },
          400,
        )
      }
    }

    const uploadedPaths: string[] = []
    const uploadedNames: string[] = []

    for (const file of files) {
      const contentType = MIME_BY_EXTENSION[extensionOf(file.name)]
      const path = `${ticket.mail_record_id}/${crypto.randomUUID()}-${file.name}`

      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, file, { contentType, upsert: false })
      if (uploadError) {
        await admin.storage.from(BUCKET).remove(uploadedPaths)
        return json({ error: uploadError.message }, 500)
      }

      const { error: insertError } = await admin.from('mail_attachments').insert({
        mail_record_id: ticket.mail_record_id,
        original_name: file.name,
        stored_name: file.name,
        stored_path: path,
        mime_type: contentType,
        size_bytes: file.size,
        uploaded_by: ticket.created_by,
      })
      if (insertError) {
        // The bytes are in the bucket but nothing points at them. Remove this
        // object and everything already written for this batch, then report.
        await admin.storage.from(BUCKET).remove([...uploadedPaths, path])
        return json({ error: insertError.message }, 500)
      }

      uploadedPaths.push(path)
      uploadedNames.push(file.name)
    }

    await admin
      .from('mail_records')
      .update({ has_attachment: true })
      .eq('id', ticket.mail_record_id)

    // Consume the ticket only AFTER a successful write, so a failed upload can be
    // retried with the same QR instead of forcing a new one.
    await admin
      .from('upload_tickets')
      .update({ used_at: new Date().toISOString() })
      .eq('id', ticket.id)

    return json({ uploaded: uploadedNames })
  } catch (err) {
    return json({ error: (err as Error).message }, 500)
  }
})
