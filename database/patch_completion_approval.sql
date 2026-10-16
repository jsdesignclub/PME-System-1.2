-- ============================================================================
-- PME System — completion-document approval workflow
-- ============================================================================
-- Run everything below in the Supabase SQL Editor.
--
-- WHAT THIS CHANGES
-- -----------------
-- Completing a letter is no longer the officer's act alone. When the work is
-- finished the assigned officer forwards a "completion document" (a scan, a
-- report, a signed minute) to the Administrative Officer OR the Secretary. The
-- letter moves to a new resting state, 'Pending Approval', and only the chosen
-- approver's decision finishes it:
--
--     In Progress  --submit_completion-->  Pending Approval
--     Pending Approval  --decide_completion(Approved)-->  Completed
--     Pending Approval  --decide_completion(Rejected)-->  In Progress
--
-- A rejection returns the letter to the officer so it can be corrected and
-- resubmitted; the reason is recorded as an official minute. An approval stamps
-- completion_date and closes the file.
--
-- WHY THE WORK IS ONE SECURITY DEFINER RPC, NOT TWO CLIENT WRITES
-- --------------------------------------------------------------
-- Submitting means "insert a submission row AND move the letter"; deciding means
-- "close the submission AND move the letter (AND write a minute)". Split across
-- two round trips from the browser each half can succeed and the other fail,
-- leaving a letter stuck in the wrong state with no error shown. Both transitions
-- live in one function, so they commit or roll back together. SECURITY DEFINER is
-- what lets the function move a letter whose row the caller's own RLS UPDATE
-- policy no longer matches (an approver, in particular, has no write path to an
-- arbitrary letter).
--
-- HOW TO APPLY
-- ------------
-- Run this file once. The enum add and the policy/table creation are idempotent.
-- NOTE: `ALTER TYPE ... ADD VALUE` must be its own statement and cannot be *used*
-- in the same transaction — nothing below USES the literal 'Pending Approval' in
-- executed DML, only inside function bodies (which are not run at creation), so
-- one run is safe.
-- ============================================================================


-- ============================================================================
-- 1. The new resting state
-- ============================================================================
ALTER TYPE mail_status ADD VALUE IF NOT EXISTS 'Pending Approval' BEFORE 'Completed';


-- ============================================================================
-- 2. completion_submissions — one row per forwarded completion document
-- ============================================================================
-- `approver_role` is a plain TEXT because the officer chooses a ROLE to send to
-- ("either AO or Secretary"), not a person. Any user holding that role — plus an
-- ADMIN or CHIEF_CLERK as an override — may decide the row. The submitter's and
-- decider's names are stored here the same way `official_minutes` stores its
-- author's, so the history can be rendered without another join.
CREATE TABLE IF NOT EXISTS public.completion_submissions (
  id                 SERIAL PRIMARY KEY,
  mail_record_id     TEXT NOT NULL REFERENCES public.mail_records(id) ON DELETE CASCADE,
  submitted_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_by_name  TEXT NOT NULL,
  approver_role      TEXT NOT NULL,                 -- 'AO' | 'SECRETARY'
  document_name      TEXT NOT NULL,
  document_path      TEXT NOT NULL,
  mime_type          TEXT NULL,
  size_bytes         INT NOT NULL DEFAULT 0,
  note               TEXT NULL,                     -- the officer's note
  status             TEXT NOT NULL DEFAULT 'Pending', -- Pending | Approved | Rejected
  decided_by_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_name    TEXT NULL,
  decided_by_role    TEXT NULL,
  decision_note      TEXT NULL,
  decided_at         TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_completion_submissions_mail
  ON public.completion_submissions(mail_record_id, created_at);

CREATE INDEX IF NOT EXISTS idx_completion_submissions_status
  ON public.completion_submissions(status);

ALTER TABLE public.completion_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS completion_read ON public.completion_submissions;
DROP POLICY IF EXISTS completion_insert ON public.completion_submissions;
DROP POLICY IF EXISTS completion_update ON public.completion_submissions;

-- Readable by any authenticated user, mirroring attachments_read / minutes_read:
-- letter-level visibility is decided by mail_read, which governs whether the
-- caller can open the letter the submission hangs off at all.
CREATE POLICY completion_read ON public.completion_submissions
  FOR SELECT TO authenticated USING (true);

-- A caller may only create a row naming themselves as the submitter. The
-- privileged transition is the RPC below (SECURITY DEFINER), not a client insert.
CREATE POLICY completion_insert ON public.completion_submissions
  FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());

