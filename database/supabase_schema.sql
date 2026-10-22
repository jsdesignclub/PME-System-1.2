-- ============================================================================
-- PME System — Supabase schema
-- ============================================================================
-- Run this in the Supabase SQL Editor.
--
-- Migrated from MySQL to PostgreSQL (Supabase). Supabase Auth replaces the
-- custom auth controller. The app-specific user profile lives in public.profiles
-- and is linked to auth.users by UUID.
-- ============================================================================

-- ENUM types
CREATE TYPE user_role AS ENUM ('ADMIN','SECRETARY','AO','CHIEF_CLERK','SUBJECT_CLERK','OFFICER','MINOR_STAFF','TRANSPORT_OFFICER','DEPARTMENT_HEAD');
CREATE TYPE sender_type AS ENUM ('Government Office','Non-Government / Public','Private Organization','Judicial / Court');
CREATE TYPE mail_priority AS ENUM ('Normal','Urgent','Confidential');
CREATE TYPE mail_status AS ENUM ('Logged','Forwarded to AO','Forwarded to Subject','Assigned','In Progress','Pending Approval','Completed');

-- ============================================================================
-- departments
-- ============================================================================
CREATE TABLE public.departments (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- profiles — app-specific user data, linked to auth.users
-- ============================================================================
CREATE TABLE public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nic_no          TEXT UNIQUE NOT NULL,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'MINOR_STAFF',
  department_id   INT NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  designation     TEXT NOT NULL DEFAULT '',
  section_name    TEXT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  -- A SUBJECT_CLERK flagged as the central intake clerk handles intake for every
  -- department, not just their own (see is_central_clerk()).
  is_central_clerk BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_profiles_nic ON public.profiles(nic_no);
CREATE UNIQUE INDEX uq_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- ============================================================================
-- senders — the reusable directory of letter senders
-- ============================================================================
-- A clerk logging a letter at reception would otherwise retype the sender's
-- name on every envelope, which drifts: "Ministry of Education", "Ministry of
-- Education " and "Ministry of education" become three ministry-wide
-- "different" correspondents and no search or report can group them. This
-- table holds the name once and lets the intake form pick it.
--
-- The sender's TYPE lives here too, because it is a property of the office
-- rather than of the letter: selecting the sender fills both fields, so the
-- clerk is not asked the same question twice.
--
-- It is a convenience, NOT a constraint: `mail_records.sender_name` remains the
-- text recorded on the letter, exactly as written on that day. Editing or
-- removing a sender later never rewrites history.
CREATE TABLE public.senders (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  sender_type        sender_type NOT NULL,
  created_by_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness: "Ministry of Education" and "ministry of
-- education" are the same office, and a directory that lets both exist is a
-- directory the clerk cannot trust.
CREATE UNIQUE INDEX uq_senders_name ON public.senders(lower(name));

-- ============================================================================
-- letter_categories — the administrator-managed category dictionary
-- ============================================================================
-- A letter's category used to be free text with nothing but a name. This table
-- gives a category an action ("prepare project report") and a maximum number of
-- days to complete that action, so the intake form can pick a category and the
-- letter can state what has to happen and by when. `mail_records.category`
-- remains the text recorded on the letter; this never rewrites history.
CREATE TABLE public.letter_categories (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  action_to_take     TEXT NOT NULL DEFAULT '',
  max_days           INT NULL,
  created_by_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_letter_categories_name
  ON public.letter_categories(lower(name));

-- ============================================================================
-- mail_records — the letter registry
-- ============================================================================
CREATE TABLE public.mail_records (
  id                    TEXT PRIMARY KEY,
  day_stamp_no          TEXT NOT NULL,
  letter_ref_no         TEXT NULL,
  receipt_date          DATE NOT NULL,
  sender_type           sender_type NOT NULL,
  sender_name           TEXT NOT NULL,
  subject               TEXT NOT NULL,
  priority              mail_priority NOT NULL DEFAULT 'Normal',
  category              TEXT NOT NULL DEFAULT 'General Administration',
  has_attachment        BOOLEAN NOT NULL DEFAULT FALSE,
  status                mail_status NOT NULL DEFAULT 'Logged',
  assigned_officer_id   UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_date         TIMESTAMPTZ NULL,
  subject_clerk_note    TEXT NULL,
  officer_status_note   TEXT NULL,
  completion_date       TIMESTAMPTZ NULL,
  created_by_user_id    UUID NOT NULL REFERENCES public.profiles(id),
  department_id         INT NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_mail_day_stamp ON public.mail_records(day_stamp_no);
CREATE INDEX idx_mail_status ON public.mail_records(status);
CREATE INDEX idx_mail_priority ON public.mail_records(priority);
CREATE INDEX idx_mail_officer ON public.mail_records(assigned_officer_id);
CREATE INDEX idx_mail_department ON public.mail_records(department_id, status);

-- ============================================================================
-- official_minutes — endorsement history
-- ============================================================================
CREATE TABLE public.official_minutes (
  id                   SERIAL PRIMARY KEY,
  mail_record_id       TEXT NOT NULL REFERENCES public.mail_records(id) ON DELETE CASCADE,
  author_user_id       UUID NOT NULL REFERENCES public.profiles(id),
  author_role          TEXT NOT NULL,
  author_name          TEXT NOT NULL,
  instruction_type     TEXT NOT NULL,
  minutes_text         TEXT NOT NULL,
  quick_note           TEXT NULL,
  -- The clerk who TYPED this minute, when it was recorded on behalf of an
  -- executive. NULL when the author entered it themselves. The AO handwrites the
  -- minute on the physical letter; the subject clerk enters it here, so
  -- author_user_id is the AO and recorded_by_user_id is the clerk.
  recorded_by_user_id  UUID NULL REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_minutes_mail ON public.official_minutes(mail_record_id, created_at);

-- ============================================================================
-- officer_duties — duty charts
-- ============================================================================
CREATE TABLE public.officer_duties (
  id                SERIAL PRIMARY KEY,
  officer_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  section_name      TEXT NOT NULL,
  duty_description  TEXT NOT NULL,
  keywords          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_duties_officer_section ON public.officer_duties(officer_user_id, section_name);

-- ============================================================================
-- day_stamp_counters — the sequence behind DS/YYYY/MM/NNNN
-- ============================================================================
CREATE TABLE public.day_stamp_counters (
  year_month TEXT PRIMARY KEY,
  last_seq   INT NOT NULL DEFAULT 0
);

-- ============================================================================
-- audit_logs — immutable record of every mutation
-- ============================================================================
CREATE TABLE public.audit_logs (
  id            SERIAL PRIMARY KEY,
  user_id       UUID NULL REFERENCES public.profiles(id),
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NULL,
  action_delta  JSONB NULL,
  ip_address    TEXT NULL,
  user_agent    TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_time ON public.audit_logs(created_at);

-- ============================================================================
-- mail_attachments — file metadata
-- ============================================================================
CREATE TABLE public.mail_attachments (
  id              SERIAL PRIMARY KEY,
  mail_record_id  TEXT NOT NULL REFERENCES public.mail_records(id) ON DELETE CASCADE,
  original_name   TEXT NOT NULL,
  stored_name     TEXT NOT NULL,
  stored_path     TEXT NOT NULL,
  mime_type       TEXT NULL,
  size_bytes      INT NOT NULL,
  uploaded_by     UUID NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_mail ON public.mail_attachments(mail_record_id);

-- ============================================================================
-- completion_submissions — one row per forwarded completion document
-- ============================================================================
-- The officer who finishes a letter forwards a "completion document" to the AO
-- or the Secretary. The letter moves to 'Pending Approval'; only that approver's
-- decision finishes it (see decide_completion). `approver_role` is a ROLE, not a
-- user, because the officer chooses who should sign off, not which individual.
CREATE TABLE public.completion_submissions (
  id                 SERIAL PRIMARY KEY,
  mail_record_id     TEXT NOT NULL REFERENCES public.mail_records(id) ON DELETE CASCADE,
  submitted_by       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  submitted_by_name  TEXT NOT NULL,
  approver_role      TEXT NOT NULL,
  document_name      TEXT NOT NULL,
  document_path      TEXT NOT NULL,
  mime_type          TEXT NULL,
  size_bytes         INT NOT NULL DEFAULT 0,
  note               TEXT NULL,
  status             TEXT NOT NULL DEFAULT 'Pending',
  decided_by_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by_name    TEXT NULL,
  decided_by_role    TEXT NULL,
  decision_note      TEXT NULL,
  decided_at         TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_completion_submissions_mail ON public.completion_submissions(mail_record_id, created_at);
CREATE INDEX idx_completion_submissions_status ON public.completion_submissions(status);

-- ============================================================================
-- notifications — the header bell's per-user feed
-- ============================================================================
-- Rows are written by triggers only (see push_notification and the two trigger
-- functions below); a client reads, marks read, and deletes its OWN rows, and has
-- no INSERT policy at all. `payload` carries the bits each event's line needs
-- (reference number, subject, document name) so the feed renders without joins.
CREATE TABLE public.notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::JSONB,
  mail_record_id  TEXT NULL REFERENCES public.mail_records(id) ON DELETE CASCADE,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read);

-- ============================================================================
-- Storage bucket for mail attachments
-- ============================================================================
-- `allowed_mime_types` must list EXACTLY the types the client sends, which are
-- derived from the file's extension (frontend/src/utils/fileTypes.js) — the
-- browser's own guess at a file's type is the operating system's, and that
-- differs from desk to desk. A type missing from this list is a file the form
-- accepts and storage refuses. `image/tiff` is here because office scanning
-- software writes TIFF.
--
-- NB: `ON CONFLICT DO NOTHING` means this statement only ever CREATES the
-- bucket. An existing bucket keeps whatever rules it was given; use
-- patch_fix_attachment_mime_types.sql to bring an existing one up to date.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mail-attachments', 'mail-attachments', false, 10485760, ARRAY['application/pdf','image/jpeg','image/jpg','image/png','image/gif','image/tiff','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- Helper function: generate day stamp
-- ============================================================================
CREATE OR REPLACE FUNCTION public.next_day_stamp(p_year_month TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_last_seq INT;
  v_next_seq INT;
BEGIN
  SELECT last_seq INTO v_last_seq FROM public.day_stamp_counters WHERE year_month = p_year_month;
  IF v_last_seq IS NULL THEN
    v_next_seq := 1;
    INSERT INTO public.day_stamp_counters (year_month, last_seq) VALUES (p_year_month, 1);
  ELSE
    v_next_seq := v_last_seq + 1;
    UPDATE public.day_stamp_counters SET last_seq = v_next_seq WHERE year_month = p_year_month;
  END IF;
  RETURN 'DS/' || p_year_month || '/' || LPAD(v_next_seq::TEXT, 4, '0');
END;
$$;

-- ============================================================================
-- Helper function: available actions for a mail record
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

-- Statistics source for the dashboard.
--
-- `mail_records` SELECT is row-scoped by RLS, so a role that may only see its own
-- queue would compute a dashboard whose tiles count that queue — not the
-- ministry. This function is SECURITY DEFINER: it reads rows, deliberately
-- ignoring RLS, and is the ONLY aggregate source for the dashboard.
--
-- Two scopes, decided by the caller's profile:
--   * ADMIN / SECRETARY / CHIEF_CLERK / AO, and a CENTRAL clerk — the ministry.
--   * an ordinary SUBJECT_CLERK — their own BRANCH only (department_id). A branch
--     subject clerk runs the letters of one branch and must see that branch's
--     progress, not another branch's.
-- Officers are refused: they work a single letter, and their queue is the queue
-- dashboard, not a branch of figures. It returns the columns, not a finished
-- summary, so the dashboard's aggregation and the shape its charts expect stay in
-- one place (the stats() function in frontend/src/api/mailApi.js).
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

  IF (v_profile.role::text = 'SUBJECT_CLERK' OR v_profile.role::text = 'DEPARTMENT_HEAD') AND NOT v_profile.is_central_clerk THEN
    -- A branch clerk sees their branch and nothing else. A clerk with no
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
-- Helper function: submit a completion document (officer)
-- ============================================================================
-- Inserts the submission AND moves the letter to 'Pending Approval' in one
-- transaction. SECURITY DEFINER because the officer's own mail_update policy
-- stops matching once the status leaves 'In Progress'.
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

-- ============================================================================
-- Helper function: decide a completion submission (AO/Secretary/Admin/Chief Clerk)
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

GRANT EXECUTE ON FUNCTION public.submit_completion(TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_completion(INT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Notifications — insert helpers + triggers (writes are trigger-only)
-- ============================================================================
-- Every insert runs inside a SECURITY DEFINER function, so a trigger can address
-- ANOTHER user without the caller holding any write privilege on the table. The
-- actor is always dropped from the recipient set: nobody is told of their own act.
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

-- Assignment and status transitions on a letter.
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
      -- The letter came back from the AO, so the clerk who logged it is told to
      -- carry on routing it. A clerk who recorded the minute ON BEHALF of the AO
      -- has just done that step themselves: telling them the letter "came back"
      -- would be news about their own act. `recorded_by_user_id` is set only on a
      -- delegated minute, so an AO recording their own still notifies the clerk.
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

-- The completion-document approval handshake.
CREATE OR REPLACE FUNCTION public.notify_on_completion_submission()
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
    'ref',      (SELECT day_stamp_no FROM public.mail_records WHERE id = NEW.mail_record_id),
    'subject',  (SELECT subject      FROM public.mail_records WHERE id = NEW.mail_record_id),
    'letterId', NEW.mail_record_id,
    'document', NEW.document_name
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM public.push_notification(p.id, 'approval_requested', NEW.mail_record_id, v_payload)
      FROM public.profiles p
     WHERE p.role::text = NEW.approver_role
       AND p.is_active
       AND p.id <> COALESCE(v_actor, v_nil);

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Approved' THEN
      PERFORM public.push_notification(NEW.submitted_by, 'approved', NEW.mail_record_id, v_payload);
    ELSIF NEW.status = 'Rejected' THEN
      PERFORM public.push_notification(NEW.submitted_by, 'rejected', NEW.mail_record_id, v_payload);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_completion ON public.completion_submissions;
CREATE TRIGGER trg_notify_completion
AFTER INSERT OR UPDATE ON public.completion_submissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_completion_submission();

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.notifications_id_seq TO authenticated;

-- ============================================================================
-- Enable RLS on all tables
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.letter_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.official_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_duties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_stamp_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS policies
-- ============================================================================

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN'), FALSE);
$$;

-- Helper: the central intake clerk. A SUBJECT_CLERK with is_central_clerk set
-- handles intake for EVERY department: they may read, forward and record the
-- AO's minutes for letters in any department, exactly as an ordinary clerk may
-- for their own. Confidential letters stay hidden, exactly as for any clerk.
CREATE OR REPLACE FUNCTION public.is_central_clerk()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT role = 'SUBJECT_CLERK' AND is_central_clerk
       FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- profiles: authenticated users read all; admins write
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_admin_write ON public.profiles FOR ALL TO authenticated USING (is_admin());

-- departments: read for all authenticated; admin write
CREATE POLICY departments_read ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_admin_write ON public.departments FOR ALL TO authenticated USING (is_admin());

-- senders: read for all authenticated. Added from the intake form by the clerks
-- who run intake (the same roles mail_insert allows), and by admins. A clerk
-- who can log a letter must be able to name its sender.
CREATE POLICY senders_read ON public.senders FOR SELECT TO authenticated USING (true);
CREATE POLICY senders_write ON public.senders FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('ADMIN','SUBJECT_CLERK')
  )
);

-- letter_categories: read for all authenticated (the intake form needs it);
-- admin write only.
CREATE POLICY letter_categories_read ON public.letter_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY letter_categories_admin_write ON public.letter_categories FOR ALL TO authenticated USING (is_admin());

-- mail_records: read scoped by visibility; write via RLS checks
CREATE POLICY mail_read ON public.mail_records FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        -- ADMIN, SECRETARY, CHIEF_CLERK: READ_ALL_MAIL
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: ONLY the letters the clerk has forwarded to them (their queue),
        -- plus any letter they have already written a minute on, so that
        -- submitting the minute does not immediately turn the page into a 404.
        -- Plus any letter with a completion document awaiting THEIR approval.
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

-- Write is split per operation rather than one FOR ALL policy, so the state a
-- caller may move FROM (USING) need not equal the state they move TO (WITH
-- CHECK). A single FOR ALL policy reused its USING expression as the WITH CHECK
-- and pinned SUBJECT_CLERK to one state while the workflow moved them through
-- several, refusing every write and surfacing as a PGRST116 on the assign path.
--
-- INSERT: intake is a SUBJECT_CLERK task now (MINOR_STAFF removed). The row
-- must name the caller as its creator, and the caller must be a clerk or admin.
CREATE POLICY mail_insert ON public.mail_records FOR INSERT TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('SUBJECT_CLERK','ADMIN')
  )
);

CREATE POLICY mail_update ON public.mail_records FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        -- AO: may only edit a letter while it is sitting in their queue. The
        -- WITH CHECK below then allows the one transition out (to the clerk).
        OR (p.role = 'AO' AND mail_records.status = 'Forwarded to AO')
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
        OR (p.role = 'AO' AND mail_records.status IN ('Forwarded to AO','Forwarded to Subject'))
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

CREATE POLICY mail_delete ON public.mail_records FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role IN ('ADMIN','SECRETARY','CHIEF_CLERK')
        OR (mail_records.created_by_user_id = p.id AND mail_records.status = 'Logged')
      )
  )
);

-- official_minutes
CREATE POLICY minutes_read ON public.official_minutes FOR SELECT TO authenticated USING (true);

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

-- officer_duties
CREATE POLICY duties_read ON public.officer_duties FOR SELECT TO authenticated USING (true);
-- Write scope: an admin maintains every chart; the AO does too (they share the
-- duty-chart responsibility with the admin and the subject clerks); the CENTRAL
-- (main) subject clerk likewise, because they handle intake for every department;
-- but an ordinary branch subject clerk may only touch duties on officers in their
-- OWN department. Without the department clause a branch clerk could write a duty
-- onto another branch's officer by hand — the UI hides those officers, but the
-- policy is the enforcement. `officer_user_id` is the row's subject, so the check is a
-- correlated lookup on that officer's department. USING is reused as WITH CHECK
-- because none is declared, so an INSERT and the new side of an UPDATE are both
-- constrained. Any other role (including OFFICER) may READ but never write.
CREATE POLICY duties_write ON public.officer_duties FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'ADMIN'
        OR p.role = 'AO'
        OR (p.role = 'SUBJECT_CLERK' AND p.is_central_clerk)
        OR (p.role = 'SUBJECT_CLERK'
            AND EXISTS (
              SELECT 1 FROM public.profiles o
              WHERE o.id = officer_duties.officer_user_id
                AND o.department_id = p.department_id
            ))
      )
  )
);

-- audit_logs: admin only
CREATE POLICY audit_admin_read ON public.audit_logs FOR SELECT TO authenticated USING (is_admin());

-- mail_attachments
CREATE POLICY attachments_read ON public.mail_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY attachments_write ON public.mail_attachments FOR INSERT TO authenticated WITH CHECK (true);

-- completion_submissions. Read is open for the same reason attachments_read is:
-- mail_read already decides whether the caller can open the letter at all. Only
-- the addressed role (or an admin override) may decide a pending row.
CREATE POLICY completion_read ON public.completion_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY completion_insert ON public.completion_submissions FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid());
CREATE POLICY completion_update ON public.completion_submissions FOR UPDATE TO authenticated USING (
  status = 'Pending'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.role IN ('ADMIN','CHIEF_CLERK') OR p.role::text = completion_submissions.approver_role)
  )
);

