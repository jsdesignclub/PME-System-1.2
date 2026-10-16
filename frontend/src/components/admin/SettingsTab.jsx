/**
 * The Settings tab — administrator-managed letter categories.
 *
 * A category used to be free text typed by the intake clerk, and the only thing
 * it could say was its own name. Here an administrator defines each category
 * once with the ACTION that a letter of that kind requires ("prepare project
 * report") and the MAXIMUM number of days allowed to complete it. The intake
 * form then offers these as a dropdown, and the letter's detail page states what
 * has to happen and by when.
 *
 * The category's NAME is what a letter stores (`mail_records.category`), exactly
 * the same relationship `senders` has to `mail_records.sender_name`. That makes
 * the dictionary a convenience, NOT a constraint: renaming or deleting a
 * category here never rewrites a letter that already named it — the letter keeps
 * its text, and the detail page simply stops finding an action for it.
 */
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../../api/axiosClient.js';
import * as categoryApi from '../../api/categoryApi.js';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.jsx';
import { DataTable } from '../../components/common/DataTable.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { ErrorNote } from '../../components/common/ErrorNote.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { useApiError } from '../../hooks/useApiError.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

export function SettingsTab() {
  const { t } = useLanguage();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { failure, run } = useApiError(t('admin.settings.failed'));

  const load = useCallback(() => {
    setLoading(true);
    categoryApi
      .list()
      .then(setRows)
      .catch((problem) => setNotice(errorMessage(problem, t('admin.settings.loadFailed'))))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(load, [load]);

  async function save(payload, id) {
    const saved = await run(() =>
      id ? categoryApi.update(id, payload) : categoryApi.create(payload),
    );
    if (saved === null) return;

    setEditing(null);
    setCreating(false);
    setNotice(id ? t('admin.settings.updated') : t('admin.settings.added'));
    load();
  }

  async function remove(id) {
    const done = await run(() => categoryApi.remove(id));
    if (done === null) return;
    setPendingDelete(null);
    setNotice(t('admin.settings.deleted'));
    load();
  }

  const columns = [
    { key: 'name', header: t('admin.settings.name'), className: 'text-slate-800' },
    { key: 'action_to_take', header: t('admin.settings.action'), className: 'text-slate-600' },
    {
      key: 'max_days',
      header: t('admin.settings.maxDays'),
      className: 'whitespace-nowrap text-slate-600',
      render: (row) =>
        row.max_days == null ? (
          <span className="text-slate-400">—</span>
        ) : (
          `${row.max_days} ${t('admin.settings.days')}`
        ),
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
          <button
            type="button"
            onClick={() => setPendingDelete(row)}
            className="rounded-btn border border-danger px-2.5 py-1 text-xs text-danger hover:bg-red-50"
          >
            {t('common.delete')}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {t('admin.settings.count', { count: rows.length })} {t('admin.settings.intro')}
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink"
        >
          {t('admin.settings.add')}
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
        empty={<EmptyState title={t('admin.settings.none')} />}
      />

      {(creating || editing) && (
        <CategoryDialog
          title={editing ? `${t('common.edit')} ${editing.name}` : t('admin.settings.add')}
          category={editing}
          failure={failure}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSave={save}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={t('admin.settings.deleteTitle')}
          message={t('admin.settings.deleteMessage', { name: pendingDelete.name })}
          confirmLabel={t('common.delete')}
          destructive
          onConfirm={() => remove(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function CategoryDialog({ title, category, onClose, onSave, failure }) {
  const { t } = useLanguage();
  const [name, setName] = useState(category?.name ?? '');
  const [actionToTake, setActionToTake] = useState(category?.action_to_take ?? '');
  const [maxDays, setMaxDays] = useState(category?.max_days ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    await onSave({ name, action_to_take: actionToTake, max_days: maxDays }, category?.id);
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
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="category-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-3">
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('admin.settings.name')}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${INPUT} mt-1`}
            placeholder={t('admin.settings.namePlaceholder')}
            required
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {t('admin.settings.nameHint')}
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('admin.settings.action')}</span>
          <input
            value={actionToTake}
            onChange={(event) => setActionToTake(event.target.value)}
            className={`${INPUT} mt-1`}
            placeholder={t('admin.settings.actionPlaceholder')}
            required
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {t('admin.settings.actionHint')}
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('admin.settings.maxDays')}</span>
          <input
            type="number"
            min="1"
            value={maxDays}
            onChange={(event) => setMaxDays(event.target.value)}
            className={`${INPUT} mt-1`}
            placeholder={t('admin.settings.maxDaysPlaceholder')}
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {t('admin.settings.maxDaysHint')}
          </span>
        </label>
      </form>
    </Modal>
  );
}
