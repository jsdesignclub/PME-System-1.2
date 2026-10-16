-- ============================================================================
-- patch_letter_categories.sql
--
-- FEATURE — an administrator-managed dictionary of letter categories.
--
-- A letter's category used to be free text typed by the intake clerk, and the
-- only thing it could say was its own name. What a registry needs to answer is
-- what has to HAPPEN to a letter of this kind and by when, so a category here
-- carries a default action ("prepare project report") and the maximum number of
-- days allowed to complete that action.
--
-- `mail_records.category` remains the text recorded on the letter, exactly as
-- picked on the day; this table is the list the intake form chooses from and the
-- source of the action/due values shown on the letter. As with `senders`, editing
-- or removing a category never rewrites a letter that already named it.
--
-- Idempotent: safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.letter_categories (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  action_to_take     TEXT NOT NULL DEFAULT '',
  max_days           INT NULL,
  created_by_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive uniqueness: "Project Report" and "project report" are the
-- same category, and a picker that lists both is a picker the clerk cannot use.
CREATE UNIQUE INDEX IF NOT EXISTS uq_letter_categories_name
  ON public.letter_categories(lower(name));

ALTER TABLE public.letter_categories ENABLE ROW LEVEL SECURITY;

-- Every signed-in user may read the dictionary (the intake form needs it);
-- only an administrator may change it.
DROP POLICY IF EXISTS letter_categories_read ON public.letter_categories;
CREATE POLICY letter_categories_read ON public.letter_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS letter_categories_admin_write ON public.letter_categories;
CREATE POLICY letter_categories_admin_write ON public.letter_categories
  FOR ALL TO authenticated USING (is_admin());

-- A starter set, so the intake dropdown is not empty on first use. ON CONFLICT
-- DO NOTHING (no target) tolerates a duplicate by name OR by the
-- case-insensitive index.
INSERT INTO public.letter_categories (name, action_to_take, max_days) VALUES
  ('General Administration', 'File and circulate', 7),
  ('Project Report', 'Prepare project report', 30),
  ('Financial', 'Prepare financial statement', 14)
ON CONFLICT DO NOTHING;
