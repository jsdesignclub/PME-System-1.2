/**
 * The notification bell.
 *
 * ============================================================================
 * WHY A DROPDOWN AND NOT A PAGE
 * ============================================================================
 *
 * The feed is read in a glance — "did anything land for me" — between two pieces
 * of real work, so it belongs over the page rather than as a destination the user
 * has to navigate to and back from. Every item is a link to the letter it is
 * about, which is the only action the feed has.
 *
 * ============================================================================
 * THE INTERACTIONS THAT ARE EASY TO SKIP
 * ============================================================================
 *
 *   1. ESCAPE CLOSES IT, and returns focus to the bell. A popup that dismisses
 *      only by tapping a row strands anyone using the keyboard.
 *   2. A CLICK OUTSIDE CLOSES IT. Listeners are attached only while open, so a
 *      closed bell costs nothing.
 *   3. OPENING IS NOT MARKING READ. The count reflects unread notifications, and
 *      the panel deliberately does not clear it on open — a user who opens the
 *      panel to read the list should still see which rows are new, and the count
 *      drops as each is opened. "Mark all as read" is the explicit clear.
 *   4. THE BADGE IS CAPPED. A count of 347 in a 16px circle is unreadable and
 *      bursts the layout, so anything past 9 reads "9+".
 *
 * The badge is `aria-hidden` and the count is carried on the button's label
 * instead, because a screen reader announcing "nine plus" out of context is worse
 * than "3 unread notifications".
 */
import { useEffect, useRef, useState } from 'react';
import { Bell, CircleCheck, CircleX, CornerDownLeft, FileCheck, Inbox, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useNotifications } from '../../context/NotificationContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatDateTime } from '../../utils/dateUtils.js';

/** One icon per event type, so a row is scannable before its text is read. */
const ICONS = {
  assigned: UserCheck,
  forwarded_to_ao: Inbox,
  returned: CornerDownLeft,
  approval_requested: FileCheck,
  approved: CircleCheck,
  rejected: CircleX,
  completed: CircleCheck,
};

export function NotificationBell() {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  // (1) and (2): dismissal, only while open.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // (3): opening a row marks that ONE read and goes to its letter.
  const openItem = (item) => {
    markRead(item.id);
    setOpen(false);
    if (item.mail_record_id) navigate(`/mail/${item.mail_record_id}`);
  };

  const badge = unread > 9 ? '9+' : unread;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread > 0 ? t('notification.unread', { count: unread }) : t('notification.open')}
        className="relative flex size-11 items-center justify-center rounded-btn text-ink transition hover:bg-slate-100"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] leading-none font-semibold text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('notification.title')}
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-slate-300 bg-surface shadow-card"
        >
          <div className="flex items-center justify-between border-b border-slate-300 px-3 py-2">
            <p className="text-sm font-semibold text-ink">{t('notification.title')}</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-brand-400 transition hover:text-brand"
              >
                {t('notification.markAllRead')}
              </button>
            )}
          </div>

          <ul className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-slate-500">
                {t('notification.empty')}
              </li>
            ) : (
              items.map((item) => {
                const Icon = ICONS[item.type] ?? Bell;
                const payload = item.payload ?? {};

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={`flex w-full items-start gap-3 border-b border-slate-200 px-3 py-2.5 text-left transition last:border-b-0 hover:bg-slate-100 ${
                        item.is_read ? '' : 'bg-brand-50'
                      }`}
                    >
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-btn bg-slate-100 text-brand-400">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink">
                          {t(`notification.${item.type}.title`, payload)}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {t(`notification.${item.type}.body`, payload)}
                        </span>
                        <span className="mt-1 block text-[0.65rem] text-slate-400">
                          {formatDateTime(item.created_at)}
                        </span>
                      </span>

                      {!item.is_read && (
                        <span
                          aria-hidden="true"
                          className="mt-1.5 size-2 shrink-0 rounded-full bg-danger"
                        />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
