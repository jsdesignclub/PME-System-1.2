-- Seed 004: demo letters, one per workflow state.
--
-- D50: the workflow has FIVE resting states and SIX steps. "Reviewed" is not a
-- state — it is the act of writing minutes, and its result is that the letter has
-- been forwarded. So five states are represented here, and the sixth letter
-- deliberately sits in the same state as another so the registry shows a queue
-- with depth in it rather than one lonely row per status.
--
--   DS/2026/09/0001  Logged                 — waiting for a Secretary's minutes
--   DS/2026/09/0002  Logged                 — urgent, waiting for a Secretary
--   DS/2026/09/0003  Forwarded to Subject   — minutes written, awaiting a clerk
--   DS/2026/09/0004  Assigned               — routed to the District Officer
--   DS/2026/09/0005  In Progress            — the officer has started work
--   DS/2026/09/0006  Completed              — closed, with a completion note
--   DS/2026/09/0007  Logged                 — CONFIDENTIAL, for Q7 (not a state)
--
-- Every subject names a real domain word (procurement, tender, budget, repair,
-- ambulance) so GET /mail/<id>/suggestions has something to rank. That is the
-- point of the set: a demo whose matcher always returns nothing teaches an
-- officer nothing about the feature that is hardest to explain.
--
-- Letter 7 exists for one reason: Q7. It is the ONLY confidential letter, and it
-- is placed here rather than left to the reviewer to create because the most
-- consequential access-control rule in the system is otherwise INVISIBLE in a
-- demo — every persona's registry looks identical on that axis, so the rule
-- cannot be shown, tested by eye, or demonstrated. Sign in as SUBJECT_CLERK
-- (881234564V) or OFFICER (881234565V) and the letter is absent from the list
-- and its detail route is a 404; sign in as ADMIN, SECRETARY, AO or CHIEF_CLERK
-- and it is present. That contrast is the whole of Q7, in one row.
--
-- Re-runnable. The ids are FIXED UUIDs and the conflict target is the primary
-- key, so a second run updates these six rows in place instead of creating a
-- second copy of the demo registry. They are not random for that reason.

-- ---------------------------------------------------------------------------
-- 1. Logged — a tender, sitting in the intake tray.
-- ---------------------------------------------------------------------------
INSERT INTO mail_records
  (id, day_stamp_no, letter_ref_no, receipt_date, sender_type, sender_name,
   subject, priority, category, has_attachment, status, created_by_user_id)
VALUES
  ('a1c0de00-0000-4000-8000-000000000001', 'DS/2026/09/0001', 'EDU/2026/TND/0142',
   '2026-09-24', 'Government Office', 'Department of Provincial Education',
'Tender for procurement of laboratory equipment for provincial schools',
   'Normal', 'Procurement', TRUE, 'Logged',
   (SELECT id FROM users WHERE nic_no = '881234568V'))
ON DUPLICATE KEY UPDATE
  day_stamp_no = VALUES(day_stamp_no), letter_ref_no = VALUES(letter_ref_no),
  receipt_date = VALUES(receipt_date), sender_type = VALUES(sender_type),
  sender_name = VALUES(sender_name), subject = VALUES(subject),
  priority = VALUES(priority), category = VALUES(category), status = VALUES(status),
  has_attachment = VALUES(has_attachment);

-- ---------------------------------------------------------------------------
-- 2. Logged — urgent, an ambulance. Two letters in the intake tray is what a
--    Secretary's queue actually looks like on a normal morning.
-- ---------------------------------------------------------------------------
INSERT INTO mail_records
  (id, day_stamp_no, letter_ref_no, receipt_date, sender_type, sender_name,
   subject, priority, category, has_attachment, status, created_by_user_id)
VALUES
  ('a1c0de00-0000-4000-8000-000000000002', 'DS/2026/09/0002', 'TRN/2026/AMB/0311',
   '2026-09-25', 'Private Organization', 'Sambul General Hospital',
   'Urgent request for ambulance vehicle allocation for emergency transport',
'Urgent', 'Transport', FALSE, 'Logged',
    (SELECT id FROM users WHERE nic_no = '881234568V'))
ON DUPLICATE KEY UPDATE
  day_stamp_no = VALUES(day_stamp_no), letter_ref_no = VALUES(letter_ref_no),
  receipt_date = VALUES(receipt_date), sender_type = VALUES(sender_type),
  sender_name = VALUES(sender_name), subject = VALUES(subject),
  priority = VALUES(priority), category = VALUES(category), status = VALUES(status),
  has_attachment = VALUES(has_attachment);

