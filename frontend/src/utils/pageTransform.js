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
import { thumbnailDataUrl } from './thumbnail.js';

const FULL_CROP = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });

/** A cropped page never needs more than this; keeps phone canvas memory small. */
const MAX_OUTPUT_EDGE = 2000;

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
 * Apply a rotation and a normalised crop to one page.
 *
 * Returns `{ file, width, height }`, where `width`/`height` are the new JPEG's
 * pixel size so the PDF writer can place it without decoding again. `width` and
 * `height` are null when the page could not be re-encoded and the original was
 * returned unchanged.
 *
 * The crop is drawn straight into the output canvas, so no full-resolution
 * intermediate canvas is held alongside it, and the canvas is released as soon
 * as the JPEG exists.
 *
 * Failure returns the original file, as `compressImage` does: a page that
 * cannot be re-encoded is better uploaded untouched than lost.
 */
export async function flattenPage(file, { rotation = 0, crop = FULL_CROP } = {}) {
  if (!file) return { file, width: null, height: null };

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return { file, width: null, height: null };
  }

  let output;
  try {
    const size = rotatedSize(bitmap.width, bitmap.height, rotation);

    const cropX = Math.round(crop.x * size.width);
    const cropY = Math.round(crop.y * size.height);
    const cropWidth = Math.max(1, Math.round(crop.w * size.width));
    const cropHeight = Math.max(1, Math.round(crop.h * size.height));

    const scale = Math.min(
      1,
      MAX_OUTPUT_EDGE / Math.max(cropWidth, cropHeight),
    );
    const outputWidth = Math.max(1, Math.round(cropWidth * scale));
    const outputHeight = Math.max(1, Math.round(cropHeight * scale));

    output = document.createElement('canvas');
    output.width = outputWidth;
    output.height = outputHeight;
    const context = output.getContext('2d');
    if (!context) return { file, width: null, height: null };

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);

    // Map the rotated page onto the output so the crop rectangle lands at (0,0).
    context.scale(scale, scale);
    context.translate(-cropX, -cropY);
    context.translate(size.width / 2, size.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const blob = await toBlob(output, 'image/jpeg', 0.88);
    if (!blob) return { file, width: null, height: null };

    return {
      file: new File([blob], replaceExtension(file.name, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }),
      width: outputWidth,
      height: outputHeight,
      preview: thumbnailDataUrl(output),
    };
  } catch {
    return { file, width: null, height: null };
  } finally {
    if (output) {
      output.width = 0;
      output.height = 0;
    }
    bitmap.close?.();
  }
}
