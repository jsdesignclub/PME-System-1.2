-- ============================================================================
-- patch_hrm.sql
--
-- FEATURE — the HRM extension to an officer's profile.
--
-- `profiles` stays what it has always been: the identity and posting of a
-- person (NIC, name, role, department, designation, section). The things an HR
-- file needs that the mail workflow does not — date of birth, addresses,
-- employment type, retirement date, emergency contact — live here instead, in a
-- 1:1 row keyed on the profile.
--
-- Keeping them out of `profiles` is deliberate. Every screen that lists users
-- selects from `profiles`; adding a dozen HR columns would widen every one of
-- those queries and every RLS check for fields the registry never reads. It
-- would also blur the line between "a person who can sign in" and "an employee
-- with a service record", which are different facts that can legitimately
-- diverge (an account can exist before its HR file is complete).
--
-- The row is 1:1 and optional: an officer with no HR details yet has no row,
-- and the UI treats that as "not recorded" rather than as an error. Future
-- phases add qualifications, experience and service history as their own
-- child tables keyed on the same `officer_user_id`; this table is only the
-- basic-information block.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_details (
  officer_user_id          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  date_of_birth            DATE NULL,
  gender                   TEXT NULL,
  marital_status           TEXT NULL,
  nationality              TEXT NULL DEFAULT 'Sri Lankan',
  permanent_address        TEXT NULL,
  residential_address      TEXT NULL,
  phone                    TEXT NULL,
  personal_email           TEXT NULL,
  join_date                DATE NULL,
  confirmation_date        DATE NULL,
  retirement_date          DATE NULL,
  employment_type          TEXT NULL,
  service_grade            TEXT NULL,
  salary_scale             TEXT NULL,
  blood_group              TEXT NULL,
  emergency_contact_name   TEXT NULL,
  emergency_contact_phone  TEXT NULL,
  notes                    TEXT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The primary key is the foreign key, so a profile can have at most one HR
-- row and an HR row cannot exist without its profile. ON DELETE CASCADE is
-- correct here for the same reason officer_duties uses it: an HR record is
-- ABOUT a person and has no meaning once the person is gone. In practice
-- profiles are deactivated, not deleted (D23), so this is a database-level
-- guarantee rather than something the API triggers.

-- `updated_at` is maintained by the database rather than by each caller. The
-- client may also send it, but the trigger wins, so a stale browser cannot
-- backdate an edit.
CREATE OR REPLACE FUNCTION public.set_employee_details_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_details_updated_at ON public.employee_details;
CREATE TRIGGER trg_employee_details_updated_at
BEFORE UPDATE ON public.employee_details
FOR EACH ROW
EXECUTE FUNCTION public.set_employee_details_updated_at();

ALTER TABLE public.employee_details ENABLE ROW LEVEL SECURITY;

-- Read is open to every signed-in user, matching `profiles_read`. A clerk
-- opening an officer's duty chart must be able to see who that officer is;
-- the HR block is read-only in Phase 1 and contains no confidential fields.
DROP POLICY IF EXISTS employee_details_read ON public.employee_details;
CREATE POLICY employee_details_read ON public.employee_details
  FOR SELECT TO authenticated USING (true);

-- Writes are administrator-only for now. A later phase can widen this to the
-- employee editing their own row, but the default must be the narrow one.
DROP POLICY IF EXISTS employee_details_admin_write ON public.employee_details;
CREATE POLICY employee_details_admin_write ON public.employee_details
  FOR ALL TO authenticated USING (is_admin());

-- ============================================================================
-- Phase 2 — qualifications and previous experience
-- ============================================================================
-- Both are child lists of the person, not columns on the profile: a person may
-- hold several qualifications and may have worked in several places, and a
-- design that forces one row per person loses history the moment a second one
-- is recorded. They are ordered by date rather than by insertion, because the
-- HR file is read as a history.
--
-- Both tables cascade with the profile for the same reason `officer_duties`
-- does: a qualification is a fact ABOUT a person and has no owner once the
-- person is gone. Profiles are normally deactivated rather than deleted (D23),
-- so this is a database guarantee rather than an API path.

CREATE TABLE IF NOT EXISTS public.employee_qualifications (
  id               SERIAL PRIMARY KEY,
  officer_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level            TEXT NULL,
  title            TEXT NOT NULL,
  institution      TEXT NULL,
  year_completed   INT NULL,
  grade            TEXT NULL,
  -- Reserved for the documents phase; NULL until then.
  certificate_path TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_qualifications_officer
  ON public.employee_qualifications(officer_user_id);

CREATE TABLE IF NOT EXISTS public.employee_experience (
  id               SERIAL PRIMARY KEY,
  officer_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employer         TEXT NOT NULL,
  designation      TEXT NULL,
  from_date        DATE NULL,
  -- NULL means "current": a person still employed there. That is different
  -- from an unknown end date, and the UI renders it as "Current".
  to_date          DATE NULL,
  description      TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_employee_experience_dates
    CHECK (from_date IS NULL OR to_date IS NULL OR to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_experience_officer
  ON public.employee_experience(officer_user_id, from_date DESC);

-- One generic trigger function for both child tables. The Phase 1 function is
-- left as-is so this patch remains additive and safe to re-run.
CREATE OR REPLACE FUNCTION public.set_employee_record_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_qualifications_updated_at ON public.employee_qualifications;
CREATE TRIGGER trg_employee_qualifications_updated_at
BEFORE UPDATE ON public.employee_qualifications
FOR EACH ROW
EXECUTE FUNCTION public.set_employee_record_updated_at();

DROP TRIGGER IF EXISTS trg_employee_experience_updated_at ON public.employee_experience;
CREATE TRIGGER trg_employee_experience_updated_at
BEFORE UPDATE ON public.employee_experience
FOR EACH ROW
EXECUTE FUNCTION public.set_employee_record_updated_at();

ALTER TABLE public.employee_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_experience ENABLE ROW LEVEL SECURITY;

-- Same read/write split as employee_details: every signed-in user may read an
-- officer's history (it is part of the officer profile they can already open),
-- but only an administrator may change it.
DROP POLICY IF EXISTS employee_qualifications_read ON public.employee_qualifications;
CREATE POLICY employee_qualifications_read ON public.employee_qualifications
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS employee_qualifications_admin_write ON public.employee_qualifications;
CREATE POLICY employee_qualifications_admin_write ON public.employee_qualifications
  FOR ALL TO authenticated USING (is_admin());

DROP POLICY IF EXISTS employee_experience_read ON public.employee_experience;
CREATE POLICY employee_experience_read ON public.employee_experience
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS employee_experience_admin_write ON public.employee_experience;
CREATE POLICY employee_experience_admin_write ON public.employee_experience
  FOR ALL TO authenticated USING (is_admin());

-- ============================================================================
-- Phase 3 — service history (postings, promotions and transfers)
-- ============================================================================
-- This is the officer's life INSIDE the ministry, as opposed to
-- `employee_experience`, which records employment elsewhere. A posting is a
-- period with a designation at a workplace, and `to_date` NULL means the
-- posting is still current. `workplace` and `grade` are text rather than a
-- foreign key to `departments`: a history row must keep the name the office
-- used at the time, even if the department is later renamed or removed.
CREATE TABLE IF NOT EXISTS public.employee_service_history (
  id               SERIAL PRIMARY KEY,
  officer_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  designation      TEXT NOT NULL,
  workplace        TEXT NULL,
  grade            TEXT NULL,
  from_date        DATE NULL,
  to_date          DATE NULL,
  remarks          TEXT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_employee_service_history_dates
    CHECK (from_date IS NULL OR to_date IS NULL OR to_date >= from_date)
);

CREATE INDEX IF NOT EXISTS idx_employee_service_history_officer
  ON public.employee_service_history(officer_user_id, from_date DESC);

DROP TRIGGER IF EXISTS trg_employee_service_history_updated_at ON public.employee_service_history;
CREATE TRIGGER trg_employee_service_history_updated_at
BEFORE UPDATE ON public.employee_service_history
FOR EACH ROW
EXECUTE FUNCTION public.set_employee_record_updated_at();

ALTER TABLE public.employee_service_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_service_history_read ON public.employee_service_history;
CREATE POLICY employee_service_history_read ON public.employee_service_history
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS employee_service_history_admin_write ON public.employee_service_history;
CREATE POLICY employee_service_history_admin_write ON public.employee_service_history
  FOR ALL TO authenticated USING (is_admin());

-- ============================================================================
-- Phase 4 - employee documents (certificates, appointment letters, etc.)
-- ============================================================================
-- The metadata row names an object in the private `employee-documents` bucket.
-- The bytes are never in the table: `file_path` is a storage key, and every
-- download goes through an authenticated storage request. `uploaded_by` is
-- nullable and ON DELETE SET NULL so a document survives the departure of the
-- clerk who filed it.
CREATE TABLE IF NOT EXISTS public.employee_documents (
  id               SERIAL PRIMARY KEY,
  officer_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  document_type    TEXT NULL,
  file_path        TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  mime_type        TEXT NULL,
  size_bytes       BIGINT NULL,
  uploaded_by      UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_officer
  ON public.employee_documents(officer_user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_employee_documents_updated_at ON public.employee_documents;
CREATE TRIGGER trg_employee_documents_updated_at
BEFORE UPDATE ON public.employee_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_employee_record_updated_at();

ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_documents_read ON public.employee_documents;
CREATE POLICY employee_documents_read ON public.employee_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS employee_documents_admin_write ON public.employee_documents;
CREATE POLICY employee_documents_admin_write ON public.employee_documents
  FOR ALL TO authenticated USING (is_admin());

-- The bucket is private, so a leaked path is not a public URL. The mime list is
-- the same one the mail attachments bucket uses; the client derives the type
-- from the extension for the same reason (see frontend/src/utils/fileTypes.js).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-documents',
  'employee-documents',
  false,
  10485760,
  ARRAY['application/pdf','image/jpeg','image/jpg','image/png','image/gif','image/tiff','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Read is open to every signed-in user; write is administrator-only, matching
-- the table policies above. `is_admin()` is already defined by this point.
DROP POLICY IF EXISTS "employee_documents_insert" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_select" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_update" ON storage.objects;
DROP POLICY IF EXISTS "employee_documents_delete" ON storage.objects;

CREATE POLICY "employee_documents_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-documents' AND public.is_admin());

CREATE POLICY "employee_documents_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'employee-documents');

CREATE POLICY "employee_documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-documents' AND public.is_admin())
  WITH CHECK (bucket_id = 'employee-documents' AND public.is_admin());

CREATE POLICY "employee_documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'employee-documents' AND public.is_admin());