-- ---------------------------------------------------------------------------
-- 3. Forwarded to Subject — minutes written, no officer yet. This is the letter
--    the Subject Clerk picks up in the demo.
-- ---------------------------------------------------------------------------
INSERT INTO mail_records
  (id, day_stamp_no, letter_ref_no, receipt_date, sender_type, sender_name,
   subject, priority, category, has_attachment, status, created_by_user_id)
VALUES
  ('a1c0de00-0000-4000-8000-000000000003', 'DS/2026/09/0003', 'EDU/2026/BUD/0207',
   '2026-09-22', 'Non-Government / Public', 'Provincial Teachers Union',
'Submission of budget proposals for the 2027 academic year',
   'Normal', 'Budget', TRUE, 'Forwarded to Subject',
   (SELECT id FROM users WHERE nic_no = '881234568V'))
ON DUPLICATE KEY UPDATE
  day_stamp_no = VALUES(day_stamp_no), letter_ref_no = VALUES(letter_ref_no),
  receipt_date = VALUES(receipt_date), sender_type = VALUES(sender_type),
  sender_name = VALUES(sender_name), subject = VALUES(subject),
  priority = VALUES(priority), category = VALUES(category), status = VALUES(status),
  has_attachment = VALUES(has_attachment);

-- ---------------------------------------------------------------------------
-- 4. Assigned — routed to the District Officer, not yet started.
-- ---------------------------------------------------------------------------
INSERT INTO mail_records
  (id, day_stamp_no, letter_ref_no, receipt_date, sender_type, sender_name,
   subject, priority, category, has_attachment, status,
   assigned_officer_id, assigned_date, subject_clerk_note, created_by_user_id)
VALUES
  ('a1c0de00-0000-4000-8000-000000000004', 'DS/2026/09/0004', 'EDU/2026/RPR/0088',
   '2026-09-19', 'Government Office', 'Kandy Education Office',
   'Repairs required to the school roof at Kadugannawa and furniture replacement',
   'Normal', 'Maintenance', TRUE, 'Assigned',
   (SELECT id FROM users WHERE nic_no = '881234565V'), '2026-09-26 09:15:00',
   'Routed to the District Officer — repairs and furniture sit on their chart.',
   (SELECT id FROM users WHERE nic_no = '881234568V'))
ON DUPLICATE KEY UPDATE
  day_stamp_no = VALUES(day_stamp_no), letter_ref_no = VALUES(letter_ref_no),
  receipt_date = VALUES(receipt_date), sender_type = VALUES(sender_type),
  sender_name = VALUES(sender_name), subject = VALUES(subject),
  priority = VALUES(priority), category = VALUES(category), status = VALUES(status),
  assigned_officer_id = VALUES(assigned_officer_id),
  subject_clerk_note = VALUES(subject_clerk_note),
  has_attachment = VALUES(has_attachment);

-- ---------------------------------------------------------------------------
-- 5. In Progress — the officer's live queue, with a status note written.
-- ---------------------------------------------------------------------------
INSERT INTO mail_records
  (id, day_stamp_no, letter_ref_no, receipt_date, sender_type, sender_name,
   subject, priority, category, has_attachment, status,
   assigned_officer_id, assigned_date, subject_clerk_note, officer_status_note,
   created_by_user_id)
VALUES
  ('a1c0de00-0000-4000-8000-000000000005', 'DS/2026/09/0005', 'EDU/2026/ADM/0233',
   '2026-09-15', 'Judicial / Court', 'Kandy Provincial Court',
   'Quotation call for school stationery and supplies procurement',
   'Urgent', 'Procurement', TRUE, 'In Progress',
   (SELECT id FROM users WHERE nic_no = '881234565V'), '2026-09-21 10:40:00',
   'Procurement duty — District Officer.',
   'Quotations called from three suppliers. Comparison in progress.',
   (SELECT id FROM users WHERE nic_no = '881234568V'))
ON DUPLICATE KEY UPDATE
  day_stamp_no = VALUES(day_stamp_no), letter_ref_no = VALUES(letter_ref_no),
  receipt_date = VALUES(receipt_date), sender_type = VALUES(sender_type),
  sender_name = VALUES(sender_name), subject = VALUES(subject),
  priority = VALUES(priority), category = VALUES(category), status = VALUES(status),
  assigned_officer_id = VALUES(assigned_officer_id),
  subject_clerk_note = VALUES(subject_clerk_note),
  officer_status_note = VALUES(officer_status_note),
  has_attachment = VALUES(has_attachment);

