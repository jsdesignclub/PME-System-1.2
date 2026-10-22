-- ============================================================================
-- patch_fix_attachment_mime_types.sql
--
-- FIX — a scanned letter cannot be attached. The upload is refused with
-- `InvalidMIMEType` ("mime type image/tiff is not supported"), the letter
-- shows an error, and the same file uploads on one desk and not on another.
--
-- WHY
-- ---
-- The `mail-attachments` bucket carries an `allowed_mime_types` list, and
-- storage refuses any upload whose Content-Type is not in it. The list and the
-- application disagreed:
--
--   the app accepts            the bucket allowed
--   -------------------------  --------------------------------------------
--   .pdf  .jpg  .jpeg          application/pdf, image/jpeg
--   .png                       image/png
--   .tiff                      (image/tiff WAS MISSING)
--   .doc  .docx                application/msword, ...wordprocessingml.document
--
-- A TIFF scan — which is what office scanning software produces — was
-- accepted by the form and then refused by the bucket.
--
-- On top of that, the Content-Type the browser sends is `file.type`, which is
-- the OPERATING SYSTEM's answer for the extension rather than the type itself.
-- A Windows desk with no PDF application installed reports a `.pdf` as
-- `application/octet-stream` or `application/x-pdf`, and neither is in the
-- list. The client now states the type itself, from the extension the
-- allowlist already validated (frontend/src/utils/fileTypes.js), so the OS's
-- guess can no longer decide whether a file is accepted.
--
-- The list below is the exact set the client sends, plus `image/jpg` for
-- clients that still report that spelling. `image/gif` is kept because it was
-- already there.
--
-- `file_size_limit` is re-asserted at 10 MB, which is the cap the form
-- enforces, so the two cannot drift apart.
--
-- Idempotent: safe to re-run.
-- ============================================================================


-- ============================================================================
-- 1. The bucket's rules
-- ============================================================================
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'application/pdf',
         'image/jpeg',
         'image/jpg',
         'image/png',
         'image/gif',
         'image/tiff',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
       ],
       file_size_limit = 10485760,
       updated_at = now()
 WHERE id = 'mail-attachments';


-- ============================================================================
-- 2. SANITY CHECK (read-only)
-- ============================================================================
-- `allowed_mime_types` must contain image/tiff and application/pdf. If it does
-- not, the bucket was never created from this project's schema and the UPDATE
-- above had nothing to update.
SELECT
  id,
  public,
  file_size_limit,
  allowed_mime_types,
  (allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png','image/tiff'])
    AS accepts_the_supported_types
FROM storage.buckets
WHERE id = 'mail-attachments';
