-- ============================================================================
-- Fix: a letter that arrives straight at a BRANCH is forwarded to that branch's
-- Department Head, minuted by the head, and typed by the branch clerk
-- ============================================================================
-- THE MISTAKE THIS CORRECTS
--
-- 'Forwarded to AO' was treated as if EVERY letter at that status were waiting
-- on the ministry Administrative Officer. A letter that a BRANCH clerk logs and
-- carries to their own head never goes to the AO at all: the branch head writes
-- the minute. But the status name was the only thing recording where the paper
-- was, so:
--
--   * the branch clerk's button said "Forward to AO";
--   * the letter appeared in every ministry AO's queue, and an AO could minute
--     it;
--   * a branch clerk could not minute it for their own head at all (the previous
--     attempt at this feature worked around that by letting them, but the step
--     still READ as the AO's).
--
-- WHAT CHANGED
--
-- `mail_records.endorser_role` records WHO the letter is waiting on for its
-- minute while it sits at 'Forwarded to AO':
--
--   * 'AO'              - a ministry letter. The AO writes the minute; the MAIN
--                         (central) clerk may type it for them.
--   * 'DEPARTMENT_HEAD' - a letter that arrived at a BRANCH. That branch's head
--                         writes the minute; the branch clerk types it.
--   * NULL              - letters logged before the marker existed; read as 'AO'.
--
-- The status VALUE is unchanged on purpose. Renaming the enum would rewrite the
-- history of every letter already at that step; the marker is enough to tell the
-- two apart, and the UI labels the step per letter ("Forwarded to Branch Head"
-- for a branch letter). No data is rewritten except the one-time backfill below,
-- which only fills in a marker that was previously unknown.
--
-- WHO FORWARDS WHERE
--
-- A BEFORE trigger (`trg_set_endorser_role`) sets the marker from the acting
-- user's profile at the moment of the forward: a non-central SUBJECT_CLERK is a
-- branch clerk and forwards to the branch head; everyone else forwards to the
-- AO. The client sends nothing, so the browser cannot choose the endorser.
--
-- THE RULES NOW
--
--   mail_read / mail_update   A letter whose marker is 'DEPARTMENT_HEAD' is NOT
--                             in the AO's queue and the AO cannot write to it.
--                             (The head and the branch clerk see it through the
--                             department clause they already had; ADMIN /
--                             SECRETARY / CHIEF_CLERK still see everything.)
--   mail_available_actions    `add_minutes` at 'Forwarded to AO' goes to the AO
--                             only for an 'AO' letter, and to a branch clerk only
--                             for their OWN department's 'DEPARTMENT_HEAD'
--                             letter. The "no minute yet" guard stays for both
--                             clerk cases.
--   minutes_write             A branch clerk may enter the minute in their own
--                             department head's name on a 'DEPARTMENT_HEAD'
--                             letter; the central clerk's executive case is
--                             limited to 'AO' letters. Same author role/name
--                             match as before.
--
-- A DEPARTMENT_HEAD still does not get `mail_update`, so they cannot log in and
-- type it themselves - the branch clerk types it, exactly as the central clerk
-- types the AO's minute. `add_minutes` is therefore still withheld from the
-- head, so no button is offered that the server would refuse (D61).
--
-- The objects below are identical to the canonical ones in supabase_schema.sql.
-- Every patch that re-creates them carries the same body, so the live database
-- ends up with these rules whichever of them is applied last.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS before each
-- CREATE POLICY, CREATE OR REPLACE FUNCTION. Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The marker
-- ----------------------------------------------------------------------------

ALTER TABLE public.mail_records
  ADD COLUMN IF NOT EXISTS endorser_role TEXT NULL;

COMMENT ON COLUMN public.mail_records.endorser_role IS
  'Who writes the minute while the letter is at Forwarded to AO: AO (or NULL) for a ministry letter, DEPARTMENT_HEAD for a letter that arrived at a branch.';

-- One-time backfill for letters already sitting at that step. A letter logged by
-- a non-central subject clerk is a branch letter; everything else is a ministry
-- letter, which is what NULL already means, so only the branch case is written.
UPDATE public.mail_records m
   SET endorser_role = 'DEPARTMENT_HEAD'
  FROM public.profiles p
 WHERE p.id = m.created_by_user_id
   AND p.role = 'SUBJECT_CLERK'
   AND p.is_central_clerk IS NOT TRUE
   AND m.endorser_role IS NULL
   AND m.status::text = 'Forwarded to AO';

-- ----------------------------------------------------------------------------
-- 1b. Who sets the marker
-- ----------------------------------------------------------------------------
-- Decided from the ACTING user's profile at the moment of the forward, so the
-- browser cannot choose the endorser (and cannot leak its own branch letter into
-- the AO queue by sending `endorser_role = 'AO'`). BEFORE, so the row the
-- policies and the notification trigger read is already final.
CREATE OR REPLACE FUNCTION public.set_endorser_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'Forwarded to AO'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'Forwarded to AO') THEN
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'SUBJECT_CLERK'
        AND p.is_central_clerk IS NOT TRUE
    ) THEN
      NEW.endorser_role := 'DEPARTMENT_HEAD';
    ELSE
      NEW.endorser_role := 'AO';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_endorser_role ON public.mail_records;
