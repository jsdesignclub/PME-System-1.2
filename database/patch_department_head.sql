-- ============================================================================
-- PME System — patch: Department Head approval
-- ============================================================================
-- Run this in the Supabase SQL Editor on a live database.
--
-- WHAT THIS ADDS
-- --------------
-- A new role, DEPARTMENT_HEAD, so each department can have a head (an
-- Accountant for Accounting, a Director for Tourism/Planning, a General Manager
-- for Transport, and so on). The head:
--
--   * sees their OWN department's letters (RLS-scoped, exactly like a branch
--     subject clerk);
--   * is offered as an approver on the completion-document workflow, alongside
--     the AO and the Secretary — so an officer forwards the finished work to
--     their own department head for approval before the letter is completed;
--   * can approve or reject that submission, which either closes the letter
--     (Completed) or returns it to the officer (In Progress).
--
-- There is NO new workflow state and NO assignment: "forward to the department
-- head" is the SAME `Pending Approval` stage the AO/Secretary already use. The
-- only difference is the `approver_role` recorded on the completion submission.
--
-- WHY THE FUNCTION BODIES ARE REPEATED
-- ------------------------------------
-- `CREATE OR REPLACE FUNCTION` needs the WHOLE body, so `mail_available_actions`,
-- `mail_stats_rows`, `submit_completion` and `decide_completion` are restated
-- here in full. They match database/supabase_schema.sql after this patch.
--
-- HOW TO APPLY
-- ------------
-- STEP 1 first, on its own, then STEP 2. `ALTER TYPE ... ADD VALUE` cannot be
-- USED in the same transaction that adds it — a function body that compares a
-- role to the literal 'DEPARTMENT_HEAD' is validated when it is created, so the
-- new enum value must be committed before those functions can be created.
-- Every statement below is idempotent, so re-running the whole file is safe.
-- ============================================================================


-- ============================================================================
-- STEP 1 — the new role. RUN THIS ON ITS OWN, THEN RUN STEP 2.
-- ============================================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'DEPARTMENT_HEAD';


-- ============================================================================
-- STEP 2 — policies and functions. Run after STEP 1 has committed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 2a. mail_read — let a department head reach their department's letters
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS mail_read ON public.mail_records;

CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: their queue, letters they have a minute on, and any letter with a
        -- completion document awaiting THEIR approval.
        OR (p.role = 'AO' AND (
          mail_records.status::text = 'Forwarded to AO'
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
        -- DEPARTMENT_HEAD: their department's letters, plus any letter with a
        -- Pending Approval completion document addressed to a DEPARTMENT_HEAD
        -- (the decide_completion RPC narrows that to their own department).
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


-- ----------------------------------------------------------------------------
-- 2b. mail_available_actions — DEPARTMENT_HEAD perms + the approval branch
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

  IF v_profile.role IN ('ADMIN','SECRETARY','CHIEF_CLERK') THEN
    v_perms := ARRAY['CREATE_MAIL','READ_ALL_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_ACTION_STATUS','CLOSE_MAIL_FILE','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role = 'AO' THEN
    v_perms := ARRAY['WRITE_MINUTES'];
  ELSIF v_profile.role = 'SUBJECT_CLERK' THEN
    v_perms := ARRAY['CREATE_MAIL','READ_DEPARTMENT_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_DUTY_CHART','UPDATE_ACTION_STATUS'];
  ELSIF v_profile.role = 'DEPARTMENT_HEAD' THEN
    -- A department head sees their own department's letters and approves
    -- completion documents addressed to them, but does not log, forward or
    -- assign — those are clerk duties.
    v_perms := ARRAY['READ_DEPARTMENT_MAIL','READ_ASSIGNED_MAIL','WRITE_MINUTES','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'];
  ELSIF v_profile.role IN ('OFFICER','TRANSPORT_OFFICER') THEN
    v_perms := ARRAY['READ_ASSIGNED_MAIL','UPDATE_ACTION_STATUS','UPDATE_DUTY_CHART'];
  END IF;

  IF v_record.status::text = 'Logged' THEN
    IF v_profile.role = 'SUBJECT_CLERK' THEN
      v_perms := array_append(v_perms, 'forward_to_ao');
    END IF;
    IF 'CREATE_MAIL' = ANY(v_perms) THEN
      v_perms := array_append(v_perms, 'edit');
      v_perms := array_append(v_perms, 'delete');
    END IF;
  ELSIF v_record.status::text = 'Forwarded to AO' THEN
    -- The MAIN subject clerk may also record the minute on the AO's behalf,
    -- but only while the letter carries no minute yet.
    IF v_profile.role IN ('AO','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'add_minutes');
    ELSIF v_profile.role = 'SUBJECT_CLERK' AND v_profile.is_central_clerk THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.official_minutes om WHERE om.mail_record_id = p_mail_id
      ) THEN
        v_perms := array_append(v_perms, 'add_minutes');
      END IF;
    END IF;
  ELSIF v_record.status::text = 'Forwarded to Subject' THEN
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
    -- The completion document is the assignee's to forward, and only the
    -- assignee's: `submit_completion` refuses anybody else by name ("Only the
    -- assigned officer may forward a completion document."). So there is no
    -- oversight override here, unlike `start` above.
    IF 'UPDATE_ACTION_STATUS' = ANY(v_perms)
       AND v_record.assigned_officer_id = p_user_id THEN
      v_perms := array_append(v_perms, 'submit_completion');
    END IF;
  ELSIF v_record.status::text = 'Pending Approval' THEN
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
-- 2c. mail_stats_rows — a department head's dashboard is their department
-- ----------------------------------------------------------------------------
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
     OR v_profile.role::text NOT IN ('ADMIN','SECRETARY','CHIEF_CLERK','AO','SUBJECT_CLERK','DEPARTMENT_HEAD') THEN
    RAISE EXCEPTION 'Not authorized to read mail statistics' USING ERRCODE = '42501';
  END IF;

  IF (v_profile.role::text = 'SUBJECT_CLERK' OR v_profile.role::text = 'DEPARTMENT_HEAD')
     AND NOT v_profile.is_central_clerk THEN
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


-- ----------------------------------------------------------------------------
-- 2d. submit_completion — allow DEPARTMENT_HEAD as an approver
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_completion(
  p_mail_id        TEXT,
  p_approver_role  TEXT,
  p_document_name  TEXT,
  p_document_path  TEXT,
  p_mime_type      TEXT,
  p_size_bytes     INT,
  p_note           TEXT
)
RETURNS public.completion_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_record  public.mail_records;
  v_sub     public.completion_submissions;
BEGIN
  IF p_approver_role NOT IN ('AO','SECRETARY','DEPARTMENT_HEAD') THEN
    RAISE EXCEPTION 'Choose an approver: AO, Secretary or Department Head.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile for the caller.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_record FROM public.mail_records WHERE id = p_mail_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not found.' USING ERRCODE = 'P0002';
  END IF;

  -- A department head is an approver only for their OWN department. Refuse
  -- DEPARTMENT_HEAD when the letter's department has no active head, which would
  -- leave the submission with nobody able to decide it.
  IF p_approver_role = 'DEPARTMENT_HEAD' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles ph
      WHERE ph.department_id = v_record.department_id
        AND ph.role = 'DEPARTMENT_HEAD'
        AND ph.is_active = true
    ) THEN
      RAISE EXCEPTION 'No active Department Head for this letter''s department.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_record.assigned_officer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned officer may forward a completion document.' USING ERRCODE = '42501';
  END IF;

  IF v_record.status::text <> 'In Progress' THEN
    RAISE EXCEPTION 'A completion document may only be forwarded while the letter is In Progress.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.completion_submissions (
    mail_record_id, submitted_by, submitted_by_name, approver_role,
    document_name, document_path, mime_type, size_bytes, note, status
  ) VALUES (
    p_mail_id, auth.uid(), v_profile.full_name, p_approver_role,
    p_document_name, p_document_path, p_mime_type, COALESCE(p_size_bytes, 0), NULLIF(p_note, ''), 'Pending'
  ) RETURNING * INTO v_sub;

  UPDATE public.mail_records
     SET status = 'Pending Approval', updated_at = NOW()
   WHERE id = p_mail_id;

  RETURN v_sub;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_completion(TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2e. decide_completion — scope a DEPARTMENT_HEAD decider to their department
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_completion(
  p_submission_id INT,
  p_decision      TEXT,
  p_note          TEXT
)
RETURNS public.mail_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_sub     public.completion_submissions;
  v_record  public.mail_records;
  v_action  TEXT;
BEGIN
  IF p_decision NOT IN ('Approved','Rejected') THEN
    RAISE EXCEPTION 'Decision must be Approved or Rejected.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile for the caller.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sub FROM public.completion_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_sub.status <> 'Pending' THEN
    RAISE EXCEPTION 'This submission has already been decided.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (v_profile.role IN ('ADMIN','CHIEF_CLERK') OR v_profile.role::text = v_sub.approver_role) THEN
    RAISE EXCEPTION 'You are not the approver for this submission.' USING ERRCODE = '42501';
  END IF;

  -- A DEPARTMENT_HEAD approver is scoped to their OWN department's letters. The
  -- submission addresses a ROLE, so without this a head of one department could
  -- decide a completion belonging to another department.
  IF v_sub.approver_role = 'DEPARTMENT_HEAD' THEN
    SELECT * INTO v_record FROM public.mail_records WHERE id = v_sub.mail_record_id;
    IF v_profile.role::text = 'DEPARTMENT_HEAD'
       AND v_profile.department_id IS DISTINCT FROM v_record.department_id THEN
      RAISE EXCEPTION 'You are not the Department Head for this letter.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.completion_submissions
     SET status = p_decision,
         decided_by_user_id = auth.uid(),
         decided_by_name = v_profile.full_name,
         decided_by_role = v_profile.role::text,
         decision_note = NULLIF(p_note, ''),
         decided_at = NOW()
   WHERE id = p_submission_id;

  IF p_decision = 'Approved' THEN
    v_action := 'Completion approved';
    UPDATE public.mail_records
       SET status = 'Completed', completion_date = NOW(), updated_at = NOW()
     WHERE id = v_sub.mail_record_id
     RETURNING * INTO v_record;
  ELSE
    v_action := 'Completion rejected';
    UPDATE public.mail_records
       SET status = 'In Progress', updated_at = NOW()
     WHERE id = v_sub.mail_record_id
     RETURNING * INTO v_record;
  END IF;

  INSERT INTO public.official_minutes (
    mail_record_id, author_user_id, author_role, author_name, instruction_type, minutes_text
  ) VALUES (
    v_sub.mail_record_id, auth.uid(), v_profile.role::text, v_profile.full_name,
    v_action, COALESCE(NULLIF(p_note, ''), v_action)
  );

  RETURN v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decide_completion(INT, TEXT, TEXT) TO authenticated;


-- ============================================================================
-- QUICK SANITY CHECK after applying
-- ============================================================================
-- The role exists:
--   SELECT unnest(enum_range(NULL::user_role)) AS role;
--
-- A department head and the department's head user:
--   SELECT p.full_name, p.role, d.name
--   FROM public.profiles p LEFT JOIN public.departments d ON d.id = p.department_id
--   WHERE p.role = 'DEPARTMENT_HEAD';
