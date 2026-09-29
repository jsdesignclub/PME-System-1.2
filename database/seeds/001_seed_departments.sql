-- Seed 001: the seven provincial departments.
--
-- Re-runnable. ON DUPLICATE KEY UPDATE matches on uq_departments_code, so a
-- second run updates the name in place instead of failing. The clause lists
-- only `name` -- a department's code is its identity and is deliberately not
-- rewritten, because renaming a code that users, documents and audit rows all
-- reference breaks every one of them.
--
-- The insert column order is (name, code) to match the table definition. MySQL
-- allows any order in the column list, but matching it means the VALUES() calls
-- below cannot be transposed by accident.

INSERT INTO departments (name, code) VALUES
  ('Provincial Secretary''s Office', 'SEC'),
  ('Administration',                'ADMIN'),
  ('Education',                     'EDU'),
  ('Engineering',                   'ENG'),
  ('Finance',                       'FIN'),
  ('Health',                        'HEALTH'),
  ('Transport',                     'TRANSPORT')
ON DUPLICATE KEY UPDATE name = VALUES(name);
