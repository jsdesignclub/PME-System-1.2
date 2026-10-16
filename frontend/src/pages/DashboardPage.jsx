/**
 * The landing screen.
 *
 * Two audiences share this page, which is why it has two modes.
 *
 *   * Executives (anyone holding READ_ALL_MAIL) get the MINISTRY-WIDE figures
 *     from `/mail/stats`.
 *   * A subject clerk gets the SAME figures dashboard, but the numbers are their
 *     own BRANCH's: `mail_stats_rows()` scopes a non-central clerk to their
 *     department. A clerk who runs one branch's letters must see that branch's
 *     progress and no other branch's.
 *   * Everyone else — officers — gets their own queue, because a transport
 *     officer opening a dashboard that counts the whole province's letters is
 *     looking at a number that is not theirs and has nothing to act on.
 *
 * Nothing on this page calls axios directly. `mailApi` owns the endpoints and
 * `errorMessage` owns the shape of a failure, so the two dashboard modes below
 * cannot drift apart from the pages that do the same work.
 *
 * THE ORGANISING RULE ON THIS PAGE: a figure is a control. Every count here —
 * the four tiles, every workflow state, every priority, every sender type — can
 * be clicked, and clicking opens the letters behind it. `LetterDrilldown` holds
 * that behaviour and the registry filters that go with it, and every control on
 * this page is just a different way of building one request.
 *
 * The intake chart that used to sit here is gone. Thirty bars of daily intake is
 * a trend question, and it is the wrong question for a screen whose purpose is
 * "what needs attention now" — a flat line of intake tells an executive nothing
 * they can act on this morning, while a donut of where the files actually sit
 * does. Space it took is the sender-type chart, which is.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, Files, FolderOpen, TriangleAlert } from 'lucide-react';

import { errorMessage } from '../api/axiosClient.js';
import { list, stats } from '../api/mailApi.js';
import { Card } from '../components/common/Card.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { LetterDrilldown } from '../components/dashboard/LetterDrilldown.jsx';
import { MailTable } from '../components/mail/MailTable.jsx';
import { PriorityChart } from '../components/charts/PriorityChart.jsx';
import { SenderTypeChart } from '../components/charts/SenderTypeChart.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { StatCard } from '../components/dashboard/StatCard.jsx';
import { WorkflowStateChart } from '../components/charts/WorkflowStateChart.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function DashboardPage() {
  const { user, permissions } = useAuth();

  // Read from the RESOLVED list, not from a role name, and not from a helper the
  // context happens to expose: `AuthContext` provides `permissions` and lets this
  // page do the one test it needs. `READ_ALL_MAIL` is what the server grants to
  // SECRETARY / AO / CHIEF_CLERK / ADMIN, and `utils/permissions.js` exists
  // precisely so that set is not restated here. For the AO it opens this
  // ministry-wide progress view; the letters behind each figure are still
  // RLS-scoped to the AO's own queue.
  //
  // This was previously a `canReadAllMail` destructured from `useAuth()` — a value
  // the context never provided. Undefined is falsy, so the ministry dashboard was
  // unreachable for EVERY user including the administrator, and nobody saw an
  // error: the personal queue is a perfectly plausible page to be on.
  const canReadAllMail = permissions.includes('READ_ALL_MAIL');
  // Subject clerks get the figures dashboard too. The SERVER decides the scope:
  // `mail_stats_rows()` returns ministry figures for an executive and central
  // clerk, and the clerk's own branch for an ordinary one.
  const canViewStats = canReadAllMail || user?.role === 'SUBJECT_CLERK';

  return canViewStats ? (
    <StatsDashboard user={user} permissions={permissions} />
  ) : (
    <QueueDashboard user={user} permissions={permissions} />
  );
}

function StatsDashboard({ user, permissions }) {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [failure, setFailure] = useState('');

  // The open drill-down, or null. One piece of state for every figure on the
  // page rather than one per figure: they are the same question asked of
  // different numbers, and eight booleans that can never be two at once is a
  // state machine nobody needs.
  const [drilldown, setDrilldown] = useState(null);

  // Who may see every department's letters. A branch clerk may not: the recent
  // list and every drill-down are narrowed to their own department, so the figures
  // above and the rows behind them describe the same branch.
  const canReadAllMail = permissions.includes('READ_ALL_MAIL');
  const seesAllDepartments = canReadAllMail || Boolean(user?.is_central_clerk);
  const scope = useMemo(
    () => ({
      departmentId: seesAllDepartments ? undefined : user?.department_id,
      canReadAllMail: seesAllDepartments,
    }),
    [seesAllDepartments, user?.department_id],
  );

  useEffect(() => {
    let cancelled = false;

    // Stats and the recent list are fetched together because they are always
    // shown together; two effects would mean two loading states and a page that
    // is half-rendered while one of them is still in flight. The failure is
    // reported once, not twice — the first rejection wins and `Promise.all`
    // settles, so a user is never told about two errors for one click.
    Promise.all([stats(), list({}, { limit: 6 }, scope)])
      .then(([figures, recent]) => {
        if (cancelled) return;
        // `list()` returns `{ rows, total }`, not `{ data }`. Reading `.data`
        // here yielded `undefined`, so `safeRecent` fell back to `[]` and the
        // "Latest letters" table was permanently empty for every role on this
        // dashboard — ADMIN and AO included.
        setData({ figures, recent: recent.rows });
      })
      .catch((failure) => {
        if (!cancelled) setFailure(errorMessage(failure));
      });

    // The `cancelled` flag rather than an AbortController: these two calls share
    // one `.then`, and a state update after unmount is the only thing being
    // prevented. React 18 removed the warning that made this famous, but the
    // wasted render is real and the flag is three lines.
    return () => {
      cancelled = true;
    };
  }, [scope]);

  /**
   * Open a drill-down.
   *
   * `figureCount` travels with the request so the modal can say so when the
   * list's count differs from the tile's — which happens legitimately, because
   * `/mail/stats` is ministry-wide and the registry is scoped to the caller.
   *
   * `useCallback` because it is passed to four tiles and three chart legends. It
   * is stable, so a tile re-renders when its figure changes and not when an
   * unrelated piece of dashboard state does.
   */
  const openDrilldown = useCallback((title, filters, figureCount) => {
    setDrilldown({ title, filters, figureCount });
  }, []);

  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  if (failure) return <ErrorNote>{failure}</ErrorNote>;
  if (!data) return <Spinner label={t('dashboard.loadingRegistry')} />;

  const { figures, recent } = data;
  const safeRecent = Array.isArray(recent) ? recent : [];

  // The tiles, as data. Each carries its own drill-down filters, because "Open"
  // and "Overdue" are the only two of the four that are not expressible as a
  // single registry filter — the other two are "everything" and one exact state —
  // and writing all four here keeps each tile's meaning on the tile that shows
  // it. `delay` staggers the entrance by 70ms per tile.
  const tiles = [
    {
      id: 'all',
      icon: Files,
      label: t('dashboard.lettersOnRecord'),
      value: figures.totals.all,
      hint: t('dashboard.lettersOnRecordHint'),
      filters: {},
      delay: 0,
    },
    {
      id: 'open',
      icon: FolderOpen,
      label: t('dashboard.open'),
      value: figures.totals.open,
      hint: t('dashboard.openHint'),
      /* "Every state that is not Completed", which is exactly how `totals.open` is
         counted server-side. It is a `?open=true` filter rather than a status the
         registry already accepts because that one takes a SINGLE state: naming
         the four open states here would be a second copy of the state list, and
         it would go stale the day a fifth open state is added. */
      filters: { open: true },
      delay: 70,
    },
    {
      id: 'completed',
      icon: CircleCheck,
      label: t('dashboard.completed'),
      value: figures.totals.completed,
      hint: t('dashboard.completedHint'),
      filters: { status: 'Completed' },
      delay: 140,
    },
    {
      id: 'overdue',
      icon: TriangleAlert,
      label: t('dashboard.overdue'),
      value: figures.overdue,
      tone: 'alert',
      hint: t('dashboard.overdueHint'),
      /* The one figure whose definition lives on the server — `OVERDUE_DAYS` — and
         the reason `?overdue=true` exists: the tile quotes a count from `stats()`
         and then has to be able to show the rows behind it, and a client-side
         approximation of the threshold is exactly how those two numbers start
         disagreeing in front of a user. */
      filters: { overdue: true },
      delay: 210,
    },
  ];

  return (
    <div className="space-y-6">
      {/*
        The tiles carry `staggered` intent through `delay`, not through a CSS
        selector on the grid: the delay is also the count-up's start time (see
        StatCard), so it has to be a number this page owns rather than an
        `nth-child` rule in a stylesheet that knows nothing about the data.
      */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <StatCard
            key={tile.id}
            icon={tile.icon}
            label={tile.label}
            value={tile.value}
            hint={tile.hint}
            tone={tile.tone}
            delay={tile.delay}
            onClick={() => openDrilldown(tile.label, tile.filters, tile.value)}
          />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t('dashboard.byState')}
          subtitle={t('dashboard.byStateHint')}
        >
          <WorkflowStateChart
            byStatus={figures.by_status}
            onSelect={(state) =>
              openDrilldown(`Letters in "${state}"`, { status: state }, figures.by_status[state])
            }
          />
        </Card>

        <div className="space-y-6">
          <Card title={t('dashboard.byPriority')} subtitle={t('dashboard.byPriorityHint')}>
            <PriorityChart
              byPriority={figures.by_priority}
              onSelect={(priority) =>
                openDrilldown(
                  `${priority} letters`,
                  { priority },
                  figures.by_priority[priority],
                )
              }
            />
          </Card>

          <Card title={t('dashboard.bySenderType')} subtitle={t('dashboard.bySenderTypeHint')}>
            <SenderTypeChart
              rows={figures.by_sender_type}
              onSelect={(senderType) =>
                openDrilldown(
                  `Letters from ${senderType}`,
                  { sender_type: senderType },
                  // `by_sender_type` is a {type: count} map from stats(); the chart
                  // accepts that shape, so read it the same way rather than
                  // assuming the array form the comment above describes.
                  figures.by_sender_type?.[senderType],
                )
              }
            />
          </Card>
        </div>
      </div>

      <Card
        title={t('dashboard.latestLetters')}
        subtitle={t('dashboard.latestHint')}
        action={
          <Link to="/mail" className="text-sm font-medium text-ink underline hover:text-brand">
            {t('dashboard.openRegistry')}
          </Link>
        }
      >
        {safeRecent.length === 0 ? (
          <EmptyState title={t('dashboard.noLetters')} />
        ) : (
          /* `staggerRows` rather than an animation prop of its own: the cascade
             lives in `DataTable`, where the row index is, so the dashboard does
             not have to reimplement a table animation per screen that shows a
             table. */
          <MailTable rows={safeRecent} staggerRows />
        )}
      </Card>

      {drilldown && <LetterDrilldown request={drilldown} scope={scope} onClose={closeDrilldown} />}
    </div>
  );
}

