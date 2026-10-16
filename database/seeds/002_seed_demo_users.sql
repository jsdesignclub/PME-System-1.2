-- Seed 002: the eight demo personas, one per role ENUM value, plus a second
-- intake counter (see the Registry Clerk note below).
--
-- ============================ READ THIS FIRST ============================
-- Every account below signs in with the password:  PmeDemo@2026
-- These are published demo credentials on purpose. They are not secrets and
-- are not to be treated as if they were. NEVER reuse this password for a real
-- deployment, and never point a real deployment at this seed file.
--
-- Re-running this file RESETS the password of any user whose NIC matches one
-- below, back to PmeDemo@2026. If you have changed a demo account's password
-- and want to keep it, run the department seed alone instead:
--
--     node database/migrate.js seed 001
-- ============================ READ THIS FIRST ============================
--
-- The password_hash below is a literal, not something computed here: bcrypt
-- cannot run inside SQL and Phase 0's D10 keeps the seed runner a plain
-- multi-statement executor. Generate it with:
--
--     node backend/scripts/hash-password.js "PmeDemo@2026"
--
--     plaintext : PmeDemo@2026
--     cost      : 12  (BCRYPT_ROUNDS in backend/utils/password.js)
--     hash      : $2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO
--
-- All eight share one hash rather than eight identical ones. That is a property
-- of bcrypt, not an oversight: the same password at the same cost always hashes
-- to the same 60 characters. It is also a useful tell -- identical hashes mean
-- identical passwords, which is exactly what these demo accounts have and is
-- never true of real accounts.
--
-- The department codes resolve via the subquery on department_id. Using the
-- code rather than a hardcoded id means this file does not care what ids
-- departments happen to have, which keeps it working on a database where
-- 001_seed_departments.sql was re-run or where rows were deleted and recreated.
--
-- is_active is absent from the ON DUPLICATE KEY UPDATE clause on purpose. If it
-- were present, re-seeding would silently reactivate every account an
-- administrator had deliberately deactivated -- a lockout with no visible cause.

INSERT INTO users (nic_no, full_name, email, password_hash, role, department_id, designation, section_name) VALUES
  ('881234560V', 'System Administrator', 'admin@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'ADMIN',            (SELECT id FROM departments WHERE code = 'ADMIN'),
   'System Administrator', NULL),

  ('881234561V', 'Provincial Secretary',  'secretary@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'SECRETARY',         (SELECT id FROM departments WHERE code = 'SEC'),
   'Provincial Secretary', NULL),

  ('881234562V', 'Administrative Officer', 'ao@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'AO',                (SELECT id FROM departments WHERE code = 'SEC'),
   'Administrative Officer', NULL),

  ('881234563V', 'Chief Clerk',           'chiefclerk@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'CHIEF_CLERK',       (SELECT id FROM departments WHERE code = 'ADMIN'),
   'Chief Clerk', NULL),

  ('881234564V', 'Subject Clerk',         'subjectclerk@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'SUBJECT_CLERK',     (SELECT id FROM departments WHERE code = 'EDU'),
   'Subject Clerk', 'Education Unit'),

  ('881234565V', 'District Officer',      'officer@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'OFFICER',           (SELECT id FROM departments WHERE code = 'EDU'),
   'District Officer', 'Education Unit'),

  ('881234566V', 'Front Desk Clerk',      'frontdesk@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'MINOR_STAFF',       (SELECT id FROM departments WHERE code = 'SEC'),
   'Front Desk Clerk', 'Mail Intake'),

  ('881234567V', 'Transport Officer',     'transport@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'TRANSPORT_OFFICER', (SELECT id FROM departments WHERE code = 'TRANSPORT'),
   'Transport Officer', 'Fleet Unit'),

  -- A SECOND intake counter, in the Education department rather than the
  -- Secretary's. Not a ninth role: MINOR_STAFF again, the same permissions, a
  -- different desk. It exists because of a scope rule that would otherwise make
  -- the demo misleading. `GET /mail` scopes a SUBJECT_CLERK to letters whose
  -- CREATOR is in the clerk's own department (models/mailModel.js mailScope), so
  -- with only the Secretary's intake counter there, the Education Subject Clerk
  -- would log in to an empty registry and be unable to route a single letter —
  -- the one handoff the demo exists to show. A ministry has more than one
  -- registry counter; this is the second one.
  ('881234568V', 'Registry Clerk',        'registry@pme.local',
   '$2b$12$3SzEDVG57oJJl6pMMmvYx.peIk33U.1Jsiyv7QT8bTxkFXg9EVVeO',
   'MINOR_STAFF',       (SELECT id FROM departments WHERE code = 'EDU'),
   'Registry Clerk', 'Education Registry')
ON DUPLICATE KEY UPDATE
  full_name     = VALUES(full_name),
  email         = VALUES(email),
  password_hash = VALUES(password_hash),
  role          = VALUES(role),
  department_id = VALUES(department_id),
  designation   = VALUES(designation),
  section_name  = VALUES(section_name);
