/**
 * A live countdown to a letter's completion deadline.
 *
 * The letter carries a category whose `max_days` is the most days allowed to
 * take the final action. `receipt_date + max_days` is the last day, and this
 * renders the time left until the end of that day as a digital clock —
 * DAYS : HRS : MIN : SEC — ticking once a second, so an officer watching the
 * letter sees the remaining time move rather than a static "due on ...".
 *
 * It is a DISPLAY, not a control: nothing here blocks a submit. The colour is
 * the whole message — green while there is room, amber inside the last three
 * days, red once the day has passed — so the urgency is readable at a glance.
 */
import { useEffect, useMemo, useState } from 'react';

import { formatDate } from '../../utils/dateUtils.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

/** Split a millisecond gap into its parts, and whether it is already overdue. */
function parts(milliseconds) {
  const overdue = milliseconds < 0;
  const totalSeconds = Math.floor(Math.abs(milliseconds) / 1000);
  return {
    overdue,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function Segment({ value, label, tone }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`font-mono text-2xl tabular-nums leading-none sm:text-3xl ${tone}`}>
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-[10px] font-medium tracking-widest text-slate-500 uppercase">
        {label}
      </span>
    </div>
  );
}

export function DeadlineClock({ dueDate, allowedDays }) {
  const { t } = useLanguage();

  // The deadline is the END of the due day, in the reader's own timezone: a
  // calendar date with no instant behind it, so "the day it is due" is what the
  // clock counts down to.
  const deadline = useMemo(() => new Date(`${dueDate}T23:59:59`), [dueDate]);
  const valid = !Number.isNaN(deadline.getTime());

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!valid) return null;

  const { overdue, days, hours, minutes, seconds } = parts(deadline.getTime() - now);

  // Tone: red once overdue, amber inside the final three days, green otherwise.
  const [tone, statusKey] = overdue
    ? ['text-danger', 'clock.statusOverdue']
    : days < 3
      ? ['text-amber-400', 'clock.statusDueSoon']
      : ['text-green-400', 'clock.statusOnTrack'];

  const summary = overdue
    ? t(days === 1 ? 'clock.dayOverdue' : 'clock.daysOverdue', { days })
    : t(days === 1 ? 'clock.dayLeft' : 'clock.daysLeft', { days });

  return (
    <div className="rounded-panel border border-slate-200 bg-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {t('clock.title')}
        </h3>
        <span className={`text-sm font-semibold ${tone}`}>{t(statusKey)}</span>
      </div>

      <div className="mt-3 flex items-end justify-center gap-2 sm:gap-3">
        <Segment value={days} label={t('clock.days')} tone={tone} />
        <span className={`pb-5 font-mono text-2xl leading-none ${tone}`}>:</span>
        <Segment value={hours} label={t('clock.hours')} tone={tone} />
        <span className={`pb-5 font-mono text-2xl leading-none ${tone}`}>:</span>
        <Segment value={minutes} label={t('clock.minutes')} tone={tone} />
        <span className={`pb-5 font-mono text-2xl leading-none ${tone}`}>:</span>
        <Segment value={seconds} label={t('clock.seconds')} tone={tone} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span className={`font-medium ${tone}`}>{summary}</span>
        <span>
          {t('clock.allowed', { days: allowedDays })} · {t('clock.due', { date: formatDate(dueDate) })}
        </span>
      </div>
    </div>
  );
}