/**
 * The personal queue. Same endpoint, no filters — the registry scopes itself to
 * what this user may see, so an officer gets exactly their assigned letters and
 * an intake clerk exactly the letters they logged. The client sends no role
 * parameter and cannot widen its own scope.
 */
function QueueDashboard({ user, permissions }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState(null);
  const [failure, setFailure] = useState('');
  const canReadAllMail = permissions.includes('READ_ALL_MAIL');
  // A central clerk sees every department's queue, so the dashboard's recent
  // letters are not narrowed to their own department locally.
  const seesAllDepartments = canReadAllMail || Boolean(user?.is_central_clerk);

  useEffect(() => {
    let cancelled = false;

    list({}, { limit: 10 }, { departmentId: user?.department_id, canReadAllMail: seesAllDepartments })
      .then(({ rows: fetched }) => {
        if (!cancelled) setRows(fetched);
      })
      .catch((failure) => {
        if (!cancelled) setFailure(errorMessage(failure));
      });

    return () => {
      cancelled = true;
    };
  }, [user?.department_id, seesAllDepartments]);

  if (failure) return <ErrorNote>{failure}</ErrorNote>;
  if (rows === null) return <Spinner label={t('dashboard.loadingQueue')} />;

  const safeRows = Array.isArray(rows) ? rows : [];

  // Completed letters are counted but not listed. A queue whose last entry is a
  // letter finished three weeks ago is not a queue, and the count is what tells
  // the user the work is closed rather than missing.
  const open = safeRows.filter((row) => row.status !== 'Completed');

  return (
    <div className="space-y-6">
      <Card
        title={`${t('dashboard.waitingForYou')} (${open.length})`}
        action={
          <Link to="/mail" className="text-sm font-medium text-ink underline hover:text-brand">
            {t('dashboard.openRegistry')}
          </Link>
        }
      >
        {open.length === 0 ? (
          <EmptyState title={t('dashboard.nothingWaiting')}>
            {t('dashboard.queueEmpty', { name: user?.full_name })}
          </EmptyState>
        ) : (
          <MailTable rows={open} staggerRows />
        )}
      </Card>
    </div>
  );
}
