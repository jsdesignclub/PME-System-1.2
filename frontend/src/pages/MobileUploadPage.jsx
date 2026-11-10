/**
 * The page the phone opens after scanning the QR code.
 *
 * It is PUBLIC: it sits outside `RequireAuth` because the phone is not signed in
 * and must not be. The scanned token in the URL is the authorization; the page
 * forwards it to the `mobile-upload` Edge Function, which verifies it and writes
 * the file. Nothing here trusts the phone with a session or a service key.
 *
 * The two inputs are deliberate: `capture="environment"` opens the rear camera
 * directly for photographing the paper, while the second input lets the user
 * pick a file already on the phone. Photographs become ordered pages that can be
 * cropped and rotated and are joined into one PDF; a PDF or Word file is carried
 * through untouched. One ticket can carry all of it.
 */
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Crop, Trash } from 'lucide-react';

import * as uploadTicketApi from '../api/uploadTicketApi.js';
import { errorMessage } from '../api/axiosClient.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_MB, extensionOf } from '../utils/fileTypes.js';
import { preparePhotoPage } from '../utils/photoPage.js';
import { formatBytes } from '../utils/dateUtils.js';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { PageEditor } from '../components/mail/PageEditor.jsx';

const PAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

let sequence = 0;
function nextId() {
  sequence += 1;
  return `item-${Date.now()}-${sequence}`;
}

