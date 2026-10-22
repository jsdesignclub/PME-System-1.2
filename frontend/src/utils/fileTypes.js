/**
 * The file types a letter may carry, and how the browser is told what they are.
 *
 * THE MIME TYPE IS DERIVED FROM THE EXTENSION, NEVER FROM `file.type`.
 *
 * `file.type` is whatever the operating system's file-type registry says about
 * the extension, and that answer differs from desk to desk: a Windows machine
 * with no PDF application installed reports a `.pdf` as `application/octet-stream`
 * or `application/x-pdf`, and office scanners write `.tif` where others write
 * `.tiff`. The browser sends that string as the upload's Content-Type, and the
 * storage bucket checks it against its own allowlist — so a perfectly good scan
 * is refused because of the machine it was scanned on, and the same file
 * uploads on one desk and not on another.
 *
 * The extension is what the clerk chose and what the allowlist already
 * validates, so it is the authoritative answer to "what is this file". The
 * registry's guess is discarded.
 *
 * `allowed_mime_types` on the `mail-attachments` bucket is the other half of
 * this: it must list exactly the types below, or storage refuses the upload
 * with `InvalidMIMEType` even though the client sent a correct one. See
 * database/patch_fix_attachment_mime_types.sql.
 */

/** The formats a letter may carry. `.tif` is the same format as `.tiff`. */
export const ALLOWED_EXTENSIONS = Object.freeze([
  '.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.doc', '.docx',
]);

/** 10 MB cap for attachments. Matches the bucket's `file_size_limit`. */
export const MAX_UPLOAD_MB = 10;

/**
 * Extension to canonical MIME type.
 *
 * The canonical value is what the browser is told to send, so the same file
 * always presents the same type to storage no matter which desk it came from.
 */
export const MIME_BY_EXTENSION = Object.freeze({
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

/**
 * The lower-cased extension of a file name, including the dot.
 *
 * @param {string} name
 * @returns {string} e.g. '.pdf', or '' when the name has no extension
 */
export function extensionOf(name) {
  const text = String(name ?? '');
  const dot = text.lastIndexOf('.');
  return dot === -1 ? '' : text.slice(dot).toLowerCase();
}

/**
 * The MIME type to upload a file under, taken from its extension.
 *
 * Falls back to the browser's own answer only for an extension the allowlist
 * does not name — a file that is going to be rejected anyway, but rejected with
 * an honest message rather than with a wrong type.
 *
 * @param {{name?: string, type?: string}} file
 * @returns {string}
 */
export function mimeTypeFor(file) {
  return MIME_BY_EXTENSION[extensionOf(file?.name)] ?? file?.type ?? 'application/octet-stream';
}

/**
 * The same file, re-declared with the canonical MIME type.
 *
 * Passing `contentType` to `storage.upload()` is NOT enough: the storage client
 * sends a Blob as a multipart form, and the browser writes each part's
 * Content-Type from the Blob's own `type`. So the type the bucket checks is the
 * type on the object handed to it, and re-declaring the File is what actually
 * changes it.
 *
 * The name is carried over so the multipart part keeps the file's name.
 *
 * @param {File|Blob} file
 * @returns {File|Blob} a file whose `type` is the canonical one
 */
export function withCanonicalType(file) {
  const type = mimeTypeFor(file);
  if (!file || typeof File === 'undefined') return file;
  if (file.type === type) return file;
  try {
    return new File([file], file.name, { type });
  } catch {
    // A browser that refuses to construct a File still has to be able to
    // upload. The original file is better than no upload.
    return file;
  }
}
