/**
 * Turning prepared pages into one scanned PDF.
 *
 * Pages arrive from `photoPage.js` already downscaled, re-encoded as JPEG, and
 * labelled with their pixel size. In the normal path this module therefore does
 * NO image decoding and NO canvas work: it reads each page's JPEG bytes and
 * hands them to jsPDF. That matters on a phone, where decoding a 48 MP camera
 * file or holding several full-size canvases at once is what produces the
 * browser's "not enough memory" failure.
 *
 * The decode path only runs as a fallback, for a page whose size is unknown, or
 * when the finished PDF is over the upload cap and the pages must be shrunk.
 *
 * `jsPDF` is imported here and this module is loaded with a dynamic `import()`
 * from the phone page, so the PDF writer is fetched only when a batch is
 * actually being combined.
 */
import { jsPDF } from 'jspdf';

import { loadBitmap } from './imageCompression.js';
import { MAX_UPLOAD_MB } from './fileTypes.js';

const PAGE_MARGIN_MM = 8;

/** Size used when a page has to be decoded here rather than taken as-is. */
const FALLBACK_EDGE_PX = 1600;
const SHRINK_EDGE_PX = 1200;

function fitWithin(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function encodePage(file, quality, maxEdge) {
  const bitmap = await loadBitmap(file);
  let canvas;

  try {
    const fitted = fitWithin(bitmap.width, bitmap.height, maxEdge);

    canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not read the image.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, fitted.width, fitted.height);
    context.drawImage(bitmap, 0, 0, fitted.width, fitted.height);

    const blob = await toBlob(canvas, quality);
    if (!blob) throw new Error('Could not encode the page.');

    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      width: fitted.width,
      height: fitted.height,
    };
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    bitmap.close?.();
  }
}

function fileOf(page) {
  return page?.file ?? page;
}

async function pageBytes(page, { reencode, quality, maxEdge }) {
  const file = fileOf(page);

  if (!reencode && page?.width && page?.height) {
    return {
      bytes: new Uint8Array(await file.arrayBuffer()),
      width: page.width,
      height: page.height,
    };
  }

  return encodePage(file, quality, maxEdge);
}

async function assemblePdf(pages, options) {
  let pdf;

  for (let index = 0; index < pages.length; index += 1) {
    const page = await pageBytes(pages[index], options);
    const orientation = page.width > page.height ? 'landscape' : 'portrait';

    if (index === 0) {
      pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
    } else {
      pdf.addPage('a4', orientation);
    }

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const availableWidth = pageWidth - PAGE_MARGIN_MM * 2;
    const availableHeight = pageHeight - PAGE_MARGIN_MM * 2;

    const scale = Math.min(
      availableWidth / page.width,
      availableHeight / page.height,
    );
    const width = page.width * scale;
    const height = page.height * scale;
    const x = (pageWidth - width) / 2;
    const y = (pageHeight - height) / 2;

    pdf.addImage(page.bytes, 'JPEG', x, y, width, height);
  }

  return pdf.output('blob');
}

function asFile(blob, name) {
  return new File([blob], name ?? pdfFileName(), {
    type: 'application/pdf',
    lastModified: Date.now(),
  });
}

/** `scan-20260919-1430.pdf`, dated so two scans never collide. */
export function pdfFileName(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    '-',
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ].join('');
  return `scan-${stamp}.pdf`;
}

/**
 * Join the pages, in order, into one PDF.
 *
 * The first attempt uses the JPEG bytes already stored on each page. Only if
 * that file breaches the upload cap are the pages decoded and re-encoded
 * smaller. The thrown errors carry a `code` so the page can word the failure in
 * the reader's language.
 */
export async function buildPdfFile(pages, { name } = {}) {
  if (!pages?.length) {
    const empty = new Error('There is nothing to combine.');
    empty.code = 'PDF_EMPTY';
    throw empty;
  }

  const limit = MAX_UPLOAD_MB * 1024 * 1024;

  let blob = await assemblePdf(pages, {
    reencode: false,
    quality: 0.72,
    maxEdge: FALLBACK_EDGE_PX,
  });

  if (blob.size <= limit) return asFile(blob, name);

  blob = await assemblePdf(pages, {
    reencode: true,
    quality: 0.55,
    maxEdge: SHRINK_EDGE_PX,
  });

  if (blob.size <= limit) return asFile(blob, name);

  const tooLarge = new Error('The scanned pages are too large to send as one PDF.');
  tooLarge.code = 'PDF_TOO_LARGE';
  tooLarge.size = blob.size;
  throw tooLarge;
}