CREATE TRIGGER trg_set_endorser_role
BEFORE INSERT OR UPDATE ON public.mail_records
FOR EACH ROW
EXECUTE FUNCTION public.set_endorser_role();

-- ----------------------------------------------------------------------------
-- 2. The function: which actions are offered at each status
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
    -- returns to the clerk. The status name is historical — the step is "with
    -- whoever endorses this letter", and `endorser_role` says who that is:
    --
    --   * 'AO' (or NULL, for letters logged before the marker existed) — a
    --     MINISTRY letter. The AO writes it (or an oversight role), and the
    --     MAIN (central) clerk may type it on their behalf.
    --   * 'DEPARTMENT_HEAD' — a letter that arrived straight at a BRANCH. Its
    --     own head writes it and the branch clerk types it. The AO is not
    --     involved and does not get the action.
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

-- ----------------------------------------------------------------------------
-- 3. The policy: who may write a minute, and in whose name
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS minutes_write ON public.official_minutes;

-- A minute is entered by its AUTHOR alone, or by a subject clerk on behalf of
-- the person who wrote it on the physical letter:
--
--   * the MAIN (central) clerk, for a MINISTRY letter, may name the AO/Secretary/
--     CHIEF_CLERK/ADMIN who endorsed it;
--   * a BRANCH clerk, for a letter that arrived at their branch, may name only
--     their own department's Department Head.
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
        AND COALESCE(m.endorser_role, 'AO') = 'AO'
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

-- ----------------------------------------------------------------------------
-- 4. The letter's own visibility and writability
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS mail_read ON public.mail_records;
DROP POLICY IF EXISTS mail_update ON public.mail_records;

-- mail_records: read scoped by visibility; write via RLS checks
CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        -- ADMIN, SECRETARY, CHIEF_CLERK: READ_ALL_MAIL
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: ONLY the letters the clerk has forwarded to THEM (their queue),
        -- plus any letter they have already written a minute on, so that
        -- submitting the minute does not immediately turn the page into a 404.
        -- Plus any letter with a completion document awaiting THEIR approval.
        --
        -- A letter that arrived at a BRANCH is in that branch head's queue, not
        -- the AO's: it carries endorser_role = 'DEPARTMENT_HEAD' and is left out
        -- of the AO's queue entirely. Without this the AO would open it, and
        -- could minute it, which is exactly the confusion the branch flow
        -- exists to avoid.
        OR (p.role = 'AO' AND (
          (mail_records.status::text = 'Forwarded to AO'
           AND COALESCE(mail_records.endorser_role, 'AO') = 'AO')
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
        -- letters it files) + their own department + direct assignment. The
        -- created_by clause must match mail_update/mail_delete, which already
        -- let a clerk manage letters they logged; without it, INSERT ...
        -- RETURNING (PostgREST's return=representation) fails the SELECT policy
        -- for a letter routed away from the clerk's own desk.
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
      -- forward it, so hiding it from them strands the letter: they cannot open
      -- it, cannot move it, and INSERT ... RETURNING refuses the row they just
      -- created ("new row violates row-level security policy for table
      -- mail_records"). The creator sees their own confidential letter; every
      -- other clerk and every officer still does not.
      AND NOT (
        p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER')
        AND mail_records.priority = 'Confidential'
        AND mail_records.created_by_user_id IS DISTINCT FROM p.id
      )
  )
);

-- Write is split per operation rather than one FOR ALL policy, so the state a
-- caller may move FROM (USING) need not equal the state they move TO (WITH
-- CHECK). A single FOR ALL policy reused its USING expression as the WITH CHECK
-- and pinned SUBJECT_CLERK to one state while the workflow moved them through
-- several, refusing every write and surfacing as a PGRST116 on the assign path.
CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: may only edit a letter while it is sitting in their queue. The
        -- WITH CHECK below then allows the one transition out (to the clerk).
        -- A branch letter is not in their queue (see mail_read).
        OR (p.role = 'AO'
            AND mail_records.status = 'Forwarded to AO'
            AND COALESCE(mail_records.endorser_role, 'AO') = 'AO')
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
        OR (p.role = 'AO'
            AND mail_records.status IN ('Forwarded to AO','Forwarded to Subject')
            AND COALESCE(mail_records.endorser_role, 'AO') = 'AO')
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

-- ----------------------------------------------------------------------------
-- 4b. Notifications: tell the queue the letter is actually in
-- ----------------------------------------------------------------------------
-- The old body told every active AO about every forward. A branch letter is not
-- in their queue, so the branch head is told instead. Same notification type:
-- "a letter is waiting in your queue" is true of either desk.
CREATE OR REPLACE FUNCTION public.notify_on_mail_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_nil     UUID := '00000000-0000-0000-0000-000000000000'::UUID;
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'ref',      NEW.day_stamp_no,
    'subject',  NEW.subject,
    'letterId', NEW.id
  );

  IF NEW.assigned_officer_id IS DISTINCT FROM OLD.assigned_officer_id
     AND NEW.assigned_officer_id IS NOT NULL
     AND NEW.assigned_officer_id <> COALESCE(v_actor, v_nil) THEN
    PERFORM public.push_notification(NEW.assigned_officer_id, 'assigned', NEW.id, v_payload);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'Forwarded to AO' THEN
      IF COALESCE(NEW.endorser_role, 'AO') = 'DEPARTMENT_HEAD' THEN
        PERFORM public.push_notification(h.id, 'forwarded_to_ao', NEW.id, v_payload)
          FROM public.profiles h
         WHERE h.role = 'DEPARTMENT_HEAD'
           AND h.department_id = NEW.department_id
           AND h.is_active
           AND h.id <> COALESCE(v_actor, v_nil);
      ELSE
        PERFORM public.push_notification(p.id, 'forwarded_to_ao', NEW.id, v_payload)
          FROM public.profiles p
         WHERE p.role = 'AO'
           AND p.is_active
           AND p.id <> COALESCE(v_actor, v_nil);
      END IF;

    ELSIF NEW.status::text = 'Forwarded to Subject' THEN
      -- The letter came back from the endorser, so the clerk who logged it is
      -- told to carry on routing it. A clerk who recorded the minute ON BEHALF
      -- of the endorser has just done that step themselves: telling them the
      -- letter "came back" would be news about their own act. `recorded_by_user_id`
      -- is set only on a delegated minute, so an endorser recording their own
      -- still notifies the clerk.
      IF NEW.created_by_user_id IS NOT NULL
         AND NEW.created_by_user_id <> COALESCE(v_actor, v_nil)
         AND NOT EXISTS (
           SELECT 1 FROM public.official_minutes om
           WHERE om.mail_record_id = NEW.id
             AND om.recorded_by_user_id = v_actor
         ) THEN
        PERFORM public.push_notification(NEW.created_by_user_id, 'returned', NEW.id, v_payload);
      END IF;

    ELSIF NEW.status::text = 'Completed' THEN
      IF NEW.created_by_user_id IS NOT NULL
         AND NEW.created_by_user_id <> COALESCE(v_actor, v_nil) THEN
        PERFORM public.push_notification(NEW.created_by_user_id, 'completed', NEW.id, v_payload);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. Read-only checks
