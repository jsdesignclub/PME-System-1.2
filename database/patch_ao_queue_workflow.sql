-- ============================================================================
-- PME System — patch: the AO queue workflow
-- ============================================================================
-- Run this in the Supabase SQL Editor on a live database.
--
-- THE WORKFLOW THIS ENFORCES
--
--     SUBJECT_CLERK logs the letter                        (Logged)
--       -> ONLY the clerk forwards the paper to the AO     (Forwarded to AO)
--       -> the AO sees it, records the primary minute      (Forwarded to Subject)
--       -> the clerk assigns an officer                    (Assigned)
--       -> the officer works it                            (In Progress -> Completed)
--
-- THREE RULES, ALL OF WHICH THIS FILE INSTALLS:
--
-- 1. Only a SUBJECT_CLERK forwards to the AO. Before this, the AO (and every
--    executive) held FORWARD_MAIL and so was offered a "Forward to AO" button on
--    a Logged letter — the AO could push a letter to themselves, which is not a
--    workflow. `mail_available_actions` now grants `forward_to_ao` to the clerk
--    and to no one else.
--
-- 2. The AO sees ONLY the letters forwarded to them (status 'Forwarded to AO'),
--    plus any letter they have already written a minute on. The second clause is
--    not cosmetic: without it the AO submits the minute, the letter moves to
--    'Forwarded to Subject', and the page they are looking at immediately 404s.
--    The AO is no longer an executive (READ_ALL_MAIL) role.
--
-- 3. The AO records the minute; the clerk does not record it on the AO's
--    behalf. `add_minutes` at 'Forwarded to AO' is granted to the AO (and the
--    ADMIN/SECRETARY/CHIEF_CLERK as an escape hatch), not to SUBJECT_CLERK.
--
-- 4. The AO still sees the MINISTRY-WIDE progress dashboard (same component as
--    admin/secretary), even though their letters stay scoped to their queue.
--    Its figures come from `mail_stats_rows()`, a SECURITY DEFINER function
--    that is the dashboard's only aggregate source and admits ADMIN / SECRETARY
--    / CHIEF_CLERK / AO. The frontend grants the AO READ_ALL_MAIL to select that
--    dashboard; it does not widen their letter visibility — RLS still does.
--
-- SAFE TO RUN AGAIN. CREATE OR REPLACE makes the function idempotent, and
-- DROP POLICY IF EXISTS / CREATE POLICY makes the policy recreation idempotent.
-- Mirrors database/supabase_schema.sql and database/patch_clerk_intake_workflow.sql.
-- ============================================================================


-- ============================================================================
-- 1. The action resolver
-- ============================================================================
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

  -- The AO is not an executive branch: no intake, no forwarding, no assignment.
  IF v_profile.role IN ('ADMIN','SECRETARY','CHIEF_CLERK') THEN
    v_perms := ARRAY['CREATE_MAIL','READ_ALL_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_ACTION_STATUS','CLOSE_MAIL_FILE','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role = 'AO' THEN
    v_perms := ARRAY['WRITE_MINUTES'];
  ELSIF v_profile.role = 'SUBJECT_CLERK' THEN
    v_perms := ARRAY['CREATE_MAIL','READ_DEPARTMENT_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role IN ('OFFICER','TRANSPORT_OFFICER') THEN
    v_perms := ARRAY['READ_ASSIGNED_MAIL','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'];
  END IF;

  -- status is cast to text on purpose (see patch_clerk_intake_workflow.sql).
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
-- 2. mail_records read policy — AO scoped to their queue
-- ============================================================================
DROP POLICY IF EXISTS mail_read ON public.mail_records;

CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        -- ADMIN, SECRETARY, CHIEF_CLERK: READ_ALL_MAIL
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
      -- Confidential hidden from SUBJECT_CLERK/OFFICER. The AO sees a
      -- confidential letter the clerk forwarded to them, exactly as before.
      AND NOT (p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER') AND mail_records.priority = 'Confidential')
  )
);


-- ============================================================================
-- 3. mail_records write policy — stop the AO writing letters not in their queue
-- ============================================================================
-- The old policy named the AO in the same branch as the executives, with no row
-- predicate: an AO could UPDATE any letter in the system. The AO now writes in
-- exactly one situation — recording the primary minute, which moves the letter
-- from 'Forwarded to AO' (USING, the old row) to 'Forwarded to Subject'
-- (WITH CHECK, the new row).
DROP POLICY IF EXISTS mail_update ON public.mail_records;

CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: may only edit a letter while it is sitting in their queue.
        OR (p.role = 'AO' AND mail_records.status::text = 'Forwarded to AO')
        OR (p.role = 'SUBJECT_CLERK'
            AND (p.is_central_clerk
                 OR mail_records.department_id = p.department_id
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
            AND (p.is_central_clerk
                 OR mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER')
            AND mail_records.assigned_officer_id = p.id)
      )
  )
);


-- ============================================================================
-- 4. official_minutes write policy — a minute is authored by its writer
-- ============================================================================
-- Supersedes the old "clerk records the AO's minute on the AO's behalf" clause.
-- The AO writes their own minute, so the only allowed INSERT is authorship.
DROP POLICY IF EXISTS minutes_write ON public.official_minutes;

CREATE POLICY minutes_write ON public.official_minutes FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = author_user_id
);


-- ============================================================================
-- 5. mail_stats_rows() — ministry-wide figures for the dashboard
-- ============================================================================
-- The AO now sees the same progress dashboard as admin/secretary, but the
-- mail_read policy scopes the AO to their forwarded queue. Reading mail_records
-- directly would therefore show the AO a dashboard of their own queue. This
-- SECURITY DEFINER function reads every row (deliberately bypassing RLS) and is
-- the dashboard's only aggregate source. The role check is what keeps the bypass
-- to the monitoring roles; the AO is included, officers and clerks are not.
CREATE OR REPLACE FUNCTION public.mail_stats_rows()
RETURNS TABLE (
  status       text,
  priority     text,
  category     text,
  sender_type  text,
  created_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('ADMIN','SECRETARY','CHIEF_CLERK','AO') THEN
    RAISE EXCEPTION 'Not authorized to read mail statistics' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT m.status::text, m.priority::text, m.category::text, m.sender_type::text, m.created_at
    FROM public.mail_records m;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mail_stats_rows() TO authenticated;


-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- 1. As the SUBJECT_CLERK, open a Logged letter: expect a "Forward to AO"
--    button and NO add-minutes form.
-- 2. As the AO, the registry shows only letters at 'Forwarded to AO' (plus any
--    the AO has already minuted). Open one: expect the add-minutes form and NO
--    "Forward to AO" button.
-- 3. As an ADMIN/SECRETARY: no "Forward to AO" button on a Logged letter.
-- 4. As the AO, the dashboard shows ministry-wide tiles/charts (not their own
--    queue's near-empty figures), while the registry still lists only the
--    letters forwarded to them.
--
-- SELECT public.mail_available_actions('<logged-mail-id>', '<ao-uuid>');
--   expect: no 'forward_to_ao'
-- SELECT public.mail_available_actions('<logged-mail-id>', '<clerk-uuid>');
--   expect: contains 'forward_to_ao'
