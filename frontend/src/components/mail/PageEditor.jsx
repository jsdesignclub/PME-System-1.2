/**
 * Crop and rotate one scanned page.
 *
 * The crop box is held in normalised coordinates over a canvas that already has
 * the page's rotation applied, so `flattenPage` can render the same rectangle at
 * full resolution no matter how large the preview is drawn here.
 *
 * Pointer handling uses pointer capture on whichever handle started the drag, so
 * a finger that slides off a 24px handle keeps cropping instead of scrolling the
 * page underneath.
 */
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, RotateCw } from 'lucide-react';

import { loadBitmap } from '../../utils/imageCompression.js';
import { flattenPage } from '../../utils/pageTransform.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Modal } from '../common/Modal.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };
const MIN_CROP = 0.08;

/** The preview never needs the camera's full pixel count. */
const MAX_PREVIEW_EDGE = 1600;

const CORNERS = [
  { key: 'nw', className: '-left-3 -top-3 cursor-nwse-resize' },
  { key: 'ne', className: '-right-3 -top-3 cursor-nesw-resize' },
  { key: 'sw', className: '-left-3 -bottom-3 cursor-nesw-resize' },
  { key: 'se', className: '-right-3 -bottom-3 cursor-nwse-resize' },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function nextCrop(kind, start, dx, dy) {
  if (kind === 'move') {
    return {
      x: clamp(start.x + dx, 0, 1 - start.w),
      y: clamp(start.y + dy, 0, 1 - start.h),
      w: start.w,
      h: start.h,
    };
  }

  let { x, y, w, h } = start;

  if (kind.includes('w')) {
    const left = clamp(start.x + dx, 0, start.x + start.w - MIN_CROP);
    w = start.x + start.w - left;
    x = left;
  }
  if (kind.includes('e')) {
    w = clamp(start.w + dx, MIN_CROP, 1 - start.x);
  }
  if (kind.includes('n')) {
    const top = clamp(start.y + dy, 0, start.y + start.h - MIN_CROP);
    h = start.y + start.h - top;
    y = top;
  }
  if (kind.includes('s')) {
    h = clamp(start.h + dy, MIN_CROP, 1 - start.y);
  }

  return { x, y, w, h };
}

function dimRects(crop) {
  return [
    { left: 0, top: 0, width: '100%', height: `${crop.y * 100}%` },
    {
      left: 0,
      top: `${(crop.y + crop.h) * 100}%`,
      width: '100%',
      height: `${(1 - crop.y - crop.h) * 100}%`,
    },
    {
      left: 0,
      top: `${crop.y * 100}%`,
      width: `${crop.x * 100}%`,
      height: `${crop.h * 100}%`,
    },
    {
      left: `${(crop.x + crop.w) * 100}%`,
      top: `${crop.y * 100}%`,
      width: `${(1 - crop.x - crop.w) * 100}%`,
      height: `${crop.h * 100}%`,
    },
  ];
}

export function PageEditor({ open, page, onClose, onApply }) {
  const { t } = useLanguage();
  const canvasRef = useRef(null);
  const drag = useRef(null);
  const [bitmap, setBitmap] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState(FULL_CROP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !page?.file) return undefined;

    let live = true;

    loadBitmap(page.file)
      .then((next) => {
        if (live) setBitmap(next);
        else next.close?.();
      })
      .catch(() => {
        if (live) setError(t('scan.editLoadFailed'));
      });

    return () => {
      live = false;
    };
  }, [open, page, t]);

  useEffect(() => {
    return () => {
      bitmap?.close?.();
    };
  }, [bitmap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;

    const sideways = rotation % 180 !== 0;
    const fullWidth = sideways ? bitmap.height : bitmap.width;
    const fullHeight = sideways ? bitmap.width : bitmap.height;

    const scale = Math.min(
      1,
      MAX_PREVIEW_EDGE / Math.max(fullWidth, fullHeight),
    );
    const width = Math.max(1, Math.round(fullWidth * scale));
    const height = Math.max(1, Math.round(fullHeight * scale));

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.save();
    context.translate(width / 2, height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(
      bitmap,
      -(bitmap.width * scale) / 2,
      -(bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    );
    context.restore();
  }, [bitmap, rotation]);

  function rotate(step) {
    setRotation((current) => (current + step + 360) % 360);
    setCrop(FULL_CROP);
  }

  function beginDrag(kind, event) {
    event.preventDefault();
    event.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    drag.current = {
      kind,
      rect,
      startX: event.clientX,
      startY: event.clientY,
      start: { ...crop },
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    const active = drag.current;
    if (!active) return;
    event.preventDefault();

    const dx = (event.clientX - active.startX) / active.rect.width;
    const dy = (event.clientY - active.startY) / active.rect.height;
    setCrop(nextCrop(active.kind, active.start, dx, dy));
  }

  function endDrag(event) {
    if (!drag.current) return;
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may already have released it; nothing to undo.
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const flattened = await flattenPage(page.file, { rotation, crop });
      onApply(flattened);
      onClose();
    } catch {
      setError(t('scan.editFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      wide
      title={t('scan.editTitle')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm font-medium text-ink transition hover:bg-slate-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy || !bitmap}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('scan.editApplying') : t('scan.editApply')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => rotate(-90)}
            className="inline-flex items-center gap-1.5 rounded-btn border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RotateCcw size={14} aria-hidden="true" />
            {t('scan.rotateLeft')}
          </button>
          <button
            type="button"
            onClick={() => rotate(90)}
            className="inline-flex items-center gap-1.5 rounded-btn border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <RotateCw size={14} aria-hidden="true" />
            {t('scan.rotateRight')}
          </button>
        </div>

        <div className="flex justify-center">
          {bitmap ? (
            <div className="relative inline-block touch-none">
              <canvas
                ref={canvasRef}
                className="block h-auto max-h-[55vh] w-auto max-w-full"
              />

              {dimRects(crop).map((style, index) => (
                <div
                  key={index}
                  className="pointer-events-none absolute bg-slate-900/60"
                  style={style}
                />
              ))}

              <div
                className="absolute cursor-move border-2 border-white"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                }}
                onPointerDown={(event) => beginDrag('move', event)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {CORNERS.map((corner) => (
                  <span
                    key={corner.key}
                    role="presentation"
                    className={`absolute h-6 w-6 rounded-full border-2 border-white bg-brand ${corner.className}`}
                    onPointerDown={(event) => beginDrag(corner.key, event)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="py-10 text-sm text-slate-500">{t('scan.editLoading')}</p>
          )}
        </div>

        <p className="text-center text-xs text-slate-500">{t('scan.editHint')}</p>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  );
}
