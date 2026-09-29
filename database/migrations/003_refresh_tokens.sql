-- ============================================================================
-- 003_refresh_tokens.sql — refresh token storage
-- ============================================================================
-- Not in the spec. Designed in PHASE_1_PLAN.md Task 1.3.
--
-- The security property of this table is that only a SHA-256 hash of the token
-- is stored. A database leak must not hand over 14 days of live sessions.
-- SHA-256 rather than bcrypt is correct here: this is a high-entropy random
-- token looked up by equality, not a low-entropy secret being brute-forced.
-- CHAR(64) is exact for hex, so there is no trailing-space ambiguity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT          NOT NULL,
  token_hash       CHAR(64)     NOT NULL,
  replaced_by_hash CHAR(64)     NULL,
  issued_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at       DATETIME     NOT NULL,
  revoked_at       DATETIME     NULL,
  ip_address       VARCHAR(45)  NULL,
  user_agent       VARCHAR(255) NULL,
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  INDEX idx_refresh_user    (user_id),
  INDEX idx_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- replaced_by_hash records the rotation chain, which is what makes reuse of an
-- already-rotated token detectable rather than merely expired.
--
-- CASCADE: unlike users.department_id, a refresh token has no meaning without
-- its user. Hard-deleting a user is already impossible via the API (D23).
--
-- idx_refresh_expires backs purgeExpired(), which runs on every login.
--
-- D42 note: this table is mutable on purpose — rotation and revocation are
-- what it exists for. The immutability requirement applies to audit_logs only.
