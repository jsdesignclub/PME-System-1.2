-- ============================================================================
-- 001_departments.sql — Shared departments / sections
-- ============================================================================
-- Spec §5.1. This is the FK target for users.department_id, so it must be
-- applied first — database/migrate.js sorts by filename, and that sort IS the
-- dependency order.
--
-- D38: COLLATE is named explicitly rather than inherited from the database
-- default, so this table's collation is a property of this file and not of
-- database/bootstrap.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS departments (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  code       VARCHAR(20)  UNIQUE NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `code` is UNIQUE under utf8mb4_unicode_ci, so 'SEC' and 'sec' collide.
-- That is intended: department codes are case-insensitively unique, which is
-- what someone typing a code into a picker expects.
