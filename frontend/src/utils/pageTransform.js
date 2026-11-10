/**
 * Applying a crop and rotation to one photographed page.
 *
 * Kept separately from `documentScan.js` so the phone page can flatten a page
 * without pulling the PDF writer into the bundle. `documentScan.js` is imported
 * only when the batch is actually being turned into a PDF.
 *
 * The page is drawn through a canvas so EXIF orientation is applied before
 * cropping. The crop box is expressed in normalised coordinates, so the editor's
 * on-screen rectangle and the full-resolution render agree no matter how the
 * preview is scaled.
 */
import { loadBitmap } from './imageCompression.js';

const FULL_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

function rotatedSize(width, height, rotation) {
  return rotation % 180 === 0
    ? { width, height }
    : { width: height, height: width };
}

function replaceExtension(name, extension) {
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  return `${base}${extension}`;
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Apply a rotation and a normalised crop to one page, returning a new JPEG.
 *
 * Failure returns the original file, as `compressImage` does: a page that
 * cannot be re-encoded is better uploaded untouched than lost.
 */
export async function flattenPage(file, { rotation = 0, crop = FULL_CROP } = {}) {
  if (!file) return file;

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file;
  }

  try {
    const size = rotatedSize(bitmap.width, bitmap.height, rotation);

    const source = document.createElement('canvas');
    source.width = size.width;
    source.height = size.height;
    const sourceContext = source.getContext('2d');
    if (!sourceContext) return file;

    sourceContext.translate(size.width / 2, size.height / 2);
    sourceContext.rotate((rotation * Math.PI) / 180);
    sourceContext.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const x = Math.round(crop.x * size.width);
    const y = Math.round(crop.y * size.height);
    const width = Math.max(1, Math.round(crop.w * size.width));
    const height = Math.max(1, Math.round(crop.h * size.height));

    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const outputContext = output.getContext('2d');
    if (!outputContext) return file;

    outputContext.fillStyle = '#ffffff';
    outputContext.fillRect(0, 0, width, height);
    outputContext.drawImage(source, x, y, width, height, 0, 0, width, height);

    const blob = await toBlob(output, 'image/jpeg', 0.9);
    if (!blob) return file;

    return new File([blob], replaceExtension(file.name, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}
