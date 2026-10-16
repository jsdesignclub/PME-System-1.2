-- ============================================================================
-- 006_official_minutes.sql — executive endorsement history (Module 1)
-- ============================================================================
-- Spec §5.2, as designed in PHASE_2_PLAN.md Task 2.2.
--
-- One row is one endorsement. Minutes are APPEND-ONLY: nothing in this schema
-- updates a row after it is written, and no ON DELETE rule other than the
-- letter's own cascade can remove one. An executive's endorsement is a
-- historical act, and the table is shaped so that no code path can quietly
-- rewrite one.
--
-- D50 — the letter's status is NOT recorded here. The transition from
-- 'Logged' to 'Forwarded to Subject' lives on mail_records.status, because
-- that is where Task 2.8's conditional UPDATE puts it and where the whole
-- application reads it from. Duplicating it into this table would create a
-- second source of truth for the same fact, and the two would disagree the
-- first time a transition failed after the minute was written. One place.
--
-- D63 — author_role and author_name are snapshots taken from the requesting
-- user at write time, never from the request body. Spec §7.2 shows both in
-- the body, which would make endorsement authorship forgeable: any
-- executive could sign minutes in someone else's name. The columns keep
-- their spec names and the snapshot keeps its purpose — a Secretary who is
-- later transferred, retires, or has their name corrected must still appear
-- as the author of what they endorsed — but the VALUES come from req.user,
-- and a body containing either field is a 400. The same reasoning as D45:
-- the dangerous input is unrepresentable rather than merely discouraged.
-- ============================================================================

CREATE TABLE IF NOT EXISTS official_minutes (
  id               INT AUTO_INCREMENT   PRIMARY KEY,
  mail_record_id   VARCHAR(36)         NOT NULL,
  author_user_id   INT                 NOT NULL,
  author_role      VARCHAR(50)         NOT NULL,
  author_name      VARCHAR(150)        NOT NULL,
  instruction_type VARCHAR(100)        NOT NULL,
  minutes_text     TEXT                NOT NULL,
  created_at       TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX      idx_minutes_mail (mail_record_id, created_at),
  CONSTRAINT fk_minutes_mail FOREIGN KEY (mail_record_id)
    REFERENCES mail_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_minutes_author FOREIGN KEY (author_user_id)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ON DELETE CASCADE on mail_record_id is the spec's choice and it is correct.
-- Minutes are a PART of the letter's history; a letter without its minutes is
-- not a letter. No API route deletes a letter in any phase, so this cascade is
-- a database-level guarantee for whoever eventually does — and it is the only
-- ON DELETE rule in this table that can remove a row.
--
-- fk_minutes_author has NO ON DELETE clause, so it is RESTRICT — deliberately,
-- and for the same reason mail_records.created_by_user_id is RESTRICT (D23).
-- Users are never hard-deleted, and if one were, deleting them must fail
-- rather than orphan the endorsement records. An endorsement that names
-- nobody is not an endorsement.
--
-- This is the opposite of officer_duties, where ON DELETE CASCADE IS correct
-- (Task 2.3), and the asymmetry is the design rather than an inconsistency:
-- a duty is a CURRENT assignment, so it goes when the person goes, while an
-- endorsement is a PAST act that outlives the officer who made it.
-- RESTRICT-on-past / CASCADE-on-current is the rule both tables follow.
--
-- idx_minutes_mail is (mail_record_id, created_at) rather than mail_record_id
-- alone. The detail view (Task 2.7) reads one letter's minutes IN ORDER, so
-- the composite serves both the filter and the sort. The extra column is close
-- to free: mail_record_id is a UUID, so the index is already selective, and
-- adding created_at to the tail of a b-tree is cheaper than a filesort on
-- every detail view.
--
-- instruction_type is VARCHAR(100), NOT an ENUM — the one field in this phase
-- whose vocabulary is genuinely open. Spec §9.2 names four presets ('For
-- Immediate Report', 'Prepare Draft Reply', 'For Information', 'For Necessary
-- Action') and Phase 3 presents them as preset chips (task 3.16), but the
-- ministry adds an occasional directive and an ENUM turns that into a
-- migration. The API accepts a free string; the UI offers a default set.
-- (Q17 in §13 records the decision and the alternative.)
--
-- minutes_text is TEXT, which MySQL caps at 64 KB, and the application caps it
-- at 10 000 characters. The application bound is the real one: an
-- executive's minute is not a novel, and an unbounded TEXT is a payload that
-- every detail view must carry.
--
-- There is no updated_at, because nothing here is ever updated. Task 2.8
-- refuses a second endorsement on a letter that has already been forwarded
-- (409), so a correction is not a second row on this table — it is not an
-- operation this phase supports at all. Phase 4 task 4.6 revisits whether
-- amendments are needed.
--
-- D42 note: this table is mutable on purpose — it is the ONE table in Module 1
-- where a later edit is a legitimate future requirement. The immutability
-- requirement in Phase 1's D42 applies to audit_logs only.