-- ---------------------------------------------------------------------------
-- 6. Completed — closed with a completion date and a note explaining the close.
-- ---------------------------------------------------------------------------
INSERT INTO mail_records
  (id, day_stamp_no, letter_ref_no, receipt_date, sender_type, sender_name,
   subject, priority, category, has_attachment, status,
   assigned_officer_id, assigned_date, subject_clerk_note, officer_status_note,
   completion_date, created_by_user_id)
VALUES
  ('a1c0de00-0000-4000-8000-000000000006', 'DS/2026/09/0006', 'EDU/2026/FIN/0091',
   '2026-09-10', 'Government Office', 'Provincial Treasury',
   'Release of budget allocation for school building expenditure',
   'Normal', 'Budget', TRUE, 'Completed',
   (SELECT id FROM users WHERE nic_no = '881234565V'), '2026-09-12 11:05:00',
   'Budget duty — District Officer.',
   'Allocation letter received. Recorded and forwarded to the finance unit.',
   '2026-09-18 16:20:00',
   (SELECT id FROM users WHERE nic_no = '881234568V'))
ON DUPLICATE KEY UPDATE
  day_stamp_no = VALUES(day_stamp_no), letter_ref_no = VALUES(letter_ref_no),
  receipt_date = VALUES(receipt_date), sender_type = VALUES(sender_type),
  sender_name = VALUES(sender_name), subject = VALUES(subject),
  priority = VALUES(priority), category = VALUES(category), status = VALUES(status),
  assigned_officer_id = VALUES(assigned_officer_id),
  subject_clerk_note = VALUES(subject_clerk_note),
  officer_status_note = VALUES(officer_status_note),
  has_attachment = VALUES(has_attachment);

