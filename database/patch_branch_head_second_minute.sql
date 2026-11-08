-- ============================================================================
-- PME System — patch: a branch clerk can send a minuted letter back to their
-- own Department Head for a SECOND minute
-- ============================================================================
-- Run this in the Supabase SQL Editor on a live database.
--
-- THE GAP THIS CLOSES
--
-- A ministry letter is minuted by the AO, then the main (central) subject clerk
-- either assigns an officer or ROUTES it to a branch subject clerk (see
-- patch_branch_clerk_routing.sql). The routed letter arrives at
-- 'Forwarded to Subject' with the AO's minute already on it.
--
-- At that point the branch clerk may need their OWN head's minute before the
-- branch can act: the branch head has not seen the letter yet, and the paper is
-- minuted at every desk it passes. But there was no path back to the head:
--
--   * `mail_available_actions` offered a branch clerk `add_minutes` only when
--     the letter carried NO minute at all, and the AO's minute already existed;
--   * `minutes_write` carried the same "no minute yet" guard;
--   * nothing moved a 'Forwarded to Subject' letter back to the head's queue.
--
-- WHAT THIS PATCH ADDS
--
--   send_to_branch_head   A branch (non-central) SUBJECT_CLERK may hand a
--                         'Forwarded to Subject' letter in their own department
--                         back to their Department Head. The status returns to
--                         the stored 'Forwarded to AO' value; the existing
--                         BEFORE trigger stamps `endorser_role =
--                         'DEPARTMENT_HEAD'` from the caller's profile, and the
--                         existing notification trigger tells the head.
--   add_minutes           The branch clerk may now record the head's minute even
--                         though the AO's minute is already on the file. The
--                         guard becomes "this branch has no head minute yet"
--                         rather than "this letter has no minute yet", so the
--                         head gets one additional minute and never two.
--
-- The AO's minute and the branch head's minute both remain on the file; the
-- timeline shows both. After the head's minute is recorded, the letter returns
-- to 'Forwarded to Subject' and the branch clerk assigns one of the branch's
-- officers, exactly as before.
--
-- WHY A NEW ACTION NAME. `forward_to_ao` belongs to INTAKE (Logged -> head).
-- This move happens later, from the clerk's routing desk, and must be offered
-- only when a minute already exists and this branch has not minuted it yet.
-- Reusing `forward_to_ao` would put the button on the wrong screen with the
-- wrong preconditions; the server computes both from its own transition table
-- (D61), so the button can never appear for a move the policies would refuse.
--
-- `mail_update` needs no NEW rule: an ordinary SUBJECT_CLERK may already write
-- a letter in their own department while it is Logged / Forwarded to AO /
-- Forwarded to Subject, and the WITH CHECK does not restrict the destination
-- status. The canonical policy is re-created here anyway, because this patch
-- must also work on a database where the earlier branch-head patch was never
-- applied (the state that produced "column m.endorser_role does not exist").
--
-- RUN THIS AFTER the earlier mail patches. It recreates
-- `public.mail_available_actions`, the `minutes_write` policy and the marker
-- machinery; running an older patch afterwards would restore the old bodies.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER/POLICY IF EXISTS before CREATE. Safe to re-run.
-- Mirrors database/supabase_schema.sql.
-- ============================================================================


-- ============================================================================
-- 0. Prerequisites: the marker, the triggers and the letter policies
-- ============================================================================
-- A live database that has not run patch_fix_branch_head_minutes.sql has no
-- `mail_records.endorser_role`, and the policy below that reads it fails with
-- 42703. Create the marker and everything that reads/writes it here, with the
-- same bodies as supabase_schema.sql, so this patch stands on its own.

ALTER TABLE public.mail_records
  ADD COLUMN IF NOT EXISTS endorser_role TEXT NULL;

COMMENT ON COLUMN public.mail_records.endorser_role IS
  'Who writes the minute while the letter is at Forwarded to AO: AO (or NULL) for a ministry letter, DEPARTMENT_HEAD for a letter that arrived at a branch.';

