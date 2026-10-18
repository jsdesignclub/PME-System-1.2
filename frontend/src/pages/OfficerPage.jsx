/**
 * Officers and their duty charts.
 *
 * This page exists to make the matcher auditable. A clerk who is told "route this
 * to the District Officer" and cannot see WHY has been asked to trust a number.
 * Showing the chart — the sections, and the keywords the matcher scores against —
 * is what turns a suggestion into something a person can check. That matters more
 * after D68 than it did before: with bilingual Sinhala and Tamil keywords, a
 * suggestion for a Tamil-language letter would otherwise be entirely
 * unauditable to a clerk reading only English labels.
 *
 * The SELECTION LIVES IN THE URL. `/officers/:id` rather than component state,
 * for one reason: an officer's chart is something you link to in a message to a
 * colleague, and a selection that dies on reload is a screenshot instead. The
 * route already existed for this, so the page reads the parameter and writes it
 * rather than keeping a private copy that could disagree with the address bar.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { errorMessage } from '../api/axiosClient.js';
import { officer, officers as fetchOfficers, officerDutyChart } from '../api/mailApi.js';
import { Card } from '../components/common/Card.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { RoleBadge } from '../components/common/RoleBadge.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { useAuth } from '../hooks/useAuth.js';

export default function OfficerPage() {
  const { t } = useLanguage();
  const { user, permissions } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const canReadAllMail = permissions.includes('READ_ALL_MAIL');
  // A subject clerk sees duty charts only for their own department; a central
  // clerk (and others with broad read rights who are not subject clerks) see all
  // departments. An OFFICER sees ONLY their own chart — never the roster of
  // other officers — so they take a separate branch below.
  const isCentralClerk = Boolean(user?.is_central_clerk);
  const isSubjectClerk = user?.role === 'SUBJECT_CLERK';
  const isOfficer = user?.role === 'OFFICER';
  const seesAllDepartments = isCentralClerk || (!isSubjectClerk && canReadAllMail);

  const [all, setAll] = useState([]);
  // An OFFICER's selection is pinned to themselves: an `/officers/:id` link to
  // someone else's chart must not open it, so the URL id is ignored for them.
  const [selectedId, setSelectedId] = useState(isOfficer ? user?.id ?? null : id ?? null);
  const [chart, setChart] = useState(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    // An OFFICER fetches only their own profile: the roster of every other
    // officer is not loaded at all, rather than loaded and filtered away — a
    // list that never arrives cannot leak into the DOM or the network tab.
    if (isOfficer) {
      officer(user.id)
        .then((row) => {
          setAll(row ? [row] : []);
          setSelectedId(row?.id ?? null);
        })
        .catch((problem) => setFailure(errorMessage(problem)));
      return;
    }
    fetchOfficers({ limit: 100, departmentId: seesAllDepartments ? undefined : user?.department_id })
      .then((rows) => {
        setAll(rows);
        // Preselect, but only from the LIST. An id in the URL that this officer
        // does not hold — a stale link, or a deactivated officer — must not pin
        // the page to a chart that will 404.
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch((problem) => setFailure(errorMessage(problem)));
  }, []);

  const loadChart = useCallback((officerId) => {
    setChart(null);
    setFailure('');

    officerDutyChart(officerId)
      .then(setChart)
      .catch((problem) => setFailure(errorMessage(problem)));
  }, []);

  useEffect(() => {
    if (selectedId) loadChart(selectedId);
  }, [selectedId, loadChart]);

  function select(nextId) {
    setSelectedId(nextId);
    // `replace: false`, so the browser Back button returns to the previous
    // officer rather than leaving the page. Chart browsing is navigation.
    navigate(`/officers/${nextId}`);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-ink">{t('officers.pageTitle')}</h1>
      <p className="text-sm text-slate-600">
        {t('officers.pageDescription')}
      </p>

      {failure && <ErrorNote>{failure}</ErrorNote>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title={t('officers.title')}>
          {all.length === 0 ? (
            <EmptyState title={t('officers.none')} />
          ) : (
            <ul className="space-y-1.5">
              {all.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => select(person.id)}
                    aria-current={selectedId === person.id ? 'true' : undefined}
                    className={`w-full rounded-btn border px-3 py-2 text-left transition ${
                      selectedId === person.id
                        ? 'border-brand bg-amber-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">{person.full_name}</span>
                      <RoleBadge role={person.role} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {person.home_section ?? person.designation} · {person.department?.name}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={chart ? `${t('officers.dutyChart')} — ${chart.officer.full_name}` : t('officers.dutyChart')}>
          {/* Three distinct states, not two. `chart === null` means loading;
              collapsing it into "no duties recorded" would tell a user their
              officer has no duties at the exact moment the request is in
              flight, and they would go and create a duplicate chart. */}
          {!chart ? (
            <Spinner label={t('officers.loadingChart')} />
          ) : chart.duty_count === 0 ? (
            <EmptyState title={t('officers.noDuties')}>
              {t('officer.noDutyRows')}
            </EmptyState>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Home section:{' '}
                <span className="font-medium text-slate-800">
                  {chart.officer.home_section ?? t('officers.homeSectionMissing')}
                </span>
                . A duty&apos;s section is the section that duty belongs to, which is not
                always the officer&apos;s home section. {chart.duty_count} duties across{' '}
                {chart.section_count} sections.
              </p>

              {Object.entries(chart.duty_chart).map(([section, duties]) => (
                <div key={section} className="rounded-btn border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-ink">{section}</h3>
                  {duties.map((duty) => (
                    <div key={duty.id} className="mt-2">
                      <p className="text-sm text-slate-700">{duty.duty_description}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1">
                        {duty.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                          >
                            {keyword}
                          </span>
                        ))}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
