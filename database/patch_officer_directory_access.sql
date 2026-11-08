-- ============================================================================
-- patch_officer_directory_access.sql
--
-- FEATURE - the Officers directory is visible only to administrators, plus the
-- people an administrator explicitly allows.
--
-- `profiles.can_view_officers` is the per-person switch. An administrator sees
-- the directory unconditionally (is_admin()), and may flip the flag on any other
-- employee from Administration > Users. The same switch is what RLS reads, so a
-- granted user can open an employee's HR file, and an ungranted user cannot read
-- it even by querying PostgREST directly.
--
-- Read remains scoped like this on every `employee_*` table and the private
-- bucket:
--
--     public.can_view_officers() OR officer_user_id = auth.uid()
--
-- The owner can always read their own file. Write policies are unchanged: only
-- an administrator or the owner may write (patch_hrm_self_service.sql).
--
-- `profiles` itself is deliberately untouched. The directory (names, roles,
-- postings) is needed by assignment pickers and the mail workflow; it is not the
-- confidential part of an employment file.
--
-- PREREQUISITE: run database/patch_hrm.sql and
-- database/patch_hrm_self_service.sql first.
--
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_view_officers BOOLEAN NOT NULL DEFAULT FALSE;

-- Helper: may the signed-in user open the Officers directory?
-- Admins always can; everyone else needs the per-profile flag.
CREATE OR REPLACE FUNCTION public.can_view_officers()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role = 'ADMIN' OR can_view_officers
       FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

DROP POLICY IF EXISTS employee_details_read ON public.employee_details;
CREATE POLICY employee_details_read ON public.employee_details
  FOR SELECT TO authenticated
  USING (public.can_view_officers() OR officer_user_id = auth.uid());

DROP POLICY IF EXISTS employee_qualifications_read ON public.employee_qualifications;
CREATE POLICY employee_qualifications_read ON public.employee_qualifications
  FOR SELECT TO authenticated
  USING (public.can_view_officers() OR officer_user_id = auth.uid());

DROP POLICY IF EXISTS employee_experience_read ON public.employee_experience;
CREATE POLICY employee_experience_read ON public.employee_experience
  FOR SELECT TO authenticated
  USING (public.can_view_officers() OR officer_user_id = auth.uid());

DROP POLICY IF EXISTS employee_service_history_read ON public.employee_service_history;
CREATE POLICY employee_service_history_read ON public.employee_service_history
  FOR SELECT TO authenticated
  USING (public.can_view_officers() OR officer_user_id = auth.uid());

DROP POLICY IF EXISTS employee_documents_read ON public.employee_documents;
CREATE POLICY employee_documents_read ON public.employee_documents
  FOR SELECT TO authenticated
  USING (public.can_view_officers() OR officer_user_id = auth.uid());

DROP POLICY IF EXISTS "employee_documents_select" ON storage.objects;
CREATE POLICY "employee_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      public.can_view_officers()
      OR split_part(name, '/', 1) = auth.uid()::text
    )
  );
