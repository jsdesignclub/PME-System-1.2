-- ============================================================================
-- 007_officer_duties.sql — official duty charts, the matcher's input (Module 1)
-- ============================================================================
-- Spec §5.2, as designed in PHASE_2_PLAN.md Task 2.3.
--
-- D49 — Q4 was answered: an officer may hold duties in MORE THAN ONE section.
-- That answer is why this table exists in this shape and is the reason two
-- different section_name columns survive in the schema:
--
--     officer_duties.section_name  = the section a GIVEN DUTY belongs to
--     users.section_name           = the officer's HOME section
--
-- They are different facts about different things, and the ministry needs
-- both. A Subject Clerk opening an officer's chart must see which sections
-- that officer's duties actually cover, which is not the same as where the
-- officer is posted. Task 2.14's officer list returns the two, labelled, for
-- exactly that reason. Had Q4 come back "one section per officer", this
-- column would have moved to users and the composite unique key below would
-- not exist.
--
-- The consequences of "more than one" are all in this table:
--
--   - one duty row PER SECTION, so the matcher scores per duty row rather
--     than per officer (D54) and an officer's relevance can legitimately be
--     spread across several rows
--   - a composite unique key so the same section cannot be entered twice for
--     one officer
--   - ON DELETE CASCADE, which is correct HERE and is the opposite of what
--     official_minutes.author_user_id does. See the long note at the bottom.
-- ============================================================================

CREATE TABLE IF NOT EXISTS officer_duties (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  officer_user_id  INT          NOT NULL,
  section_name     VARCHAR(150) NOT NULL,
  duty_description TEXT         NOT NULL,
  keywords         JSON         NOT NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_duties_officer_section UNIQUE (officer_user_id, section_name),
  CONSTRAINT fk_duties_officer FOREIGN KEY (officer_user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- uq_duties_officer_section is the load-bearing constraint of this table.
-- Without it the same section is insertable twice for one officer, and the
-- duty matcher (Task 2.12) scores the same keywords twice — inflating a
-- score for a reason that has nothing to do with relevance. A ranked list
-- whose ranking can be gamed by a double entry is not a ranking.
--
-- The uniqueness is evaluated under utf8mb4_unicode_ci, so 'Procurement' and
-- 'procurement' are the SAME section and the second insert is a 409. That is
-- the ministry's convention rather than a technicality, and it is the same
-- reasoning that made uq_departments_code case-insensitive in Phase 1. It
-- also means section names are stored once in whatever case the officer typed
-- first, and Task 2.14's PATCH treats a case-only difference as a conflict
-- rather than a rename.
--
-- There is deliberately NO separate INDEX on officer_user_id. A UNIQUE index
-- on (officer_user_id, section_name) is a usable index on its leading
-- column, so every query a single-column index would serve is already served
-- by the composite. Carrying both means a second b-tree maintained on every
-- duty insert for no gain. This is the same correction Phase 1's D36 made
-- when it dropped idx_user_nic in favour of the UNIQUE on nic_no, and it is
-- noted here because the first draft of Task 2.3 had the redundant index and
-- MySQL would have created it without complaint.
--
-- keywords is JSON, NOT an ENUM and not a comma-separated VARCHAR. The spec
-- specifies JSON and the duty matcher needs a real array: Task 2.12 iterates
-- the keywords and reports which ones matched, so the values must be
-- addressable individually rather than re-parsed from a string on every
-- request. The column is NOT NULL because a duty row with no keywords scores
-- nothing and would appear in the officer's chart as a blank entry.
--
-- The keyword array's SHAPE is validated in dutyModel (Task 2.14), not by the
-- schema, because MySQL cannot express "an array of non-empty strings" as a
-- constraint on a JSON column. That validation lowercases and deduplicates on
-- write so the matcher never has to normalise at query time, and it is the
-- reason a duty row can be trusted as a list of strings rather than
-- potentially being the JSON literal null. getKeywords() in the model
-- defends against that last case anyway, since a hand-written INSERT in
-- Workbench bypasses the model entirely.
--
-- This column is never searched in SQL. The matcher is a pure JavaScript
-- function (D59) that receives an array of duty rows and scores them in
-- memory, which is what makes its ranking rules unit-testable with no
-- database in the test at all. There is no fulltext index here and none is
-- planned: a JSON column's contents are not indexable as a b-tree, and
-- pretending otherwise would add an index that never gets used.
--
-- duty_description is free prose describing the officer's remit. The matcher
-- scores its tokens, but at a capped and sub-keyword weight (D55) precisely
-- because a long, generic description would otherwise outrank a precise
-- keyword match. The column is the human-readable version of what keywords
-- encode for the algorithm, and both are kept because the ministry maintains
-- the chart by reading the description.
--
-- created_at and updated_at: updated_at is D37 carried forward from Phase 1.
-- Duty charts are edited — an officer's remit changes — and a Subject Clerk
-- needs to know whether a chart is current or stale.
--
-- ON DELETE CASCADE on officer_user_id is the spec's choice, and here it is
-- right, and it is deliberately the OPPOSITE of official_minutes'
-- author_user_id (Task 2.2, which is RESTRICT). The rule behind both is:
--
--     a duty is a CURRENT assignment  -> CASCADE, it goes when the person goes
--     an endorsement is a PAST act     -> RESTRICT, it outlives the person
--
-- A duty chart is about a person: if the person is deleted, the chart has no
-- owner and no meaning, and leaving orphan rows would put duties in the
-- matcher's scoring pool for an officer who no longer exists. An endorsement,
-- by contrast, is something a person did once; deleting them must fail rather
-- than orphan the record that they did it. Both tables follow the same rule
-- read from opposite ends, and the asymmetry is the design, not an
-- inconsistency to be tidied up.
--
-- Note that this cascade is mostly theoretical in practice: Phase 1's D23
-- means DELETE /api/v1/users/<id> deactivates and never deletes a row, so
-- nothing in the API can trigger it. It is a database-level guarantee for
-- whoever does a deliberate deletion.
--
-- D42 note: this table IS mutable on purpose. A duty is a current assignment
-- and re-assigning one is a normal administrative act (Task 2.14 exposes
-- PUT/PATCH/DELETE on it). The immutability requirement in Phase 1's D42
-- applies to audit_logs only.
