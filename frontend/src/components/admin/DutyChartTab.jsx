/**
 * The Duty Charts tab — the only WRITING tab in Administration.
 *
 * Three things here are not incidental:
 *
 *  1. The KEYWORDS ARE THE MATCHER'S INPUT, so they are edited as chips. A
 *     comma-separated text box invites a trailing comma and a doubled word, both
 *     of which become separate "keywords" in the database and quietly dilute the
 *     score. Enter or comma commits a chip; Backspace on an empty box removes the
 *     last one, which is the behaviour a keyboard user expects from every other
 *     chip input they have used.
 *
 *  2. Delete is a HARD delete and is confirmed (unlike a user, D23). The dialog
 *     says so in those words rather than saying "are you sure?", because the
 *     difference between a deactivate and a delete is exactly what an
 *     administrator needs to be certain about.
 *
 *  3. This tab is reachable WITHOUT `ADMIN` — spec §4.1 gives SUBJECT_CLERK
 *     `UPDATE_DUTY_CHART`. A clerk editing the routing rules is unusual, so every
 *     write here is audited by the server, and the header says so rather than
 *     leaving the auditor to discover it.
 */
import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '../../api/axiosClient.js';
import * as mailApi from '../../api/mailApi.js';
import { Card } from '../../components/common/Card.jsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { ErrorNote } from '../../components/common/ErrorNote.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { RoleBadge } from '../../components/common/RoleBadge.jsx';
import { Spinner } from '../../components/common/Spinner.jsx';
import { useApiError } from '../../hooks/useApiError.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

