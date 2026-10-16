-- ============================================================================
-- 010_mail_records_department.sql — a letter's OWNING department (Module 1)
-- ============================================================================
--
-- THE DEFECT THIS FIXES. Found 2026-10-02, in the data rather than the code:
--
--   Three letters (DS/2026/10/0002-0004) were logged at reception by a
--   MINOR_STAFF in the Provincial Secretary's Office, endorsed by a Secretary,
--   and forwarded. No subject clerk could ever see them. `mailScope` derived a
--   letter's department from `creator.department_id`, because `mail_records` had
--   no department column of its own — so the letter inherited the department of
--   whoever happened to TYPE it in.
--
--   That is backwards for a ministry. Incoming mail is logged centrally at
--   reception and then ROUTED to a subject department. A front-desk clerk
--   logging an Education letter is the normal case, not an edge case, and the
--   old rule made every such letter permanently invisible to the clerk who was
--   supposed to act on it — a letter stranded at `Forwarded to Subject` with
--   minutes already written and no owner.
--
-- SO: the department becomes a property OF THE LETTER, and `mailScope` reads it
-- from there.
--
-- WHY IT IS WRITTEN AT INTAKE (`create`), NOT ONLY ON `forward`. This migration
-- originally set the column on the forward step alone, on the reasoning that
-- reception does not always know which desk a letter belongs to and that the
-- judgement belongs to the Secretary reading it. That was wrong about the
-- workflow. The department is printed on the envelope, and the front-desk clerk
-- logging the letter is the one who reads it - the endorsement is a second
-- reading, days later, of a letter somebody has to find first. Routing at intake
-- hands the letter to its own desk from the moment it exists, instead of only
-- after somebody endorses it. So `POST /mail` requires `department_id`, and the
-- forward step keeps an OPTIONAL override: `department_id` there means "this was
-- filed under the wrong desk", not "please pick one". Both writes go through the
-- same conditional UPDATE on the forward path, so status and department still
-- move together (D61's invariant: status and its consequences move together or
-- not at all).
--
-- WHY NULLABLE, AND WHY THE SCOPE STILL FALLS BACK. `department_id IS NULL` can
-- no longer arise from the intake form, which requires the field, but it is still
-- a real state in two cases: a letter whose creator had no department at
-- backfill time (left NULL on purpose - see below), and a letter whose
-- department is deleted, since the FK is ON DELETE SET NULL. `mailScope`
-- therefore reads `m.department_id` and falls back to
-- `creator.department_id` while it is NULL, so an un-routed letter stays visible
-- to whoever logged it and to their own department's clerk rather than
-- vanishing. The fallback is the ONLY reason the backfill below is safe, and the
-- only reason adding this column is not a breaking change for any letter that has
-- not been re-filed.
--
-- THE BACKFILL. Existing rows are stamped with their creator's department,
-- which was the rule being replaced. That makes the migration a NO-OP for
-- visibility: every letter visible before is visible after, by the same clerk.
-- Anything else here — stamping NULL, or guessing from `category` — would
-- silently move letters between departments on deploy day.
--
-- fk_mail_department is ON DELETE SET NULL, matching fk_mail_officer. Deleting
-- a department must not delete letters; it leaves them un-routed, which sends
-- them back to the creator-department fallback and therefore back into view.
-- That is the right failure: a deleted department is a filing problem, not a
-- reason to lose correspondence.
--
-- idx_mail_department backs the subject clerk's home screen, the same query
-- idx_mail_officer backs for officers. Composite order is deliberate —
-- (department_id, status) because the registry's default view is a department's
-- letters filtered by state, and a bare department_id index would still let
-- MySQL read every row for the department and discard most of them.
-- ============================================================================

ALTER TABLE mail_records
  ADD COLUMN department_id INT NULL AFTER created_by_user_id;

-- Before the index and the FK: backfilling 11 rows is instant, but doing it
-- after the index exists means every UPDATE touches the index too, for no gain.
UPDATE mail_records m
  JOIN users u ON u.id = m.created_by_user_id
   SET m.department_id = u.department_id
 WHERE m.department_id IS NULL
   AND u.department_id IS NOT NULL;

-- Letters whose creator has no department (a user row with department_id NULL)
-- stay NULL deliberately. They are exactly the case the scope fallback exists
-- for, and inventing a department for them here would be the guess this whole
-- migration is removing.

ALTER TABLE mail_records
  ADD INDEX idx_mail_department (department_id, status),
  ADD CONSTRAINT fk_mail_department FOREIGN KEY (department_id)
    REFERENCES departments(id) ON DELETE SET NULL;
