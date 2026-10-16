/**
 * Fetch an attachment's bytes and hand back a local object URL.
 *
 * This is the ONLY sanctioned way to show an attachment in this application,
 * and the reason is a security boundary rather than a style preference (D64).
 *
 * The bytes are fetched via Supabase Storage which enforces RLS policies,
 * so the attachment is reachable only by an authenticated request. An
 * `<img src>` or `<a href>` pointing at a public URL would send NO session,
 * so the bytes are either fetched with the user's credentials or not at all.
 *
 * Which is why no `src` attribute in this codebase contains a public URL, and
 * why the URL this hook returns is a `blob:` one that exists only in this tab
 * and is revoked on unmount.
 *
 * @param {string} mailId
 * @param {string} attachmentId
 * @param {boolean} enabled  when false the hook stays idle — a preview that
 *   starts downloading before the user asks wastes the request
 * @returns {{url: string|null, loading: boolean, error: string|null}}
 */
import { useEffect, useState } from 'react';

import * as mailApi from '../api/mailApi.js';
import { errorMessage } from '../api/axiosClient.js';

export function useObjectUrl(mailId, attachmentId, enabled = true) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !mailId || !attachmentId) return undefined;

    let cancelled = false;
    let created = null;

    setLoading(true);
    setError(null);

    mailApi
      .downloadAttachment(mailId, attachmentId)
      .then(({ blob, mime_type }) => {
        if (cancelled) return;
        // Ensure the blob has the correct MIME type for proper rendering in <embed>/<img>
        const typedBlob = new Blob([blob], { type: mime_type || 'application/octet-stream' });
        created = URL.createObjectURL(typedBlob);
        setUrl(created);
      })
      .catch((failure) => {
        if (!cancelled) setError(errorMessage(failure, 'That file could not be opened.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [mailId, attachmentId, enabled]);

  return { url, loading, error };
}