-- ---------------------------------------------------------------------------
-- 7. CONFIDENTIAL — the Q7 demonstrator.
--
-- Created by 881234566V (MINOR_STAFF, Provincial Secretary's Office) rather than
-- by a clerk, and that choice is what makes the letter teach something.
--
-- `mailScope` gives MINOR_STAFF `READ_PUBLIC_MAIL` with `hideConfidential: false`
-- — their own letters, INCLUDING the ones they classified, because a clerk who
-- cannot see the classification they applied is working blind. So this letter is
-- visible to:
--
--   881234566V  MINOR_STAFF      the creator (hideConfidential: false)
--   881234561V  SECRETARY        READ_ALL_MAIL
--   881234562V  AO               READ_ALL_MAIL
--   881234563V  CHIEF_CLERK      READ_ALL_MAIL
--   881234560V  ADMIN            READ_ALL_MAIL
--
-- and INVISIBLE to:
--
--   881234564V  SUBJECT_CLERK    READ_DEPARTMENT_MAIL, hideConfidential: true
--   881234565V  OFFICER          READ_ASSIGNED_MAIL, hideConfidential: true
--
-- Note that Q7 is NOT a department rule. `mailScope` applies it before the role
-- predicate and independently of it, so this letter is hidden from those two roles
-- even though both are in Education and even though the subject clerk's own
-- routing queue would otherwise reach it. Its creator being in the Provincial
-- Secretary's Office is what makes that separation visible: department scope and
-- confidentiality scope do not coincide here, so signing in as the clerk proves
-- the second rule fired rather than the first.
--
-- `Logged` is the right state for a letter the executives have not yet endorsed.
-- ---------------------------------------------------------------------------
INSERT INTO mail_records
  (id, day_stamp_no, letter_ref_no, receipt_date, sender_type, sender_name,
   subject, priority, category, has_attachment, status, created_by_user_id)
VALUES
  ('a1c0de00-0000-4000-8000-000000000007', 'DS/2026/09/0007', 'ADM/2026/CNF/0044',
   '2026-09-28', 'Private Organization', 'Sambul General Hospital — Board of Directors',
   'Confidential submission on the transfer of hospital land and the closure of the outpatient unit',
   'Confidential', 'Administration', FALSE, 'Logged',
   (SELECT id FROM users WHERE nic_no = '881234566V'))
ON DUPLICATE KEY UPDATE
  day_stamp_no = VALUES(day_stamp_no), letter_ref_no = VALUES(letter_ref_no),
  receipt_date = VALUES(receipt_date), sender_type = VALUES(sender_type),
  sender_name = VALUES(sender_name), subject = VALUES(subject),
  priority = VALUES(priority), category = VALUES(category), status = VALUES(status),
  has_attachment = VALUES(has_attachment);

-- ---------------------------------------------------------------------------
-- Minutes. Seeded ONLY on letters 3-6, which have passed the review step.
-- Minutes on a `Logged` letter would contradict D50: writing them is what moves
-- the letter to `Forwarded to Subject`, so a letter cannot have minutes and still
-- be sitting in `Logged`.
--
-- author_role / author_name are the D63 snapshot — written from the real user
-- row here rather than typed into the file, so the seeded history is
-- indistinguishable in shape from history the API produced.
--
-- The `id` values are FIXED, and that is load-bearing rather than cosmetic.
-- official_minutes has no natural key to conflict on — the id is AUTO_INCREMENT
-- and nothing else is unique — so without an explicit id, ON DUPLICATE KEY UPDATE
-- never fires and a second re-seed silently appends a SECOND copy of
-- every minute to the same letter. A registry whose history doubles every time
-- anyone re-seeds it is worse than one that is merely empty. Fixed ids make the
-- primary key the conflict target, exactly as it is for the letters above.
-- ---------------------------------------------------------------------------
INSERT INTO official_minutes
  (id, mail_record_id, author_user_id, author_role, author_name, instruction_type, minutes_text, created_at)
VALUES
  (9001, 'a1c0de00-0000-4000-8000-000000000003',
   (SELECT id FROM users WHERE nic_no = '881234561V'), 'SECRETARY', 'Provincial Secretary',
   'For Necessary Action',
   'The union proposal is noted. The subject matter is budget formulation, which sits '
   'with the District Officer. The letter is forwarded to the Subject Clerk for routing.',
   '2026-09-24 09:30:00'),

  (9002, 'a1c0de00-0000-4000-8000-000000000004',
   (SELECT id FROM users WHERE nic_no = '881234562V'), 'AO', 'Administrative Officer',
   'For Necessary Action',
   'Building repairs and furniture replacement are approved in principle. Forwarded to '
   'the Subject Clerk to route to the District Officer for field inspection.',
   '2026-09-25 10:05:00'),

  (9003, 'a1c0de00-0000-4000-8000-000000000005',
   (SELECT id FROM users WHERE nic_no = '881234563V'), 'CHIEF_CLERK', 'Chief Clerk',
   'For Immediate Report',
   'Court direction noted. Quotation process to be expedited and a comparison of '
   'suppliers reported. Forwarded for routing to the procurement duty holder.',
   '2026-09-20 08:45:00'),

  (9004, 'a1c0de00-0000-4000-8000-000000000006',
   (SELECT id FROM users WHERE nic_no = '881234561V'), 'SECRETARY', 'Provincial Secretary',
   'For Information',
   'Noted for information. The allocation is a routine release; the letter is forwarded '
   'for record and for routing to the officer responsible for budget files.',
   '2026-09-12 09:15:00')
ON DUPLICATE KEY UPDATE
  mail_record_id = VALUES(mail_record_id), author_user_id = VALUES(author_user_id),
  author_role = VALUES(author_role), author_name = VALUES(author_name),
  instruction_type = VALUES(instruction_type), minutes_text = VALUES(minutes_text);

-- ---------------------------------------------------------------------------
-- Attachment metadata for the five letters that carry a scan — WITHOUT the files.
--
-- This is Task 2.18's stated gap, and it is deliberate rather than unfinished.
-- The seed runner is a plain multi-statement SQL executor (Phase 1 D10), so it can
-- insert a row describing a file but cannot write bytes to disk. Committing real
-- PDFs to the repository would be the alternative, and a demo that uploads one
-- file by hand is a better demonstration of the feature than six committed
-- binaries.
--
-- What this means at runtime, stated so nobody discovers it during a demo:
-- `GET /api/v1/mail/:id/attachments/:attachmentId` returns 404 for these rows,
-- because the file the row points at does not exist. The row is there so the
-- detail view has something to list and so `has_attachment` agrees with
-- `mail_attachments` rather than standing alone (D58). Uploading a real file to
-- any of these letters makes the download work immediately, with no re-seed.
--
-- `stored_name` is a syntactically valid UUID + extension because that is what the
-- upload middleware generates, so the row looks exactly like one it wrote. The
-- path is never built from `original_name` (D57), which is why these names are
-- safe to invent here.
--
-- Fixed ids, for the same reason the minutes use fixed ids: `mail_attachments`
-- has no natural key to conflict on, so without them a re-seed doubles the rows.
-- ---------------------------------------------------------------------------
INSERT INTO mail_attachments
  (id, mail_record_id, original_name, stored_name, stored_path, mime_type,
   size_bytes, uploaded_by, created_at)
VALUES
  (9101, 'a1c0de00-0000-4000-8000-000000000001',
   'tender_lab_equipment.pdf', 'b1f0a2c4-7d3e-4a19-9c58-2f6e1d0a4b71.pdf',
   'DS/2026/09/0001/b1f0a2c4-7d3e-4a19-9c58-2f6e1d0a4b71.pdf',
   'application/pdf', 284512,
   (SELECT id FROM users WHERE nic_no = '881234568V'), '2026-09-24 10:02:00'),

  (9102, 'a1c0de00-0000-4000-8000-000000000003',
   'budget_proposals_2027.pdf', 'c3a7d918-2b60-4e83-af19-7d4c0b8e2a55.pdf',
   'DS/2026/09/0003/c3a7d918-2b60-4e83-af19-7d4c0b8e2a55.pdf',
   'application/pdf', 196430,
   (SELECT id FROM users WHERE nic_no = '881234568V'), '2026-09-22 11:15:00'),

  (9103, 'a1c0de00-0000-4000-8000-000000000004',
   'roof_damage_photo.jpg', 'd9e4b1f7-6a08-4c52-b3e7-1f5a8c9d0b23.jpg',
   'DS/2026/09/0004/d9e4b1f7-6a08-4c52-b3e7-1f5a8c9d0b23.jpg',
   'image/jpeg', 842113,
   (SELECT id FROM users WHERE nic_no = '881234568V'), '2026-09-19 14:48:00'),

  (9104, 'a1c0de00-0000-4000-8000-000000000005',
   'court_order.pdf', 'e5c1a834-7b29-4d06-9f3e-8a2b6d5c1e77.pdf',
   'DS/2026/09/0005/e5c1a834-7b29-4d06-9f3e-8a2b6d5c1e77.pdf',
   'application/pdf', 154872,
   (SELECT id FROM users WHERE nic_no = '881234568V'), '2026-09-15 09:31:00'),

  (9105, 'a1c0de00-0000-4000-8000-000000000006',
   'allocation_letter.pdf', 'f2b6d047-8c13-4a95-8e7d-0b4f1a3c9d68.pdf',
   'DS/2026/09/0006/f2b6d047-8c13-4a95-8e7d-0b4f1a3c9d68.pdf',
   'application/pdf', 121904,
   (SELECT id FROM users WHERE nic_no = '881234568V'), '2026-09-10 08:55:00')
ON DUPLICATE KEY UPDATE
  mail_record_id = VALUES(mail_record_id), original_name = VALUES(original_name),
  stored_name = VALUES(stored_name), stored_path = VALUES(stored_path),
  mime_type = VALUES(mime_type), size_bytes = VALUES(size_bytes);

-- ---------------------------------------------------------------------------
-- The day-stamp counter, advanced past the SEVEN stamps this file inserts.
--
-- The number MUST equal the highest stamp above. It was 6 when this file seeded
-- six letters and letter 0007 was added for Q7; leaving the counter at 6 handed
-- DS/2026/09/0007 to the next letter typed through the API, which then collided
-- with the seeded confidential letter on uq_mail_day_stamp. Every POST /mail after
-- a demo reset failed until this was corrected. A literal here is a duplication of
-- the data above and can drift from it; it is called out rather than derived,
-- because `SELECT MAX(...) + 1` would be wrong — the counter must never move
-- backwards, and MAX over the rows would collapse a counter the API had already
-- advanced past.
--
-- GREATEST, not an assignment. Re-running the seed must never ROLL THE COUNTER
-- BACK: if the API has already issued DS/2026/09/0008 to a letter typed after the
-- first seed, resetting last_seq to 7 makes the next letter mint 0008 again and
-- collide on uq_mail_day_stamp — a duplicate identifier on a legal registry,
-- produced by re-seeding. Moving the counter forward is the only safe direction.
--
-- `year_month` is backticked because YEAR_MONTH is a reserved word in MySQL 8.
-- See the note in 008_day_stamp_counters.sql.
-- ---------------------------------------------------------------------------
INSERT INTO day_stamp_counters (`year_month`, last_seq) VALUES
  ('2026-09', 7)
ON DUPLICATE KEY UPDATE last_seq = GREATEST(last_seq, 7);
