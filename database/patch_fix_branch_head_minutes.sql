-- ============================================================================
-- Fix: a letter that arrives straight at a BRANCH is minuted by that branch's
-- Department Head, and the branch clerk types it on the head's behalf
-- ============================================================================
-- THE GAP
--
-- A branch subject clerk could already LOG a letter (mail_insert allows any
-- SUBJECT_CLERK, and the registry shows "Log letter" for them) and forward it
-- to the endorsing executive. But the minute step belonged to the ministry AO:
--
--   * `mail_available_actions` granted `add_minutes` at 'Forwarded to AO' to
--     AO / ADMIN / SECRETARY / CHIEF_CLERK, and to the MAIN (central) clerk
--     only. A BRANCH clerk and a DEPARTMENT_HEAD got nothing, so the form was
--     never offered.
--   * `minutes_write` let a clerk enter a minute on somebody else's behalf only
--     when `is_central_clerk = TRUE` and the author was an AO/Secretary/
--     CHIEF_CLERK/ADMIN. A branch clerk naming their own head was refused by
--     the policy with a 403.
--
-- So a letter logged by a branch clerk stopped at 'Forwarded to AO' with no
-- way forward: nobody who could see it could minute it.
--
-- WHY IT MATTERS
--
-- A letter that is addressed to a branch is endorsed by that branch's
-- Department Head, not by the ministry AO. The head writes the minute on the
-- paper; the clerk enters what the head wrote. The minute must carry the
-- HEAD's name and role, not the clerk's.
--
-- THE RULE NOW
--
-- `mail_available_actions`, at 'Forwarded to AO'
--
--   * AO / ADMIN / SECRETARY / CHIEF_CLERK - unchanged.
--   * SUBJECT_CLERK - the MAIN (central) clerk, as before, AND now any branch
--     clerk for a letter of their OWN department
--     (`v_record.department_id = v_profile.department_id`).
--   * both clerk cases keep the "no minute yet" guard, so a second clerk
--     cannot add a competing endorsement.
--
-- `minutes_write` gained a third branch, alongside "the author enters their
-- own minute" and "the central clerk enters an executive's minute":
--
--   * recorded_by_user_id = auth.uid()  (the clerk typing it)
--   * the letter is at 'Forwarded to AO' and carries no minute yet
--   * the clerk is a SUBJECT_CLERK whose department is the letter's
--   * the named author is a DEPARTMENT_HEAD of that same department
--   * author_role and author_name are the head's real ones
--
-- A DEPARTMENT_HEAD still does not get `mail_update`, so they cannot log in and
-- enter it themselves - the branch clerk types it, exactly as the main clerk
-- types the AO's minute. `add_minutes` is therefore still withheld from the
-- head, so no button is offered that the server would refuse (D61).
--
-- The body below is identical to the canonical one in supabase_schema.sql.
-- Every patch that re-creates these objects carries the same body, so the live
-- database ends up with this rule whichever of them is applied last.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The function: which actions are offered at each status
-- ----------------------------------------------------------------------------

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

  -- MINOR_STAFF is deliberately absent. Intake is now a SUBJECT_CLERK task;
  -- a front-desk role with no computer literacy does not log in.
  --
  -- The AO is NOT an executive branch here. Their one act is to record the
  -- primary minute on a letter the clerk forwarded to them and hand the paper
  -- back. They do not log letters, do not forward to themselves, and do not
  -- assign officers.
  IF v_profile.role IN ('ADMIN','SECRETARY','CHIEF_CLERK') THEN
    v_perms := ARRAY['CREATE_MAIL','READ_ALL_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_ACTION_STATUS','CLOSE_MAIL_FILE','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role = 'AO' THEN
    v_perms := ARRAY['WRITE_MINUTES'];
  ELSIF v_profile.role = 'SUBJECT_CLERK' THEN
    v_perms := ARRAY['CREATE_MAIL','READ_DEPARTMENT_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_DUTY_CHART','UPDATE_ACTION_STATUS'];
  ELSIF v_profile.role = 'DEPARTMENT_HEAD' THEN
    -- A department head sees their own department's letters and can approve
    -- completion documents addressed to them, but does not log, forward or
    -- assign — those are clerk duties.
    v_perms := ARRAY['READ_DEPARTMENT_MAIL','READ_ASSIGNED_MAIL','WRITE_MINUTES','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role IN ('OFFICER','TRANSPORT_OFFICER') THEN
    v_perms := ARRAY['READ_ASSIGNED_MAIL','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'];
  END IF;

  -- State machine: what actions are valid for the CURRENT status?
  --
  -- status is cast to text on purpose. The Forwarded-to-AO value is added by
  -- the incremental patch; a plain enum literal here would be coerced at
  -- execution and could not be used in the same transaction that adds it.
  IF v_record.status::text = 'Logged' THEN
    -- ONLY the intake clerk pushes a Logged letter to the AO. An executive
    -- cannot, and the AO cannot forward a letter to themselves.
    IF v_profile.role = 'SUBJECT_CLERK' THEN
      v_perms := array_append(v_perms, 'forward_to_ao');
    END IF;
    IF 'CREATE_MAIL' = ANY(v_perms) THEN
      v_perms := array_append(v_perms, 'edit');
      v_perms := array_append(v_perms, 'delete');
    END IF;
  ELSIF v_record.status::text = 'Forwarded to AO' THEN
    -- The endorsing executive records the primary minute; the letter then
    -- returns to the clerk. For a letter the ministry AO received that is the
    -- AO/Secretary. For a letter that arrived straight at a BRANCH it is that
    -- branch's Department Head, and the branch clerk types it on the head's
    -- behalf — so a clerk may record here only for their OWN department.
    IF v_profile.role IN ('AO','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'add_minutes');
    ELSIF v_profile.role = 'SUBJECT_CLERK'
          AND (v_profile.is_central_clerk
               OR v_record.department_id = v_profile.department_id) THEN
      -- Only allow if no minute has been added yet (by anyone) to prevent duplicates
      IF NOT EXISTS (SELECT 1 FROM public.official_minutes om WHERE om.mail_record_id = p_mail_id) THEN
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
    -- document, which the AO or Secretary must approve.
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

-- ----------------------------------------------------------------------------
-- 2. The policy: who may write a minute, and in whose name
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS minutes_write ON public.official_minutes;

-- A minute is entered by its AUTHOR alone, or by a subject clerk on behalf of
-- the person who wrote it on the physical letter:
--
--   * the MAIN (central) clerk, for any letter, may name the AO/Secretary/
--     CHIEF_CLERK/ADMIN who endorsed it;
--   * a BRANCH clerk may name only their own department's Department Head, and
--     only for their own department's letter.
--
-- When recorded on behalf, author_user_id must be that endorser, author_role
-- must match, and recorded_by_user_id must be the clerk typing it.
CREATE POLICY minutes_write ON public.official_minutes FOR INSERT TO authenticated WITH CHECK (
  -- The author enters their own minute.
  auth.uid() = author_user_id
  -- OR the main subject clerk enters it on behalf of an executive.
  OR (
    recorded_by_user_id = auth.uid()
    AND author_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.mail_records m
      JOIN public.profiles p ON p.id = auth.uid()
      JOIN public.profiles a ON a.id = official_minutes.author_user_id
      WHERE m.id = official_minutes.mail_record_id
        AND p.role = 'SUBJECT_CLERK'
        AND p.is_central_clerk = TRUE
        AND m.status::text = 'Forwarded to AO'
        AND NOT EXISTS (SELECT 1 FROM public.official_minutes om2 WHERE om2.mail_record_id = m.id)
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
-- 3. Read-only checks
-- ============================================================================
-- Every statement below only reads. None of them changes a row.

-- 3a. The branch rule is in the live function body, and the policy carries the
--     branch clause.
SELECT
  position('v_record.department_id = v_profile.department_id'
           IN pg_get_functiondef('public.mail_available_actions'::regproc)) > 0
    AS branch_clerk_action_rule_present,
  (SELECT position('a.role = ''DEPARTMENT_HEAD''' IN with_check)
     FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'official_minutes'
      AND policyname = 'minutes_write') > 0
    AS branch_head_policy_present;

-- 3b. The letters waiting at 'Forwarded to AO', with the department they
--     belong to, whether a minute already exists, and the branch head who is
--     expected to endorse them. `head_name` NULL means the department has no
--     active DEPARTMENT_HEAD - the clerk would have nobody to name, so the fix
--     is to give that branch a head (Admin -> Users).
SELECT
  m.day_stamp_no,
  m.subject,
  d.name AS department,
  m.status::text AS status,
  EXISTS (SELECT 1 FROM public.official_minutes om WHERE om.mail_record_id = m.id)
    AS has_minute,
  h.full_name AS head_name
FROM public.mail_records m
LEFT JOIN public.departments d ON d.id = m.department_id
LEFT JOIN LATERAL (
  SELECT p.full_name
  FROM public.profiles p
  WHERE p.role = 'DEPARTMENT_HEAD'
    AND p.department_id = m.department_id
    AND p.is_active
  ORDER BY p.full_name
  LIMIT 1
) h ON TRUE
WHERE m.status::text = 'Forwarded to AO'
ORDER BY m.receipt_date DESC;

-- 3c. Every department and the head a branch clerk could name. A blank
--     `head_name` is the one thing this feature cannot work without.
SELECT
  d.name AS department,
  h.full_name AS head_name,
  h.is_active AS head_active
FROM public.departments d
LEFT JOIN LATERAL (
  SELECT p.full_name, p.is_active
  FROM public.profiles p
  WHERE p.role = 'DEPARTMENT_HEAD'
    AND p.department_id = d.id
  ORDER BY p.is_active DESC, p.full_name
  LIMIT 1
) h ON TRUE
ORDER BY d.name;

-- 3d. Who may minute one letter. Put a real letter id and a branch clerk's uuid
--     in the two places, and both of those people must show 'add_minutes'.
--
--     SELECT
--       p.full_name,
--       p.role::text AS role,
--       p.is_central_clerk,
--       p.department_id = m.department_id AS same_department,
--       public.mail_available_actions(m.id, p.id) AS actions
--     FROM public.profiles p
--     CROSS JOIN public.mail_records m
--     WHERE m.id = '<letter-id>'
--       AND p.id IN ('<branch-clerk-uuid>', '<branch-head-uuid>')
--     ORDER BY p.role, p.full_name;
--
--     The clerk must show 'add_minutes'. The head must NOT - they do not type
--     it themselves, and the form must not offer what the policy would refuse.
