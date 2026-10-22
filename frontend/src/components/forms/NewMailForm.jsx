/**
 * Letter intake.
 *
 * `day_stamp_no` is NOT on this form, and its absence is the design (D53). The
 * stamp is allocated by the server inside the same transaction that writes the
 * letter, so two clerks logging at the same instant get 0007 and 0008 rather
 * than both claiming 0007. A form field for it would be a field any user could
 * type any number into — and the server rejects the body with a 400 if it is
 * present, so the field would not even be decorative.
 *
 * `department_id` IS on this form, and it is required (D70). The department a
 * letter belongs to is normally written on the envelope, so the clerk logging it
 * at reception knows the answer — and the department is what decides which
 * subject clerk can see the letter at all. Leaving it to be set later meant a
 * letter was invisible to its own desk for as long as it sat unread, which is
 * how three letters were found stranded on 2026-10-02.
 *
 * It is a ROUTING choice, not a privilege one: it decides who sees the letter,
 * never what they may do with it, and the clerk keeps sight of everything they
 * log regardless. The forwarding Secretary can still correct a mis-route.
 *
 * The attachment allowlist and the 10 MB cap are surfaced BEFORE upload. The
 * server enforces both, so they are not the control — but a rejection after a
 * 9 MB upload on a slow connection teaches the user that the form is unreliable
 * rather than that they picked the wrong file.
 */
import { useEffect, useRef, useState } from 'react';

import * as categoryApi from '../../api/categoryApi.js';
import * as departmentApi from '../../api/departmentApi.js';
import * as mailApi from '../../api/mailApi.js';
import * as senderApi from '../../api/senderApi.js';
import { useApiError } from '../../hooks/useApiError.js';
import { isoToday } from '../../utils/dateUtils.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';
import { Modal } from '../common/Modal.jsx';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_MB, extensionOf } from '../../utils/fileTypes.js';

const SENDER_TYPES = Object.freeze([
  'Government Office',
  'Non-Government / Public',
  'Private Organization',
  'Judicial / Court',
]);

const PRIORITIES = Object.freeze(['Normal', 'Urgent', 'Confidential']);

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

/**
 * The form's own bounds, read once at module load.
 *
 * `max` is today: a letter cannot be received in the future. `min` is five years
 * back, matching the server's `receipt_date` validation — stated in the control
 * so the browser refuses the date before a round trip rather than after.
 */
const TODAY = isoToday();

