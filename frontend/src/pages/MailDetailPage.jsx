/**
 * One letter: everything about it, and every move available on it.
 *
 * The centre of the phase, and the page where the most could go wrong. Three
 * rules hold it together:
 *
 *  1. Every button traces to `available_actions` (D61). The server computes that
 *     array from the same transition table it enforces with, so a button can
 *     never appear for a move that would 409. Nothing on this page is derived
 *     from `status` and `role` in the browser.
 *  2. No `src` or `href` points at an API URL (D64). Attachment bytes go through
 *     `useObjectUrl` or an explicit download, both of which send the bearer.
 *  3. Letter text is rendered as text, never as markup (D66). Minutes are
 *     free text from an officer and are printed into a government document.
 *
 * Q7 — CONFIDENTIAL LETTERS. Answered 2026-09-30: **hidden entirely** from
 * SUBJECT_CLERK and OFFICER, implemented server-side in `mailScope` as a filter
 * within the caller's existing scope. The consequence here is that a confidential
 * letter is simply not in the caller's registry and its detail route answers
 * `404` — the same shape D29 uses for an unknown NIC, so probing ids reveals
 * nothing about which letters exist. There is deliberately NO redacted view: a
 * redacted body is a second projection of the letter, and a partial view of a
 * confidential document is a weaker guarantee than no view.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import * as categoryApi from '../api/categoryApi.js';
import * as mailApi from '../api/mailApi.js';
import { useMail } from '../context/MailContext.jsx';
import { useApiError } from '../hooks/useApiError.js';
import { useAuth } from '../hooks/useAuth.js';
import { useDutyMatcher } from '../hooks/useDutyMatcher.js';
import { formatDate, formatDateTime, addDays } from '../utils/dateUtils.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { Card } from '../components/common/Card.jsx';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { PriorityBadge } from '../components/common/PriorityBadge.jsx';
import { Spinner } from '../components/common/Spinner.jsx';
import { StatusBadge } from '../components/common/StatusBadge.jsx';
import { useToast } from '../components/common/Toast.jsx';
import { AddMinutesForm } from '../components/forms/AddMinutesForm.jsx';
import { AttachmentList } from '../components/mail/AttachmentList.jsx';
import { CompletionApprovalPanel } from '../components/mail/CompletionApprovalPanel.jsx';
import { DeadlineClock } from '../components/mail/DeadlineClock.jsx';
import { DutyMatcherBox } from '../components/mail/DutyMatcherBox.jsx';
import { ForwardToAoPanel } from '../components/mail/ForwardToAoPanel.jsx';
import { MinutesTimeline } from '../components/mail/MinutesTimeline.jsx';
import { PrintButton, PrintMinuteSlip } from '../components/mail/PrintMinuteSlip.jsx';
import { StatusRail } from '../components/mail/StatusRail.jsx';
import { OfficerActionPanel } from '../components/mail/OfficerActionPanel.jsx';


export default function MailDetailPage() {
  const { t } = useLanguage();
  const { id } = useParams();
  const { notify } = useToast();
  const { user, permissions, hasPermission } = useAuth();

  const [detail, setDetail] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [categoryInfo, setCategoryInfo] = useState(null);
  const { failure, report, clear } = useApiError(t('mail.couldNotOpen'));
  const { remember } = useMail();

  const load = useCallback(() => {
    clear();
    return mailApi
      .getById(id)
      .then((data) => {
        setDetail(data);
        // Cached on every LOAD, not just the first, so pressing Back and returning
        // re-reads the server anyway if the caller refreshes. The cache exists to
        // spare a re-fetch on navigation, and `remember` replaces the entry
        // wholesale — a cached letter whose status moved is exactly the stale read
        // a detail cache is capable of causing.
        remember(id, data);
      })
      .catch((error) => report(error, t('mail.couldNotOpen')));
  }, [id, clear, report, remember, t]);

  useEffect(() => {
    load();
  }, [load]);

  // The letter stores only the category NAME, so the action to take and the
  // maximum days to complete it come from the dictionary by name. A letter whose
  // category was since removed shows neither, rather than an error.
  useEffect(() => {
    let live = true;
    const name = detail?.category;
    if (!name) {
      setCategoryInfo(null);
      return undefined;
    }
    categoryApi
      .getByName(name)
      .then((row) => {
        if (live) setCategoryInfo(row);
      })
      .catch(() => {
        // A missing action is not a reason to fail the letter; the card above
        // already carries everything the registry knows about it.
        if (live) setCategoryInfo(null);
      });
    return () => {
      live = false;
    };
  }, [detail?.category]);

  if (failure && !detail) {
    // A 404 here is the Q7 shape as much as a deleted letter: the caller's scope
    // does not include it. The message does not distinguish them, because saying
    // "it exists but you may not see it" is exactly the leak Q7 exists to close.
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorNote remedy={failure.remedy} onRetry={failure.retryable ? load : undefined}>
          {failure.message}
        </ErrorNote>
        <Link to="/mail" className="text-sm font-medium text-ink underline hover:text-brand">
          {t('mail.backToRegistry')}
        </Link>
      </div>
    );
  }

  if (!detail) return <Spinner label={t('mail.opening')} />;

  const {
    minutes = [],
    attachments = [],
    completion_submissions: completionSubmissions = [],
    audit = [],
    available_actions: actions = [],
    status = 'Unknown',
    ...mail
  } = detail || {};
  mail.status = status;
  const canAssign = actions.some((a) => a.action === 'assign');
  const canWriteMinutes = actions.some((a) => a.action === 'add_minutes');
  const canForwardToAo = actions.some((a) => a.action === 'forward_to_ao');

  // The upload right, expressed the way `mailController.addAttachments` enforces
  // it: CREATE_MAIL (the clerk who logged the letter) OR UPDATE_ACTION_STATUS
  // (the officer working it). Neither, so a SECRETARY sees a read-only list — the
  // server refuses the POST with the same 403, so this is a hint, not the gate.
  // `Completed` is archival and refuses attachments too, hence the third clause.
  const canAttach =
    status !== 'Completed' &&
    (hasPermission('CREATE_MAIL') || hasPermission('UPDATE_ACTION_STATUS'));

  // The last day the category's final action may be taken on, if the letter's
  // category defines a maximum. Shared by the metadata field and the clock.
  const completionDue =
    categoryInfo?.max_days != null ? addDays(mail.receipt_date, categoryInfo.max_days) : null;

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/mail" className="text-sm font-medium text-ink underline hover:text-brand">
            {t('mail.backToRegistry')}
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold text-ink">
            <span className="font-mono">{mail.day_stamp_no}</span>
            <StatusBadge status={mail.status} endorserRole={mail.endorser_role} />
            <PriorityBadge priority={mail.priority} />
          </h1>
          <p className="mt-1 text-slate-700">{mail.subject}</p>
        </div>

        <PrintButton />
      </div>

      <StatusRail
        status={status}
        hasMinutes={minutes.length > 0}
        availableActions={actions}
        endorserRole={mail.endorser_role}
      />

      {completionDue && status !== 'Completed' && (
        <div className="no-print">
          <DeadlineClock dueDate={completionDue} allowedDays={categoryInfo.max_days} />
        </div>
      )}

      {failure && (
        <ErrorNote remedy={failure.remedy} onRetry={failure.retryable ? load : undefined}>
          {failure.message}
        </ErrorNote>
      )}

      <div className="no-print grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title={t('mail.title')}>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label={t('mail.receivedOn')} value={formatDate(mail.receipt_date)} />
              <Field label={t('mail.senderReference')} value={mail.letter_ref_no ?? '—'} />
              <Field label={t('mail.senderType')} value={mail.sender_type} />
              <Field label={t('mail.sender')} value={mail.sender_name} />
              <Field label={t('mail.category')} value={mail.category} />
              {categoryInfo?.action_to_take && (
                <Field label={t('mail.categoryAction')} value={categoryInfo.action_to_take} />
              )}
              {categoryInfo?.max_days != null && (
                <Field
                  label={t('mail.categoryDue')}
                  value={
                    completionDue
                      ? t('mail.categoryDueValue', { days: categoryInfo.max_days, date: formatDate(completionDue) })
                      : t('mail.categoryMaxDaysOnly', { days: categoryInfo.max_days })
                  }
                />
              )}
              <Field label={t('mail.loggedBy')} value={mail.created_by?.full_name ?? '—'} />
              <Field label={t('mail.registry')} value={mail.department?.name ?? '—'} />
              <Field label={t('mail.assignedOfficer')} value={mail.assigned_officer?.full_name ?? t('mail.notYetAssigned')} />
              {mail.assigned_date && <Field label={t('mail.assignedOn')} value={formatDateTime(mail.assigned_date)} />}
              {mail.completion_date && <Field label={t('mail.completedOn')} value={formatDateTime(mail.completion_date)} />}
            </dl>
          </Card>

          {/*
            THE LETTER ITSELF, and the reason this sits here rather than inside
            `OfficerActionPanel`, where the only other mount point for it lives.

            `mail_records` has no body column. Everything the registry knows about a
            letter is the metadata above plus `subject`; the letter's actual content
            is the scan in `mail_attachments`. So for a SECRETARY this card was
            unreachable: `OfficerActionPanel` renders only when `start` or
            `complete` is available, both `officerOnly: true` and gated on
            UPDATE_ACTION_STATUS — which SECRETARY does not hold. The Secretary
            could reach the letter, read its day stamp and subject, and write the
            endorsement without ever seeing what they were endorsing.

            `mailStateMachine.js` states the intent plainly — "Reviewed is the act
            of a Secretary reading a letter and writing minutes" — so the read is
            part of the step, not an optional extra. It is placed ABOVE the minutes
            form for that reason: read, then endorse.

            Placement is also the security answer. This mounts for every role that
            can open the letter, and `GET /:id/attachments/:attachmentId` applies
            the same `mailScope` predicate as the letter itself, so an executive
            sees exactly the scans they were already cleared to see and a
            confidential letter is still a 404 for anyone below READ_ALL_MAIL.

            `canUpload` mirrors the server's own OR at
            `mailController.addAttachments` — CREATE_MAIL (the logger) or
            UPDATE_ACTION_STATUS (the officer), never both. SECRETARY holds
            neither, so an executive gets a read-only list. That is deliberate and
            not an oversight: appending to the file of record is the logger's and
            the officer's right, and viewing it is the Secretary's.
          */}
          <AttachmentList
            letterId={mail.id}
            attachments={attachments ?? []}
            canUpload={canAttach}
            onChanged={load}
          />

          <Card title={t('minutes.title')}>
            <MinutesTimeline minutes={minutes} audit={audit} />
          </Card>

          {canWriteMinutes && (
        <AddMinutesForm
          letterId={mail.id}
          departmentId={mail.department_id}
          letterStatus={status}
          onSaved={load}
        />
      )}

          <NotesPanel mail={mail} onChanged={load} notify={notify} />
        </div>

        <div className="space-y-5">
          {canForwardToAo && (
            <ForwardToAoPanel letter={mail} notify={notify} onChanged={load} />
          )}

          {canAssign && (
            <AssignPanel
              mail={mail}
              selected={assigning}
              onSelect={setAssigning}
              onChanged={load}
              notify={notify}
              user={user}
              permissions={permissions}
            />
          )}

          {/* A subject clerk may take the letter as the EXECUTOR instead of
              routing it on: one press assigns it to themselves, and the normal
              officer path (start -> progress note -> submit completion) opens
              because they hold UPDATE_ACTION_STATUS.

              Deliberately NOT guarded by "assigned_officer_id !== me": a branch
              clerk who received the letter through routeToClerk() already has
              their id in that column (it is the routing pointer), and that is
              exactly the clerk who needs this button. Once they press it the
              status leaves 'Forwarded to Subject', `assign` disappears from the
              action list and canAssign hides the card on its own. */}
          {canAssign && user?.role === 'SUBJECT_CLERK' && (
            <SelfAssignCard mail={mail} user={user} onChanged={load} notify={notify} />
          )}

          <DutyMatcherPanel letterId={mail.id} selected={assigning} onSelect={setAssigning} canAssign={canAssign} />

          {actions.some((a) => a.action === 'start') && (
            <OfficerActionPanel letter={mail} actions={actions} onChanged={load} />
          )}

          <CompletionApprovalPanel
            letter={mail}
            actions={actions}
            submissions={completionSubmissions}
            onChanged={load}
          />

          {!actions.some((a) =>
            ['start', 'submit_completion', 'approve_completion', 'reject_completion'].includes(a.action),
          ) &&
            !canWriteMinutes &&
            !canAssign &&
            !canForwardToAo && (
              <Card title={t('nextStep.title')}>
                <p className="text-sm text-slate-600">
                  {status === 'Completed'
                    ? t('nextStep.closed')
                    : t('nextStep.otherRole')}
                </p>
              </Card>
            )}
        </div>
      </div>

      {/* Always mounted, hidden on screen, revealed by @media print. See
          PrintMinuteSlip: mounting this on demand is a race the dialog can lose. */}
      <PrintMinuteSlip mail={mail} minutes={minutes} />
    </div>
  );
}

