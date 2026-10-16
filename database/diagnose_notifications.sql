-- ============================================================================
-- PME System — diagnose the notification feed (the header bell)
-- ============================================================================
-- Run this when the bell does not show a notification it should. It CHANGES
-- NOTHING: every query below is a SELECT. Read the notes under each and follow
-- the fix that matches what you see.
--
-- Backstory worth keeping: forwarding a letter to the AO works even when the
-- notification trigger is missing, so "the letter moved but the bell stayed
-- quiet" points at the notification objects, not at the workflow. Run the four
-- checks in order.
-- ============================================================================


-- ============================================================================
-- CHECK 1 — are the trigger, the function and the table installed?
-- ============================================================================
-- Expect exactly one row whose tgname is 'trg_notify_mail_change'.
--
--   * No row at all            -> the patch was never applied. This is the most
--                                 common cause. Apply, in this order:
--                                 database/patch_completion_approval.sql, then
--                                 database/patch_notifications.sql.
--   * Two rows (one internal)  -> fine; only the user trigger matters.
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.mail_records'::regclass
  AND NOT tgisinternal;

-- The helper the trigger calls, and the table it writes to. Both should exist.
SELECT proname
FROM pg_proc
WHERE proname IN ('notify_on_mail_change', 'push_notification')
ORDER BY proname;

SELECT to_regclass('public.notifications') AS notifications_table;


-- ============================================================================
-- CHECK 2 — has ANY notification ever been written?
-- ============================================================================
-- If this is empty while CHECK 1 passed, the trigger exists but never fired with
-- a recipient. Look at CHECK 3.
SELECT id, user_id, type, mail_record_id, is_read, created_at
FROM public.notifications
ORDER BY created_at DESC
LIMIT 20;


-- ============================================================================
-- CHECK 3 — who is an AO, are they active, and do their ids line up?
-- ============================================================================
-- The trigger only notifies profiles that are BOTH role = 'AO' AND is_active.
--
--   * No rows                -> nobody holds the AO role in `profiles`, so the
--                               forward had no recipient. Fix the role:
--                                   UPDATE public.profiles
--                                      SET role = 'AO'
--                                    WHERE email = '<ao-email>';
--   * is_active = false      -> the AO is filtered out. Reactivate:
--                                   UPDATE public.profiles
--                                      SET is_active = TRUE
--                                    WHERE role = 'AO';
--   * id looks right         -> compare it against `user_id` in CHECK 2. They
--                               must be the SAME uuid. `profiles.id` is the
--                               auth user id (FK to auth.users), so a mismatch
--                               means the AO signs in as a different account.
SELECT id, full_name, email, role, is_active
FROM public.profiles
WHERE role = 'AO'
ORDER BY full_name;


-- ============================================================================
-- CHECK 4 — confirm the CLIENTS may read their own feed
-- ============================================================================
-- The bell reads `notifications` through PostgREST. With RLS on and no SELECT
-- policy (or no GRANT) a signed-in user sees an empty feed even when rows exist.
-- Expect the three policies and the SELECT grant below.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'notifications'
ORDER BY policyname;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'notifications'
  AND grantee = 'authenticated'
ORDER BY privilege_type;


-- ============================================================================
-- AFTER FIXING — prove it works
-- ============================================================================
-- Forward a letter to the AO from the app, then run this. A fresh
-- 'forwarded_to_ao' row should be the newest line, and the bell updates within
-- 60s (or immediately on the AO's next login/reload).
SELECT id, type, mail_record_id, is_read, created_at
FROM public.notifications
ORDER BY created_at DESC
LIMIT 5;
