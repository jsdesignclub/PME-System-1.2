-- ============================================================================
-- 009_mail_attachments.sql — the letter's stored scans (Module 1)
-- ============================================================================
-- Spec §5.2 carries one `attachment_path VARCHAR(255)` on `mail_records`.
-- D67 replaces it with this child table: a letter can hold several files
-- (parent plan task 2.15) and one column cannot hold three. `mail_records`
-- keeps `has_attachment` (D58) but no `attachment_path` — a copy of "the first
-- row of mail_attachments" would be a second source of truth for one fact.
--
-- D57 — the filesystem layout is the security boundary:
--   - the directory name is the server-generated day stamp (D53), so `../../`
--     cannot escape UPLOAD_DIR
--   - the on-disk name is `randomUUID() + ext`, so the client's filename never
--     reaches the filesystem
--   - `stored_path` is stored RELATIVE to UPLOAD_DIR, so moving the upload
--     directory is a `.env` edit and no row changes
--   - `original_name` is stored for display only and is never used to build a
--     path or a filename
--
-- The file bytes are NOT this table's concern. Task 2.5 writes the file and
-- this row in one transaction; a rollback deletes the file in the controller's
-- catch. The row and the bytes agree or neither lands (D58).
--
-- SIZE, NOT FINGERPRINT: there is no checksum column. Spec §5.2 does not ask
-- for one, and a defensive hash of bytes a client hands you proves only that
-- the bytes happened to be identical on write and on read. Phase 4 task 4.9
-- does content inspection, which is where a real integrity claim belongs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS mail_attachments (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  mail_record_id VARCHAR(36)   NOT NULL,
  original_name  VARCHAR(255)  NOT NULL,
  stored_name    VARCHAR(255)  NOT NULL,
  stored_path    VARCHAR(500)  NOT NULL,
  mime_type      VARCHAR(100)  NULL,
  size_bytes     INT UNSIGNED  NOT NULL,
  uploaded_by    INT           NOT NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX      idx_attachments_mail (mail_record_id),
  CONSTRAINT fk_attachments_mail FOREIGN KEY (mail_record_id)
    REFERENCES mail_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_user FOREIGN KEY (uploaded_by)
    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `stored_name` is deliberately NOT unique. `randomUUID()` collision is not a
-- threat model worth a b-tree that costs a page on every upload; the
-- filesystem already refuses an existing name, and the random UUID makes a
-- collision effectively unreachable.
--
-- `stored_path` is VARCHAR(500), not the spec's 255: Windows long paths plus
-- the nested `<day_stamp>/` directory exceed 255 characters routinely (plan §10).
--
-- `mime_type` is client-supplied (req.file.mimetype). It is stored for display
-- and trusted for nothing — the extension allowlist is what gates storage
-- (Task 2.5's validation table), and real content inspection is Phase 4's
-- task 4.9.
--
-- `uploaded_by` FK has no ON DELETE clause (RESTRICT): a hard-deleted user
-- cannot take their uploads' provenance with them. Same reasoning as
-- fk_mail_creator in migration 005 — a letter must always name who handled it.
--
-- The execution sequence in PHASE_2_PLAN.md §14 writes this migration AHEAD of
-- Task 2.5's POST /mail, because that endpoint stores the first attachment and
-- its test asserts the row exists.