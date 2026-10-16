/**
 * The Departments tab.
 *
 * Smallest of the four, and short by necessity: a department has exactly two
 * writable fields and no state. What is worth stating is what happens to a
 * department's letters when the department changes, because that is the question
 * an administrator has while typing here.
 *
 * A department is referenced by `mail_records` only INDIRECTLY — through the
 * `department_id` of the user who logged the letter — so renaming or deactivating
 * a department does not rewrite a single letter. The `code` is UNIQUE and is what
 * appears in external references and reports, so it is treated as the stable
 * identifier and the name as the mutable label. There is deliberately no delete:
 * `departmentRoutes` has POST and PATCH and no DELETE, and offering a Delete
 * button for an endpoint that does not exist would be a 404 waiting for a user.
 */
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../../api/axiosClient.js';
import * as departmentApi from '../../api/departmentApi.js';
import { DataTable } from '../../components/common/DataTable.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { ErrorNote } from '../../components/common/ErrorNote.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { useApiError } from '../../hooks/useApiError.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

export function DepartmentsTab() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const { failure, run } = useApiError('The department could not be saved.');

  const load = useCallback(() => {
    setLoading(true);
    departmentApi
      .list()
      .then(setRows)
      .catch((problem) => setNotice(errorMessage(problem, 'Departments could not be loaded.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function save(payload, id) {
    const saved = await run(() =>
      id ? departmentApi.update(id, payload) : departmentApi.create(payload),
    );
    if (saved === null) return;

    setEditing(null);
    setCreating(false);
    setNotice(id ? t('departments.updated') : t('departments.added'));
    load();
  }

  const columns = [
    { key: 'name', header: t('departments.name'), className: 'text-slate-800' },
    {
      key: 'code',
      header: t('departments.code'),
      className: 'font-mono text-xs whitespace-nowrap text-slate-600',
    },
    { key: 'id', header: 'Id', className: 'font-mono text-xs text-slate-400' },
    {
      key: 'actions',
      header: '',
      sortable: false,
      render: (row) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(row)}
            className="rounded-btn border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {rows.length} {t('common.department')}{rows.length === 1 ? '' : 's'}. A user&apos;s {t('common.department')}
          decides which letters they can read; letters already logged are not moved by
          any change made here.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink"
        >
          {t('departments.add')}
        </button>
      </div>

      {notice && (
        <p className="text-sm text-slate-700" role="status">
          {notice}
        </p>
      )}
      {failure && <ErrorNote>{failure.message}</ErrorNote>}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={rows.length}
        empty={<EmptyState title={t('departments.none')} />}
      />

      {(creating || editing) && (
        <DepartmentDialog
          title={editing ? `${t('common.edit')} ${editing.name}` : t('departments.add')}
          department={editing}
          failure={failure}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}
    </div>
  );
}

function DepartmentDialog({ title, department, onClose, onSave, failure }) {
  const { t } = useLanguage();
  const [name, setName] = useState(department?.name ?? '');
  const [code, setCode] = useState(department?.code ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSave({ name, code }, department?.id);
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
            form="department-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="department-form" onSubmit={submit} className="space-y-3">
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('departments.name')}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className={`${INPUT} mt-1`} required />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('departments.code')}</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className={`${INPUT} mt-1 font-mono uppercase`}
            maxLength={14}
            required
          />
          {/* `maxLength` is 14 because that is the column's width, so the browser
              refuses the 15th character instead of the server refusing the whole
              request. The collision case — a different department already holding
              this code — is still the server's 400, and it names the duplicate. */}
          <span className="mt-0.5 block text-xs text-slate-500">
            Unique, up to 14 characters. Used in external references, so changing it
            after the fact changes what those references mean.
          </span>
        </label>
      </form>
    </Modal>
  );
}
