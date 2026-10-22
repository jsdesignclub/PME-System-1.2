-- ============================================================================
-- patch_fix_clerk_intake_rls.sql
--
-- FIX — a SUBJECT_CLERK (including the MAIN / central clerk) cannot file a
-- letter. The button reports:
--
--     new row violates row-level security policy for table "mail_records"
--
-- and the app turns that 42501 into "Your role does not permit this. Nothing
-- you retry will change that."
--
-- WHY IT HAPPENS
-- ---------------
-- The INSERT itself is fine. `mail_insert` passes its WITH CHECK (the row names
-- the caller as its creator and the caller is a clerk or an admin).
--
-- The refusal comes from the RETURNING clause. `mailApi.create` does
-- `.insert(record).select()`, which is PostgREST's `return=representation`,
-- which is `INSERT ... RETURNING *`. PostgreSQL applies the SELECT policy
-- (`mail_read`) to every row it is about to return, and a row that the SELECT
-- policy hides is an ERROR, not a silently dropped row:
--
--     ERROR:  new row violates row-level security policy for table "mail_records"
--
-- and the whole statement rolls back. So the letter is never created, and the
-- clerk sees a permission error for a permission they actually hold.
--
-- WHICH ROWS `mail_read` HIDES FROM A CLERK
-- -----------------------------------------
-- `mail_read` ended with:
--
--     AND NOT (p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER')
--              AND mail_records.priority = 'Confidential')
--
-- That clause hides a Confidential letter from EVERY clerk — including the
-- clerk who just filed it. But the clause right above it grants a clerk their
-- own filed letters (`created_by_user_id = p.id`), and the Confidential
-- exclusion silently cancelled it. The clerk who filed the letter is the one
-- who has to forward it to the AO, so hiding it from them strands the letter:
-- they cannot open it, cannot move it, and cannot even create it.
--
-- This is the same failure the central-clerk patch already documented for a
-- letter routed to another department (see patch_central_clerk.sql, the "FIX"
-- at the top): the INSERT passed, and the re-read refused. That patch added
-- the `created_by_user_id = p.id` clause but left the Confidential exclusion
-- in place, so the Confidential case was never covered.
--
-- THE FIX
-- -------
-- The Confidential exclusion now has one exception: the clerk who filed the
-- letter still sees it. Every other clerk and every officer still does not,
-- and the AO still does (the AO was never in the excluded list). The letter's
-- visibility is therefore still confined to the people the workflow puts it in
-- front of — the clerk who logged it, then the AO.
--
-- This patch also re-applies `mail_insert`, `mail_read`, `mail_update` and
-- `mail_delete` from database/supabase_schema.sql, so the live policies are
-- the canonical ones and cannot have drifted from the file in the repository.
-- The code in the repository's copies of these policies is identical; only the
-- comments and `status` vs `status::text` (equivalent for an enum) differ.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================================
-- 0. The central-clerk flag and its helper
-- ============================================================================
-- Re-declared here so this patch stands on its own: if `patch_central_clerk.sql`
-- was never applied to this project, the policies below would fail with
-- "column profiles.is_central_clerk does not exist".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_central_clerk BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.is_central_clerk()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role = 'SUBJECT_CLERK' AND is_central_clerk
       FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;


-- ============================================================================
-- 1. mail_read
-- ============================================================================
DROP POLICY IF EXISTS mail_read ON public.mail_records;

CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        -- ADMIN, SECRETARY, CHIEF_CLERK: READ_ALL_MAIL
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: ONLY the letters the clerk has forwarded to them (their queue),
        -- plus any letter they have already written a minute on, so that
        -- submitting the minute does not immediately turn the page into a 404.
        -- Plus any letter with a completion document awaiting THEIR approval.
        OR (p.role = 'AO' AND (
          mail_records.status::text = 'Forwarded to AO'
          OR EXISTS (
            SELECT 1 FROM public.official_minutes om
            WHERE om.mail_record_id = mail_records.id
              AND om.author_user_id = p.id
          )
          OR (mail_records.status::text = 'Pending Approval' AND EXISTS (
            SELECT 1 FROM public.completion_submissions cs
            WHERE cs.mail_record_id = mail_records.id
              AND cs.status = 'Pending'
              AND cs.approver_role = 'AO'
          ))
        ))
        -- SUBJECT_CLERK: the central clerk sees everything; an ordinary clerk
        -- sees everything they logged (any department — the intake desk routes
        -- letters it files) + their own department + direct assignment.
        OR (p.role = 'SUBJECT_CLERK' AND (
          p.is_central_clerk
          OR mail_records.created_by_user_id = p.id
          OR mail_records.department_id = p.department_id
          OR mail_records.assigned_officer_id = p.id
        ))
        -- DEPARTMENT_HEAD: their department's letters, plus any letter with a
        -- Pending Approval completion document addressed to them.
        OR (p.role = 'DEPARTMENT_HEAD' AND (
          mail_records.department_id = p.department_id
          OR (mail_records.status::text = 'Pending Approval' AND EXISTS (
            SELECT 1 FROM public.completion_submissions cs
            WHERE cs.mail_record_id = mail_records.id
              AND cs.status = 'Pending'
              AND cs.approver_role = 'DEPARTMENT_HEAD'
          ))
        ))
        -- OFFICER/TRANSPORT_OFFICER: assigned to them only
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER') AND mail_records.assigned_officer_id = p.id)
      )
      -- Confidential is hidden from SUBJECT_CLERK/OFFICER — but NOT from the
      -- clerk who filed the letter. The filing clerk is the one who has to
      -- forward it to the AO, so hiding it from them strands the letter: they
      -- cannot open it, cannot move it, and INSERT ... RETURNING refuses the
      -- row they just created ("new row violates row-level security policy for
      -- table mail_records"). The creator sees their own confidential letter;
      -- every other clerk and every officer still does not.
      AND NOT (
        p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER')
        AND mail_records.priority = 'Confidential'
        AND mail_records.created_by_user_id IS DISTINCT FROM p.id
      )
  )
);


