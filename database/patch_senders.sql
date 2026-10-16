-- ============================================================================
-- patch_senders.sql
--
-- FEATURE — a reusable sender directory for the letter intake form.
--
-- A clerk logging a letter used to retype the sender's name on every envelope.
-- The same office was then spelled three ways ("Ministry of Education",
-- "Ministry of Education ", "Ministry of education"), no search or report could
-- group those letters, and the clerk paid the cost on every single letter.
--
-- This patch adds `public.senders`: a small shared directory the intake form
-- offers as a dropdown, with a quick-add form for a sender that is not in it
-- yet. The sender's TYPE is stored with it too, so picking the office fills
-- both the name and the type.
--
-- It is a convenience, NOT a constraint. `mail_records.sender_name` remains the
-- text recorded on the letter, exactly as written on that day; this table never
-- rewrites history, and a letter logged before this patch is unaffected.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.senders (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  sender_type        sender_type NOT NULL,
  created_by_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness: "Ministry of Education" and "ministry of
-- education" are the same office, and a directory that lets both exist is a
-- directory the clerk cannot trust.
CREATE UNIQUE INDEX IF NOT EXISTS uq_senders_name ON public.senders(lower(name));

-- RLS: every signed-in user may read the directory; the roles that may log a
-- letter (SUBJECT_CLERK) and admins may add to it.
ALTER TABLE public.senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS senders_read ON public.senders;
CREATE POLICY senders_read ON public.senders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS senders_write ON public.senders;
CREATE POLICY senders_write ON public.senders FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('ADMIN','SUBJECT_CLERK')
  )
);

-- A starter set of senders, so the picker is not empty on first use. Clerks add
-- the rest from the form itself. ON CONFLICT DO NOTHING (no target) tolerates
-- the existing duplicate by name OR by the case-insensitive index.
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
