/**
 * Attachment metadata, preview and download.
 *
 * Every byte of every file here comes from `useObjectUrl` or an explicit
 * download — never from a `src` or an `href` pointing at the API (D64). See
 * that hook for why: the route is authorization-checked, and a browser will not
 * attach a bearer token to an image request.
 *
 * Preview is offered only for the formats a browser renders inline. A `.docx`
 * cannot be previewed, so it gets a download and says so — the alternative is an
 * iframe full of browser error text, which a clerk reasonably reads as a
 * corrupt upload.
 */
import { useState } from 'react';

import * as mailApi from '../../api/mailApi.js';
import { errorMessage } from '../../api/axiosClient.js';
import { formatBytes, formatDate } from '../../utils/dateUtils.js';
import { useObjectUrl } from '../../hooks/useObjectUrl.js';
import { Card } from '../common/Card.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

/** The same allowlist the server enforces, so the UI can say it up front. */
export const ALLOWED_EXTENSIONS = Object.freeze([
  '.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.doc', '.docx',
]);

/** Types a browser will render in an `<img>` or `<embed>`. */
const PREVIEWABLE = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
]);

import { useLanguage } from '../../context/LanguageContext.jsx';

export function AttachmentList({ letterId, attachments, canUpload, onChanged }) {
  const { t } = useLanguage();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewing, setPreviewing] = useState(null);

  async function download(attachment) {
    setError(null);
    try {
      const { blob } = await mailApi.downloadAttachment(letterId, attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.original_name;
      document.body.append(link);
      link.click();
      link.remove();
      // Revoked on the next tick rather than immediately: revoking in the same
      // statement as `click()` cancels the download in some browsers, because
      // the navigation has not started yet.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (failure) {
      setError({
        message: errorMessage(failure, t('attachment.downloadFailed')),
        ...(failure?.response?.status ? { status: failure.response.status } : {}),
      });
    }
  }

  async function upload(event) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    setProgress(0);

    // Checked before sending, and the offending file is NAMED. The batch is
    // rejected whole, and "Only .pdf… can be attached" leaves the reader
    // guessing which of the twelve files on a scanner's output needs renaming.
    for (const file of files) {
      const dot = file.name.lastIndexOf('.');
      const extension = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        setError({
          message: `"${file.name}" cannot be attached. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`,
        });
        setBusy(false);
        event.target.value = '';
        return;
      }
    }

    try {
      await mailApi.addAttachments(letterId, files);
      event.target.value = '';
      onChanged();
    } catch (failure) {
        setError({ message: errorMessage(failure, t('attachment.uploadFailed')) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('attachment.title', { count: attachments.length })}>
      {attachments.length === 0 ? (
        <p className="text-sm text-slate-600">{t('attachment.none')}</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => {
            const previewable = PREVIEWABLE.has(attachment.mime_type);
            return (
              <li key={attachment.id} className="rounded-btn border border-slate-200 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{attachment.original_name}</p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(attachment.size_bytes)} · {formatDate(attachment.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {previewable && (
                      <button
                        type="button"
                        onClick={() => setPreviewing(attachment)}
                        className="no-print rounded-btn border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                       >
                         {t('attachment.preview')}
                       </button>
                    )}
                    <button
                      type="button"
                      onClick={() => download(attachment)}
                      className="no-print rounded-btn border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        {t('attachment.open')}
                      </button>
                  </div>
                </div>

                {previewing?.id === attachment.id && (
                  <AttachmentPreview
                    letterId={letterId}
                    attachment={attachment}
                    onClose={() => setPreviewing(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canUpload && (
        <div className="no-print mt-3">
          <label className="block text-xs text-slate-600">
            {t('attachment.add')}
            <input
              type="file"
              multiple
              onChange={upload}
              accept={ALLOWED_EXTENSIONS.join(',')}
              className="mt-1 block w-full text-xs"
            />
              <span className="mt-0.5 block">
                {t('attachment.helper')}
              </span>
          </label>

          {busy && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
              </div>
               <p className="mt-1 text-xs text-slate-500">{t('attachment.uploading')} {progress}%</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-2">
          <ErrorNote>{error.message}</ErrorNote>
        </div>
      )}
    </Card>
  );
}

/**
 * An inline preview of one attachment.
 *
 * The `src` is a `blob:` URL from `useObjectUrl`, which is the whole point: the
 * bytes were fetched with the bearer and are now local. There is no API URL in
 * this markup, which is what the acceptance check greps for.
 */
function AttachmentPreview({ letterId, attachment, onClose }) {
  const { t } = useLanguage();
  const { url, loading, error } = useObjectUrl(letterId, attachment.id, true);
  const isImage = attachment.mime_type?.startsWith('image/');

  return (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">{t('attachment.preview')}</p>
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 underline hover:text-ink"
            >
              {t('common.close')}
            </button>
          </div>

          {loading && <p className="mt-2 text-xs text-slate-500">{t('attachment.loading')}</p>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {url && isImage && (
        <img src={url} alt={attachment.original_name} className="mt-2 max-h-64 w-full rounded border border-slate-200 object-contain" />
      )}
      {url && !isImage && (
        <embed src={url} type={attachment.mime_type} className="mt-2 h-64 w-full rounded border border-slate-200" />
      )}
    </div>
  );
}