-- One-time backfill for letters already sitting at that step: a letter logged
-- by a non-central subject clerk is a branch letter. NULL already means AO.
UPDATE public.mail_records m
   SET endorser_role = 'DEPARTMENT_HEAD'
  FROM public.profiles p
 WHERE p.id = m.created_by_user_id
   AND p.role = 'SUBJECT_CLERK'
   AND p.is_central_clerk IS NOT TRUE
   AND m.endorser_role IS NULL
   AND m.status::text = 'Forwarded to AO';

-- The marker is decided from the ACTING user's profile at the moment of the
-- forward, never from anything the browser sends.
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

-- Notifications: a letter moved to the minute step tells the queue it is
-- actually in — the branch head for a DEPARTMENT_HEAD letter, the AO otherwise.
CREATE OR REPLACE FUNCTION public.push_notification(
  p_user_id  UUID,
  p_type     TEXT,
  p_mail_id  TEXT,
  p_payload  JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, mail_record_id, payload)
  VALUES (p_user_id, p_type, p_mail_id, COALESCE(p_payload, '{}'::JSONB));
END;
$$;

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

DROP TRIGGER IF EXISTS trg_notify_mail_change ON public.mail_records;
CREATE TRIGGER trg_notify_mail_change
AFTER UPDATE ON public.mail_records
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_mail_change();

-- The letter's visibility and writability. The branch clerk sees a routed
-- letter through department_id / assigned_officer_id and may write it while it
-- is with the clerk; the AO never sees a DEPARTMENT_HEAD letter in their queue.
DROP POLICY IF EXISTS mail_read ON public.mail_records;
CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
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
        OR (p.role = 'SUBJECT_CLERK' AND (
          p.is_central_clerk
          OR mail_records.created_by_user_id = p.id
          OR mail_records.department_id = p.department_id
          OR mail_records.assigned_officer_id = p.id
        ))
        OR (p.role = 'DEPARTMENT_HEAD' AND (
          mail_records.department_id = p.department_id
          OR (mail_records.status::text = 'Pending Approval' AND EXISTS (
            SELECT 1 FROM public.completion_submissions cs
            WHERE cs.mail_record_id = mail_records.id
              AND cs.status = 'Pending'
              AND cs.approver_role = 'DEPARTMENT_HEAD'
          ))
        ))
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER') AND mail_records.assigned_officer_id = p.id)
      )
      AND NOT (
        p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER')
        AND mail_records.priority = 'Confidential'
        AND mail_records.created_by_user_id IS DISTINCT FROM p.id
      )
  )
);

