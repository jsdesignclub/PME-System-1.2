-- ============================================================================
-- PME System — patch: subject-clerk intake workflow
-- ============================================================================
-- Run this in the Supabase SQL Editor on a database created from an older
-- supabase_schema.sql. A fresh database gets all of this from
-- supabase_schema.sql directly.
--
-- WHY. The incoming-mail workflow was:
--
--     MINOR_STAFF logs the letter  ->  AO/SECRETARY writes minutes
--       ->  Forwarded to Subject  ->  SUBJECT_CLERK assigns  ->  ...
--
-- Minor-staff intake is being removed (the front desk does not use a computer),
-- so the SUBJECT_CLERK becomes the single intake point and the letter visits the
-- AO FIRST:
--
--     SUBJECT_CLERK logs the letter           (Logged)
--       -> forwards the paper to the AO        (Forwarded to AO)
--       -> AO handwrites the minute; clerk types it  (Forwarded to Subject)
--       -> SUBJECT_CLERK assigns the officer   (Assigned)
--       -> OFFICER works it                    (In Progress -> Completed)
--
-- One new resting state is added (Forwarded to AO). Forwarded to Subject keeps
-- its ENUM spelling and now means "minutes recorded, back with the clerk".
--
-- The AO does not log in for this step. The clerk enters the AO's minute on the
-- AO's behalf, so official_minutes gains recorded_by_user_id (the clerk) while
-- author_user_id stays the AO who wrote it.
--
-- SAFE TO RUN AS ONE SCRIPT. The new enum value is only ever compared as text
-- (status::text), never used as an enum value, so it can be added and referenced
-- in the same transaction. The DROP ... IF EXISTS statements make it idempotent.
-- It does not touch mail_delete (which is unchanged) or the mail_read shape
-- beyond removing the MINOR_STAFF clause.
--
-- This mirrors database/supabase_schema.sql.
-- ============================================================================


-- ============================================================================
-- 1. The new resting state
-- ============================================================================
ALTER TYPE mail_status ADD VALUE IF NOT EXISTS 'Forwarded to AO' BEFORE 'Forwarded to Subject';


-- ============================================================================
-- 2. official_minutes — who TYPED the minute (the clerk), beside who WROTE it
-- ============================================================================
ALTER TABLE public.official_minutes
  ADD COLUMN IF NOT EXISTS recorded_by_user_id UUID NULL REFERENCES public.profiles(id);