-- Only the addressed role (or an admin override) may decide a pending row.
CREATE POLICY completion_update ON public.completion_submissions
  FOR UPDATE TO authenticated USING (
    status = 'Pending'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('ADMIN','CHIEF_CLERK') OR p.role::text = completion_submissions.approver_role)
    )
  );


-- ============================================================================
-- 3. mail_available_actions — replace 'complete' with 'submit_completion'
-- ============================================================================
-- The In Progress branch no longer offers 'complete' (the officer cannot close a
-- letter alone). It offers 'submit_completion'. The new Pending Approval branch
-- offers the decision to the addressed role, and to ADMIN/CHIEF_CLERK. Status is
-- cast to text throughout, exactly as before.
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
    v_perms := ARRAY['CREATE_MAIL','READ_DEPARTMENT_MAIL','WRITE_MINUTES','FORWARD_MAIL','ASSIGN_OFFICER','UPDATE_DUTY_CHART'];
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
    IF v_profile.role IN ('AO','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'add_minutes');
    END IF;
  ELSIF v_record.status::text = 'Forwarded to Subject' THEN
    IF v_profile.role IN ('SUBJECT_CLERK','ADMIN','SECRETARY','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'assign');
    END IF;
  ELSIF v_record.status::text = 'Assigned' THEN
    IF 'UPDATE_ACTION_STATUS' = ANY(v_perms) THEN
      v_perms := array_append(v_perms, 'start');
    END IF;
  ELSIF v_record.status::text = 'In Progress' THEN
    -- The officer no longer completes directly: they forward a completion
    -- document for approval. Only the assigned officer reaches this.
    IF 'UPDATE_ACTION_STATUS' = ANY(v_perms) THEN
      v_perms := array_append(v_perms, 'submit_completion');
    END IF;
  ELSIF v_record.status::text = 'Pending Approval' THEN
    IF v_profile.role IN ('ADMIN','CHIEF_CLERK') THEN
      v_perms := array_append(v_perms, 'approve_completion');
      v_perms := array_append(v_perms, 'reject_completion');
    ELSIF v_profile.role IN ('AO','SECRETARY') THEN
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
-- 4. mail_read — let the addressed AO reach a Pending Approval letter
-- ============================================================================
-- mail_read already excludes the AO from anything but their queue and letters
-- they have a minute on. An AO who must approve a completion document needs to
-- open the letter while it is 'Pending Approval', so the AO branch is extended.
DROP POLICY IF EXISTS mail_read ON public.mail_records;

CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        OR (p.role = 'AO' AND (
          mail_records.status::text = 'Forwarded to AO'
          OR EXISTS (
            SELECT 1 FROM public.official_minutes om
            WHERE om.mail_record_id = mail_records.id
              AND om.author_user_id = p.id
          )
          -- An AO addressed by a pending completion submission may read the letter
          -- it belongs to.
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
        OR (p.role IN ('OFFICER','TRANSPORT_OFFICER') AND mail_records.assigned_officer_id = p.id)
      )
      AND NOT (p.role IN ('SUBJECT_CLERK','OFFICER','TRANSPORT_OFFICER') AND mail_records.priority = 'Confidential')
  )
);


-- ============================================================================
-- 5. submit_completion — the officer forwards the document
-- ============================================================================
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
  IF p_approver_role NOT IN ('AO','SECRETARY') THEN
    RAISE EXCEPTION 'Choose an approver: AO or Secretary.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile for the caller.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_record FROM public.mail_records WHERE id = p_mail_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not found.' USING ERRCODE = 'P0002';
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


-- ============================================================================
-- 6. decide_completion — the approver approves or rejects
-- ============================================================================
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

  -- The decision is part of the letter's history, so it is recorded where the
  -- reader will look for it. SECURITY DEFINER makes the insert legal even though
  -- the approver is not the minute's author under minutes_write.
  INSERT INTO public.official_minutes (
    mail_record_id, author_user_id, author_role, author_name, instruction_type, minutes_text
  ) VALUES (
    v_sub.mail_record_id, auth.uid(), v_profile.role::text, v_profile.full_name,
    v_action, COALESCE(NULLIF(p_note, ''), v_action)
  );

  RETURN v_record;
END;
$$;


-- ============================================================================
-- 7. Grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.submit_completion(TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_completion(INT, TEXT, TEXT) TO authenticated;

-- Ask PostgREST to pick up the new table immediately.
NOTIFY pgrst, 'reload schema';
