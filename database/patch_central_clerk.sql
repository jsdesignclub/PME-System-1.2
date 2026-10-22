-- ============================================================================
-- patch_central_clerk.sql
--
-- Two changes to mail intake:
--
-- 1. FIX — a SUBJECT_CLERK could not file a letter into a department other than
--    their own. The intake form (D70) makes `department_id` a routing choice:
--    the clerk picks the department named on the envelope, which is frequently
--    NOT the clerk's own desk. The clerk then hit:
--
--      403  42501  new row violates row-level security policy for table "mail_records"
--
--    The INSERT passed its WITH CHECK. The refusal came from PostgREST's
--    `return=representation`: it re-reads the inserted row through the SELECT
--    policy (mail_read), which only showed a SUBJECT_CLERK rows whose
--    `department_id` equalled their own (or was NULL, or assigned to them). A
--    letter routed to another department was invisible to the clerk the instant
--    it was created, so the write appeared to fail. mail_update, mail_delete and
--    minutes_write ALREADY grant a clerk their own logged letters via
--    `created_by_user_id = p.id`, regardless of department; mail_read was the
--    one policy missing that clause.
--
-- 2. FEATURE — the central intake clerk. A SUBJECT_CLERK flagged with
--    `profiles.is_central_clerk` handles intake for EVERY department: they read,
--    forward and record the AO's minutes for letters in any department, exactly
--    as an ordinary clerk may for their own. Confidential letters stay hidden,
--    exactly as for any other clerk. The flag only ever widens a SUBJECT_CLERK;
--    it grants nothing to any other role.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. The flag -----------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_central_clerk BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Helper -------------------------------------------------------------------
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

-- 3. mail_records — read, update ---------------------------------------------
DROP POLICY IF EXISTS mail_read   ON public.mail_records;
DROP POLICY IF EXISTS mail_update ON public.mail_records;

-- READ: the central clerk sees everything; an ordinary clerk sees what they
-- logged (any department), their own department, and direct assignments.
CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: only letters forwarded to them, plus any they have written a
        -- minute on (so a submit does not 404 the page under their feet).
        OR (p.role = 'AO' AND (
          mail_records.status::text = 'Forwarded to AO'
          OR EXISTS (
            SELECT 1 FROM public.official_minutes om
            WHERE om.mail_record_id = mail_records.id
              AND om.author_user_id = p.id
          )
        ))
        OR (p.role = 'SUBJECT_CLERK' AND (
          p.is_central_clerk
          OR mail_records.created_by_user_id = p.id
          OR mail_records.department_id = p.department_id
          OR mail_records.assigned_officer_id = p.id
        ))
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

-- UPDATE: USING is the OLD row, WITH CHECK is the NEW row. SUBJECT_CLERK moves
-- a letter through Logged -> Forwarded to AO -> Forwarded to Subject; and once a
-- letter is ASSIGNED to a clerk (self-assign / executor), that clerk starts and
-- works it exactly like an officer.
CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: may only edit a letter while it is sitting in their queue.
        OR (p.role = 'AO' AND mail_records.status = 'Forwarded to AO')
        OR (p.role = 'SUBJECT_CLERK'
            AND (p.is_central_clerk
                 OR mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id
                 OR mail_records.assigned_officer_id = p.id)
            AND mail_records.status IN ('Logged','Forwarded to AO','Forwarded to Subject'))
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

-- 4. official_minutes — a clerk recording the AO's minute on their behalf -----
-- The MAIN subject clerk only, and only while the letter carries no minute yet.
-- The named author must be a real AO/ADMIN/SECRETARY/CHIEF_CLERK, and the clerk
-- is always recorded as the person who typed it.
DROP POLICY IF EXISTS minutes_write ON public.official_minutes;

CREATE POLICY minutes_write ON public.official_minutes FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = author_user_id
  OR (
    recorded_by_user_id = auth.uid()
    AND author_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.mail_records m
        JOIN public.profiles p ON p.id = auth.uid()
        JOIN public.profiles a ON a.id = official_minutes.author_user_id
       WHERE m.id = official_minutes.mail_record_id
         AND p.role = 'SUBJECT_CLERK'
         AND p.is_central_clerk = TRUE
         AND m.status::text = 'Forwarded to AO'
         AND COALESCE(m.endorser_role, 'AO') = 'AO'
         AND NOT EXISTS (
           SELECT 1 FROM public.official_minutes om2
            WHERE om2.mail_record_id = m.id
         )
         AND a.role IN ('AO','ADMIN','SECRETARY','CHIEF_CLERK')
         -- The clerk may NAME an executive as the author, but may not rename
         -- them: the displayed role and name must be that person's real ones.
         AND a.role::text = official_minutes.author_role
         AND a.full_name = official_minutes.author_name
    )
  )
  -- OR a BRANCH subject clerk enters it on behalf of their OWN branch head.
  -- A letter that arrives straight at a branch is endorsed by that branch's
  -- Department Head, not by the ministry AO: the branch clerk types what the
  -- head wrote on the paper, and the minute carries the head's name.
  OR (
    recorded_by_user_id = auth.uid()
    AND author_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.mail_records m
      JOIN public.profiles p ON p.id = auth.uid()
      JOIN public.profiles a ON a.id = official_minutes.author_user_id
      WHERE m.id = official_minutes.mail_record_id
        AND p.role = 'SUBJECT_CLERK'
        AND p.department_id = m.department_id
        AND m.status::text = 'Forwarded to AO'
        AND COALESCE(m.endorser_role, 'AO') = 'DEPARTMENT_HEAD'
        AND NOT EXISTS (SELECT 1 FROM public.official_minutes om2 WHERE om2.mail_record_id = m.id)
        AND a.role = 'DEPARTMENT_HEAD'
        AND a.department_id = m.department_id
        -- Same rule as above: the clerk may NAME the author, but may not
        -- rename them. The displayed role and name must be the real ones.
        AND a.role::text = official_minutes.author_role
        AND a.full_name = official_minutes.author_name
    )
  )
);


-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- The column exists:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='profiles' AND column_name='is_central_clerk';
--
-- The policies now on mail_records:
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='mail_records' ORDER BY policyname;
--   expect: mail_delete, mail_insert, mail_read, mail_update
--
-- Promote the Provincial Secretary's Office clerk to central clerk:
-- UPDATE public.profiles SET is_central_clerk = TRUE
--  WHERE email = 'jsdesignclub2@gmail.com';
--
-- As that clerk, filing a letter into department 2 (or any other) now returns
-- 201 instead of 403 42501, and the letter is listed for them.
