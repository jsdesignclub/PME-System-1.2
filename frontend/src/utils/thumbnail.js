/**
 * A tiny JPEG thumbnail, as a data URL, for the page list on the phone.
 *
 * The list renders one `<img>` per page. Pointing those at the full page JPEG —
 * a 1600 px image — makes the browser decode and hold the whole thing just to
 * paint a 44x56 px box; a batch of twenty pages then costs hundreds of MB and
 * contributes to the same out-of-memory failure as the PDF writer. A 160 px
 * thumbnail is a few KB and decodes to nothing worth worrying about.
 *
 * A data URL is used rather than an object URL so there is nothing to revoke:
 * removing a page simply drops the string.
 */
const THUMB_MAX_EDGE = 200;
const THUMB_QUALITY = 0.7;

/** `source` may be a canvas, an ImageBitmap or an HTMLImageElement. */
export function thumbnailDataUrl(source, maxEdge = THUMB_MAX_EDGE) {
  if (!source) return null;

  const width = source.width;
  const height = source.height;
  if (!width || !height) return null;

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const thumbWidth = Math.max(1, Math.round(width * scale));
  const thumbHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = thumbWidth;
  canvas.height = thumbHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, thumbWidth, thumbHeight);
  context.drawImage(source, 0, 0, thumbWidth, thumbHeight);

  let url = null;
  try {
    url = canvas.toDataURL('image/jpeg', THUMB_QUALITY);
  } catch {
    url = null;
  }

  canvas.width = 0;
  canvas.height = 0;
  return url;
}
