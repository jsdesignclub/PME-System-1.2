-- ============================================================================
-- PME System — database bootstrap
-- ============================================================================
-- Run ONCE, as root. Safe to re-run.
--
-- This file is the committed, reviewable record of the D2 privilege grant, so
-- the database can be rebuilt on another machine without reverse-engineering
-- what was clicked in MySQL Workbench.
--
-- The application password is a PLACEHOLDER here on purpose (D3). A file under
-- version control is a permanent record; a password pasted into it cannot be
-- un-leaked by a later `git rm`. The real value lives only in the git-ignored
-- backend/.env.
--
-- Execute with the placeholder substituted, without ever writing the real
-- password into this file:
--
--   (Get-Content database\bootstrap.sql) `
--     -replace '<choose-a-strong-password>', $env:PME_DB_PASSWORD `
--     | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
--
-- To rotate the application password later, `CREATE USER IF NOT EXISTS` will
-- NOT change an existing account's password. Use ALTER USER instead:
--
--   ALTER USER 'pme_user'@'localhost' IDENTIFIED BY '<new-password>';
--   ALTER USER 'pme_user'@'127.0.0.1'  IDENTIFIED BY '<new-password>';
--   FLUSH PRIVILEGES;
--
-- and update backend/.env to match.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Database
-- ----------------------------------------------------------------------------
-- utf8mb4 is required, not preferred: the system stores Sinhala/Tamil/English
-- text, and utf8 (3 bytes) cannot represent all Sinhala codepoints.
CREATE DATABASE IF NOT EXISTS pme_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Application account (D2)
-- ----------------------------------------------------------------------------
-- The app never connects as root. root is used once, by a human, to create the
-- database and grant privileges — then it leaves the story. A compromised app
-- process can then neither drop other schemas, read the MySQL grant tables, nor
-- SHUTDOWN the server.
--
-- Both host rows exist because MySQL treats 'localhost' and '127.0.0.1' as
-- DIFFERENT accounts. Creating only one and then connecting via the other
-- produces a confusing ERROR 1045 that reads like a wrong password when the
-- password is in fact correct. (Decision D2 scope is pme_system.* only.)
CREATE USER IF NOT EXISTS 'pme_user'@'localhost' IDENTIFIED BY '<choose-a-strong-password>';
CREATE USER IF NOT EXISTS 'pme_user'@'127.0.0.1'  IDENTIFIED BY '<choose-a-strong-password>';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON pme_system.* TO 'pme_user'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON pme_system.* TO 'pme_user'@'127.0.0.1';

FLUSH PRIVILEGES;
