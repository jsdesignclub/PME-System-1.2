-- ============================================================================
-- 002_users.sql — Shared users table (authentication & hierarchy)
-- ============================================================================
-- Spec §5.1, with four deliberate departures, each recorded in
-- PHASE_1_PLAN.md §4a:
--
--   D27 — the role ENUM is exactly the spec's 8 values. Spec §4.1 also names
--         ENGINEER and LEGAL_OFFICER as officer personas, but neither is an
--         ENUM value. Engineers and legal officers are OFFICER rows whose
--         `designation` says so.
--   D36 — `idx_user_nic` from the spec is omitted. nic_no is already UNIQUE,
--         and a UNIQUE index is a usable index on that column, so a second
--         b-tree on the same data is pure write cost on every login.
--         idx_user_role IS kept — it backs every role-scoped query in later
--         phases.
--   D37 — `updated_at` is added. The spec has created_at only, but PATCH
--         /users/:id needs to report when a row last changed, and
--         audit_logs records who changed it, not when the row itself did.
--   D38 — COLLATE named explicitly.
--
-- The unique keys are named so a corrective migration can drop them by name.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nic_no        VARCHAR(20)  NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN','SECRETARY','AO','CHIEF_CLERK','SUBJECT_CLERK','OFFICER',
            'MINOR_STAFF','TRANSPORT_OFFICER') NOT NULL,
  department_id INT          NULL,
  designation   VARCHAR(150) NOT NULL,
  section_name  VARCHAR(150) NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_nic  (nic_no),
  UNIQUE KEY uq_users_email (email),
  INDEX      idx_user_role (role),
  CONSTRAINT fk_users_department FOREIGN KEY (department_id)
    REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Case-insensitive uniqueness is free and intended: under utf8mb4_unicode_ci,
-- '881234567V' and '881234567v' are the same account. Sri Lankan NICs are
-- written both ways, and authMiddleware/normalizeNic lean on this.
--
-- ON DELETE SET NULL: deleting a department orphans its users rather than
-- deleting them. Since users are never hard-deleted (D23), this only fires
-- from a deliberate database operation.
--
-- is_active is NOT NULL so "is this user active" is always answerable and
-- authMiddleware never has to tell NULL from FALSE (D21 reloads the row on
-- every request and branches on this column).
