-- ============================================================================
-- patch_hrm_self_service.sql
--
-- FEATURE - an employee may maintain their OWN HR record.
--
-- The HRM tables (patch_hrm.sql) originally kept every write administrator-only:
-- an employee could read their file but not correct it. That made the HR file
-- depend on a clerk being available to type in a phone number, and the fields
-- most likely to be wrong or stale - address, emergency contact, personal email -
-- are the ones only the employee can supply.
--
-- This patch keeps the administrator's write access and ADDS a self-service
-- branch. It does not widen the read side: every signed-in user could already
-- read an officer's HR block, and that is unchanged.
--
-- The self branch is keyed on `officer_user_id = auth.uid()` in BOTH `USING`
-- and `WITH CHECK`. The `USING` half stops an employee reading/updating/deleting
-- a row that is not theirs; the `WITH CHECK` half stops them MOVING a row to
-- someone else's id with an UPDATE or INSERT. Either clause alone leaves a hole.
--
-- Profile identity (`profiles` itself: name, NIC, role, posting) stays
-- administrator-only. This patch only opens the HR side tables.
--
-- PREREQUISITE: run database/patch_hrm.sql first. It creates the five
-- `employee_*` tables this patch replaces policies on. This patch does not
-- create them, so applying it to a database that never ran patch_hrm.sql fails
-- with "relation public.employee_qualifications does not exist".
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Basic HR block (1:1 with the profile)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS employee_details_admin_write ON public.employee_details;
DROP POLICY IF EXISTS employee_details_write ON public.employee_details;

CREATE POLICY employee_details_write ON public.employee_details
  FOR ALL TO authenticated
  USING (public.is_admin() OR officer_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR officer_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Qualifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS employee_qualifications_admin_write ON public.employee_qualifications;
DROP POLICY IF EXISTS employee_qualifications_write ON public.employee_qualifications;

CREATE POLICY employee_qualifications_write ON public.employee_qualifications
  FOR ALL TO authenticated
  USING (public.is_admin() OR officer_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR officer_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Previous experience
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS employee_experience_admin_write ON public.employee_experience;
DROP POLICY IF EXISTS employee_experience_write ON public.employee_experience;

CREATE POLICY employee_experience_write ON public.employee_experience
  FOR ALL TO authenticated
  USING (public.is_admin() OR officer_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR officer_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Service history
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS employee_service_history_admin_write ON public.employee_service_history;
DROP POLICY IF EXISTS employee_service_history_write ON public.employee_service_history;

CREATE POLICY employee_service_history_write ON public.employee_service_history
  FOR ALL TO authenticated
  USING (public.is_admin() OR officer_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR officer_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Documents (metadata rows)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS employee_documents_admin_write ON public.employee_documents;
DROP POLICY IF EXISTS employee_documents_write ON public.employee_documents;

CREATE POLICY employee_documents_write ON public.employee_documents
  FOR ALL TO authenticated
  USING (public.is_admin() OR officer_user_id = auth.uid())
  WITH CHECK (public.is_admin() OR officer_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Documents (storage objects)
-- ---------------------------------------------------------------------------
-- uploadDocument() stores each file at `<officer_user_id>/<uuid>-<name>`, so the
-- first path segment IS the owner. The self branch checks that segment rather
-- than the metadata row: storage is reached before the row exists, and a leaked
-- path must not let an employee overwrite another officer's file.
--
-- Read stays open to every signed-in user, matching the metadata policy that was
-- already in place. Only insert/update/delete gain the self branch.
DROP POLICY IF EXISTS "employee_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_delete" ON storage.objects;

CREATE POLICY "employee_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (
      public.is_admin()
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );

CREATE POLICY "employee_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'employee-documents');

CREATE POLICY "employee_documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      public.is_admin()
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (
      public.is_admin()
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );

CREATE POLICY "employee_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      public.is_admin()
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );
