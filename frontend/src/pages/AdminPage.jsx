/**
 * Administration — five tabs, gated individually (D73).
 *
 * The gate is per TAB and it is the interesting part of this page. The three
 * admin routers are guarded server-side by `requireAdmin` — the `role` column —
 * while duty-chart writes are guarded by `UPDATE_DUTY_CHART`, which spec §4.1
 * gives to ADMIN *and* SUBJECT_CLERK. Those are two different questions:
 *
 *   - Users, Departments, Audit Log: role-gated, read-mostly. The audit log is
 *     also useful to a clerk who may not edit anything, and a page-level gate
 *     would deny that clerk a working viewer.
 *   - Duty Charts: the only WRITING tab, and the only one a non-admin may reach.
 *
 * An earlier version gated the whole page on `MANAGE_USERS`, a permission that
 * does not exist in this system — the server expands the ADMIN wildcard to the
 * concrete list, and that list contains no such constant. The result was an
 * Administration link that appeared for nobody and a /admin that 403'd for the
 * one role that owns it. `ADMIN_ROLES` in `utils/permissions.js` is the fix.
 *
 * `RequireAdminArea` in App.jsx applies that at the ROUTE — it admits an admin role
 * OR `UPDATE_DUTY_CHART`, because a subject clerk must be able to maintain the duty
 * chart the matcher runs on — and the `usable` filter below decides which tabs that
 * visitor actually sees.
 *
 * Every tab's data comes from a module in `api/`. This file names endpoints in
 * no place.
 */
import { useState } from 'react';

import { Card } from '../components/common/Card.jsx';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { AuditTab } from '../components/admin/AuditTab.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { DepartmentsTab } from '../components/admin/DepartmentsTab.jsx';
import { DutyChartTab } from '../components/admin/DutyChartTab.jsx';
import { SettingsTab } from '../components/admin/SettingsTab.jsx';
import { UsersTab } from '../components/admin/UsersTab.jsx';

/**
 * Each tab declares its own gate, so the rule lives with the thing it protects
 * rather than in a list here that a fifth tab would have to be added to twice.
 *
 * `adminOnly` mirrors `requireAdmin` on the corresponding router. It is a
 * convenience gate, not a control: the server refuses these regardless, and a
 * tab shown to the wrong user renders a 403 in place of its table, which is a
 * worse experience but not a security hole.
 */
const TABS = [
  { id: 'users', labelKey: 'admin.tabUsers', Component: UsersTab, adminOnly: true },
  { id: 'departments', labelKey: 'admin.tabDepartments', Component: DepartmentsTab, adminOnly: true },
  { id: 'duties', labelKey: 'admin.tabDuties', Component: DutyChartTab, adminOnly: false },
  { id: 'settings', labelKey: 'admin.tabSettings', Component: SettingsTab, adminOnly: true },
  { id: 'audit', labelKey: 'admin.tabAudit', Component: AuditTab, adminOnly: true },
];

export default function AdminPage() {
  const { t } = useLanguage();
  const { user, isAdmin } = useAuth();

  // Duty Charts is reachable by UPDATE_DUTY_CHART alone, so it is in the list for
  // a clerk — and it is then the ONLY tab, because it is the only one `adminOnly`
  // does not claim. `usable` is what the user may OPEN; the rest are hidden rather
  // than shown-and-refused, because a row of tabs that 403 on click is a page that
  // looks broken.
  const usable = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  const [activeId, setActiveId] = useState(usable[0]?.id ?? null);

  // The active tab is re-resolved rather than trusted: `usable` changes when the
  // session does, and a tab that is no longer permitted must not keep rendering.
  const active = usable.find((tab) => tab.id === activeId) ?? usable[0];

  if (!active) {
    return (
      <ErrorNote>
        {t('admin.noTabs')}
      </ErrorNote>
    );
  }

  const { Component } = active;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('admin.subtitle', { name: user?.full_name, role: user?.role })}
        </p>
      </div>

      {/*
        `role="tablist"` with arrow-key navigation is the full ARIA tabs pattern
        and it is not implemented here. What IS implemented is the part that
        matters without it: these are real buttons, so they are reachable by Tab,
        operable by Enter and Space, and announced. A `role="tab"` on a div with
        no key handler would be worse than a plain group of buttons, because it
        promises an interaction the keyboard cannot deliver.
      */}
      <div className="border-b border-slate-200">
        <nav className="flex flex-wrap gap-1" aria-label={t('admin.sections')}>
          {usable.map((tab) => {
            const isActive = tab.id === active.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'border-brand text-ink'
                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-ink'
                }`}
              >
                {t(tab.labelKey)}
              </button>
            );
          })}
        </nav>
      </div>

      {/* `key` on the wrapper, so switching tabs discards the previous tab's
          state. Without it a half-typed user filter survives into the next tab,
          which is the same class of bug as the registry's lost filters — and the
          fix is the opposite: here the filters SHOULD go, because the tabs are
          unrelated views rather than two steps of one task. */}
      <Card>
        <Component key={active.id} />
      </Card>
    </div>
  );
}