DROP POLICY IF EXISTS mail_update ON public.mail_records;
CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        OR (p.role = 'AO'
            AND mail_records.status = 'Forwarded to AO'
            AND COALESCE(mail_records.endorser_role, 'AO') = 'AO')
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
    --   * 'DEPARTMENT_HEAD' — a letter that arrived straight at a BRANCH, or a
    --     minuted letter the branch clerk sent back to its head for a second
    --     minute. Its own head writes it and the branch clerk types it. The AO
    --     is not involved and does not get the action.
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
      IF v_profile.is_central_clerk THEN
        -- A ministry letter carries ONE AO minute. The central clerk may type
        -- it, never a second one.
        IF NOT EXISTS (
          SELECT 1 FROM public.official_minutes om WHERE om.mail_record_id = p_mail_id
        ) THEN
          v_perms := array_append(v_perms, 'add_minutes');
        END IF;
      ELSE
        -- A branch letter carries ONE minute by THAT branch's head. An AO
        -- minute (or a minute by another branch) does not block it: that is
        -- exactly the second-minute case. A minute already written by this
        -- branch's own head does block a duplicate.
        IF NOT EXISTS (
          SELECT 1
          FROM public.official_minutes om
          JOIN public.profiles a ON a.id = om.author_user_id
          WHERE om.mail_record_id = p_mail_id
            AND a.role = 'DEPARTMENT_HEAD'
            AND a.department_id = v_record.department_id
        ) THEN
          v_perms := array_append(v_perms, 'add_minutes');
        END IF;
      END IF;
    END IF;
  ELSIF v_record.status::text = 'Forwarded to Subject' THEN
    -- The clerk routes it to an officer. The AO does not assign.
    IF v_profile.role IN ('SUBJECT_CLERK','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'assign');
    END IF;

    -- The branch clerk may hand the letter back to their own head for a new
    -- minute. Offered only when the letter has been minuted at least once (it
    -- has, by definition, at this status) and this branch has not put its own
    -- head's minute on it yet. The head may have already minuted a letter that
    -- arrived straight at the branch, in which case there is nothing new to
    -- say and the button is withheld.
    IF v_profile.role = 'SUBJECT_CLERK'
       AND v_profile.is_central_clerk IS NOT TRUE
       AND v_record.department_id IS NOT NULL
       AND v_record.department_id = v_profile.department_id
       AND EXISTS (
         SELECT 1 FROM public.official_minutes om WHERE om.mail_record_id = p_mail_id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM public.official_minutes om
         JOIN public.profiles a ON a.id = om.author_user_id
         WHERE om.mail_record_id = p_mail_id
           AND a.role = 'DEPARTMENT_HEAD'
           AND a.department_id = v_record.department_id
       ) THEN
      v_perms := array_append(v_perms, 'send_to_branch_head');
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
-- 2. The policy: who may write a minute, and in whose name
-- ============================================================================
DROP POLICY IF EXISTS minutes_write ON public.official_minutes;

-- A minute is entered by its AUTHOR alone, or by a subject clerk on behalf of
-- the person who wrote it on the physical letter:
--
--   * the MAIN (central) clerk, for a MINISTRY letter, may name the AO/Secretary/
--     CHIEF_CLERK/ADMIN who endorsed it;
--   * a BRANCH clerk, for a letter in their own department, may name only that
--     department's Department Head.
--
-- The central clerk's case still carries the "no minute yet" guard: a ministry
-- letter has one AO minute. The branch clerk's case now asks whether THIS
-- branch's head has already minuted the letter, not whether any minute exists:
-- an AO minute (or another branch's minute) is expected on a routed letter and
-- must not block the branch head's own endorsement.
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
  -- A letter that arrives straight at a branch — or that the branch clerk sends
  -- back to the head for a second minute — is endorsed by that branch's
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
        -- Only ONE minute by THIS branch's head. Minutes by the AO, or by
        -- another branch's head, are allowed to precede it.
        AND NOT EXISTS (
          SELECT 1
          FROM public.official_minutes om2
          JOIN public.profiles a2 ON a2.id = om2.author_user_id
          WHERE om2.mail_record_id = m.id
            AND a2.role = 'DEPARTMENT_HEAD'
            AND a2.department_id = m.department_id
        )
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
-- 3a. The new action is in the resolver, and the branch minute rule no longer
--     blocks on "any minute exists".
SELECT
  position('send_to_branch_head'
           IN pg_get_functiondef('public.mail_available_actions'::regproc)) > 0
    AS send_to_branch_head_present,
  position('a.department_id = v_record.department_id'
           IN pg_get_functiondef('public.mail_available_actions'::regproc)) > 0
    AS branch_minute_rule_present,
  position('a2.department_id = m.department_id'
           IN (SELECT with_check FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'official_minutes'
                 AND policyname = 'minutes_write')) > 0
    AS policy_branch_minute_rule_present;

-- 3b. What a real letter offers. Put a routed, minuted 'Forwarded to Subject'
--     letter id in place of <letter-id> and the branch clerk's uuid in place of
--     <branch-clerk-uuid>. Expect 'assign' and 'send_to_branch_head' before the
--     move, then 'add_minutes' after it, then 'assign' again after the head's
--     minute is recorded.
--
--     SELECT public.mail_available_actions('<letter-id>', '<branch-clerk-uuid>');