export function DutyChartTab() {
  const { t } = useLanguage();
  const { user, permissions, hasPermission } = useAuth();
  const canEdit = hasPermission('UPDATE_DUTY_CHART');
  // A subject clerk maintains the duty chart for their own branch — always scoped
  // to their department, regardless of READ_ALL_MAIL. A central clerk routes
  // across departments and keeps the full list. Others follow READ_ALL_MAIL.
  // `profiles_read` is `USING (true)`, so this scoping lives here, not in RLS.
  const canReadAllMail = permissions.includes('READ_ALL_MAIL');
  const isCentralClerk = Boolean(user?.is_central_clerk);
  const isSubjectClerk = user?.role === 'SUBJECT_CLERK';
  const seesAllDepartments = isCentralClerk || (!isSubjectClerk && canReadAllMail);

  const [all, setAll] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [chart, setChart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const { failure, run } = useApiError(t('duties.failed'));

  useEffect(() => {
    mailApi
      .officers({
        limit: 100,
        departmentId: seesAllDepartments ? undefined : user?.department_id,
      })
      .then((rows) => {
        setAll(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
      })
      .catch((problem) => setNotice(errorMessage(problem, t('duties.loadingOfficers'))))
      .finally(() => setLoading(false));
  }, [t, seesAllDepartments, user?.department_id]);

  const loadChart = useCallback((officerId) => {
    setChart(null);
    mailApi
      .officerDutyChart(officerId)
      .then(setChart)
      .catch((problem) => setNotice(errorMessage(problem, t('duties.loadingChart'))));
  }, [t]);

  useEffect(() => {
    if (selectedId) loadChart(selectedId);
  }, [selectedId, loadChart]);

  async function saveDuty(fields, dutyId) {
    const saved = await run(() =>
      dutyId
        ? mailApi.updateDuty(selectedId, dutyId, fields)
        : mailApi.addDuty(selectedId, fields),
    );
    if (saved === null) return;

    setDialog(null);
    setNotice(dutyId ? t('duties.updated') : t('duties.added'));
    loadChart(selectedId);
  }

  async function confirmDelete() {
    const result = await run(() => mailApi.removeDuty(selectedId, pendingDelete.id));
    if (result === null) return;

    setNotice(t('duties.removed'));
    loadChart(selectedId);
  }

  if (loading) return <Spinner label={t('duties.loadingOfficers')} />;

  if (all.length === 0) {
    return (
      <EmptyState title={t('duties.noOfficers')}>
        The matcher ranks duties held by OFFICER and TRANSPORT_OFFICER users. Until one
        exists there is nothing to route to.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <ErrorNote>
          {t('duties.readOnly')}
        </ErrorNote>
      )}
      {canEdit && (
        <p className="text-xs text-slate-500">
          {t('duties.auditNote')}
        </p>
      )}

      {notice && (
        <p className="text-sm text-slate-700" role="status">
          {notice}
        </p>
      )}
      {failure && <ErrorNote>{failure.message}</ErrorNote>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title={t('officers.title')}>
          <ul className="space-y-1.5">
            {all.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(person.id)}
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
                    {person.home_section ?? person.designation}
                    {person.department?.name ? ` · ${person.department.name}` : ''}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title={chart ? `${t('officers.dutyChart')} — ${chart.officer.full_name}` : t('officers.dutyChart')}
          subtitle={chart?.officer?.department?.name}
          action={
            canEdit && (
              <button
                type="button"
                onClick={() => setDialog({})}
                className="rounded-btn bg-brand px-3 py-1.5 text-sm font-medium text-ink"
              >
                {t('duties.add')}
              </button>
            )
          }
        >
          {!chart ? (
            <Spinner label={t('duties.loadingChart')} />
          ) : chart.duty_count === 0 ? (
            <EmptyState title={t('duties.noDuties')}>
              {canEdit
                ? t('duties.noDutiesHint')
                : t('officer.noDutyRows')}
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {Object.entries(chart.duty_chart).map(([section, duties]) => (
                <div key={section} className="rounded-btn border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-ink">{section}</h3>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setDialog({ section_name: section })}
                        className="text-xs text-slate-500 underline hover:text-ink"
                      >
                        {t('duties.addToSection')}
                      </button>
                    )}
                  </div>

                  {duties.map((duty) => (
                    <div key={duty.id} className="mt-3 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-slate-700">{duty.duty_description}</p>
                        {canEdit && (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => setDialog(duty)}
                              className="text-xs text-slate-500 underline hover:text-ink"
                            >
                            {t('common.edit')}
                          </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(duty)}
                              className="text-xs text-red-600 underline hover:text-red-800"
                            >
                            {t('common.delete')}
                          </button>
                          </div>
                        )}
                      </div>

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

      {dialog && (
        <DutyDialog
          duty={dialog}
          failure={failure}
          onClose={() => setDialog(null)}
          onSave={saveDuty}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t('duties.deleteTitle')}
        destructive
        confirmLabel={t('duties.deleteConfirm')}
        message={
          pendingDelete
            ? `"${pendingDelete.duty_description}" and its ${pendingDelete.keywords.length} keyword(s) will be removed. This is a permanent delete, not a deactivation — a duty row can never be recovered, though the deletion is recorded in the audit log.`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * Add or edit one duty row.
 *
 * `duty` arrives as `{}` for a new row and as the duty itself for an edit — the
 * same discriminator `UsersTab` uses, and the reason `duty.id` rather than a
 * separate `mode` prop decides which endpoint is called.
 */
function DutyDialog({ duty, onClose, onSave, failure }) {
  const { t } = useLanguage();
  const isEdit = Boolean(duty.id);

  const [section, setSection] = useState(duty.section_name ?? '');
  const [description, setDescription] = useState(duty.duty_description ?? '');
  const [keywords, setKeywords] = useState(duty.keywords ?? []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  function commitDraft() {
    const keyword = draft.trim().toLowerCase();
    if (!keyword) return;

    // De-duplicated here as well as server-side, because the UI should not offer
    // to save something it already knows is a duplicate. `normalizeKeywords` on
    // the server is the actual guarantee; this is the courtesy.
    if (!keywords.includes(keyword)) setKeywords((current) => [...current, keyword]);
    setDraft('');
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      // `preventDefault` on Enter is what stops the dialog submitting. Without it,
      // committing a keyword submits the form — which is the single most annoying
      // thing a chip input can do inside a dialog with a Save button.
      event.preventDefault();
      commitDraft();
      return;
    }

    if (event.key === 'Backspace' && draft === '' && keywords.length > 0) {
      setKeywords((current) => current.slice(0, -1));
    }
  }

  /**
   * The keywords to send, with the uncommitted draft folded in.
   *
   * Read here rather than in `submit` because the Save button's disabled state
   * needs the same answer: a user who typed a keyword but has not pressed Enter
   * must still be able to save. Folding the draft in at submit time only, while
   * the button checks `keywords.length`, is how a legitimate save gets blocked by
   * a field the user can plainly see filled in.
   *
   * De-duplicated so the same keyword cannot be sent twice by typing it and
   * pressing Enter as well — the server would normalise it, but a payload with
   * duplicates is a confusing thing to log.
   */
  function pendingKeywords() {
    const draftKeyword = draft.trim().toLowerCase();
    if (!draftKeyword || keywords.includes(draftKeyword)) return keywords;
    return [...keywords, draftKeyword];
  }

  async function submit(event) {
    event.preventDefault();

    const payload = {
      section_name: section,
      duty_description: description,
      keywords: pendingKeywords(),
    };

    // Clear the draft so a rejected save does not then send the keyword twice on
    // the retry — the user presses Save, sees the error, presses Save again, and
    // the second attempt has one more keyword than the first for no reason.
    setDraft('');
    setKeywords(payload.keywords);

    setBusy(true);
    await onSave(payload, duty.id);
    setBusy(false);
  }

  return (
    <Modal
      open
      title={isEdit ? t('common.edit') + ' duty' : t('duties.add')}
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
            form="duty-form"
            disabled={busy || pendingKeywords().length === 0}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="duty-form" onSubmit={submit} className="space-y-3">
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('duties.section')}</span>
          <input
            value={section}
            onChange={(event) => setSection(event.target.value)}
            className={`${INPUT} mt-1`}
            placeholder={t('duties.sectionPlaceholder')}
            required
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {t('duties.sectionHint')}
          </span>
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('duties.description')}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className={`${INPUT} mt-1 resize-y`}
            placeholder={t('duties.descriptionPlaceholder')}
            required
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {t('duties.scoredToo')}
          </span>
        </label>

        <div className="text-sm">
          <span className="font-medium text-slate-700">{t('duties.keywords')}</span>

          <div
            className="mt-1 flex flex-wrap items-center gap-1.5 rounded-btn border border-slate-300 p-2"
            onClick={() => document.getElementById('duty-keyword')?.focus()}
          >
            {keywords.map((keyword) => (
              <span
                key={keyword}
                className="inline-flex items-center gap-1 rounded bg-ink/10 px-2 py-0.5 text-xs text-ink"
              >
                {keyword}
                <button
                  type="button"
                  onClick={() => setKeywords((c) => c.filter((k) => k !== keyword))}
                  aria-label={`Remove ${keyword}`}
                  className="text-ink/60 hover:text-red-700"
                >
                  ×
                </button>
              </span>
            ))}

            <input
              id="duty-keyword"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commitDraft}
              className="min-w-32 flex-1 border-0 px-1 py-0.5 text-sm focus:outline-none"
              placeholder={keywords.length === 0 ? t('duties.keywordPlaceholder') : ''}
            />
          </div>

          <span className="mt-0.5 block text-xs text-slate-500">
            {t('duties.keywordHint')}
          </span>
        </div>
      </form>
    </Modal>
  );
}