-- ============================================================================
-- 3. The action resolver — intake now embeds forward-to-AO and record-minutes
-- ============================================================================
-- MINOR_STAFF has no branch: it has no actions on any letter. SUBJECT_CLERK
-- gains WRITE_MINUTES (to record the AO's minute) and moves a Logged letter to
-- Forwarded to AO; the Logged -> Forwarded to Subject step is gone.
CREATE OR REPLACE FUNCTION public.mail_available_actions(p_mail_id TEXT, p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_record RECORD;
  v_profile RECORD;
  v_perms TEXT[] := '{}'::TEXT[];
BEGIN
  SELECT * INTO v_record FROM public.mail_records WHERE id = p_mail_id;
  IF NOT FOUND THEN
    RETURN '{}'::TEXT[];
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

  -- The AO is NOT an executive branch here. Their one act is to record the
  -- primary minute on a letter the clerk forwarded to them and hand the paper
  -- back. They do not log letters, do not forward to themselves, and do not
  -- assign officers.
  IF v_profile.role IN ('ADMIN','SECRETARY','CHIEF_CLERK') THEN
    v_perms := ARRAY['CREATE_MAIL','READ_ALL_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_ACTION_STATUS','CLOSE_MAIL_FILE','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role = 'AO' THEN
    v_perms := ARRAY['WRITE_MINUTES'];
  ELSIF v_profile.role = 'SUBJECT_CLERK' THEN
    v_perms := ARRAY['CREATE_MAIL','READ_DEPARTMENT_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role IN ('OFFICER','TRANSPORT_OFFICER') THEN
    v_perms := ARRAY['READ_ASSIGNED_MAIL','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'];
  END IF;

  -- status is cast to text on purpose, so this body does not coerce the
  -- just-added enum value and can be created in the same transaction.
  IF v_record.status::text = 'Logged' THEN
    -- ONLY the intake clerk pushes a Logged letter to the AO.
    IF v_profile.role = 'SUBJECT_CLERK' THEN
      v_perms := array_append(v_perms, 'forward_to_ao');
    END IF;
    IF 'CREATE_MAIL' = ANY(v_perms) THEN
      v_perms := array_append(v_perms, 'edit');
      v_perms := array_append(v_perms, 'delete');
    END IF;
  ELSIF v_record.status::text = 'Forwarded to AO' THEN
    -- The AO records the primary minute; the letter then returns to the clerk.
    IF v_profile.role IN ('AO','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'add_minutes');
    END IF;
  ELSIF v_record.status::text = 'Forwarded to Subject' THEN
    -- The clerk routes it to an officer. The AO does not assign.
    IF v_profile.role IN ('SUBJECT_CLERK','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'assign');
    END IF;
  ELSIF v_record.status::text = 'Assigned' THEN
    IF 'UPDATE_ACTION_STATUS' = ANY(v_perms) THEN
      v_perms := array_append(v_perms, 'start');
    END IF;
  ELSIF v_record.status::text = 'In Progress' THEN
    IF 'UPDATE_ACTION_STATUS' = ANY(v_perms) THEN
      v_perms := array_append(v_perms, 'complete');
    END IF;
  END IF;

  RETURN v_perms;
END;
$$;


-- ============================================================================
-- 4. mail_records — read, insert and update policies
-- ============================================================================
DROP POLICY IF EXISTS mail_read   ON public.mail_records;
DROP POLICY IF EXISTS mail_insert ON public.mail_records;
DROP POLICY IF EXISTS mail_update ON public.mail_records;

-- READ: MINOR_STAFF clause removed; every other clause is unchanged.
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
          mail_records.department_id = p.department_id
          OR (mail_records.department_id IS NULL AND mail_records.created_by_user_id = p.id)
          OR mail_records.assigned_officer_id = p.id
        ))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER') AND mail_records.assigned_officer_id = p.id)
      )
      AND NOT (p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER') AND mail_records.priority = 'Confidential')
  )
);

-- INSERT: intake is a SUBJECT_CLERK task now.
CREATE POLICY mail_insert ON public.mail_records FOR INSERT TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('SUBJECT_CLERK','ADMIN')
  )
);

-- UPDATE: USING is the OLD row, WITH CHECK is the NEW row. SUBJECT_CLERK now
-- moves a letter through Logged -> Forwarded to AO -> Forwarded to Subject.
CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: may only edit a letter while it is sitting in their queue.
        OR (p.role = 'AO' AND mail_records.status::text = 'Forwarded to AO')
        OR (p.role = 'SUBJECT_CLERK'
            AND (mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id)
            AND mail_records.status::text IN ('Logged','Forwarded to AO','Forwarded to Subject'))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER')
            AND mail_records.assigned_officer_id = p.id
            AND mail_records.status::text IN ('Assigned','In Progress'))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: the new row is either still in their queue or back with the clerk.
        OR (p.role = 'AO' AND mail_records.status::text IN ('Forwarded to AO','Forwarded to Subject'))
        OR (p.role = 'SUBJECT_CLERK'
            AND (mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER')
            AND mail_records.assigned_officer_id = p.id)
      )
  )
);


-- ============================================================================
-- 5. official_minutes — a minute is written by its author alone
-- ============================================================================
-- Superseded: this patch used to let a SUBJECT_CLERK record the AO's minute on
-- the AO's behalf. The AO records their own minute now, so the only write that
-- is allowed is "the caller is the author".
DROP POLICY IF EXISTS minutes_write ON public.official_minutes;

CREATE POLICY minutes_write ON public.official_minutes FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = author_user_id
);


-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- The new enum value:
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'mail_status'::regtype ORDER BY enumsortorder;
--   expect: Logged, Forwarded to AO, Forwarded to Subject, Assigned, In Progress, Completed
--
-- The policies now on each table:
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'mail_records'
--  ORDER BY policyname;
--   expect: mail_delete, mail_insert, mail_read, mail_update
--
-- The clerk's new action on a Logged letter:
-- SELECT public.mail_available_actions('<some-logged-mail-id>', '<a-subject-clerk-uuid>');
--   expect the array to contain: forward_to_ao
