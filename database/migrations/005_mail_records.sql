-- ============================================================================
-- 005_mail_records.sql — the letter registry (Module 1)
-- ============================================================================
-- Spec §5.2, with the departures recorded in PHASE_2_PLAN.md Task 2.1:
--
--   D48 — the status and priority ENUMs are the spec's values, verbatim.
--         Q3 was answered: the ministry's wording is correct, and these
--         strings become status badges in Phase 3, seed data, and every test
--         fixture. There is no synonym layer.
--   D50 — REVIEWED is not a state. Spec §6 draws six boxes; this ENUM has five
--         values, and REVIEWED is not among them. "Reviewed" is the *act* of an
--         executive reading a letter and writing minutes; the result of that
--         act is that minutes exist and the letter has been forwarded. So the
--         review IS the Logged -> Forwarded to Subject transition. Six steps,
--         five resting states.
--   D67 — attachment_path is DROPPED. Spec §5.2 carries one VARCHAR(255) on
--         this table, but a letter can hold several files (parent plan task
--         2.15), and one column cannot hold three. It is replaced by the
--         mail_attachments child table (Task 2.15's migration 009) rather
--         than kept alongside, because a duplicate of "the first row of
--         mail_attachments" is a second source of truth for the same fact.
--         has_attachment is KEPT — see below.
--   D69 — idx_day_stamp is DROPPED, idx_mail_officer is ADDED. day_stamp_no
--         is UNIQUE, so a second b-tree on it is pure write cost on every
--         letter logged (the same reasoning as Phase 1's D36 on
--         idx_user_nic). The officer index backs the most frequent query in
--         the application: an officer's "my letters" home screen.
--   D58 — has_attachment is NOT NULL DEFAULT FALSE. The spec has DEFAULT
--         FALSE with no NOT NULL, which means the column can be NULL — and
--         NULL is neither true nor false, so `WHERE NOT has_attachment`
--         silently excludes it. NOT NULL costs nothing and removes a third
--         state nobody chose. The flag is written in the same transaction as
--         the attachment rows, on the same connection, so it and the rows
--         always agree — a rolled-back upload cannot leave TRUE with no file
--         behind it.
--   D37 — updated_at, carried forward from Phase 1. audit_logs records who
--         changed a row; updated_at records when the row itself last did.
--   D38 — COLLATE named explicitly, so this table's collation is a property
--         of the migration that defines it rather than of bootstrap.sql.
--
-- The unique keys are named so a corrective migration can drop them by name.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mail_records (
  id                  VARCHAR(36)   NOT NULL PRIMARY KEY,
  day_stamp_no        VARCHAR(50)   NOT NULL,
  letter_ref_no       VARCHAR(100)  NULL,
  receipt_date        DATE          NOT NULL,
  sender_type ENUM('Government Office','Non-Government / Public',
                   'Private Organization','Judicial / Court') NOT NULL,
  sender_name         VARCHAR(200)  NOT NULL,
  subject             TEXT          NOT NULL,
  priority ENUM('Normal','Urgent','Confidential') NOT NULL DEFAULT 'Normal',
  category            VARCHAR(100)  NOT NULL DEFAULT 'General Administration',
  has_attachment      BOOLEAN       NOT NULL DEFAULT FALSE,
  status ENUM('Logged','Forwarded to Subject','Assigned',
              'In Progress','Completed') NOT NULL DEFAULT 'Logged',
  assigned_officer_id INT           NULL,
  assigned_date       DATETIME      NULL,
  subject_clerk_note  TEXT          NULL,
  officer_status_note TEXT          NULL,
  completion_date     DATETIME      NULL,
  created_by_user_id  INT           NOT NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mail_day_stamp (day_stamp_no),
  INDEX      idx_mail_status   (status),
  INDEX      idx_mail_priority (priority),
  INDEX      idx_mail_officer  (assigned_officer_id),
  CONSTRAINT fk_mail_officer FOREIGN KEY (assigned_officer_id)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_mail_creator FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- id is a VARCHAR(36) UUID generated in JavaScript, not a MySQL
-- DEFAULT (UUID()). The spec's comment allows "UUID or System LTR Code", and
-- server-side generation works, but it means no caller can name a row before
-- inserting it. Task 2.19's happy-path test walks one letter through five
-- transitions and needs the id at every step. Generating in JS lets the test
-- hold the id it expects.
--
-- The spec's own example response shows record_id "LTR-2026-0891", which is
-- neither a UUID nor a day stamp. Task 2.5 honours the spec's response SHAPE
-- ({ success, message, record_id }) and carries this table's id in it.
-- Inventing a second identifier for the same letter would give two ways to
-- address one row.
--
-- priority and category are NOT NULL where the spec leaves them nullable, both
-- with the spec's DEFAULT. priority's default already declares 'Normal' as the
-- intended default, and an explicit NULL is a bug the column should reject.
-- category is on the filter bar in Task 2.6, so it is always populated in
-- practice; NOT NULL means "no category" is one specific value rather than
-- NULL, which is what a category filter needs to behave.
--
-- fk_mail_officer is ON DELETE SET NULL: if a user is ever hard-deleted at
-- the database level, the letter survives with no officer. A letter is an
-- institutional record; a user is a login.
--
-- fk_mail_creator has NO ON DELETE clause, so it is RESTRICT — deliberately,
-- and for the same reason users are never hard-deleted (D23): a letter must
-- always name the person who logged it. The asymmetry with fk_mail_officer
-- above is the point. The officer is a current assignment; the logger is a
-- historical fact.
--
-- completion_date is set by the 'complete' transition only (Task 2.10) and is
-- NULL for every other state. A row with a completion_date and a status of
-- 'In Progress' is a defect, and workflow.test.js asserts it cannot exist.
--
-- subject_clerk_note and officer_status_note are two columns on purpose. They
-- are notes BY different roles ABOUT different things (Task 2.11), and
-- merging them would make the detail view's two panels impossible. Both are
-- long TEXT and are deliberately omitted from the Task 2.6 list projection.
--
-- D42 note: this table is mutable on purpose — a letter moves through states
-- for its whole life. The immutability requirement applies to audit_logs only.
