/**
 * Completion by approval.
 *
 * A letter's officer finishes the work by forwarding a completion document to
 * the AO or the Secretary; the letter then sits at 'Pending Approval' until that
 * approver decides. This panel is BOTH ends of that exchange, rendered from the
 * server's `available_actions` rather than from `status` and `role` in the
 * browser (D61):
 *
 *   submit_completion   the assigned officer's form (choose approver, attach,
 *                       note).
 *   approve_completion / reject_completion   the approver's decision on the
 *                       pending document: approve closes the letter, reject
 *                       returns it to the officer for correction.
 *
 * Every decision is recorded as an official minute by the server, so the outcome
 * appears in the letter's timeline alongside the workflow transitions. This panel
 * only renders the submission history the same server hands back.
 */
import { useEffect, useRef, useState } from 'react';

import { Paperclip, Upload, X } from 'lucide-react';

import * as completionApi from '../../api/completionApi.js';
import * as userApi from '../../api/userApi.js';
import { useApiError } from '../../hooks/useApiError.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { formatBytes, formatDateTime } from '../../utils/dateUtils.js';
import { Card } from '../common/Card.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';
import { useToast } from '../common/Toast.jsx';
import { ALLOWED_EXTENSIONS } from './AttachmentList.jsx';

const STATUS_CLASS = {
  Pending: 'bg-amber-100 text-amber-600 ring-amber-300',
  Approved: 'bg-green-100 text-green-600 ring-green-300',
  Rejected: 'bg-red-100 text-red-600 ring-red-300',
};