export default function MobileUploadPage() {
  const { t } = useLanguage();
  const { token } = useParams();
  const [pages, setPages] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const cameraInput = useRef(null);
  const fileInput = useRef(null);

  /**
   * Add files after checking the same rules the desktop form states up front.
   * A bad file is named rather than silently dropped, and the whole selection is
   * refused so the list on screen always matches what will be uploaded.
   */
  async function addFiles(list) {
    const chosen = Array.from(list ?? []);
    if (chosen.length === 0) return;

    setError(null);
    for (const file of chosen) {
      if (!ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
        setError(
          t('attachment.invalidExtension', {
            name: file.name,
          }),
        );
        return;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        setError(
          t('attachment.tooLarge', {
            name: file.name,
            size: (file.size / (1024 * 1024)).toFixed(1),
            limit: MAX_UPLOAD_MB,
          }),
        );
        return;
      }
    }

    setPreparing(true);
    try {
      const newPages = [];
      const newDocuments = [];

      for (const file of chosen) {
        if (PAGE_EXTENSIONS.has(extensionOf(file.name))) {
          // Decode once, at a bounded size, and remember the pixel size so the
          // page can later go into the PDF without being decoded again.
          const prepared = await preparePhotoPage(file);
          newPages.push({
            id: nextId(),
            file: prepared.file,
            preview: prepared.preview,
            width: prepared.width,
            height: prepared.height,
          });
        } else {
          newDocuments.push({ id: nextId(), file });
        }
      }

      if (newPages.length > 0) setPages((current) => [...current, ...newPages]);
      if (newDocuments.length > 0) {
        setDocuments((current) => [...current, ...newDocuments]);
      }
    } catch (failure) {
      const lowMemory = /memory|allocat/i.test(String(failure?.message ?? ''));
      setError(
        failure?.code === 'PHOTO_UNREADABLE' || lowMemory
          ? t('scan.photoReadFailed')
          : errorMessage(failure, t('scan.mobileUploadFailed')),
      );
    } finally {
      setPreparing(false);
    }
  }

  function removePage(id) {
    setPages((current) => current.filter((page) => page.id !== id));
  }

  function removeDocument(id) {
    setDocuments((current) => current.filter((document) => document.id !== id));
  }

  function movePage(id, step) {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === id);
      const destination = index + step;
      if (index === -1 || destination < 0 || destination >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  function applyEdit(id, result) {
    const target = pages.find((page) => page.id === id);
    if (!target) return;
    const next = {
      ...target,
      file: result.file,
      width: result.width ?? target.width,
      height: result.height ?? target.height,
      preview: result.preview ?? target.preview,
    };
    setPages((current) => current.map((page) => (page.id === id ? next : page)));
  }

  async function submit() {
    if (pages.length === 0 && documents.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const files = [];

      if (pages.length > 0) {
        const { buildPdfFile } = await import('../utils/documentScan.js');
        files.push(await buildPdfFile(pages));
      }
      for (const document of documents) files.push(document.file);

      await uploadTicketApi.uploadFiles(token, files);

      setPages([]);
      setDocuments([]);
      setDone(true);
    } catch (failure) {
      const message = String(failure?.message ?? '');
      const outOfMemory =
        failure?.name === 'RangeError' ||
        failure?.name === 'NotEnoughMemoryError' ||
        /memory|allocat/i.test(message);

      setError(
        outOfMemory
          ? t('scan.pdfOutOfMemory')
          : failure?.code === 'PDF_TOO_LARGE'
            ? t('scan.pdfTooLarge')
            : errorMessage(failure, t('scan.mobileUploadFailed')),
      );
    } finally {
      setBusy(false);
    }
  }

  const editing = pages.find((page) => page.id === editingId) ?? null;
  const total = pages.length + documents.length;
  const uploadLabel =
    pages.length > 0 && documents.length > 0
      ? t('scan.uploadMixed', { count: documents.length })
      : pages.length > 0
        ? t('scan.uploadPdf', { count: pages.length })
        : t('scan.upload', { count: documents.length });

  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-md rounded-card border border-slate-300 bg-surface shadow-card">
        <header className="border-b border-slate-200 px-5 py-4">
          <h1 className="text-lg font-semibold text-ink">{t('scan.mobileTitle')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('scan.mobileIntro')}</p>
        </header>

        <div className="space-y-4 p-5">
          {done ? (
            <div className="space-y-2">
              <p className="text-base font-semibold text-brand-400">
                {t('scan.mobileDoneTitle')}
              </p>
              <p className="text-sm text-slate-700">{t('scan.mobileDoneBody')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInput.current?.click()}
                  disabled={preparing || busy}
                  className="rounded-btn bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {t('scan.takePhoto')}
                </button>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={preparing || busy}
                  className="rounded-btn border border-slate-300 px-4 py-3 text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {t('scan.chooseFiles')}
                </button>
              </div>

              <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ALLOWED_EXTENSIONS.join(',')}
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = '';
                }}
              />

              <p className="text-xs text-slate-500">{t('scan.mobileLimit')}</p>
              <p className="text-xs text-slate-500">{t('scan.mobileOptimiseNote')}</p>

              {preparing && (
                <p className="text-sm text-slate-600">{t('scan.optimising')}</p>
              )}

              {pages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    {t('scan.pagesTitle', { count: pages.length })}
                  </p>
                  <ol className="space-y-2">
                    {pages.map((page, index) => (
                      <li
                        key={page.id}
                        className="flex items-center gap-2 rounded-btn border border-slate-200 p-2"
                      >
                        <img
                          src={page.preview}
                          alt={t('scan.pageLabel', { index: index + 1 })}
                          className="h-14 w-11 shrink-0 rounded border border-slate-200 object-cover"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-slate-800">
                            {t('scan.pageLabel', { index: index + 1 })}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {formatBytes(page.file.size)}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => movePage(page.id, -1)}
                            disabled={index === 0 || busy}
                            aria-label={t('scan.moveUp')}
                            className="rounded-btn p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ArrowUp size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePage(page.id, 1)}
                            disabled={index === pages.length - 1 || busy}
                            aria-label={t('scan.moveDown')}
                            className="rounded-btn p-1.5 text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ArrowDown size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(page.id)}
                            disabled={busy}
                            aria-label={t('scan.edit')}
                            className="rounded-btn p-1.5 text-brand-400 transition hover:bg-slate-100 disabled:opacity-30"
                          >
                            <Crop size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePage(page.id)}
                            disabled={busy}
                            aria-label={t('scan.remove')}
                            className="rounded-btn p-1.5 text-red-700 transition hover:bg-red-50 disabled:opacity-30"
                          >
                            <Trash size={16} aria-hidden="true" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {documents.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    {t('scan.documentsTitle', { count: documents.length })}
                  </p>
                  <ul className="space-y-1.5">
                    {documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex items-center justify-between gap-2 rounded-btn border border-slate-200 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-800">
                            {document.file.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {formatBytes(document.file.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDocument(document.id)}
                          disabled={busy}
                          className="shrink-0 text-xs text-red-700 underline disabled:opacity-30"
                        >
                          {t('scan.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {error && <ErrorNote>{error}</ErrorNote>}

              <button
                type="button"
                onClick={submit}
                disabled={busy || preparing || total === 0}
                className="w-full rounded-btn bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {busy
                  ? pages.length > 0
                    ? t('scan.pdfBuilding')
                    : t('scan.uploading')
                  : uploadLabel}
              </button>
            </>
          )}
        </div>
      </div>

      <PageEditor
        key={editingId ?? 'closed'}
        open={editingId !== null}
        page={editing}
        onClose={() => setEditingId(null)}
        onApply={(file) => {
          if (editingId) applyEdit(editingId, file);
        }}
      />
    </div>
  );
}
