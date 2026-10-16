-- ============================================================================
-- PME System — in-app notifications (header bell)
-- ============================================================================
-- Run everything below in the Supabase SQL Editor.
--
-- WHAT THIS ADDS
-- --------------
-- A per-user notification feed so the header bell can show a red unread count.
-- Rows are WRITTEN BY TRIGGERS ONLY, never by the browser: a client is allowed to
-- read its own feed, mark its own rows read, and delete its own rows — nothing
-- else. Every insert happens inside a SECURITY DEFINER function owned by the
-- schema owner, so a trigger can address ANOTHER user (the officer a letter was
-- assigned to, the approver a document was sent to) without the caller holding
-- any write privilege on the table, and without RLS rejecting the row.
--
-- EVENTS (one trigger family on mail_records, one on completion_submissions)
-- ------------------------------------------------------------------------
--   mail_records AFTER UPDATE:
--     assigned_officer_id changed        -> 'assigned'            to that officer
--     status -> 'Forwarded to AO'        -> 'forwarded_to_ao'     to every active AO
--     status -> 'Forwarded to Subject'   -> 'returned'            to the clerk who logged it
--     status -> 'Completed'              -> 'completed'           to the clerk who logged it
--   completion_submissions AFTER INSERT OR UPDATE:
--     INSERT                             -> 'approval_requested'  to every holder of the approver role
--     status Pending -> 'Approved'       -> 'approved'            to the submitter (the officer)
--     status Pending -> 'Rejected'       -> 'rejected'            to the submitter (the officer)
--
-- The actor is never notified of their own action: both functions drop the
-- caller (`auth.uid()`) from the recipient set.
--
-- DEPENDS ON: patch_completion_approval.sql (the completion_submissions table and
-- the 'Pending Approval' status). Apply that one first.
--
-- HOW TO APPLY
-- ------------
-- Run this file once. Table, index and policy creation are idempotent; the
-- triggers are dropped and recreated so re-running never doubles a notification.
-- ============================================================================


-- ============================================================================
-- 1. notifications — one row per recipient
-- ============================================================================
-- `type` names the event; `payload` carries the bits needed to render the line
-- (reference number, subject, document name) so the feed needs no joins. It is
-- JSONB rather than columns because the shape differs per event and the frontend
-- translates each type's own template. `mail_record_id` is nullable (a future
-- event may not hang off a letter) and cascades, so deleting a letter clears its
-- notifications instead of leaving links to a 404.
CREATE TABLE IF NOT EXISTS public.notifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::JSONB,
  mail_record_id  TEXT NULL REFERENCES public.mail_records(id) ON DELETE CASCADE,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The bell polls two things every minute: the newest page (by user, newest first)
