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
-- 3. The AO records the minute. `add_minutes` at 'Forwarded to AO' is granted to
--    the AO (and the ADMIN/SECRETARY/CHIEF_CLERK as an escape hatch), and to the
--    MAIN subject clerk — but only while the letter carries no minute yet, so
--    the clerk can enter what the AO wrote on the paper without a competing
--    endorsement ever being possible. See patch_central_clerk_add_minutes.sql
--    for the full rule.
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
    v_perms := ARRAY['CREATE_MAIL','READ_DEPARTMENT_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_DUTY_CHART','UPDATE_ACTION_STATUS'];
  ELSIF v_profile.role = 'DEPARTMENT_HEAD' THEN
    v_perms := ARRAY['READ_DEPARTMENT_MAIL','READ_ASSIGNED_MAIL','WRITE_MINUTES','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'];
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
    -- The MAIN subject clerk may also record it on the AO's behalf, but only
    -- while the letter carries no minute yet.
    IF v_profile.role IN ('ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'add_minutes');
    ELSIF v_profile.role = 'AO'
          AND COALESCE(v_record.endorser_role, 'AO') = 'AO' THEN
      v_perms := array_append(v_perms, 'add_minutes');
    ELSIF v_profile.role = 'SUBJECT_CLERK'
          AND ((v_profile.is_central_clerk
                AND COALESCE(v_record.endorser_role, 'AO') = 'AO')
               OR (COALESCE(v_record.endorser_role, 'AO') = 'DEPARTMENT_HEAD'
                   AND v_record.department_id = v_profile.department_id)) THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.official_minutes om WHERE om.mail_record_id = p_mail_id
      ) THEN
        v_perms := array_append(v_perms, 'add_minutes');
      END IF;
    END IF;
  ELSIF v_record.status::text = 'Forwarded to Subject' THEN
    -- The clerk routes it to an officer. The AO does not assign.
    IF v_profile.role IN ('SUBJECT_CLERK','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'assign');
    END IF;
  ELSIF v_record.status::text = 'Assigned' THEN
    -- `start` belongs to the person the letter is ASSIGNED TO, and to nobody
    -- else.
    --
    -- The clerk who routed the letter to an officer is not that person:
    -- starting the work is the officer's duty, and the clerk's business with
    -- the letter from here on is to watch it. A clerk who took the letter for
    -- themselves — self-assign, or a letter routed to their own desk — IS the
    -- assignee, so they still get the button.
    --
    -- `mail_update` has always said this: the Assigned -> In Progress move
    -- requires `assigned_officer_id = p.id`. Offering `start` to anybody else
    -- showed a button the server refuses with a 403 — the failure D61 exists
    -- to prevent.
    --
    -- ADMIN / SECRETARY / CHIEF_CLERK keep the reach they have in `mail_update`,
    -- where they may write to any letter: an oversight role must be able to
    -- take a stalled letter in hand.
    IF 'UPDATE_ACTION_STATUS' = ANY(v_perms)
       AND (v_record.assigned_officer_id = p_user_id
            OR v_profile.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')) THEN
      v_perms := array_append(v_perms, 'start');
    END IF;
  ELSIF v_record.status::text = 'In Progress' THEN
    -- The officer no longer completes directly: they forward a completion
    -- document, which the AO, Secretary or Department Head must approve.
    --
    -- The completion document is the assignee's to forward, and only the
    -- assignee's: `submit_completion` refuses anybody else by name ("Only the
    -- assigned officer may forward a completion document."). So there is no
    -- oversight override here, unlike `start` above.
    IF 'UPDATE_ACTION_STATUS' = ANY(v_perms)
       AND v_record.assigned_officer_id = p_user_id THEN
      v_perms := array_append(v_perms, 'submit_completion');
    END IF;
  ELSIF v_record.status::text = 'Pending Approval' THEN
    -- The addressed role decides, as does an ADMIN/CHIEF_CLERK override.
    IF v_profile.role IN ('ADMIN','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'approve_completion');
      v_perms := array_append(v_perms, 'reject_completion');
    ELSIF v_profile.role IN ('AO','SECRETARY','DEPARTMENT_HEAD') THEN
      IF EXISTS (
        SELECT 1 FROM public.completion_submissions cs
        WHERE cs.mail_record_id = p_mail_id
          AND cs.status = 'Pending'
          AND cs.approver_role::text = v_profile.role::text
      ) THEN
        v_perms := array_append(v_perms, 'approve_completion');
        v_perms := array_append(v_perms, 'reject_completion');
      END IF;
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
                 OR mail_records.created_by_user_id = p.id
                 OR mail_records.assigned_officer_id = p.id)
            AND mail_records.status::text IN ('Logged','Forwarded to AO','Forwarded to Subject'))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER','SUBJECT_CLERK')
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
                 OR mail_records.created_by_user_id = p.id
                 OR mail_records.assigned_officer_id = p.id))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER','SUBJECT_CLERK')
            AND mail_records.assigned_officer_id = p.id)
      )
  )
);


-- ============================================================================
-- 4. official_minutes write policy — a minute is authored by its writer
-- ============================================================================
-- Two ways in:
--
--  * The AUTHOR enters their own minute. Unchanged, and always available.
--  * The MAIN subject clerk enters it ON BEHALF of the AO/ADMIN/SECRETARY/
--    CHIEF_CLERK who wrote it on the physical letter. The clerk is named as
--    `recorded_by_user_id`; the letter must still be at 'Forwarded to AO' and
--    must carry no minute yet, so a second, competing endorsement cannot be
--    added on top of the AO's own.
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
