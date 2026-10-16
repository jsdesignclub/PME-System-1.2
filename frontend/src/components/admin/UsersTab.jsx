/**
 * The Users tab.
 *
 * Onboarding is TWO steps, deliberately:
 *
 *   1. "Create login" mints an auth account (email + password) and nothing else.
 *      The account appears in the amber "accounts without a profile" panel.
 *   2. The administrator selects that account and completes the PROFILE — name,
 *      NIC, role, department — which writes the public.profiles row.
 *
 * Splitting the two is what lets a login exist before it is a person. A NIC is
 * an identity that belongs on the profile, not on the credential, and the person
 * may not be known at the moment the login is made.
 *
 * The rest of the file keeps the two things it was already careful about:
 *
 *  - `deactivate` is NOT a delete, and the button says "Deactivate". A control
 *    labelled "Delete" that silently sets `is_active = FALSE` teaches an
 *    administrator that the system loses people, and the next request to "really
 *    delete this account" will be a support ticket rather than a button. The row
 *    also keeps its audit attribution (D23), which is the whole reason the
 *    endpoint is a deactivate.
 *
 *  - A deactivated user is shown, not hidden. An administrator asking "what
 *    happened to Sunil?" must be able to answer, and a list that quietly omits
 *    people cannot answer it.
 */
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../../api/axiosClient.js';
import * as departmentApi from '../../api/departmentApi.js';
import * as userApi from '../../api/userApi.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { DataTable } from '../../components/common/DataTable.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { ErrorNote } from '../../components/common/ErrorNote.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { RoleBadge } from '../../components/common/RoleBadge.jsx';
import { useApiError } from '../../hooks/useApiError.js';
import { formatDateTime } from '../../utils/dateUtils.js';

/**
 * The role ENUM, in schema order.
 *
 * This is a list of the roles a user may be GIVEN, not a role→permission map.
 * The distinction is the whole point of D25: the client may know which role
 * names exist (they are in the spec and in the schema), and may not know what
 * each one permits — that list comes from `/auth/permissions` at runtime.
 *
 * Kept as a local constant rather than fetched, because there is no endpoint that
 * serves the ENUM and inventing one would be a new API surface for a list of
 * eight strings that changes when a migration changes.
 */
const ROLES = [
  'MINOR_STAFF',
  'SECRETARY',
  'AO',
  'CHIEF_CLERK',
  'SUBJECT_CLERK',
  'OFFICER',
  'TRANSPORT_OFFICER',
  'ADMIN',
];

/**
 * The designations a profile may carry, in the order the ministry lists them.
 *
 * A fixed list rather than free text so that "Chief Clerk", "chief clerk" and
 * "Chief clerk " cannot become three different things in the directory. It is
 * NOT validated server-side, and rows predating this list may hold a value that
 * is not here (the seeded "Provincial Secretary", for instance); the picker
 * keeps such a value as an option of its own rather than dropping it on save.
 */
const DESIGNATIONS = [
  'Secretary',
  'Assistant Secretary',
  'Administration Officer',
  'Chief Clerk',
  'Director Planning',
  'Development Officer',
  'Accountant',
  'Technical Officer',
  'Management Assistant',
  'Driver',
  'Office Assistant',
];

const PAGE_SIZE = 25;

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

