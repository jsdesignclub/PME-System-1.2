/**
 * Preparing one camera photo as a page of a scanned PDF.
 *
 * A modern phone camera can write a 48 MP file. Decoding that at full size is
 * ~190 MB of pixels, which is more than a mobile browser will give a tab — the
 * failure surfaces as "not enough memory to complete this operation". The fix
 * is to decode ONCE at a bounded size and never again:
 *
 *   * the JPEG header is read for its pixel dimensions before decoding, so the
 *     decoder can be asked to produce a 1600 px-wide bitmap rather than the
 *     full-size one;
 *   * the result is re-encoded as JPEG and its pixel size is remembered on the
 *     page;
 *   * the PDF writer then feeds those JPEG bytes straight to jsPDF, with no
 *     second decode and no full-size canvas.
 *
 * Everything here frees its canvas as soon as the JPEG exists.
 */
import { loadBitmap } from './imageCompression.js';
import { thumbnailDataUrl } from './thumbnail.js';

/** Long edge of a stored page. A4 at this size is comfortably readable. */
export const PAGE_MAX_EDGE = 1600;

const PAGE_QUALITY = 0.78;

function readJpegSize(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }

    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return null;

    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isStartOfFrame) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8],
      };
    }

    offset += 2 + length;
  }

  return null;
}

function readPngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47];
  if (!signature.every((value, index) => bytes[index] === value)) return null;

  return {
    width:
      ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>>
      0,
    height:
      ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>>
      0,
  };
}

/** Pixel dimensions straight from the file header, without decoding the image. */
async function readImageSize(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    return readJpegSize(head) ?? readPngSize(head);
  } catch {
    return null;
  }
}

async function decodeBounded(file, size) {
  if (
    size &&
    typeof createImageBitmap === 'function' &&
    size.width > PAGE_MAX_EDGE
  ) {
    try {
      // Width only: the browser keeps the aspect ratio for us. The orientation
      // option means EXIF rotation is applied before the resize.
      return await createImageBitmap(file, {
        imageOrientation: 'from-image',
        resizeWidth: PAGE_MAX_EDGE,
      });
    } catch {
      // Fall through to a normal decode below.
    }
  }

  return loadBitmap(file);
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function replaceExtension(name, extension) {
  const dot = name.lastIndexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  return `${base}${extension}`;
}

function unreadable() {
  const error = new Error('This photo could not be read on this phone.');
  error.code = 'PHOTO_UNREADABLE';
  return error;
}

/**
 * Decode, downscale and re-encode one photo.
 *
 * @returns {Promise<{file: File, width: number, height: number}>}
 */
export async function preparePhotoPage(file) {
  if (!file) throw unreadable();

  const size = await readImageSize(file);

  let bitmap;
  try {
    bitmap = await decodeBounded(file, size);
  } catch {
    throw unreadable();
  }

  let canvas;
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, PAGE_MAX_EDGE / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw unreadable();

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await toBlob(canvas, 'image/jpeg', PAGE_QUALITY);
    if (!blob) throw unreadable();

    const preview = thumbnailDataUrl(canvas);

    return {
      file: new File([blob], replaceExtension(file.name, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }),
      width,
      height,
      preview,
    };
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    bitmap.close?.();
  }
}
