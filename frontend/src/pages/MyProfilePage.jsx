/**
 * The signed-in employee's own HR file.
 *
 * Every role lands here, not only OFFICER: a clerk or a member of the minor
 * staff has a phone number, an address and an emergency contact that only they
 * can keep current. The page is the same `EmployeeHrPanel` the Officers screen
 * uses, with `canEdit` always set: the database policy allows an employee to
 * write their own row, and nobody else's.
 *
 * The profile row is fetched with `officer()`, not read off the session, because
 * the session carries identity and role but not the department join the profile
 * header displays.
 */
import { useEffect, useState } from 'react';
import { Briefcase, FileText, GraduationCap, History, User } from 'lucide-react';

import { errorMessage } from '../api/axiosClient.js';
import { officer } from '../api/mailApi.js';
import { EmployeeHrPanel } from '../components/employee/EmployeeHrPanel.jsx';
import { Card } from '../components/common/Card.jsx';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../hooks/useAuth.js';

const TABS = [
  { key: 'profile', label: 'officers.profileTab', icon: User },
  { key: 'qualifications', label: 'officers.qualificationsTab', icon: GraduationCap },
  { key: 'experience', label: 'officers.experienceTab', icon: Briefcase },
  { key: 'service', label: 'officers.serviceHistoryTab', icon: History },
  { key: 'documents', label: 'officers.documentsTab', icon: FileText },
];

export default function MyProfilePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [person, setPerson] = useState(null);
  const [failure, setFailure] = useState('');
  const [tab, setTab] = useState('profile');

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;
    officer(user.id)
      .then((row) => {
        if (!cancelled) setPerson(row);
      })
      .catch((problem) => {
        if (!cancelled) setFailure(errorMessage(problem));
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const name = person?.full_name ?? user?.full_name ?? '';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('profile.pageTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('profile.pageDescription')}</p>
      </div>

      {failure && <ErrorNote>{failure}</ErrorNote>}

      <Card title={name ? `${t('profile.pageTitle')} — ${name}` : t('profile.pageTitle')}>
        <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map(({ key, label, icon }) => (
            <TabButton key={key} active={tab === key} onClick={() => setTab(key)} icon={icon}>
              {t(label)}
            </TabButton>
          ))}
        </div>

        <EmployeeHrPanel
          officerId={user?.id ?? null}
          person={person}
          canEdit={Boolean(user?.id)}
          tab={tab}
        />
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