export function NewMailForm({ onCreated }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    receipt_date: TODAY,
    letter_ref_no: '',
    sender_type: SENDER_TYPES[0],
    sender_name: '',
    subject: '',
    priority: 'Normal',
    category: 'General Administration',
    department_id: '',
  });
  const [departments, setDepartments] = useState([]);
  const [departmentsFailed, setDepartmentsFailed] = useState(false);
  const [senders, setSenders] = useState([]);
  const [sendersFailed, setSendersFailed] = useState(false);
  const [senderDialog, setSenderDialog] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const { failure, report, clear } = useApiError(t('new.failed'));
  const fileInput = useRef(null);

  // GET /departments is open to every signed-in user, so this needs no
  // permission of its own.
  useEffect(() => {
    let live = true;
    departmentApi
      .list()
      .then((rows) => {
        if (live) setDepartments(rows);
      })
      .catch(() => {
        // An empty picker with a stated reason beats an empty picker: the clerk
        // needs to know whether "no departments configured" or "the directory
        // did not load" is what they are looking at, because one of them is
        // fixable from the browser and the other is not.
        if (live) setDepartmentsFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // The sender directory. Read is open to every signed-in user, so a failure
  // here is a transport problem rather than a permission one, and it is stated
  // (the select stays disabled with a reason) rather than shown as an empty
  // picker the clerk would read as "no senders exist".
  useEffect(() => {
    let live = true;
    senderApi
      .list()
      .then((rows) => {
        if (live) setSenders(rows);
      })
      .catch(() => {
        if (live) setSendersFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // The category dictionary. Read is open to every signed-in user. A failure is
  // a transport problem, so the select stays usable with whatever the clerk has
  // (the pre-filled default) rather than blocking intake — a letter still needs
  // to be logged even when the directory could not be read.
  useEffect(() => {
    let live = true;
    categoryApi
      .list()
      .then((rows) => {
        if (!live) return;
        setCategories(rows);
        // Keep the pre-filled default when it is still a defined category;
        // otherwise fall back to the first one so the clerk is never left with a
        // value that no longer exists in the dictionary.
        setForm((current) => {
          if (rows.some((row) => row.name === current.category)) return current;
          const first = rows[0]?.name;
          return first ? { ...current, category: first } : current;
        });
      })
      .catch(() => {
        if (live) setCategoriesFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  /**
   * Selecting a sender fills the TYPE as well as the name.
   *
   * The type is a property of the office, not of the letter, so asking the
   * clerk to state "Government Office" again after they just named a
   * government office is a question already answered. They can still change it
   * in the Sender type field below.
   */
  function chooseSender(event) {
    const name = event.target.value;
    const match = senders.find((sender) => sender.name === name);
    setForm((current) => ({
      ...current,
      sender_name: name,
      sender_type: match ? match.sender_type : current.sender_type,
    }));
  }

  /**
   * A sender just added from the quick form: put it in the picker, select it,
   * and close the dialog. Sorting by name keeps the new row where the clerk
   * will look for it rather than appending it at the bottom of a long list.
   */
  function senderAdded(sender) {
    setSenders((current) => {
      const next = current.filter((item) => item.id !== sender.id);
      next.push(sender);
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
    setForm((current) => ({
      ...current,
      sender_name: sender.name,
      sender_type: sender.sender_type,
    }));
    setSenderDialog(false);
  }

  /** Validate one file. Returns an error string, or null when it is fine. */
  function reject(file) {
    const extension = extensionOf(file.name);

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `"${file.name}" is not an accepted format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      return `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${MAX_UPLOAD_MB} MB.`;
    }
    return null;
  }

  function accept(chosen) {
    setLocalError('');
    if (!chosen) {
      setFile(null);
      return;
    }

    const problem = reject(chosen);
    if (problem) {
      setLocalError(problem);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }
    setFile(chosen);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setLocalError('');
    clear();

    try {
      // FormData, not JSON. The route is multipart and the file rides in the
      // same request as the fields — the day stamp is allocated and the scan
      // stored inside one transaction, so a letter can never exist without the
      // scan the clerk attached to it.
      const result = await mailApi.create(
        { ...form, department_id: form.department_id === '' ? undefined : Number(form.department_id) },
        file
      );

      // The issued day stamp is shown, not navigated past. Allocating the next
      // number in the registry is the visible result of filing a letter, and a
      // form that redirects past its own success state throws that away.
      setIssued(result);
    } catch (error) {
       report(error, t('new.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (issued) {
    return (
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-6">
        <h2 className="text-lg font-semibold text-brand-400">{t('new.filed')}</h2>
        <p className="mt-1 text-sm text-brand-400">
          {t('new.dayStampIssued', { stamp: issued.day_stamp_no })}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onCreated(issued)}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {t('new.openLetter')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIssued(null);
              setFile(null);
              setProgress(0);
              if (fileInput.current) fileInput.current.value = '';
              setForm((current) => ({ ...current, receipt_date: TODAY, letter_ref_no: '', sender_name: '', subject: '' }));            }}
            className="rounded-btn border border-brand-300 bg-surface px-4 py-2 text-sm text-brand-400 transition hover:bg-brand-100"
          >
            {t('new.fileAnother')}
          </button>
        </div>
      </div>
    );
  }

  // The dropdown is the admin-defined categories. The clerk's current choice is
  // always kept as an option, so a letter carrying a category that has since been
  // removed from the dictionary is still visible and editable rather than
  // silently blank.
  const categoryOptions = (() => {
    const names = categories.map((category) => category.name);
    if (form.category && !names.includes(form.category)) names.push(form.category);
    return names.length > 0 ? names : [form.category].filter(Boolean);
  })();

  return (
    <>
      <form onSubmit={submit}>
        <section className="rounded-lg border border-slate-200 bg-surface shadow-sm">
          <header className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">
              {t('new.incoming')}
            </h2>
          </header>

          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t('new.receivedOn')}</span>
              <input type="date" value={form.receipt_date} max={TODAY} onChange={set('receipt_date')} className={INPUT} required />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t('new.senderReference')}</span>
              <input
                value={form.letter_ref_no}
                onChange={set('letter_ref_no')}
                className={INPUT}
                placeholder={t('new.referencePlaceholder')}
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t('new.department')}</span>
              <select
                value={form.department_id}
                onChange={set('department_id')}
                disabled={departmentsFailed || departments.length === 0}
                aria-label={t('new.departmentLabel')}
                className={`${INPUT} disabled:bg-slate-50 disabled:text-slate-500`}
                required
              >
                <option value="">
                  {departmentsFailed
                    ? t('new.departmentError')
                    : departments.length === 0
                      ? t('new.departmentLoading')
                      : t('new.departmentPlaceholder')}
                </option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              <span className="mt-0.5 block text-xs text-slate-500">
                {t('new.departmentHint')}
              </span>
            </label>

            <div className="block text-sm">
              <span className="font-medium text-slate-700">{t('new.sender')}</span>
              <div className="flex gap-2">
                <select
                  value={form.sender_name}
                  onChange={chooseSender}
                  disabled={sendersFailed}
                  className={`${INPUT} disabled:bg-slate-50 disabled:text-slate-500`}
                  required
                >
                  <option value="">
                    {sendersFailed
                      ? t('new.senderError')
                      : senders.length === 0
                        ? t('new.senderEmpty')
                        : t('new.senderSelect')}
                  </option>
                  {senders.map((sender) => (
                    <option key={sender.id} value={sender.name}>
                      {sender.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSenderDialog(true)}
                  aria-label={t('new.addSender')}
                  title={t('new.addSender')}
                  className="shrink-0 rounded-btn border border-slate-300 px-3 text-lg leading-none font-medium text-ink transition hover:bg-slate-50"
                >
                  +
                </button>
              </div>
              <span className="mt-0.5 block text-xs text-slate-500">
                {t('new.senderHint')}
              </span>
            </div>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t('new.senderType')}</span>
              <select value={form.sender_type} onChange={set('sender_type')} className={INPUT}>
                {SENDER_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">{t('new.subject')}</span>
              <textarea
                value={form.subject}
                onChange={set('subject')}
                rows={3}
                className={`${INPUT} resize-y`}
                placeholder={t('new.subjectPlaceholder')}
                required
              />
              <span className="mt-0.5 block text-xs text-slate-500">
                {t('new.languageHint')}
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t('new.priority')}</span>
              <select value={form.priority} onChange={set('priority')} className={INPUT}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">{t('new.category')}</span>
              <select value={form.category} onChange={set('category')} className={INPUT} required>
                {categoryOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {categoriesFailed && (
                <span className="mt-0.5 block text-xs text-slate-500">
                  {t('new.categoryError')}
                </span>
              )}
            </label>

            <div className="sm:col-span-2">
              <p className="text-sm font-medium text-slate-700">{t('new.attachment')}</p>

              {/* A real drop zone rather than a styled file input: the input itself
                  cannot receive a drop, so the visible area has to be a separate
                  element that forwards the file. The input stays in the DOM for
                  keyboard and screen-reader users — hiding it entirely would leave
                  the one mandatory attachment path reachable only by mouse. */}
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  accept(event.dataTransfer.files?.[0] ?? null);
                }}
                className={`mt-1 rounded-btn border-2 border-dashed px-4 py-6 text-center transition ${
                  dragging ? 'border-brand bg-amber-50' : 'border-slate-300 bg-slate-50'
                }`}
              >
                <p className="text-sm text-slate-600">
                  {t('new.dropHere')}
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  onChange={(event) => accept(event.target.files?.[0] ?? null)}
                  accept={ALLOWED_EXTENSIONS.join(',')}
                  className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-btn file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  {t('new.dropHelper')}
                </span>
                {file && (
                  <span className="mt-1 block text-xs font-medium text-slate-700">
                    {t('new.selectedFile', { name: file.name })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 p-5">
            {localError && <ErrorNote>{localError}</ErrorNote>}

            {failure && (
              <ErrorNote remedy={failure.remedy}>
                {failure.message}
                {/* A validation failure names the field the server objected to
                    (D62), so it is repeated next to the message rather than left
                    for the user to work out which box it meant. */}
                {failure.field && (
                  <span className="mt-0.5 block text-xs">{t('new.fieldError', { field: failure.field })}</span>
                )}
              </ErrorNote>
            )}

            {busy && progress > 0 && (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{t('new.uploading')} {progress}%</p>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="rounded-btn bg-brand px-5 py-2 font-medium text-ink transition hover:brightness-95 disabled:opacity-60"
            >
              {busy ? t('new.submitting') : t('new.submit')}
            </button>
          </div>
        </section>
      </form>

      <SenderDialog
        open={senderDialog}
        onClose={() => setSenderDialog(false)}
        onCreated={senderAdded}
      />
    </>
  );
}

/**
 * The quick-add form behind the sender picker's "+".
 *
 * It exists so that a sender the directory does not know yet does not force the
 * clerk to abandon the letter they are holding and go and create it elsewhere.
 * On success the parent selects the new sender and closes this — the point of
 * the form is to get the clerk back to the letter, so it does not linger on a
 * confirmation.
 */
function SenderDialog({ open, onClose, onCreated }) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [senderType, setSenderType] = useState(SENDER_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const { failure, report, clear } = useApiError(t('new.senderFailed'));

  // The dialog stays mounted while closed (Modal returns null, this component
  // does not), so a half-typed name from the previous open would otherwise be
  // waiting on the next one. Reset each time it opens.
  useEffect(() => {
    if (open) {
      setName('');
      setSenderType(SENDER_TYPES[0]);
      clear();
    }
  }, [open, clear]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    clear();
    try {
      const sender = await senderApi.create({ name, sender_type: senderType });
      onCreated(sender);
    } catch (error) {
      report(error, t('new.senderFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t('new.addSenderTitle')}
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
            form="sender-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink transition hover:brightness-95 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('new.senderSave')}
          </button>
        </>
      }
    >
      <form id="sender-form" onSubmit={submit} className="space-y-3">
        {failure && <ErrorNote remedy={failure.remedy}>{failure.message}</ErrorNote>}

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('new.senderName')}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`${INPUT} mt-1`}
            placeholder={t('new.senderNamePlaceholder')}
            autoFocus
            required
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-slate-700">{t('new.senderType')}</span>
          <select
            value={senderType}
            onChange={(event) => setSenderType(event.target.value)}
            className={`${INPUT} mt-1`}
          >
            {SENDER_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <span className="mt-0.5 block text-xs text-slate-500">
            {t('new.senderTypeHint')}
          </span>
        </label>
      </form>
    </Modal>
  );
}
