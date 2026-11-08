/**
 * The Officers area: the directory of everyone on file, and one person's
 * employment file — profile, qualifications, experience, service history,
 * documents and duty chart.
 *
 * `/officers` is the directory (see `EmployeeDirectory`); `/officers/:id` is the
 * file. Neither is open to every signed-in user. `RequireOfficerAccess` in
 * App.jsx admits administrators and the people an administrator has granted
 * `can_view_officers`, and the same helper scopes the HR tables in RLS, so a
 * refused user cannot read a colleague's file by calling the API directly.
 *
 * An administrator may edit any file. A granted user reads other files but can
 * only edit their own — `canEditHr` mirrors the database write policy.
 *
 * The HR tabs are rendered by `EmployeeHrPanel`, shared with My Profile, so an
 * administrator editing an officer and an officer editing themselves see the
 * same fields, validation and ordering.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Briefcase,
  ClipboardList,
  FileText,
  GraduationCap,
  History,
  User,
} from 'lucide-react';

import { errorMessage } from '../api/axiosClient.js';
import { officer, officerDutyChart } from '../api/mailApi.js';
import { EmployeeDirectory } from '../components/employee/EmployeeDirectory.jsx';
import { EmployeeHrPanel } from '../components/employee/EmployeeHrPanel.jsx';
import { Card } from '../components/common/Card.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../hooks/useAuth.js';

export default function OfficerPage() {
  const { id } = useParams();
  return id ? <OfficerDetail /> : <EmployeeDirectory />;
}

function OfficerDetail() {
  const { t } = useLanguage();
  const { user, isAdmin } = useAuth();
  const { id } = useParams();

  const [all, setAll] = useState([]);
  // The route guard has already established that this viewer may open any HR
  // file, so the URL id is used directly. My Profile is where a user goes for
  // their own file.
  const [selectedId, setSelectedId] = useState(id ?? null);
  const [chart, setChart] = useState(null);
  const [failure, setFailure] = useState('');
  // 'profile' | 'qualifications' | 'experience' | 'service' | 'documents' |
  // 'duties'. The profile is first because it answers "who is this person"
  // before the chart answers "what may be routed to them".
  const [tab, setTab] = useState('profile');

  // HR writes are administrator-only OR self-service, and the database policy
  // enforces exactly that. The UI hides the controls for anyone else.
  const canEditHr = isAdmin || (Boolean(user?.id) && selectedId === user.id);

  useEffect(() => {
    // Only ONE profile is fetched, never the roster — the directory is its own
    // screen and loads the list, this screen loads the selected person.
    const targetId = id ?? user?.id;
    if (!targetId) {
      setAll([]);
      return undefined;
    }

    let cancelled = false;
    officer(targetId)
      .then((row) => {
        if (cancelled) return;
        setAll(row ? [row] : []);
        setSelectedId(row?.id ?? null);
      })
      .catch((problem) => {
        if (!cancelled) setFailure(errorMessage(problem));
      });

    return () => {
      cancelled = true;
    };
  }, [id, user?.id]);

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

  const selectedPerson = all.find((person) => person.id === selectedId) ?? null;

  const personSuffix = selectedPerson ? ` — ${selectedPerson.full_name}` : '';
  const cardTitle =
    tab === 'profile'
      ? `${t('officers.profileTitle')}${personSuffix}`
      : tab === 'qualifications'
        ? `${t('employee.qualifications')}${personSuffix}`
        : tab === 'experience'
          ? `${t('employee.experience')}${personSuffix}`
          : tab === 'service'
            ? `${t('employee.serviceHistory')}${personSuffix}`
            : tab === 'documents'
              ? `${t('employee.documents')}${personSuffix}`
              : `${t('officers.dutyChart')}${chart ? ` — ${chart.officer.full_name}` : ''}`;

  return (
    <div className="space-y-5">
      <Link
        to="/officers"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-ink"
      >
        ← {t('officers.backToDirectory')}
      </Link>

      <h1 className="text-2xl font-semibold text-ink">{t('officers.pageTitle')}</h1>
      <p className="text-sm text-slate-600">
        {t('officers.pageDescription')}
      </p>

      {failure && <ErrorNote>{failure}</ErrorNote>}

      <Card title={cardTitle}>
        <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
          <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon={User}>
            {t('officers.profileTab')}
          </TabButton>
          <TabButton
            active={tab === 'qualifications'}
            onClick={() => setTab('qualifications')}
            icon={GraduationCap}
          >
            {t('officers.qualificationsTab')}
          </TabButton>
          <TabButton
            active={tab === 'experience'}
            onClick={() => setTab('experience')}
            icon={Briefcase}
          >
            {t('officers.experienceTab')}
          </TabButton>
          <TabButton active={tab === 'service'} onClick={() => setTab('service')} icon={History}>
            {t('officers.serviceHistoryTab')}
          </TabButton>
          <TabButton active={tab === 'documents'} onClick={() => setTab('documents')} icon={FileText}>
            {t('officers.documentsTab')}
          </TabButton>
          <TabButton active={tab === 'duties'} onClick={() => setTab('duties')} icon={ClipboardList}>
            {t('officers.dutyChartTab')}
          </TabButton>
        </div>

        {tab === 'duties' ? (
          <DutyChart chart={chart} />
        ) : (
          <EmployeeHrPanel
            officerId={selectedId}
            person={selectedPerson}
            canEdit={canEditHr && Boolean(selectedId)}
            tab={tab}
          />
        )}
      </Card>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? 'border-brand text-ink'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

function DutyChart({ chart }) {
  const { t } = useLanguage();

  // Three distinct states, not two. `chart === null` means loading;
  // collapsing it into "no duties recorded" would tell a user their officer has
  // no duties at the exact moment the request is in flight, and they would go
  // and create a duplicate chart.
  if (!chart) return <Spinner label={t('officers.loadingChart')} />;
  if (chart.duty_count === 0) {
    return (
      <EmptyState title={t('officers.noDuties')}>
        {t('officer.noDutyRows')}
      </EmptyState>
    );
  }

  return (
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
  );
}
