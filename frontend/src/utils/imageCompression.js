/**
 * Shrink a photographed page before it is uploaded.
 *
 * A phone camera writes a 2-4 MB JPEG for a single A4 sheet, and a letter can be
 * several pages. Downscaling the long edge and re-encoding at a moderate quality
 * takes that to a few hundred KB per page with no loss of legibility for a
 * scanner-style document. It also keeps the upload inside the same 10 MB cap the
 * server enforces, so a burst of photos does not fail halfway through.
 *
 * Compression is best-effort and never blocks an upload: if the browser cannot
 * decode the image, or re-encoding does not make it smaller, the original file
 * is returned unchanged. Only the formats a camera produces (JPEG/PNG) are
 * touched — a PDF or Word file is passed straight through.
 */
import { extensionOf } from './fileTypes.js';

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

const DEFAULT_MAX_DIMENSION = 2000;
const DEFAULT_TARGET_BYTES = 1.5 * 1024 * 1024;
const DEFAULT_QUALITY = 0.82;
const MIN_QUALITY = 0.5;

/** Decode a File into something drawable, honouring EXIF orientation. */
export function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read the image.'));
    };
    image.src = url;
  });
}

/** Fit within a square box without ever scaling a small image up. */
function fitWithin(width, height, maxDimension) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function replaceExtension(name, extension) {
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  return `${base}${extension}`;
}

/**
 * Compress an image file, returning a smaller JPEG or the original on failure.
 *
 * @param {File} file
 * @param {{maxDimension?: number, targetBytes?: number, quality?: number}} [options]
 * @returns {Promise<File>}
 */
export async function compressImage(file, options = {}) {
  if (!file) return file;
  if (!PHOTO_EXTENSIONS.has(extensionOf(file.name))) return file;
  if (!file.type?.startsWith('image/')) return file;

  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const targetBytes = options.targetBytes ?? DEFAULT_TARGET_BYTES;

  // Already small enough: re-encoding would only lose quality for no gain.
  if (file.size <= targetBytes) return file;

  let bitmap;
  try {
    bitmap = await loadBitmap(file);
  } catch {
    return file;
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return file;

    // A flat white background keeps a transparent PNG from turning black where
    // the JPEG encoder would otherwise fill the alpha channel.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    let quality = options.quality ?? DEFAULT_QUALITY;
    let blob = await toBlob(canvas, 'image/jpeg', quality);
    while (blob && blob.size > targetBytes && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.1);
      blob = await toBlob(canvas, 'image/jpeg', quality);
    }

    if (!blob) return file;
    if (blob.size >= file.size) return file;

    // Output is JPEG, so the extension must say so: the server derives the
    // stored MIME type from the extension, not from the bytes.
    return new File([blob], replaceExtension(file.name, '.jpg'), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}
