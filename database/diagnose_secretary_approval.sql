-- ============================================================================
-- diagnose_secretary_approval.sql
--
-- The Secretary's bell stays quiet after an officer forwards a completion
-- document for their approval. The code path is:
--
--   officer picks "Secretary" in the submit form
--     -> submit_completion() INSERTs a row in completion_submissions
--        with approver_role = 'SECRETARY'
--     -> trigger trg_notify_completion (AFTER INSERT) fires
--     -> push_notification() to EVERY profiles row where
--        role::text = approver_role AND is_active AND id <> actor
--     -> the bell reads its own feed through RLS (user_id = auth.uid())
--
-- Run the five checks below IN ORDER. Every statement is a SELECT; nothing is
-- changed. The first check that returns empty/wrong tells you the break.
-- ============================================================================


-- CHECK 1 — does the completion trigger exist at all?
-- The trigger is created by patch_notifications.sql, NOT by
-- patch_completion_approval.sql. If the completion patch ran LAST (or the
-- notifications patch never ran), this is empty: the submission INSERT
-- succeeds but nobody is ever told. Fix: run database/patch_notifications.sql
-- (it must run AFTER patch_completion_approval.sql has created the table).
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.completion_submissions'::regclass
  AND NOT tgisinternal;


-- CHECK 2 — what approver role did the officer actually send to?
-- Latest submission first. approver_role must read 'SECRETARY'. If it says
-- 'AO' or 'DEPARTMENT_HEAD', the notification went to THAT role's holders and
-- the Secretary was never a recipient — pick "Secretary" in the form.
SELECT id, mail_record_id, approver_role, status, submitted_by_name, created_at
FROM public.completion_submissions
ORDER BY created_at DESC
LIMIT 5;


-- CHECK 3 — is the Secretary an active holder of the role?
-- The trigger's WHERE clause is role::text = approver_role AND is_active.
--   * role <> 'SECRETARY'  -> fix with: UPDATE public.profiles SET role='SECRETARY' ...
--   * is_active = false    -> the row is filtered out silently:
--                               UPDATE public.profiles SET is_active = TRUE ...
--                             WHERE email = '<secretary-email>';
--   * id                   -> must be the same UUID the Secretary signs in
--                             with (profiles.id = auth.users.id).
SELECT id, full_name, email, role, is_active
FROM public.profiles
WHERE role = 'SECRETARY'
ORDER BY full_name;


-- CHECK 4 — did the notification row land?
-- A fresh 'approval_requested' row whose user_id equals the Secretary's id
-- (CHECK 3) means the SERVER did its job and the break is on the client
-- (stale tab, or RLS — see CHECK 5). Empty means the trigger/recipient
-- checks above failed.
SELECT n.id, n.user_id, n.type, n.mail_record_id, n.is_read, n.created_at
FROM public.notifications n
WHERE n.type = 'approval_requested'
ORDER BY n.created_at DESC
LIMIT 10;


-- CHECK 5 — may a signed-in user read their own feed?
-- Expect three policies (notifications_read / _update / _delete) and the
-- SELECT + UPDATE grants for 'authenticated'. Missing rows here: the bell
-- query returns an empty list even though notifications exist.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'notifications'
  AND grantee = 'authenticated'
ORDER BY privilege_type;
