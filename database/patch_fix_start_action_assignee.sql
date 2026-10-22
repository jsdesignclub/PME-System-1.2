-- ============================================================================
-- Fix: `start` and `submit_completion` belong to the letter's ASSIGNEE
-- ============================================================================
-- THE BUG
--
-- After the main (central) subject clerk assigned a letter to an officer, the
-- clerk's own letter page still showed the "Start" button and the progress-note
-- box. It had to be pressed by the clerk who had just handed the letter to
-- somebody else, and it was not theirs to press.
--
-- WHY IT HAPPENED
--
-- `mail_available_actions` granted `start` to every profile holding
-- UPDATE_ACTION_STATUS, and every SUBJECT_CLERK holds it. The role was the
-- whole test, so the clerk who assigned the letter passed it.
--
-- The RLS said otherwise all along. `mail_update` allows the Assigned ->
-- In Progress move only when `assigned_officer_id = p.id`, so the clerk's press
-- was refused by the database with a 403. The button was a trap: it offered a
-- move the server would not perform, which is the one thing D61 exists to
-- prevent.
--
-- THE RULE NOW
--
--   * `start` — the assignee, and the ADMIN / SECRETARY / CHIEF_CLERK who may
--     write to any letter in `mail_update` and so can take a stalled letter in
--     hand. A clerk who assigned the letter to an officer is NOT the assignee
--     and no longer gets it.
--
--   * `submit_completion` — the assignee only. `submit_completion` refuses
--     anybody else by name ("Only the assigned officer may forward a completion
--     document."), so there is no oversight override here.
--
-- A clerk who took the letter for THEMSELVES — self-assign, or a letter routed
-- to their own desk — IS the assignee, so they keep the button and the progress
-- note. That is the case the button was written for.
--
-- The body below is identical to the canonical one in supabase_schema.sql.
-- Every patch that re-creates this function carries the same body, so the live
-- database ends up with this rule whichever of them is applied last.
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

-- ============================================================================
-- 2. Read-only checks
-- ============================================================================
-- Every statement below only reads. None of them changes a row.

-- 2a. The rule is in the live function body.
SELECT
  position('assigned_officer_id = p_user_id' IN pg_get_functiondef('public.mail_available_actions'::regproc)) > 0
    AS assignee_rule_present;

-- 2b. The letters currently waiting to be started, with the officer each one
--     is assigned to. The clerk who assigned it is not shown here on purpose:
--     the column IS the answer to "who may press Start".
SELECT
  m.day_stamp_no,
  m.status::text AS status,
  m.priority::text AS priority,
  o.full_name AS assigned_to,
  o.role::text AS assigned_to_role,
  o.is_central_clerk AS assigned_to_is_central_clerk
FROM public.mail_records m
LEFT JOIN public.profiles o ON o.id = m.assigned_officer_id
WHERE m.status::text IN ('Assigned','In Progress')
ORDER BY m.receipt_date DESC;

-- 2c. Who may press Start on one letter. Put a real letter id in the first
--     place and run it: every row is one person's answer.
--
--     ASSIGNEE  -> 'start' is on the list. That is the officer, or the clerk
--                  who took the letter for themselves.
--     ANYBODY ELSE WHO IS NOT AN OVERSIGHT ROLE -> 'start' is absent.
--     ADMIN / SECRETARY / CHIEF_CLERK -> 'start' is on the list, by the
--                  override: they may write to any letter.
--
--     SELECT
--       p.full_name,
--       p.role::text AS role,
--       p.is_central_clerk,
--       (m.assigned_officer_id = p.id) AS is_the_assignee,
--       public.mail_available_actions('<letter-id>', p.id) AS actions
--     FROM public.profiles p
--     CROSS JOIN public.mail_records m
--     WHERE m.id = '<letter-id>'
--     ORDER BY p.role, p.full_name;

-- 2d. A letter that is Assigned to an officer, seen by the clerk who assigned
--     it: the action list must NOT contain 'start'.
--
--     SELECT public.mail_available_actions('<letter-id>', '<clerk-uuid>');
--
--     The same letter seen by the assigned officer MUST contain 'start':
--
--     SELECT public.mail_available_actions('<letter-id>', '<officer-uuid>');
