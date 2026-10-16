-- ============================================================================
-- PME System — patch: branch subject clerks (routing + branch-scoped dashboard)
-- ============================================================================
-- Run this in the Supabase SQL Editor on a live database.
--
-- This file does two things for the branch subject clerk:
--   1. lets a letter be ROUTED to a branch clerk (mail_update policy)
--   2. scopes the DASHBOARD figures to that clerk's own branch
--      (mail_stats_rows), and lets the registry stay branch-only.
--
-- THE WORKFLOW THIS ENABLES
--
--     main (central) subject clerk
--        -> EITHER assigns an officer directly             (Assigned)
--        -> OR routes the letter to a BRANCH subject clerk (Forwarded to Subject)
--             -> the branch clerk assigns one of THEIR OWN branch's officers
--                                                           (Assigned -> ...)
--
-- The frontend for this is already in place:
--   * mailApi.officers({ includeClerks: true }) lists branch clerks beside officers
--   * mailApi.routeToClerk() moves the letter to the branch clerk
--   * the registry / dashboard pass the department filter for a non-central clerk
-- This file installs the two database rules the feature needs.
--
-- WHY THE RULE IS NEEDED
--
-- Routing sets `assigned_officer_id` to the branch clerk and leaves the status at
-- 'Forwarded to Subject'. But the mail_update policy only let a SUBJECT_CLERK
-- write a letter in their own department, one they logged, or (as central clerk)
-- anywhere. A branch clerk in another department is none of those, so the routing
-- appeared to succeed while the branch clerk's own assign step 403'd.
--
-- Adding `mail_records.assigned_officer_id = p.id` to the SUBJECT_CLERK branch
-- names the branch clerk as an owner of the letter while it sits with them. The
-- mail_read policy ALREADY carries this clause; the write policies were the gap.
--
-- PREREQUISITE: the clerk who routes TO another branch (the "main subject clerk")
-- must be able to see the other branch's clerks. Set is_central_clerk = TRUE on
-- that clerk:
--
--   UPDATE public.profiles SET is_central_clerk = TRUE WHERE email = '<their email>';
--
-- A central clerk lists every department's officers and branch clerks in the
-- assign dropdown; an ordinary clerk lists only their own department's.
--
-- Idempotent: DROP POLICY IF EXISTS / CREATE POLICY, safe to re-run.
-- Mirrors database/supabase_schema.sql.
-- ============================================================================

DROP POLICY IF EXISTS mail_update ON public.mail_records;

CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: may only edit a letter while it is sitting in their queue.
        OR (p.role = 'AO' AND mail_records.status = 'Forwarded to AO')
        -- SUBJECT_CLERK owns intake and routing: forward to the AO, record the
        -- AO's minutes, then assign. The central clerk handles any department; an
        -- ordinary clerk any letter in their department or one they logged; and a
        -- letter ROUTED to a branch clerk names them in assigned_officer_id.
        OR (p.role = 'SUBJECT_CLERK'
            AND (p.is_central_clerk
                 OR mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id
                 OR mail_records.assigned_officer_id = p.id)
            AND mail_records.status IN ('Logged','Forwarded to AO','Forwarded to Subject'))
        -- The assigned officer starts (Assigned -> In Progress) and completes.
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER')
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
        -- A branch clerk keeps the letter after forwarding it on to an officer
        -- because the letter's department was moved to their branch on routing.
        OR (p.role = 'SUBJECT_CLERK'
            AND (p.is_central_clerk
                 OR mail_records.department_id = p.department_id
                 OR mail_records.created_by_user_id = p.id
                 OR mail_records.assigned_officer_id = p.id))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER')
            AND mail_records.assigned_officer_id = p.id)
      )
  )
);


-- ============================================================================
-- 2. Branch-scoped dashboard figures
-- ============================================================================
-- The dashboard's only aggregate source. It is SECURITY DEFINER, so it is the one
-- place that decides what a role may count:
--   * ministry-wide for ADMIN / SECRETARY / CHIEF_CLERK / AO and a CENTRAL clerk
--   * the caller's own BRANCH for an ordinary SUBJECT_CLERK
-- A branch subject clerk previously could not open the figures dashboard at all
-- (the function raised 42501 for SUBJECT_CLERK). Now they get their branch's
-- progress; the registry and every drill-down stay scoped to the branch too,
-- because the frontend passes the department filter for a non-central clerk.
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
  v_profile RECORD;
BEGIN
  SELECT p.role, p.department_id, p.is_central_clerk
    INTO v_profile
    FROM public.profiles p
   WHERE p.id = auth.uid();

  IF v_profile.role IS NULL
     OR v_profile.role::text NOT IN ('ADMIN','SECRETARY','CHIEF_CLERK','AO','SUBJECT_CLERK') THEN
    RAISE EXCEPTION 'Not authorized to read mail statistics' USING ERRCODE = '42501';
  END IF;

  IF v_profile.role::text = 'SUBJECT_CLERK' AND NOT v_profile.is_central_clerk THEN
    RETURN QUERY
      SELECT m.status::text, m.priority::text, m.category::text, m.sender_type::text, m.created_at
      FROM public.mail_records m
      WHERE m.department_id = v_profile.department_id;
  ELSE
    RETURN QUERY
      SELECT m.status::text, m.priority::text, m.category::text, m.sender_type::text, m.created_at
      FROM public.mail_records m;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mail_stats_rows() TO authenticated;


-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- 1. As the main (central) clerk, open a letter at 'Forwarded to Subject'. The
--    assign dropdown shows two group headings: "Officers" and "Branch subject
--    clerks".
-- 2. Choose a branch clerk (another department) and press Assign. Expect success;
--    the letter stays at 'Forwarded to Subject' and now sits in that branch's
--    registry.
-- 3. As the branch clerk, open the letter: the assign dropdown lists that
--    branch's own officers. Assign one: the letter moves to 'Assigned'.
-- 4. The branch clerk still sees the letter after assigning it (department match).
-- 5. As the branch clerk, the dashboard shows that branch's tiles/charts only,
--    and the Registry lists that branch's letters only.
--
-- SELECT policyname FROM pg_policies
--  WHERE schemaname='public' AND tablename='mail_records' ORDER BY policyname;
--   expect: mail_delete, mail_insert, mail_read, mail_update
