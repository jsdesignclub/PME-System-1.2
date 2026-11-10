/**
 * Turning photographed pages into one scanned PDF.
 *
 * The phone page lets a clerk crop and rotate each captured sheet, then joins
 * the whole batch into a single PDF before upload. Doing this on the phone,
 * rather than server-side, keeps the office free of an image-processing job and
 * means the file that is checked against the 10 MB cap is exactly the file that
 * is stored.
 *
 * `jsPDF` is imported here and this module is loaded with a dynamic `import()`
 * from the phone page, so the PDF writer is fetched only when a batch is
 * actually being combined. A clerk who only sends a ready-made file never pays
 * for it.
 */
import { jsPDF } from 'jspdf';

import { loadBitmap } from './imageCompression.js';
import { MAX_UPLOAD_MB } from './fileTypes.js';

const PAGE_MARGIN_MM = 8;
const MAX_PAGE_EDGE_PX = 2000;

/** Tried in order until the finished PDF fits the upload cap. */
const JPEG_QUALITIES = [0.82, 0.68, 0.52, 0.4];

function fitWithin(width, height, maxEdge) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function renderPage(file) {
  const bitmap = await loadBitmap(file);
  try {
    const fitted = fitWithin(bitmap.width, bitmap.height, MAX_PAGE_EDGE_PX);
    const canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not read the image.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, fitted.width, fitted.height);
    context.drawImage(bitmap, 0, 0, fitted.width, fitted.height);

    return { canvas, width: fitted.width, height: fitted.height };
  } finally {
    bitmap.close?.();
  }
}

function assemblePdf(pages, quality) {
  let pdf;

  pages.forEach((page, index) => {
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

    pdf.addImage(
      page.canvas.toDataURL('image/jpeg', quality),
      'JPEG',
      x,
      y,
      width,
      height,
    );
  });

  return pdf.output('blob');
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
 * Quality is stepped down only when the finished file would breach the upload
 * cap. The thrown error carries `code = 'PDF_TOO_LARGE'` so the page can word
 * the failure in the reader's language instead of repeating an English string.
 */
export async function buildPdfFile(files, { name } = {}) {
  if (!files?.length) {
    const empty = new Error('There is nothing to combine.');
    empty.code = 'PDF_EMPTY';
    throw empty;
  }

  const pages = [];
  for (const file of files) pages.push(await renderPage(file));

  const limit = MAX_UPLOAD_MB * 1024 * 1024;
  let lastSize = 0;

  for (const quality of JPEG_QUALITIES) {
    const blob = assemblePdf(pages, quality);
    lastSize = blob.size;
    if (blob.size <= limit) {
      return new File([blob], name ?? pdfFileName(), {
        type: 'application/pdf',
        lastModified: Date.now(),
      });
    }
  }

  const tooLarge = new Error('The scanned pages are too large to send as one PDF.');
  tooLarge.code = 'PDF_TOO_LARGE';
  tooLarge.size = lastSize;
  throw tooLarge;
}
