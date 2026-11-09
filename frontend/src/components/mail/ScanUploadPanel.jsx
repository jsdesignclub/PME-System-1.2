/**
 * "Scan from your phone" — the desktop half of scan-to-upload.
 *
 * The clerk presses once and a short-lived QR appears. The phone scans it, opens
 * the public upload page, and photographs the paper. This panel polls the letter
 * while the code is live, so the new scan appears in `AttachmentList` without a
 * manual refresh, and the QR is withdrawn as soon as a file lands or the code
 * expires.
 *
 * Polling, not Realtime, for the same reason `NotificationContext` polls: a
 * 4-second re-read of one letter is cheaper to get right than a subscription
 * lifecycle, and the event is a colleague's upload, not a millisecond feed.
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

import * as uploadTicketApi from '../../api/uploadTicketApi.js';
import { errorMessage } from '../../api/axiosClient.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Card } from '../common/Card.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

/** How often the letter is re-read while a QR is on screen. */
const POLL_MS = 4000;

export function ScanUploadPanel({ letterId, attachmentCount, onChanged }) {
  const { t } = useLanguage();
  const [ticket, setTicket] = useState(null);
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(0);

  // `onChanged` (the detail page's `load`) is not guaranteed to keep the same
  // identity between renders. Holding it in a ref keeps the countdown/poll
  // effect from tearing down and restarting every time the page re-renders.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  // The attachment count when the QR was shown. A larger count means the phone's
  // upload arrived. `create()` re-reads it at the moment the code is minted, so
  // a panel reused for a different letter cannot compare against the old one.
  const baseline = useRef(attachmentCount);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const data = await uploadTicketApi.createTicket(letterId);
      baseline.current = attachmentCount;
      setQr(null);
      setTicket({
        url: uploadTicketApi.uploadUrl(data.token),
        expiresAt: data.expires_at,
      });
    } catch (failure) {
      setError(errorMessage(failure, t('scan.failed')));
    } finally {
      setBusy(false);
    }
  }

  // Draw the QR whenever a new ticket is shown. `qr` is cleared in `create()`
  // before the next ticket, so a stale code is never drawn under a new one.
  useEffect(() => {
    if (!ticket) return undefined;
    let live = true;
    QRCode.toDataURL(ticket.url, { width: 240, margin: 1, errorCorrectionLevel: 'M' })
      .then((dataUrl) => {
        if (live) setQr(dataUrl);
      })
      .catch(() => {
        if (live) setQr(null);
      });
    return () => {
      live = false;
    };
  }, [ticket]);

  // Count down the code's life and poll for the arriving scan.
  useEffect(() => {
    if (!ticket) return undefined;

    const tick = () => {
      const seconds = Math.max(
        0,
        Math.floor((new Date(ticket.expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemaining(seconds);
      if (seconds === 0) {
        setTicket(null);
        setError(t('scan.expired'));
      }
    };
    tick();

    const countdown = setInterval(tick, 1000);
    const poll = setInterval(() => onChangedRef.current?.(), POLL_MS);
    return () => {
      clearInterval(countdown);
      clearInterval(poll);
    };
  }, [ticket, t]);

  // The scan arrived: withdraw the code so it cannot be reused.
  useEffect(() => {
    if (ticket && attachmentCount > baseline.current) {
      setTicket(null);
      setError(null);
    }
  }, [attachmentCount, ticket]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeLabel = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <Card title={t('scan.title')}>
      {!ticket ? (
        <div>
          <p className="text-sm text-slate-600">{t('scan.help')}</p>
          {error && (
            <div className="mt-2">
              <ErrorNote>{error}</ErrorNote>
            </div>
          )}
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="mt-3 rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy
              ? t('scan.generating')
              : error
                ? t('scan.regenerate')
                : t('scan.generate')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t('scan.scanWith')}</p>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            {qr ? (
              <img
                src={qr}
                alt={t('scan.qrAlt')}
                width={240}
                height={240}
                className="rounded-btn border border-slate-200 bg-white p-2"
              />
            ) : (
              <div className="flex h-60 w-60 items-center justify-center rounded-btn border border-slate-200 text-xs text-slate-500">
                {t('scan.building')}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm text-slate-700">{t('scan.orOpen')}</p>
              <a
                href={ticket.url}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-xs font-medium text-brand-400 underline"
              >
                {ticket.url}
              </a>
              <p className="text-xs text-slate-500">
                {t('scan.expires', { time: timeLabel })}
              </p>
              <p className="text-xs text-slate-500">{t('scan.waiting')}</p>
              <button
                type="button"
                onClick={() => {
                  setTicket(null);
                  setError(null);
                }}
                className="rounded-btn border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                {t('scan.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
