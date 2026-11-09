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
 * pick a file already on the phone (a scan emailed over, or a PDF). Both feed the
 * same list, so a multi-page letter can be sent in one go.
 */
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';

import * as uploadTicketApi from '../api/uploadTicketApi.js';
import { errorMessage } from '../api/axiosClient.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_MB, extensionOf } from '../utils/fileTypes.js';
import { compressImage } from '../utils/imageCompression.js';
import { formatBytes } from '../utils/dateUtils.js';
import { ErrorNote } from '../components/common/ErrorNote.jsx';

export default function MobileUploadPage() {
  const { t } = useLanguage();
  const { token } = useParams();
  const [files, setFiles] = useState([]);
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

    // A camera photo is far larger than the page needs to be readable. Shrink
    // each image before it joins the list, so the size shown is the size that
    // will actually be uploaded. Non-images pass through untouched.
    setPreparing(true);
    try {
      const prepared = [];
      for (const file of chosen) prepared.push(await compressImage(file));
      setFiles((current) => [...current, ...prepared]);
    } finally {
      setPreparing(false);
    }
  }

  function remove(index) {
    setFiles((current) => current.filter((_, position) => position !== index));
  }

  async function submit() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await uploadTicketApi.uploadFiles(token, files);
      setFiles([]);
      setDone(true);
    } catch (failure) {
      setError(errorMessage(failure, t('scan.mobileUploadFailed')));
    } finally {
      setBusy(false);
    }
  }

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
                  disabled={preparing}
                  className="rounded-btn bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {t('scan.takePhoto')}
                </button>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={preparing}
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

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    {t('scan.selected')}
                  </p>
                  <ul className="space-y-1.5">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-btn border border-slate-200 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-800">
                            {file.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {formatBytes(file.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="shrink-0 text-xs text-red-700 underline"
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
                disabled={busy || preparing || files.length === 0}
                className="w-full rounded-btn bg-brand px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {busy
                  ? t('scan.uploading')
                  : t('scan.upload', { count: files.length })}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
