-- ============================================================================
-- PME System — patch: scope duty-chart writes to the clerk's own branch
-- ============================================================================
-- Run this in the Supabase SQL Editor on a live database.
--
-- THE GAP THIS CLOSES
--
-- `duties_write` originally allowed ANY SUBJECT_CLERK (or ADMIN) to write a duty
-- onto ANY officer:
--
--     CREATE POLICY duties_write ON public.officer_duties FOR ALL TO authenticated
--     USING (EXISTS (SELECT 1 FROM public.profiles p
--                    WHERE p.id = auth.uid() AND p.role IN ('ADMIN','SUBJECT_CLERK')));
--
-- `profiles_read` is `USING (true)`, so a branch clerk can read every officer,
-- and the Duty Charts screen listed them all. The frontend has since been
-- narrowed (DutyChartTab passes the clerk's department_id, exactly as
-- OfficerPage does), but a scope that lives only in the UI is a scope a console
-- bypasses. This patch puts the rule in the policy.
--
-- THE RULE
--
--   * ADMIN                       -> every department's chart
--   * SUBJECT_CLERK + central     -> every department's chart (the MAIN clerk,
--                                    who handles intake across the ministry)
--   * SUBJECT_CLERK (branch)      -> only officers whose department_id equals the
--                                    clerk's own department_id
--   * any other role              -> nothing (unchanged)
--
-- A branch clerk with no department (department_id IS NULL) therefore writes
-- nothing, which matches how the rest of the system treats a department-less
-- clerk (see mail_stats_rows). NULL = NULL is not TRUE, so the row is refused.
--
-- USING is reused as WITH CHECK because none is declared: an INSERT and the new
-- side of an UPDATE are constrained by the same expression. A branch clerk also
-- cannot MOVE a duty row onto another branch's officer — the old row fails USING.
--
-- Idempotent: DROP POLICY IF EXISTS / CREATE POLICY, safe to re-run.
-- Mirrors database/supabase_schema.sql.
-- ============================================================================

DROP POLICY IF EXISTS duties_write ON public.officer_duties;

CREATE POLICY duties_write ON public.officer_duties FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'ADMIN'
        -- The main (central) clerk maintains every department's officers.
        OR (p.role = 'SUBJECT_CLERK' AND p.is_central_clerk)
        -- An ordinary branch clerk maintains only their own department's officers.
        OR (p.role = 'SUBJECT_CLERK'
            AND EXISTS (
              SELECT 1 FROM public.profiles o
              WHERE o.id = officer_duties.officer_user_id
                AND o.department_id = p.department_id
            ))
      )
  )
);

-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- 1. As the MAIN (central) clerk (is_central_clerk = TRUE), add a duty to an
--    officer in another department. Expect success.
-- 2. As a branch subject clerk, the Duty Charts screen lists only your own
--    branch's officers, and adding a duty succeeds.
-- 3. Hand-crafted cross-branch write from a branch clerk is refused by RLS:
--      insert into public.officer_duties (officer_user_id, section_name, duty_description, keywords)
--      values ('<officer-in-another-branch>', 'X', 'Y', '[]'::jsonb);
--    -> "new row violates row-level security policy for table \"officer_duties\""
--
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname='public' AND tablename='officer_duties' ORDER BY policyname;