-- and the unread count (by user, unread only). One index each.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 2. push_notification — the single insert path used by every trigger
-- ============================================================================
-- SECURITY DEFINER is what makes the triggers able to write on another user's
-- behalf. Kept as its own function so the two trigger bodies stay readable and
-- the "no insert can be dropped for a NULL recipient" rule lives in one place.
CREATE OR REPLACE FUNCTION public.push_notification(
  p_user_id  UUID,
  p_type     TEXT,
  p_mail_id  TEXT,
  p_payload  JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (user_id, type, mail_record_id, payload)
  VALUES (p_user_id, p_type, p_mail_id, COALESCE(p_payload, '{}'::JSONB));
END;
$$;


-- ============================================================================
-- 3. notify_on_mail_change — assignment and status transitions
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_on_mail_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_nil     UUID := '00000000-0000-0000-0000-000000000000'::UUID;
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'ref',      NEW.day_stamp_no,
    'subject',  NEW.subject,
    'letterId', NEW.id
  );

  -- Handed to an officer. Fires for a fresh assignment AND a re-assignment; a
  -- clerk routed a letter (status unchanged) still notifies the new assignee.
  IF NEW.assigned_officer_id IS DISTINCT FROM OLD.assigned_officer_id
     AND NEW.assigned_officer_id IS NOT NULL
     AND NEW.assigned_officer_id <> COALESCE(v_actor, v_nil) THEN
    PERFORM public.push_notification(NEW.assigned_officer_id, 'assigned', NEW.id, v_payload);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'Forwarded to AO' THEN
      -- Every active AO owns the shared queue, so all of them are told.
      PERFORM public.push_notification(p.id, 'forwarded_to_ao', NEW.id, v_payload)
        FROM public.profiles p
       WHERE p.role = 'AO'
         AND p.is_active
         AND p.id <> COALESCE(v_actor, v_nil);

    ELSIF NEW.status::text = 'Forwarded to Subject' THEN
      -- The AO has recorded their minute and the paper is back with the desk that
      -- logged it.
      IF NEW.created_by_user_id IS NOT NULL
         AND NEW.created_by_user_id <> COALESCE(v_actor, v_nil) THEN
        PERFORM public.push_notification(NEW.created_by_user_id, 'returned', NEW.id, v_payload);
      END IF;

    ELSIF NEW.status::text = 'Completed' THEN
      -- The approval closed the file. The officer who submitted already receives
      -- the 'approved' decision, so only the logging clerk is told here.
      IF NEW.created_by_user_id IS NOT NULL
         AND NEW.created_by_user_id <> COALESCE(v_actor, v_nil) THEN
        PERFORM public.push_notification(NEW.created_by_user_id, 'completed', NEW.id, v_payload);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_mail_change ON public.mail_records;
CREATE TRIGGER trg_notify_mail_change
AFTER UPDATE ON public.mail_records
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_mail_change();


-- ============================================================================
-- 4. notify_on_completion_submission — the approval handshake
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_on_completion_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_nil     UUID := '00000000-0000-0000-0000-000000000000'::UUID;
  v_payload JSONB;
BEGIN
  v_payload := jsonb_build_object(
    'ref',      (SELECT day_stamp_no FROM public.mail_records WHERE id = NEW.mail_record_id),
    'subject',  (SELECT subject      FROM public.mail_records WHERE id = NEW.mail_record_id),
    'letterId', NEW.mail_record_id,
    'document', NEW.document_name
  );

  IF TG_OP = 'INSERT' THEN
    -- Sent for approval: everyone who can decide it is told.
    PERFORM public.push_notification(p.id, 'approval_requested', NEW.mail_record_id, v_payload)
      FROM public.profiles p
     WHERE p.role::text = NEW.approver_role
       AND p.is_active
       AND p.id <> COALESCE(v_actor, v_nil);

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Decided: the officer who submitted hears the outcome. On a rejection this
    -- is the prompt to correct and resubmit; the letter itself has returned to
    -- 'In Progress' in the same transaction.
    IF NEW.status = 'Approved' THEN
      PERFORM public.push_notification(NEW.submitted_by, 'approved', NEW.mail_record_id, v_payload);
    ELSIF NEW.status = 'Rejected' THEN
      PERFORM public.push_notification(NEW.submitted_by, 'rejected', NEW.mail_record_id, v_payload);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_completion ON public.completion_submissions;
CREATE TRIGGER trg_notify_completion
AFTER INSERT OR UPDATE ON public.completion_submissions
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_completion_submission();


-- ============================================================================
-- 5. RLS — read/mark/delete your own feed; nobody inserts from the client
-- ============================================================================
-- There is deliberately NO INSERT policy. With RLS enabled and no INSERT policy,
-- a client INSERT is refused; the SECURITY DEFINER functions above are the only
-- writers. UPDATE is constrained by USING (which rows are visible to change) AND
-- WITH CHECK (what they may become) so a caller can flip is_read on their own
-- row and nothing else.
DROP POLICY IF EXISTS notifications_read   ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;

CREATE POLICY notifications_read ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());


-- ============================================================================
-- 6. Grants
-- ============================================================================
-- The client reads and marks rows through PostgREST, so the table needs the
-- usual authenticated privileges; RLS then narrows them to the caller's rows.
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.notifications_id_seq TO authenticated;

-- Ask PostgREST to pick up the new table immediately.
NOTIFY pgrst, 'reload schema';