export function CompletionApprovalPanel({ letter, actions = [], submissions = [], onChanged }) {
  const { t } = useLanguage();
  const { notify } = useToast();

  const canSubmit = actions.some((a) => a.action === 'submit_completion');
  const canDecide = actions.some(
    (a) => a.action === 'approve_completion' || a.action === 'reject_completion',
  );
  const pending = submissions.find((s) => s.status === 'Pending');

  const [approverRole, setApproverRole] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [departmentHead, setDepartmentHead] = useState(null);
  const fileInputRef = useRef(null);

  // Load the department head for this letter's department, so the officer can
  // choose them as an approver alongside the AO and the Secretary.
  useEffect(() => {
    if (!letter?.department_id) {
      setDepartmentHead(null);
      return undefined;
    }
    let live = true;
    userApi
      .list({ role: 'DEPARTMENT_HEAD', department_id: letter.department_id, is_active: true }, { limit: 1 })
      .then(({ rows }) => {
        if (live) setDepartmentHead(rows[0] ?? null);
      })
      .catch(() => {
        if (live) setDepartmentHead(null);
      });
    return () => {
      live = false;
    };
  }, [letter?.department_id]);

  const submitApi = useApiError(t('completion.submitFailed'));
  const decideApi = useApiError(t('completion.decideFailed'));

  const history = [...submissions].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );

  if (!canSubmit && !canDecide && history.length === 0) return null;

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submit() {
    submitApi.clear();
    setBusy(true);
    const result = await submitApi.run(() => {
      if (!approverRole) throw new Error(t('completion.approverRequired'));
      if (!file) throw new Error(t('completion.fileRequired'));
      return completionApi.submit(letter.id, { approverRole, note, file });
    });
    setBusy(false);

    if (result) {
      setApproverRole('');
      setNote('');
      clearFile();
      notify(t('completion.submittedToast'), 'success');
      onChanged();
    }
  }

  async function decide(decision) {
    decideApi.clear();
    setBusy(true);
    const result = await decideApi.run(() => completionApi.decide(pending.id, decision, decisionNote));
    setBusy(false);

    if (result) {
      setDecisionNote('');
      notify(
        decision === 'Approved'
          ? t('completion.approvedToast')
          : t('completion.rejectedToast'),
        'success',
      );
      onChanged();
    }
  }

  async function download(submission) {
    setDownloading(submission.id);
    try {
      const { blob } = await completionApi.download(submission);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = submission.document_name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      notify(t('completion.downloadFailed'), 'error');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-5">
      {canSubmit && (
        <Card title={t('completion.submitTitle')}>
          <p className="text-sm text-slate-600">{t('completion.submitHelp')}</p>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-slate-700">{t('completion.approverLabel')}</span>
            <select
              value={approverRole}
              onChange={(event) => setApproverRole(event.target.value)}
              className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            >
              <option value="">{t('completion.chooseApprover')}</option>
              <option value="AO">{t('completion.approverAO')}</option>
              <option value="SECRETARY">{t('completion.approverSecretary')}</option>
              {departmentHead && (
                <option value="DEPARTMENT_HEAD">
                  {t('completion.approverDepartmentHead')} ({departmentHead.full_name})
                </option>
              )}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-slate-700">{t('completion.noteLabel')}</span>
            <textarea
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('completion.notePlaceholder')}
              className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>

          <div className="mt-3">
            <span className="font-medium text-slate-700">{t('completion.documentLabel')}</span>

            {file ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-btn border border-brand-300 bg-brand-50 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Paperclip size={16} className="shrink-0 text-brand-400" />
                  <span className="truncate text-sm text-ink">{file.name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span>
                </div>
                <button
                  type="button"
                  onClick={clearFile}
                  title={t('completion.removeFile')}
                  aria-label={t('completion.removeFile')}
                  className="shrink-0 rounded-full p-1 text-slate-500 transition hover:bg-red-500/10 hover:text-critical"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-btn border border-dashed border-slate-400 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-brand hover:bg-brand-50 hover:text-brand-400"
              >
                <Upload size={16} />
                {t('completion.chooseFile')}
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_EXTENSIONS.join(',')}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="hidden"
            />

            <span className="mt-1 block text-xs text-slate-500">{t('attachment.helper')}</span>
          </div>

          {submitApi.failure && (
            <div className="mt-3">
              <ErrorNote>{submitApi.failure.message}</ErrorNote>
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="mt-3 w-full rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('completion.submitting') : t('completion.submit')}
          </button>
        </Card>
      )}

      {canDecide && pending && (
        <Card title={t('completion.decideTitle')}>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t('completion.documentLabel')}</dt>
              <dd className="text-right text-slate-800">{pending.document_name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t('completion.submittedBy')}</dt>
              <dd className="text-right text-slate-800">{pending.submitted_by_name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t('completion.submittedAt')}</dt>
              <dd className="text-right text-slate-800">{formatDateTime(pending.created_at)}</dd>
            </div>
          </dl>

          {pending.note && (
            <p className="mt-3 rounded-btn border border-slate-200 bg-slate-50 p-2.5 text-sm text-slate-700">
              {pending.note}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => download(pending)}
              disabled={downloading === pending.id}
              className="rounded-btn border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              {downloading === pending.id ? t('completion.loading') : t('completion.open')}
            </button>
          </div>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-slate-700">{t('completion.decisionLabel')}</span>
            <textarea
              rows={2}
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
              placeholder={t('completion.decisionPlaceholder')}
              className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>

          {decideApi.failure && (
            <div className="mt-3">
              <ErrorNote>{decideApi.failure.message}</ErrorNote>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('Approved')}
              className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {t('completion.approve')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => decide('Rejected')}
              className="rounded-btn border border-ink px-4 py-2 text-sm font-medium text-ink transition hover:bg-red-50 disabled:opacity-50"
            >
              {t('completion.reject')}
            </button>
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <Card title={t('completion.historyTitle')}>
          <ul className="space-y-2">
            {history.map((submission) => (
              <li key={submission.id} className="rounded-btn border border-slate-200 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-800">{submission.document_name}</p>
                    <p className="text-xs text-slate-500">
                      {t('completion.role')}: {t(`role.${submission.approver_role}`)} ·{' '}
                      {formatBytes(submission.size_bytes)} · {formatDateTime(submission.created_at)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t('completion.submittedBy')}: {submission.submitted_by_name}
                    </p>
                    {submission.decided_by_name && (
                      <p className="text-xs text-slate-500">
                        {t('completion.decidedBy')}: {submission.decided_by_name}
                        {submission.decided_at ? ` · ${formatDateTime(submission.decided_at)}` : ''}
                      </p>
                    )}
                    {submission.decision_note && (
                      <p className="mt-1 text-xs text-slate-600">{submission.decision_note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                        STATUS_CLASS[submission.status] ?? 'bg-slate-200 text-slate-600 ring-slate-400'
                      }`}
                    >
                      {t(`completion.status.${submission.status}`)}
                    </span>
                    <button
                      type="button"
                      onClick={() => download(submission)}
                      disabled={downloading === submission.id}
                      className="rounded-btn border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {downloading === submission.id ? t('completion.loading') : t('completion.open')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
