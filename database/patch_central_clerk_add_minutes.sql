-- ============================================================================
-- MAIN (CENTRAL) SUBJECT CLERK — RECORD THE AO's MINUTE ON THEIR BEHALF
-- ============================================================================
-- WHY THIS PATCH EXISTS
--
-- The AO writes their minute by hand on the physical letter. Most of the time
-- they have no time to log in and type it into PME, so the letter sits at
-- 'Forwarded to AO' with nothing against it, and the main subject clerk — who
-- CAN see whether a minute exists — is asked to enter what the AO wrote.
--
-- Before this patch the clerk could not: `mail_available_actions` offered
-- `add_minutes` only to AO/ADMIN/SECRETARY/CHIEF_CLERK, and `minutes_write`
-- demanded `auth.uid() = author_user_id`, so a clerk naming an AO as the
-- author was refused by RLS.
--
-- WHAT CHANGES
--
--  1. `official_minutes` gains a `quick_note` column — the clerk's one-line
--     note for the file ("minuted from the AO's handwritten note on the
--     original letter"). It rides with the minute, not with the letter, so it
--     stays attached to the endorsement it describes.
--
--  2. `minutes_write` gains a second branch. The first branch is unchanged:
--     the author may always enter their own minute. The second branch lets the
--     MAIN subject clerk (`is_central_clerk`) enter a minute whose AUTHOR is
--     an AO/ADMIN/SECRETARY/CHIEF_CLERK, and requires
--     `recorded_by_user_id = auth.uid()` — the clerk is always named as the
--     person who typed it. The letter must still be at 'Forwarded to AO', and
--     the letter must have NO minute yet, so a second, competing endorsement
--     cannot be added on top of the AO's own.
--
--     Note that the author is NOT free text: it must resolve to a real,
--     active profile holding one of those roles. A clerk cannot invent an
--     author, and cannot author a minute in someone else's name unless that
--     someone is an executive who could have written it.
--
--  3. `mail_available_actions` grants `add_minutes` at 'Forwarded to AO' to the
--     main subject clerk, but only while the letter carries no minute. The
--     button therefore disappears the moment the AO records their own — which
--     is exactly the check the clerk needs to make ("has the AO already added
--     a minute?"), answered by the server rather than by the browser.
--
-- The function is replaced in full because that is the only way to change a
-- plpgsql body. Its body below is the authoritative one from
-- `supabase_schema.sql`, with the two changes marked.
--
-- ============================================================================


-- 1. quick_note ----------------------------------------------------------------
ALTER TABLE public.official_minutes ADD COLUMN IF NOT EXISTS quick_note TEXT NULL;

COMMENT ON COLUMN public.official_minutes.quick_note IS
  'One-line note for the file, added by the clerk who recorded a minute on behalf of the AO.';


-- 2. minutes_write --------------------------------------------------------------
DROP POLICY IF EXISTS minutes_write ON public.official_minutes;

CREATE POLICY minutes_write ON public.official_minutes FOR INSERT TO authenticated WITH CHECK (
  -- The author enters their own minute.
  auth.uid() = author_user_id
  -- OR the main subject clerk enters it on behalf of an executive.
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


-- 3. mail_available_actions ----------------------------------------------------
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
    -- The AO records the primary minute; the letter then returns to the clerk.
    -- The MAIN subject clerk may also record the minute on the AO's behalf
    -- when the AO has not yet added one.
    IF v_profile.role IN ('AO','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'add_minutes');
    ELSIF v_profile.role = 'SUBJECT_CLERK'
          AND (v_profile.is_central_clerk
               OR v_record.department_id = v_profile.department_id) THEN
      -- Only while the letter carries NO minute: once the AO has recorded
      -- theirs, the clerk must not add a competing endorsement.
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


-- 4. notify_on_mail_change ------------------------------------------------------
-- The letter came back from the AO, so the clerk who logged it is told to carry
-- on routing it. A clerk who recorded the minute ON BEHALF of the AO has just
-- done that step themselves: telling them the letter "came back" would be news
-- about their own act. `recorded_by_user_id` is set only on a delegated minute,
-- so an AO recording their own still notifies the clerk, unchanged.
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
      PERFORM public.push_notification(p.id, 'forwarded_to_ao', NEW.id, v_payload)
        FROM public.profiles p
       WHERE p.role = 'AO'
         AND p.is_active
         AND p.id <> COALESCE(v_actor, v_nil);

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


-- ============================================================================
-- SANITY CHECK after applying
-- ============================================================================
-- The new column:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='official_minutes'
--      AND column_name='quick_note';
--
-- The policy now in force:
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname='public' AND tablename='official_minutes';
--   expect: minutes_read (SELECT), minutes_write (INSERT)
--
-- Promote a clerk to main subject clerk (do this once, by hand):
--   UPDATE public.profiles SET is_central_clerk = TRUE
--    WHERE email = 'jsdesignclub2@gmail.com';