export function UsersTab() {
  const { t } = useLanguage();
  const [filters, setFilters] = useState({ search: '', role: '', is_active: '' });
  const [applied, setApplied] = useState(filters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const { failure, run } = useApiError('The user directory could not be loaded.');

  const load = useCallback(() => {
    setLoading(true);
    userApi
      .list(applied, { limit: PAGE_SIZE, offset })
      .then(setResult)
      // `run` would swallow this into `failure`, and the table has its own error
      // slot for a LOAD failure — a full-width banner above a table of rows is a
      // different failure from a banner inside one dialog, and `errorMessage` is
      // the right reader for the first.
      .catch((problem) => setNotice(errorMessage(problem, 'The user directory could not be loaded.')))
      .finally(() => setLoading(false));
  }, [applied, offset]);

  useEffect(load, [load]);

  // Accounts that exist as logins but have no profile yet, i.e. the queue for
  // step 2. A failure here (most often the Edge Function not being deployed) is
  // kept separate from the directory error, because the directory still works.
  const [pending, setPending] = useState([]);
  const [pendingError, setPendingError] = useState('');
  const loadPending = useCallback(() => {
    setPendingError('');
    userApi
      .listUnprofiled()
      .then(setPending)
      .catch((problem) => {
        setPending([]);
        setPendingError(errorMessage(problem, t('users.pendingFailed')));
      });
  }, [t]);

  useEffect(loadPending, [loadPending]);

  const [editing, setEditing] = useState(null);
  const [creatingLogin, setCreatingLogin] = useState(false);
  const [profiling, setProfiling] = useState(null);
  const [deactivating, setDeactivating] = useState(null);

  // Step 1 of a save: a login. No profile is written, so the optimistic move is
  // to refresh the pending queue rather than the directory.
  async function saveLogin(payload) {
    const saved = await run(() => userApi.createLogin(payload));
    if (saved === null) return;

    setCreatingLogin(false);
    setNotice(t('users.loginCreated', { email: payload.email }));
    loadPending();
  }

  // Step 2: the profile. `id` is absent on a profile CREATE (the id travels in
  // the payload, being the auth user's id) and present on an EDIT.
  async function saveProfile(payload, id) {
    const saved = await run(() => (id ? userApi.update(id, payload) : userApi.createProfile(payload)));

    // On failure `run` returns null AND sets `failure`. The early return keeps the
    // dialog open with the user's typed values intact, and `failure` then renders
    // inside it — a rejected save must not discard the form.
    if (saved === null) return;

    setEditing(null);
    setProfiling(null);
    setNotice(id ? t('users.updated') : t('users.profileCreated', { name: payload.full_name }));
    load();
    loadPending();
  }

  async function confirmDeactivate() {
    const result = await run(() => userApi.deactivate(deactivating.id));
    if (result === null) return;

    setNotice(t('users.deactivatedNotice', { name: deactivating.full_name }));
    load();
  }

  // Reactivation is not destructive, so it takes no confirmation dialog: there
  // is nothing to lose by pressing it, and a dialog on every harmless action
  // trains people to click through the ones that matter.
  async function reactivate(row) {
    const result = await run(() => userApi.reactivate(row.id));
    if (result === null) return;

    setNotice(t('users.reactivatedNotice', { name: row.full_name }));
    load();
  }

  const columns = [
    {
      key: 'full_name',
      header: t('common.name'),
      render: (row) => (
        <span className={row.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}>
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
      key: 'updated_at',
      header: 'Last change',
      className: 'whitespace-nowrap text-slate-500',
      render: (row) => formatDateTime(row.updated_at),
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(row)}
            className="rounded-btn border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            {t('common.edit')}
          </button>
          {/* The button reflects the row's current state rather than always
              offering "Deactivate": a deactivated row gets "Reactivate", which
              is the only action it has left. A single fixed button disabled for
              half the rows would leave an administrator unable to undo the
              deactivation without guessing. */}
          {row.is_active ? (
            <button
              type="button"
              onClick={() => setDeactivating(row)}
              className="rounded-btn border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              {t('users.deactivate')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => reactivate(row)}
              className="rounded-btn border border-green-300 px-2.5 py-1 text-xs text-green-700 hover:bg-green-50"
            >
              {t('users.reactivate')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
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
            onChange={(event) => setFilters((c) => ({ ...c, search: event.target.value }))}
            className={`${INPUT} mt-1 w-56`}
            placeholder={t('users.searchPlaceholder')}
          />
        </label>

        <label className="text-sm">
          <span className="block font-medium text-slate-700">{t('common.role')}</span>
          <select
            value={filters.role}
            onChange={(event) => setFilters((c) => ({ ...c, role: event.target.value }))}
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
          <span className="block font-medium text-slate-700">{t('common.status')}</span>
          <select
            value={filters.is_active}
            onChange={(event) => setFilters((c) => ({ ...c, is_active: event.target.value }))}
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
          onClick={() => setCreatingLogin(true)}
          className="ml-auto rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink"
        >
          {t('users.addLogin')}
        </button>
      </form>

      {/* Step 2's queue. Shown only when it holds something, since an empty panel
          is a standing instruction to do work that does not exist. */}
      {pendingError && <ErrorNote>{pendingError}</ErrorNote>}
      {!pendingError && pending.length > 0 && (
        <PendingProfiles pending={pending} onComplete={setProfiling} />
      )}

      {/* Two slots, not one. `notice` carries a load failure (the table is empty
          and the reason is above it) AND the "saved" confirmation, which are
          different visual urgencies sharing a string type. `failure` is a WRITE
          failure, shown in the dialog where the form still is, so the user's
          typed values are on screen next to the message that rejected them. */}
      {notice && !failure && (
        <p className="text-sm text-slate-700" role="status">
          {notice}
        </p>
      )}
      {failure && <ErrorNote>{failure.message}</ErrorNote>}

      <DataTable
        columns={columns}
        rows={result.rows}
        loading={loading}
        total={result.total}
        offset={offset}
        pageSize={PAGE_SIZE}
        onOffsetChange={setOffset}
        empty={
          <EmptyState title={t('users.noMatches')}>
            {applied.search || applied.role || applied.is_active
              ? 'Clear the filters to see the whole directory.'
              : t('users.none')}
          </EmptyState>
        }
      />

      {creatingLogin && (
        <LoginDialog
          onClose={() => setCreatingLogin(false)}
          onSave={saveLogin}
          failure={failure}
        />
      )}

      {profiling && (
        <UserDialog
          mode="profile"
          title={t('users.profileTitle', { email: profiling.email ?? profiling.id })}
          user={profiling}
          onClose={() => setProfiling(null)}
          onSave={saveProfile}
          failure={failure}
        />
      )}

      {editing && (
        <UserDialog
          title={`${t('common.edit')} ${editing.full_name}`}
          user={editing}
          onClose={() => setEditing(null)}
          onSave={saveProfile}
          failure={failure}
        />
      )}

      <ConfirmDialog
        open={Boolean(deactivating)}
        title={t('users.deactivate')}
        destructive
        confirmLabel={t('users.deactivate')}
        message={
          deactivating
            ? `${deactivating.full_name} will no longer be able to sign in. Their letters, minutes and audit history are kept, and their name still appears on every record they touched.`
            : ''
        }
        onConfirm={confirmDeactivate}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}

/**
 * The step-2 queue: logins with no profile yet.
 *
 * Each row offers the one action that clears it, and shows the account's email
 * and age so two logins made minutes apart are distinguishable without opening
 * them.
 */
function PendingProfiles({ pending, onComplete }) {
  const { t } = useLanguage();

  return (
    <div className="rounded-card border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-900">
        {t('users.pendingTitle', { count: pending.length })}
      </h2>
      <p className="mt-1 text-xs text-amber-800">{t('users.pendingHint')}</p>
      <ul className="mt-3 divide-y divide-amber-200">
        {pending.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div>
              <div className="font-mono text-sm text-slate-800">
                {account.email ?? account.id}
              </div>
              <div className="text-xs text-slate-500">
                {t('users.createdAt')}: {formatDateTime(account.created_at)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onComplete(account)}
              className="rounded-btn border border-amber-300 bg-surface px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              {t('users.completeProfile')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Step 1 form: the login alone.
 *
 * No name, NIC or role here — those belong to the profile, which is a separate
 * decision taken against the account this form creates.
 */
function LoginDialog({ onClose, onSave, failure }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm((c) => ({ ...c, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSave({ email: form.email.trim(), password: form.password });
    setBusy(false);
  }

  return (
    <Modal
      open
      title={t('users.addLoginTitle')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="login-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="login-form" onSubmit={submit} className="space-y-3">
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <p className="rounded-btn bg-slate-50 p-3 text-xs text-slate-600">
          {t('users.addLoginIntro')}
        </p>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('users.email')}</span>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            className={`${INPUT} mt-1`}
            required
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('users.password')}</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            className={`${INPUT} mt-1`}
            required
            autoComplete="new-password"
          />
          <span className="mt-0.5 block text-xs text-slate-500">{t('users.passwordHint')}</span>
        </label>
      </form>
    </Modal>
  );
}

/**
 * The profile form, used for BOTH step 2 (create a profile for an existing
 * login) and editing.
 *
 *  - `mode="profile"` (step 2): `user` is `{ id, email }`, the account's email is
 *    fixed and read-only, the NIC is required, and there is no password — the
 *    credential was set when the login was created.
 *
 *  - edit (`user` is a full directory row): the NIC is fixed (a NIC is an
 *    identity and cannot be changed), and there is still no password field,
 *    because there is no reset endpoint and a save must not carry a field the
 *    PATCH allowlist rejects.
 */
function UserDialog({ title, user, mode = 'edit', onClose, onSave, failure }) {
  const { t } = useLanguage();
  const isProfile = mode === 'profile';
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    nic_no: user?.nic_no ?? '',
    role: user?.role ?? (isProfile ? 'SUBJECT_CLERK' : 'MINOR_STAFF'),
    designation: user?.designation ?? '',
    email: user?.email ?? '',
    department_id: user?.department_id ?? '',
    section_name: user?.section_name ?? '',
    is_central_clerk: user?.is_central_clerk ?? false,
  });
  const [busy, setBusy] = useState(false);

  // The department picker needs the full list, and the tab itself does not need
  // it, so it is fetched by the dialog rather than hoisted — opening the dialog is
  // the moment it becomes relevant, and cancelling before then costs nothing.
  useEffect(() => {
    let cancelled = false;
    departmentApi
      .list()
      .then((found) => {
        if (!cancelled) setDepartments(found);
      })
      // A picker that cannot be populated is not a reason to block the form: every
      // other field still works, and `department_id` is optional. The empty select
      // simply shows "No department" alongside any departments that did load.
      .catch(() => {
        if (!cancelled) setDepartments([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (key) => (event) => setForm((c) => ({ ...c, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);

    const payload = {
      full_name: form.full_name,
      email: form.email,
      role: form.role,
      designation: form.designation,
      // `null` rather than `''` on purpose. The controller tests
      // `req.body.department_id === null` for "cleared"; an empty string would fail
      // requireInt with "must be an integer" instead of clearing the column.
      department_id: form.department_id === '' ? null : Number(form.department_id),
      // Only a SUBJECT_CLERK can hold the flag; switching the role away clears
      // it, so `is_central_clerk()` can never widen a non-clerk.
      is_central_clerk: form.role === 'SUBJECT_CLERK' ? Boolean(form.is_central_clerk) : false,
    };

    // `section_name` is optional server-side (optionalString), so an empty box is
    // omitted rather than sent as `''` — which would set the column to an empty
    // string instead of leaving the existing value alone on an edit.
    if (form.section_name.trim()) payload.section_name = form.section_name;

    if (isProfile) {
      // Step 2: the row's identity is the auth user's id; the NIC comes from the
      // profile form. `id` travels inside the payload to `createProfile`.
      payload.id = user.id;
      payload.nic_no = form.nic_no;
      await onSave(payload);
    } else {
      // Edit: NIC and password are not editable, so neither travels. The id is
      // passed on the side, marking this as an update.
      await onSave(payload, user.id);
    }
    setBusy(false);
  }

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700"
          >
             Cancel
          </button>
          <button
            type="submit"
            form="user-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-3">
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('users.fullName')}</span>
          <input value={form.full_name} onChange={set('full_name')} className={`${INPUT} mt-1`} required />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('users.nic')}</span>
          <input
            value={form.nic_no}
            onChange={set('nic_no')}
            className={`${INPUT} mt-1 font-mono`}
            required
            readOnly={!isProfile}
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {isProfile
              ? t('users.nicHint')
              : 'A NIC is an identity and cannot be changed. Create a new login instead.'}
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('users.email')}</span>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            className={`${INPUT} mt-1`}
            required
            readOnly={isProfile}
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {isProfile
              ? t('users.accountEmailHint')
              : 'Required, and unique across the directory.'}
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('common.role')}</span>
          <select value={form.role} onChange={set('role')} className={`${INPUT} mt-1`} required>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        {/*
          Only meaningful for a SUBJECT_CLERK. The flag widens that clerk from
          their own department to every department — they may read, forward and
          record the AO's minutes for any letter (Confidential letters stay
          hidden). Shown only for the role it applies to; switching the role away
          clears it on save.
        */}
        {form.role === 'SUBJECT_CLERK' && (
          <label className="flex items-start gap-2 rounded-btn bg-slate-50 p-3 text-sm">
            <input
              type="checkbox"
              checked={form.is_central_clerk}
              onChange={(event) =>
                setForm((c) => ({ ...c, is_central_clerk: event.target.checked }))
              }
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-slate-700">{t('users.centralClerk')}</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {t('users.centralClerkHint')}
              </span>
            </span>
          </label>
        )}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('users.designation')}</span>
          <select value={form.designation} onChange={set('designation')} className={`${INPUT} mt-1`} required>
            <option value="">{t('users.selectDesignation')}</option>
            {/* A value recorded before this list existed — or typed by an
                earlier build — is shown as its own option so that merely opening
                the form cannot silently rewrite it to an empty string. */}
            {form.designation && !DESIGNATIONS.includes(form.designation) && (
              <option value={form.designation}>{form.designation}</option>
            )}
            {DESIGNATIONS.map((designation) => (
              <option key={designation} value={designation}>
                {designation}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('common.department')}</span>
          <select value={form.department_id} onChange={set('department_id')} className={`${INPUT} mt-1`}>
            <option value="">No department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-xs text-slate-500">
            Optional, and it decides which department&apos;s mail this person can see
            when their role scopes them that way.
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('common.section')}</span>
          <input value={form.section_name} onChange={set('section_name')} className={`${INPUT} mt-1`} />
        </label>

        {/*
          Deliberately NOT a permission list. The frontend cannot know what a role
          permits — that is the resolved `/auth/permissions` response, and it is
          per-user, not per-role-name. An earlier draft tried to render "this role
          grants CREATE_MAIL, …" from a local table, which is exactly the second
          source of truth `utils/permissions.js` exists to forbid, and it would
          have been wrong the moment a permission changed on the server.
        */}
        <p className="rounded-btn bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-medium text-slate-700">{form.role}</span> takes effect
          immediately for that person&apos;s next request. What it permits is decided by
          the server; no role-to-permission list is kept in this interface.
        </p>
      </form>
    </Modal>
  );
}