-- notifications: read/mark/delete your OWN feed. There is deliberately NO INSERT
-- policy — with RLS on and none declared, a client INSERT is refused, and the
-- SECURITY DEFINER triggers are the only writers. UPDATE's USING decides which
-- rows are visible to change and WITH CHECK what they may become, so a caller can
-- flip is_read on their own row and nothing else.
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================================
-- Seed data: admin user (password must be set via Supabase Auth UI or signup)
-- ============================================================================
INSERT INTO public.departments (name, code) VALUES
  ('Provincial Secretary''s Office', 'PSO'),
  ('Ministry of Finance', 'MOF'),
  ('Ministry of Education', 'MOE')
ON CONFLICT (code) DO NOTHING;

-- A starter set of senders, so the intake picker is not empty on a fresh
-- install. Clerks add the rest from the form itself.
INSERT INTO public.senders (name, sender_type) VALUES
  ('Department of Provincial Education', 'Government Office'),
  ('Ministry of Finance', 'Government Office'),
  ('Ministry of Education', 'Government Office'),
  ('Provincial Secretary''s Office', 'Government Office'),
  ('Department of Motor Traffic', 'Government Office'),
  ('Sri Lanka Police', 'Government Office'),
  ('District Secretariat', 'Government Office'),
  ('Divisional Secretariat', 'Government Office'),
  ('Provincial High Court', 'Judicial / Court'),
  ('Regional Office of the Auditor General', 'Government Office'),
  ('National Water Supply and Drainage Board', 'Government Office'),
  ('Ceylon Electricity Board', 'Government Office'),
  ('Public', 'Non-Government / Public')
ON CONFLICT DO NOTHING;

-- A starter set of letter categories, so the intake dropdown is not empty on a
-- fresh install. Administrators add the rest from Settings.
INSERT INTO public.letter_categories (name, action_to_take, max_days) VALUES
  ('General Administration', 'File and circulate', 7),
  ('Project Report', 'Prepare project report', 30),
  ('Financial', 'Prepare financial statement', 14)
ON CONFLICT DO NOTHING;
