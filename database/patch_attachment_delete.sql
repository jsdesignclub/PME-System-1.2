-- ============================================================================
-- PME System — remove a wrongly attached scan before the letter is forwarded
-- ============================================================================
--
-- WHY THIS FILE EXISTS
-- --------------------
-- supabase_schema.sql gives public.mail_attachments a SELECT policy and an
-- INSERT policy, but NO DELETE policy. With RLS enabled that means a clerk who
-- attaches the wrong scan by mistake cannot take it off the letter: the browser
-- delete is refused (the row stays), even though the bucket already permits
-- removing the object. This patch adds the missing metadata policy.
--
-- WHAT IT ALLOWS
-- --------------
-- An authenticated user may delete an attachment row only while its parent
-- letter is still at `Logged`, i.e. before the letter has been forwarded. The
-- subquery reads public.mail_records, which is itself protected by mail_read, so
-- a user can only remove attachments from a letter they can already open. Once
-- the letter moves on, the scan is part of the file the next desk received and
-- cannot be removed here.
--
-- The matching storage.objects DELETE policy normally comes from
-- storage_attachments_policies.sql. It is repeated below so this patch works on
-- its own; both statements are idempotent and safe to re-run.
--
-- HOW TO APPLY
-- ------------
-- Run everything below in the Supabase SQL Editor.
-- ============================================================================

DROP POLICY IF EXISTS attachments_delete ON public.mail_attachments;

CREATE POLICY attachments_delete ON public.mail_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.mail_records m
      WHERE m.id = mail_attachments.mail_record_id
        AND m.status::text = 'Logged'
    )
  );

DROP POLICY IF EXISTS "mail_attachments_delete" ON storage.objects;

CREATE POLICY "mail_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'mail-attachments');


-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'mail_attachments'
-- ORDER BY policyname;
--
-- Expected: attachments_delete (DELETE), attachments_read (SELECT),
--           attachments_write (INSERT)
