================================================================================
PME System - mail_records Row Level Security (RLS) policies
================================================================================

SUPERSEDED (subject-clerk intake workflow). MINOR_STAFF intake was removed and a
Forwarded-to-AO state was added. Use database/patch_clerk_intake_workflow.sql
instead; the policies below are the previous shape and would revert the change if
run afterwards.

WHY THIS FILE EXISTS
--------------------
The live Supabase project still has the original single `mail_write` policy,
which was FOR ALL and reused its USING expression as the WITH CHECK. That pinned
a SUBJECT_CLERK to `status = 'Logged'`, but the only move a clerk is offered is
assigning a letter sitting at `Forwarded to Subject`. The assign button appeared
(available_actions said so) and every write was refused, producing PostgREST
error PGRST116 ("Cannot coerce the result to a single JSON object") because the
UPDATE matched 0 rows.

The officer had the mirror problem: the policy demanded `status = 'In Progress'`
while `start` moves Assigned -> In Progress.

The fix is to split write into per-operation policies so the state a caller
moves FROM does not have to equal the state they move TO.

HOW TO APPLY
------------
Run everything below in the Supabase SQL Editor. It is safe to run again: the
DROP ... IF EXISTS statements make it idempotent, and it does not touch the
`mail_read` policy (which already works).

This matches database/supabase_schema.sql lines 276-359 and
database/patch_mail_rls.sql, so a freshly built database is unaffected.


================================================================================
1. READ (SELECT) - one row is visible to a caller if any of the clauses hold
================================================================================
CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        -- ADMIN, SECRETARY, CHIEF_CLERK: READ_ALL_MAIL
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- SUBJECT_CLERK: their department, un-routed letters they logged,
        -- or a letter directly assigned to them
        OR (p.role = 'SUBJECT_CLERK' AND (
          mail_records.department_id = p.department_id
          OR (mail_records.department_id IS NULL AND mail_records.created_by_user_id = p.id)
          OR mail_records.assigned_officer_id = p.id
        ))
        -- OFFICER / TRANSPORT_OFFICER: only what is assigned to them
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER') AND mail_records.assigned_officer_id = p.id)
        -- MINOR_STAFF: letters they created
        OR (p.role = 'MINOR_STAFF' AND mail_records.created_by_user_id = p.id)
      )
      -- Confidential letters hidden from SUBJECT_CLERK / OFFICER
      AND NOT (p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER')
               AND mail_records.priority = 'Confidential')
  )
);


================================================================================
2. WRITE - drop the old single policy, install the split per-operation policies
================================================================================
DROP POLICY IF EXISTS mail_write  ON public.mail_records;
DROP POLICY IF EXISTS mail_insert ON public.mail_records;
DROP POLICY IF EXISTS mail_update ON public.mail_records;
DROP POLICY IF EXISTS mail_delete ON public.mail_records;


-- INSERT: a caller may only create rows they own.
CREATE POLICY mail_insert ON public.mail_records FOR INSERT TO authenticated
WITH CHECK (created_by_user_id = auth.uid());


-- UPDATE: USING is the OLD row (who may update it), WITH CHECK is the NEW row
-- (what it may become). Splitting them lets a caller move a letter between
-- states instead of being pinned to one state for both.
CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK','AO')
        -- SUBJECT_CLERK routes any letter in their department, from Logged or
        -- after the executives' minutes moved it to Forwarded to Subject.
        OR (p.role = 'SUBJECT_CLERK'
            AND (mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id)
            AND mail_records.status IN ('Logged','Forwarded to Subject'))
        -- The assigned officer starts (Assigned -> In Progress) and completes.
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


-- DELETE: admins and executives, plus a logger's own still-unforwarded letter.
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


================================================================================
QUICK SANITY CHECK after applying
================================================================================
-- List the policies now on the table:
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mail_records'
ORDER BY policyname;

-- Expected: mail_delete, mail_insert, mail_read, mail_update
-- mail_write must NOT appear.
