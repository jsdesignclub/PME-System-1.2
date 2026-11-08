/**
 * The Officers directory — every person on file, for administrators and the
 * people an administrator has granted access.
 *
 * The My Profile screen is the signed-in user's own file. This is the other
 * page: the list of everyone, with the filters needed to find a person (name or
 * NIC, role, department, active status). Selecting a row opens that person's full
 * HR file on `/officers/:id`.
 *
 * The list is `profiles`, so it includes every role — clerks, minor staff and
 * administrators too — not only the executing officers the duty matcher routes
 * to. Visibility is enforced in two places: the sidebar link and route guard in
 * the frontend, and `can_view_officers()` in the RLS policies that protect the
 * HR tables behind each row.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { errorMessage } from '../../api/axiosClient.js';
import * as departmentApi from '../../api/departmentApi.js';
import * as userApi from '../../api/userApi.js';
import { DataTable } from '../common/DataTable.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';
import { RoleBadge } from '../common/RoleBadge.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { ROLES } from '../../utils/roles.js';

const PAGE_SIZE = 25;

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

export function EmployeeDirectory() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    department_id: '',
    is_active: '',
  });
  const [applied, setApplied] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [departments, setDepartments] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    setNotice('');
    userApi
      .list(applied, { limit: PAGE_SIZE, offset })
      .then(setResult)
      .catch((problem) =>
        setNotice(errorMessage(problem, t('employees.loadFailed'))),
      )
      .finally(() => setLoading(false));
  }, [applied, offset, t]);

  useEffect(load, [load]);

  useEffect(() => {
    let cancelled = false;
    departmentApi
      .list()
      .then((rows) => {
        if (!cancelled) setDepartments(rows);
      })
      // The department picker is a convenience filter; every other control still
      // works when the list cannot be loaded.
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const columns = [
    {
      key: 'full_name',
      header: t('common.name'),
      render: (row) => (
        <span className={row.is_active ? 'font-medium text-slate-800' : 'text-slate-400 line-through'}>
          {row.full_name}
        </span>
      ),
    },
    { key: 'nic_no', header: t('users.nic'), className: 'font-mono text-xs whitespace-nowrap' },
    { key: 'role', header: t('common.role'), render: (row) => <RoleBadge role={row.role} /> },
    { key: 'designation', header: t('users.designation'), className: 'text-slate-600' },
    {
      key: 'department_name',
      header: t('common.department'),
      className: 'text-slate-600',
      render: (row) => row.department?.name ?? '—',
    },
    {
      key: 'is_active',
      header: t('common.status'),
      render: (row) => (
        <span className={row.is_active ? 'text-green-700' : 'text-slate-500'}>
          {row.is_active ? t('users.active') : t('users.deactivated')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (row) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate(`/officers/${row.id}`)}
            className="rounded-btn border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {t('employees.view')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{t('officers.pageTitle')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('employees.description')}</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(filters);
          setOffset(0);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('users.search')}</span>
          <input
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            className={`${INPUT} mt-1 w-56`}
            placeholder={t('users.searchPlaceholder')}
          />
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('common.role')}</span>
          <select
            value={filters.role}
            onChange={(event) => setFilters((current) => ({ ...current, role: event.target.value }))}
            className={`${INPUT} mt-1 w-48`}
          >
            <option value="">{t('users.allRoles')}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('common.department')}</span>
          <select
            value={filters.department_id}
            onChange={(event) =>
              setFilters((current) => ({ ...current, department_id: event.target.value }))
            }
            className={`${INPUT} mt-1 w-48`}
          >
            <option value="">{t('employees.allDepartments')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('common.status')}</span>
          <select
            value={filters.is_active}
            onChange={(event) =>
              setFilters((current) => ({ ...current, is_active: event.target.value }))
            }
            className={`${INPUT} mt-1 w-32`}
          >
            <option value="">{t('users.all')}</option>
            <option value="true">{t('users.active')}</option>
            <option value="false">{t('users.deactivated')}</option>
          </select>
        </label>

        <button type="submit" className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white">
          {t('common.apply')}
        </button>

        <button
          type="button"
          onClick={() => {
            const cleared = { search: '', role: '', department_id: '', is_active: '' };
            setFilters(cleared);
            setApplied(cleared);
            setOffset(0);
          }}
          className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('common.clear')}
        </button>
      </form>

      {notice && <ErrorNote>{notice}</ErrorNote>}

      <DataTable
        columns={columns}
        rows={result.rows}
        loading={loading}
        total={result.total}
        offset={offset}
        pageSize={PAGE_SIZE}
        onOffsetChange={setOffset}
        onRowClick={(row) => navigate(`/officers/${row.id}`)}
        empty={
          <EmptyState title={t('employees.noMatches')}>
            {applied.search || applied.role || applied.department_id || applied.is_active
              ? t('employees.clearFilters')
              : t('employees.none')}
          </EmptyState>
        }
      />
    </div>
  );
}
