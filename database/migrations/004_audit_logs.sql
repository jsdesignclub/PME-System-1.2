-- ============================================================================
-- 004_audit_logs.sql — immutable record of every mutation
-- ============================================================================
-- Spec §13.1 requires "an immutable audit record containing user_id, timestamp,
-- ip_address, and action_delta", but gives no DDL — only prose. The table is
-- therefore designed in PHASE_1_PLAN.md Task 1.4.
--
-- D42 — IMMUTABILITY IS NOT ENFORCED BY THIS TABLE.
-- database/bootstrap.sql grants pme_user SELECT, INSERT, UPDATE, DELETE,
-- CREATE, ALTER, INDEX, DROP, REFERENCES on pme_system.*. The TRIGGER
-- privilege is NOT among them, so the BEFORE UPDATE / BEFORE DELETE trigger
-- that would make this table genuinely immutable cannot be created by the
-- application user. Creating it needs root, or an amended GRANT in
-- bootstrap.sql.
--
-- The guarantee actually provided by Phase 1: models/auditModel.js exports
-- insert() and list() and nothing else, so no code path can alter a row.
-- Phase 4 task 4.6 is where the database-level enforcement belongs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NULL,
  action      VARCHAR(64)  NOT NULL,
  entity_type VARCHAR(64)  NOT NULL,
  entity_id   VARCHAR(64)  NULL,
  action_delta JSON        NULL,
  ip_address  VARCHAR(45)  NULL,
  user_agent  VARCHAR(255) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_user   (user_id),
  INDEX idx_audit_time   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_id is NULLable so a failed login can be recorded. A login attempt
-- against a NIC that does not exist is precisely the event an auditor wants,
-- and NOT NULL would push it somewhere less useful.
--
-- entity_id is VARCHAR(64), not INT: Phase 2's mail_records.id is a VARCHAR(36)
-- UUID, and this table has to accept those rows without an ALTER.
--
-- action_delta is JSON, not two text columns. "What changed" for a
-- PATCH /users/:id is a partial object; { before: {...}, after: {...} } is
-- queryable with JSON_EXTRACT and MySQL 8 validates it on write.
--
-- There is no updated_at. An audit row is written once.
--
-- Index note: idx_audit_entity is (entity_type, entity_id) rather than a
-- single composite key because entity_id is nullable, and MySQL will not index
-- NULL values in a unique key.