/** The matcher, with the assignment state shared with the assign panel above it. */
function DutyMatcherPanel({ letterId, selected, onSelect, canAssign }) {
  const { result, loading, error } = useDutyMatcher(letterId);

  return (
    <DutyMatcherBox
      result={result}
      loading={loading}
      error={error}
      selected={selected}
      onSelect={onSelect}
      canAssign={canAssign}
    />
  );
}

/**
 * Assignment: an explicit officer choice, then an explicit press.
 *
 * Selecting a suggestion does NOT assign (D72). A letter routed to an officer
 * because a clerk was reading a list is a letter nobody decided on, and the
 * registry would show an `Assigned` state that no human chose.
 */
function AssignPanel({ mail, selected, onSelect, onChanged, notify, user, permissions }) {
  const { t } = useLanguage();
  const [targets, setTargets] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Ticked only when the clerk should WORK the letter instead of passing it on.
  const [executorMode, setExecutorMode] = useState(false);
  const { failure, run, clear } = useApiError(t('assign.failed'));

  useEffect(() => {
    let cancelled = false;
    const canReadAllMail = permissions.includes('READ_ALL_MAIL');
    // A central clerk may assign an officer (or route to a branch clerk) from any
    // department; an ordinary clerk only within their own.
    const seesAllDepartments = canReadAllMail || Boolean(user?.is_central_clerk);
    const departmentId = seesAllDepartments ? undefined : user?.department_id;

    mailApi
      // `includeClerks` lists BRANCH subject clerks alongside the officers, so the
      // main clerk may either assign an officer directly or hand the letter to a
      // branch clerk, who then assigns one of their own branch's officers.
      .officers({ limit: 100, departmentId, includeClerks: true })
      .then((rows) => {
        if (!cancelled) setTargets(rows);
      })
      .catch(() => {
        if (!cancelled) setTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.department_id, user?.is_central_clerk, permissions]);

  const officerTargets = targets.filter((person) => person.role !== 'SUBJECT_CLERK');
  // Only BRANCH clerks are routing targets: a central clerk already sees every
  // letter, and a clerk never routes to themselves. Every clerk still appears as
  // an EXECUTOR option when the clerk-as-executor box is ticked.
  const clerkTargets = targets.filter(
    (person) =>
      person.role === 'SUBJECT_CLERK' &&
      !person.is_central_clerk &&
      person.id !== user?.id,
  );
  const selectedTarget = targets.find((person) => person.id === selected);

  async function assign() {
    if (!selected) return;
    const target = targets.find((person) => person.id === selected);

    // A clerk is picked for one of two DIFFERENT jobs, and the status decides
    // which one the receiving clerk can act on:
    //
    //  * ROUTE (default): status stays 'Forwarded to Subject', the letter's
    //    department moves to the clerk — the branch clerk then sees the Assign
    //    box and picks one of their own branch's officers.
    //  * EXECUTOR: status moves to 'Assigned' — the clerk works the letter
    //    themselves exactly like an officer (start, progress note, completion).
    const toClerk = target?.role === 'SUBJECT_CLERK';
    const asExecutor = toClerk && executorMode;

    setBusy(true);
    const result = await run(() =>
      !toClerk || asExecutor
        ? mailApi.assign(mail.id, selected)
        : mailApi.routeToClerk(mail.id, target),
    );
    setBusy(false);

    if (result) {
      // The routing note is a SECOND request on purpose: the assign route takes
      // only `officer_user_id`, and a note that silently failed to save would be
      // worse than asking a clerk to press Save twice.
      if (note.trim() !== '') {
        await run(() => mailApi.updateNotes(mail.id, 'subject_clerk_note', note.trim()));
      }
      onSelect(null);
      setExecutorMode(false);
      setNote('');
      onChanged();
      notify(
        toClerk && !asExecutor
          ? t('assign.routedToClerk', { name: target.full_name })
          : t('assign.assigned', { name: target.full_name }),
        'success',
      );
    }
  }

  return (
    <Card title={t('assign.title')}>
      <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('assign.officerLabel')}</span>
        <select
          value={selected ?? ''}
          onChange={(event) => {
            onSelect(event.target.value ? event.target.value : null);
            setExecutorMode(false);
          }}
          className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
        >
          <option value="">{t('assign.choose')}</option>
          {officerTargets.length > 0 && (
            <optgroup label={t('assign.officersGroup')}>
              {officerTargets.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name} — {person.section_name ?? person.designation}
                </option>
              ))}
            </optgroup>
          )}
          {clerkTargets.length > 0 && (
            <optgroup label={t('assign.clerksGroup')}>
              {clerkTargets.map((clerk) => (
                <option key={clerk.id} value={clerk.id}>
                  {clerk.full_name} — {clerk.department?.name ?? clerk.designation}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {selectedTarget?.role === 'SUBJECT_CLERK' && (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={executorMode}
            onChange={(event) => setExecutorMode(event.target.checked)}
            className="mt-0.5"
          />
          <span>{t('assign.clerkAsExecutor')}</span>
        </label>
      )}

      <label className="mt-3 block text-sm">
          <span className="font-medium text-slate-700">{t('assign.routingNote')}</span>
        <textarea
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('assign.routingHint')}
          className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
        />
      </label>

      {failure && (
        <div className="mt-3">
          <ErrorNote remedy={failure.remedy} onRetry={failure.retryable ? onChanged : undefined}>
            {failure.message}
          </ErrorNote>
        </div>
      )}

      <button
        type="button"
        disabled={busy || !selected}
        onClick={() => {
          clear();
          assign();
        }}
        className="mt-3 w-full rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? t('assign.submitting') : t('assign.submit')}
      </button>
    </Card>
  );
}

/**
 * "Assign this letter to myself" — the subject clerk taking the letter as the
 * EXECUTOR rather than routing it on.
 *
 * One press: `mailApi.assign` with the clerk's own id moves the letter to
 * 'Assigned' with themselves on `assigned_officer_id`. The state machine then
 * offers `start`, and because the clerk holds UPDATE_ACTION_STATUS the whole
 * officer path opens (start -> progress note -> submit completion). Shown while
 * the letter is at 'Forwarded to Subject' (canAssign) — including letters that
 * were ROUTED to this clerk, whose assigned_officer_id already holds their id.
 * The card disappears on its own once the status leaves 'Forwarded to Subject',
 * because the `assign` action (and so canAssign) goes away with it.
 */
function SelfAssignCard({ mail, user, onChanged, notify }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const { failure, run, clear } = useApiError(t('assign.failed'));

  async function take() {
    setBusy(true);
    const result = await run(() => mailApi.assign(mail.id, user.id));
    setBusy(false);
    if (result) {
      onChanged();
      notify(t('assign.selfAssigned'), 'success');
    }
  }

  return (
    <Card title={t('assign.toSelf')}>
      <p className="text-sm text-slate-600">{t('assign.toSelfHint')}</p>
      {failure && (
        <div className="mt-3">
          <ErrorNote remedy={failure.remedy} onRetry={failure.retryable ? take : undefined}>
            {failure.message}
          </ErrorNote>
        </div>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          clear();
          take();
        }}
        className="mt-3 w-full rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? t('assign.submitting') : t('assign.toSelf')}
      </button>
    </Card>
  );
}

/**
 * The two note columns.
 *
 * Which one is editable is decided by the PERMISSION LIST and by whether this
 * user is the letter's assigned officer. Both conditions, not either: an officer
 * permission alone is not enough, because an officer who is not this letter's
 * officer must not write into its progress note — the server would refuse with a
 * 403, and showing a field that always fails is a 403 waiting to happen.
 */
function NotesPanel({ mail, onChanged, notify }) {
  const { t } = useLanguage();
  const { user, permissions } = useAuth();

  const mayWriteClerkNote = permissions.includes('ASSIGN_OFFICER');
  const isAssignedOfficer = mail.assigned_officer_id === user?.id;
  const mayWriteOfficerNote = permissions.includes('UPDATE_ACTION_STATUS') && isAssignedOfficer;

  const [clerkNote, setClerkNote] = useState(mail.subject_clerk_note ?? '');
  const [officerNote, setOfficerNote] = useState(mail.officer_status_note ?? '');
  const { run } = useApiError(t('notes.saveFailed'));

  async function save(field, value) {
    const saved = await run(() => mailApi.updateNotes(mail.id, field, value));
    if (saved) {
      onChanged();
      notify('Note saved.', 'success');
    }
  }

  if (!mayWriteClerkNote && !mayWriteOfficerNote) {
    return (
      <Card title={t('notes.title')}>
        <dl className="space-y-3 text-sm">
          <Field label={t('notes.subjectClerk')} value={mail.subject_clerk_note ?? '—'} />
          <Field label={t('notes.officer')} value={mail.officer_status_note ?? '—'} />
        </dl>
      </Card>
    );
  }

  return (
    <Card title="Notes">
      <div className="space-y-4">
        {mayWriteClerkNote && (
           <NoteEditor
            label={t('notes.subjectClerkLabel')}
            hint={t('notes.clerkHint')}
            value={clerkNote}
            onChange={setClerkNote}
            onSave={(text) => save('subject_clerk_note', text)}
          />
        )}
        {mayWriteOfficerNote && (
          <NoteEditor
            label={t('notes.officerLabel')}
            hint={t('notes.officerHint')}
            value={officerNote}
            onChange={setOfficerNote}
            onSave={(text) => save('officer_status_note', text)}
          />
        )}
      </div>
    </Card>
  );
}

function NoteEditor({ label, hint, value, onChange, onSave }) {
  const { t } = useLanguage();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <div>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <textarea
          rows={3}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setDirty(true);
          }}
          className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
        />
        <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>
      </label>
      <button
        type="button"
        disabled={!dirty || busy}
        onClick={async () => {
          setBusy(true);
          // An empty value CLEARS the note rather than being ignored: a clerk who
          // deletes the text means to remove it, and silently keeping the old
          // text is worse than clearing it.
          if (await onSave(value)) setDirty(false);
          setBusy(false);
        }}
        className="mt-1.5 rounded-btn border border-ink px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-brand hover:text-white disabled:opacity-40"
      >
        {busy ? t('notes.saving') : t('notes.save')}
      </button>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  );
}
