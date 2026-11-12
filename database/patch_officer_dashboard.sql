-- ============================================================================
-- PME System — patch: an officer's dashboard is their own assigned letters
-- ============================================================================
-- Run this in the Supabase SQL Editor on a live database.
--
-- WHY. The dashboard had two shapes: ministry/branch figures for the monitoring
-- roles, and a bare queue for an officer. An officer's queue is the right SET of
-- letters but the wrong PRESENTATION: they could not see their own workload as
-- figures (open / completed / overdue, by state, by priority), which is the
-- performance view every other role already had.
--
-- This extends the one aggregate source, `mail_stats_rows()`, instead of adding
-- a second one:
--
--   * ADMIN / SECRETARY / CHIEF_CLERK / AO, and a CENTRAL clerk  -> ministry
--   * an ordinary SUBJECT_CLERK / DEPARTMENT_HEAD                 -> their branch
--   * OFFICER / TRANSPORT_OFFICER                                 -> assigned to them
--
-- The officer branch filters on `assigned_officer_id = auth.uid()` and excludes
-- Confidential letters, matching the `mail_read` RLS policy that already hides
-- them from an officer. The registry list and every drill-down are narrowed by
-- the same officer id in frontend/src/pages/DashboardPage.jsx, so the figures,
-- the recent list and the rows behind a figure describe the same set.
--
-- Safe to run more than once: CREATE OR REPLACE, and it touches no table data.
-- Mirrors database/supabase_schema.sql.
-- ============================================================================

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
     OR v_profile.role::text NOT IN (
       'ADMIN','SECRETARY','CHIEF_CLERK','AO','SUBJECT_CLERK','DEPARTMENT_HEAD',
       'OFFICER','TRANSPORT_OFFICER'
     ) THEN
    RAISE EXCEPTION 'Not authorized to read mail statistics' USING ERRCODE = '42501';
  END IF;

  IF v_profile.role::text IN ('OFFICER','TRANSPORT_OFFICER') THEN
    -- An officer's dashboard is their own queue. Confidential letters are
    -- excluded for the same reason the mail_read policy hides them from this
    -- role; the aggregate must not count what the list cannot show.
    RETURN QUERY
      SELECT m.status::text, m.priority::text, m.category::text, m.sender_type::text, m.created_at
      FROM public.mail_records m
      WHERE m.assigned_officer_id = auth.uid()
        AND m.priority::text <> 'Confidential';
  ELSIF (v_profile.role::text = 'SUBJECT_CLERK' OR v_profile.role::text = 'DEPARTMENT_HEAD')
     AND NOT v_profile.is_central_clerk THEN
    -- A branch clerk or head sees their branch and nothing else. A user with no
    -- department sees an empty dashboard rather than every branch's figures.
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
-- 1. Sign in as an OFFICER and open the dashboard. It should show the same four
--    tiles and the three charts as the administrator, with figures matching the
--    letters assigned to that officer.
-- 2. Click a tile or a chart segment. The drill-down must list only that
--    officer's assigned letters, and "Open in the registry" must show the same
--    set.
-- 3. A Confidential letter assigned to the officer must not be counted.
