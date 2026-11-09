-- ============================================================================
-- PME System — scan-to-upload tickets
-- ============================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- A subject clerk should not have to sit at the office PC to scan each letter
-- the desk receives. The "Upload from phone" panel on a letter shows a QR code;
-- the clerk scans it with a phone, photographs the paper, and the phone uploads
-- the image straight into the `mail-attachments` bucket against that letter.
--
-- The phone has no Supabase session. It must NOT be given one, and the anon key
-- must not be trusted to write attachments. Instead the signed-in desktop asks
-- the `create-upload-ticket` Edge Function for a short-lived, random token and
-- shows it inside the QR. The phone presents that token to `mobile-upload`,
-- which runs with the service role, verifies the token, and writes the object.
--
-- This table is the record of those tokens. It is DELIBERATELY unreadable from
-- the browser: RLS is enabled and there is no policy granting any role access,
-- so only the service role (the Edge Functions) can touch it. The raw token is
-- never stored — only its SHA-256 hash — so a database read cannot reconstruct
-- a working upload link.
--
-- Columns
--   token_hash    SHA-256 (hex) of the raw token shown in the QR.
--   mail_record_id The letter the token is bound to. One token, one letter.
--   created_by    The signed-in user who generated it; the attachment row is
--                 attributed to this person, not to "the phone".
--   expires_at    Short TTL (15 minutes). Expired rows are ignored.
--   used_at       Set when the token is consumed. A used token is refused, so
--                 a photographed QR is useless after the first upload.
--
-- HOW TO APPLY
-- ------------
-- Run everything below in the Supabase SQL Editor. It is safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.upload_tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mail_record_id TEXT NOT NULL REFERENCES public.mail_records(id) ON DELETE CASCADE,
  created_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_tickets_expiry
  ON public.upload_tickets(expires_at);

-- RLS on, and NO policies. That is the point: the browser cannot read or mint
-- tickets directly. The Edge Functions use the service role, which bypasses
-- RLS, and they do the authorization themselves.
ALTER TABLE public.upload_tickets ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- SELECT relname, relrowsecurity
-- FROM pg_class WHERE relname = 'upload_tickets';
-- Expected: upload_tickets | t
--
-- SELECT count(*) FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'upload_tickets';
-- Expected: 0