-- ============================================================================
-- 2. mail_insert
-- ============================================================================
-- Intake is a SUBJECT_CLERK task. The row must name the caller as its creator,
-- and the caller must be a clerk or an admin.
DROP POLICY IF EXISTS mail_insert ON public.mail_records;

CREATE POLICY mail_insert ON public.mail_records FOR INSERT TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('SUBJECT_CLERK','ADMIN')
  )
);


-- ============================================================================
-- 3. mail_update
-- ============================================================================
-- USING is the OLD row (who may update it), WITH CHECK is the NEW row (what it
-- may become). Splitting them lets a caller move a letter between states
-- instead of being pinned to one state for both.
DROP POLICY IF EXISTS mail_update ON public.mail_records;

CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: may only edit a letter while it is sitting in their queue. The
        -- WITH CHECK below then allows the one transition out (to the clerk).
        OR (p.role = 'AO' AND mail_records.status = 'Forwarded to AO')
        -- SUBJECT_CLERK owns intake and routing: forward to the AO, record the
        -- AO's minutes, then assign. The central clerk handles any department;
        -- an ordinary clerk any letter in their department or one they logged,
        -- while it is with the clerk (Logged / Forwarded to AO / Forwarded to
        -- Subject).
        OR (p.role = 'SUBJECT_CLERK'
            AND (p.is_central_clerk
                 OR mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id
                 OR mail_records.assigned_officer_id = p.id)
            AND mail_records.status IN ('Logged','Forwarded to AO','Forwarded to Subject'))
        -- The assigned officer/clerk starts (Assigned -> In Progress).
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER','SUBJECT_CLERK')
            AND mail_records.assigned_officer_id = p.id
            AND mail_records.status IN ('Assigned','In Progress'))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: the new row may only sit at their queue or at the clerk's, i.e.
        -- the AO recorded a minute and handed the paper back.
        OR (p.role = 'AO' AND mail_records.status IN ('Forwarded to AO','Forwarded to Subject'))
        OR (p.role = 'SUBJECT_CLERK'
            AND (p.is_central_clerk
                 OR mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id
                 OR mail_records.assigned_officer_id = p.id))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER','SUBJECT_CLERK')
            AND mail_records.assigned_officer_id = p.id)
      )
  )
);


-- ============================================================================
-- 4. mail_delete
-- ============================================================================
DROP POLICY IF EXISTS mail_delete ON public.mail_records;

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


-- ============================================================================
-- 5. SANITY CHECKS (read-only — nothing below changes data)
-- ============================================================================
-- 5a. Every account, so the failing one can be identified by eye. Read this
--     for the clerk who reported the failure:
--       role = 'SUBJECT_CLERK'  -> they are a clerk and CAN file a letter
--       is_central_clerk = TRUE -> they are the MAIN clerk and see every
--                                  department's letters
--       is_active = FALSE       -> they are deactivated
--     A clerk whose `is_central_clerk` is FALSE can still file a letter; they
--     just see their own department's letters, not every department's.
SELECT
  email,
  role,
  is_active,
  is_central_clerk,
  department_id,
  (SELECT name FROM public.departments d WHERE d.id = profiles.department_id) AS department
FROM public.profiles
ORDER BY role, email;

-- 5b. The policies now in force on mail_records.
SELECT policyname, cmd, permissive, qual AS using_expr, with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mail_records'
ORDER BY cmd, policyname;

-- 5c. The letters, by priority and state. A Confidential row here is the one
--     that used to be unfileable by its own clerk.
SELECT priority, status, count(*) AS letters
FROM public.mail_records
GROUP BY priority, status
ORDER BY priority, status;

-- 5d. What each clerk can see of each letter, with the NEW rule inlined. The
--     row that used to be invisible to the clerk who filed it is the one where
--     `visible_to_clerk` flipped from FALSE to TRUE.
SELECT
  m.day_stamp_no,
  m.priority,
  m.status,
  f.email AS filed_by,
  v.email AS clerk,
  v.is_central_clerk,
  (
    v.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
    OR (v.role = 'SUBJECT_CLERK' AND (
          v.is_central_clerk
          OR m.created_by_user_id = v.id
          OR m.department_id = v.department_id
          OR m.assigned_officer_id = v.id))
    AND NOT (v.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER')
             AND m.priority = 'Confidential'
             AND m.created_by_user_id IS DISTINCT FROM v.id)
  ) AS visible_to_clerk
FROM public.mail_records m
CROSS JOIN public.profiles v
LEFT JOIN public.profiles f ON f.id = m.created_by_user_id
WHERE v.role = 'SUBJECT_CLERK'
ORDER BY m.created_at DESC NULLS LAST, v.email
LIMIT 40;
