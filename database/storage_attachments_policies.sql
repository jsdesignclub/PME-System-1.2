-- ============================================================================
-- PME System — storage RLS policies for the `mail-attachments` bucket
-- ============================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- supabase_schema.sql creates the private `mail-attachments` bucket, but it
-- defines NO policies on `storage.objects`. Row Level Security is enabled on
-- storage.objects by default, and with zero policies every operation from an
-- authenticated (non-service-role) client is refused. The upload fails with:
--
--   StorageApiError: new row violates row-level security policy
--   (status 400, statusCode "403", code "AccessDenied")
--
-- The browser sees a 400, so `normaliseError` classified it as a *validation*
-- error and the form showed "Correct the highlighted field and submit again."
-- — even though no field was wrong. Because `mailApi.create` writes the letter
-- FIRST and the attachment SECOND, the failed upload left a letter with no scan
-- and the throw surfaced that confusing message.
--
-- The same missing SELECT policy makes the preview/download fail: the detail
-- page fetches the bytes with `storage.download(stored_path)` and, with no
-- SELECT policy, the object is invisible.
--
-- This file grants authenticated users INSERT/SELECT/UPDATE/DELETE on everything
-- inside the `mail-attachments` bucket, matching the permissive
-- `attachments_read` / `attachments_write` policies on public.mail_attachments
-- in supabase_schema.sql. Letter-level visibility is still enforced by
-- mail_read on public.mail_records, which decides which letters (and therefore
-- which attachment rows) a caller can see.
--
-- HOW TO APPLY
-- ------------
-- Run everything below in the Supabase SQL Editor. It is safe to re-run: the
-- DROP ... IF EXISTS statements make it idempotent and only touch policies on
-- the `mail-attachments` bucket.
-- ============================================================================

DROP POLICY IF EXISTS "mail_attachments_insert" ON storage.objects;
DROP POLICY IF EXISTS "mail_attachments_select" ON storage.objects;
DROP POLICY IF EXISTS "mail_attachments_update" ON storage.objects;
DROP POLICY IF EXISTS "mail_attachments_delete" ON storage.objects;

-- Upload a scan.
CREATE POLICY "mail_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mail-attachments');

-- Preview and download a scan.
CREATE POLICY "mail_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'mail-attachments');

-- Replace/overwrite an object (upsert).
CREATE POLICY "mail_attachments_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'mail-attachments')
  WITH CHECK (bucket_id = 'mail-attachments');

-- Remove a scan.
CREATE POLICY "mail_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mail-attachments');


-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
-- ORDER BY policyname;
--
-- Expected: mail_attachments_delete, mail_attachments_insert,
--           mail_attachments_select, mail_attachments_update
