-- ============================================================================
-- PME System — patch: mail_records write policies
-- ============================================================================
-- SUPERSEDED (subject-clerk intake workflow). The intake/forwarding workflow
-- changed — MINOR_STAFF removed and a Forwarded-to-AO state added. See
-- database/patch_clerk_intake_workflow.sql, which replaces the policies below.
-- Running THIS file after that one would revert the workflow to the old shape.
--
-- Run this ONCE in the Supabase SQL Editor on a database created from an older
-- supabase_schema.sql. New databases get this from supabase_schema.sql directly.
--
-- WHY. mail_write was a single FOR ALL policy, so its USING expression (the old
-- row) was also the WITH CHECK (the new row). It pinned SUBJECT_CLERK to
-- `status = 'Logged'`, but the only move a clerk is offered is assigning a letter
-- sitting at Forwarded to Subject. The assign button appeared (available_actions
-- said so) and every write was refused, and the same pin blocked the clerk's
-- routing note. The officer had the mirror problem: the policy demanded
-- `status = 'In Progress'` while `start` moves Assigned -> In Progress.
--
-- Write is now split per operation so the state a caller moves FROM does not have
-- to equal the state they move TO.
-- ============================================================================

DROP POLICY IF EXISTS mail_write ON public.mail_records;
DROP POLICY IF EXISTS mail_insert ON public.mail_records;
DROP POLICY IF EXISTS mail_update ON public.mail_records;
DROP POLICY IF EXISTS mail_delete ON public.mail_records;

CREATE POLICY mail_insert ON public.mail_records FOR INSERT TO authenticated
WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK','AO')
        OR (p.role = 'SUBJECT_CLERK'
            AND (mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id)
            AND mail_records.status IN ('Logged','Forwarded to Subject'))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER')
            AND mail_records.assigned_officer_id = p.id
            AND mail_records.status IN ('Assigned','In Progress'))
        OR (p.role = 'MINOR_STAFF'
            AND mail_records.created_by_user_id = p.id
            AND mail_records.status = 'Logged')
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK','AO')
        OR (p.role = 'SUBJECT_CLERK'
            AND (mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER')
            AND mail_records.assigned_officer_id = p.id)
        OR (p.role = 'MINOR_STAFF' AND mail_records.created_by_user_id = p.id)
      )
  )
);

CREATE POLICY mail_delete ON public.mail_records FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        OR (mail_records.created_by_user_id = p.id AND mail_records.status = 'Logged')
      )
  )
);