-- ============================================================================
-- Every statement below only reads. None of them changes a row.

-- 5a. The marker exists, and the policies carry the branch rule.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mail_records'
      AND column_name = 'endorser_role'
  ) AS marker_column_present,
  position('v_record.endorser_role'
           IN pg_get_functiondef('public.mail_available_actions'::regproc)) > 0
    AS branch_action_rule_present,
  (SELECT position('endorser_role' IN with_check) > 0
     FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mail_records'
      AND policyname = 'mail_read') AS mail_read_rule_present,
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgname = 'trg_set_endorser_role' AND NOT tgisinternal)
    AS marker_trigger_present,
  position('endorser_role'
           IN pg_get_functiondef('public.notify_on_mail_change'::regproc)) > 0
    AS branch_notify_rule_present;

-- 5b. Letters at the minute step, with the executive they are waiting on. A
--     branch letter shows head_name = the Department Head of its department;
--     a NULL there means the branch has no active head, and its clerk would
--     have nobody to name (Admin -> Users fixes that).
SELECT
  m.day_stamp_no,
  m.subject,
  d.name AS department,
  COALESCE(m.endorser_role, 'AO') AS endorser_role,
  EXISTS (SELECT 1 FROM public.official_minutes om WHERE om.mail_record_id = m.id)
    AS has_minute,
  COALESCE(h.full_name, ao.full_name) AS endorser_name
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
LEFT JOIN LATERAL (
  SELECT p.full_name
  FROM public.profiles p
  WHERE p.role = 'AO'
    AND p.is_active
  ORDER BY p.full_name
  LIMIT 1
) ao ON TRUE
WHERE m.status::text = 'Forwarded to AO'
ORDER BY m.receipt_date DESC;

-- 5c. Every department and the head a branch clerk could name. A blank
--     head_name is the one thing the branch flow cannot work without.
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

-- 5d. Who may minute one letter. Put a real letter id and the two uuids in the
--     three places; for a BRANCH letter the branch clerk must show
--     'add_minutes' and the ministry AO must NOT.
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
--       AND p.id IN ('<branch-clerk-uuid>', '<branch-head-uuid>', '<ao-uuid>')
--     ORDER BY p.role, p.full_name;
--
--     The branch clerk must show 'add_minutes'. The head must NOT - they do not
--     type it themselves, and the form must not offer what the policy would
--     refuse. The AO must NOT, because the letter is not in their queue.
