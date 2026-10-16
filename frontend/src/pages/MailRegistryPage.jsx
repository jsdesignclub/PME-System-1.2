/**
 * The Letter Registry — the module's main screen.
 *
 * Filters live in `MailContext`, not in this component, and that is the whole
 * design note: the path a clerk actually takes is filter, open a letter, press
 * Back. With page-local state the filters are gone on return, and a clerk who
 * has just rebuilt the same query twice concludes the registry is inconsistent
 * rather than that the page forgot what they typed.
 *
 * Two further pieces of state are page-local on purpose:
 *
 *  - `sort` is NOT in the context. It is a property of how this table is being
 *    read, not of the query the user built, and it is sent to the server as
 *    `sort_by`/`sort_dir` rather than applied to the 25 rows in the browser.
 *
 *  - `loading` is local too, deliberately set to `true` before every request so
 *    the table shows a skeleton instead of holding the previous page's rows while
 *    the next one loads. A registry showing stale rows under a new filter is
 *    worse than one that briefly shows nothing: the rows are plausible, and the
 *    user may act on one that is no longer in the result set.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { errorMessage } from '../api/axiosClient.js';
import * as categoryApi from '../api/categoryApi.js';
import { list, listAll, update as updateMail, remove as removeMail } from '../api/mailApi.js';
import { Card } from '../components/common/Card.jsx';
import { EmptyState } from '../components/common/EmptyState.jsx';
import { ErrorNote } from '../components/common/ErrorNote.jsx';
import { Modal } from '../components/common/Modal.jsx';
import { MailTable } from '../components/mail/MailTable.jsx';
import { PrintRegistryTable } from '../components/mail/PrintRegistryTable.jsx';
import { PAGE_SIZE, PRIORITIES, SENDER_TYPES, STATES, useMail } from '../context/MailContext.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { printDocument } from '../utils/printUtils.js';
import { downloadTextFile, registryCsv, registryFilename } from '../utils/registryExport.js';

/** The keys `BLANK_FILTERS` carries, in the order the form shows them. */
const FIELDS = ['search', 'status', 'priority', 'sender_type', 'category', 'from', 'to'];

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

export default function MailRegistryPage() {
  const { t } = useLanguage();
  const { canCreateMail, user, permissions } = useAuth();
  const { filters, applied, offset, setFilter, apply, adoptFilters, clearFilters, setOffset } = useMail();
  const canReadAllMail = permissions.includes('READ_ALL_MAIL');
  // A central clerk (a SUBJECT_CLERK flagged is_central_clerk) handles intake for
  // every department, so the registry must not be narrowed to their own
  // department locally — RLS already decides what they may see.
  const seesAllDepartments = canReadAllMail || Boolean(user?.is_central_clerk);

  const [searchParams] = useSearchParams();

  const seededFromUrl = useRef(false);
  useEffect(() => {
    if (seededFromUrl.current) return;
    seededFromUrl.current = true;

    adoptFilters(Object.fromEntries(searchParams.entries()));
  }, [adoptFilters, searchParams]);

  const [sort, setSort] = useState(null);
  const [result, setResult] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  // `exporting` is the action in flight ('csv' or 'print') rather than a bare
  // boolean, so the button that was pressed is the one that reads "Preparing…".
  const [exporting, setExporting] = useState(null);
  // The full filtered result set, held only long enough to print it. `null`
  // means "print what is on screen" — see `PrintRegistryTable`.
  const [printRows, setPrintRows] = useState(null);
  // Bumped to remount the print sheet, so a second print recaptures its time.
  const [printSeq, setPrintSeq] = useState(0);
  // The category dictionary, read once: it turns each row's category text into
  // the maximum days it allows, which is what tints an overdue row red.
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let live = true;
    categoryApi
      .list()
      .then((rows) => {
        if (live) setCategories(rows);
      })
      .catch(() => {
        // Without the dictionary no row can be judged overdue; that degrades to
        // the previous look rather than failing the registry.
      });
    return () => {
      live = false;
    };
  }, []);

  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setFailure('');
    setNotice('');

    list(applied, { limit: PAGE_SIZE, offset, sort }, { departmentId: user?.department_id, canReadAllMail: seesAllDepartments })
      .then((next) => {
        if (id === requestId.current) setResult(next);
      })
      .catch((problem) => {
        if (id === requestId.current) setFailure(errorMessage(problem));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [applied, offset, sort, user?.department_id, seesAllDepartments]);

  useEffect(load, [load]);

  const changeSort = useCallback((next) => {
    setSort(next);
    setOffset(0);
  }, [setOffset]);

  /**
   * Print the whole filtered result set.
   *
   * The rows are fetched first and handed to `PrintRegistryTable`, then the
   * effect below opens the dialog once they have painted. Printing the 25 rows
   * on screen instead would file a partial registry, which is worse than filing
   * nothing: it looks complete.
   */
  useEffect(() => {
    if (!printRows) return undefined;

    // One frame, so the sheet is in the DOM before `window.print()` reads it.
    const frame = requestAnimationFrame(() => {
      if (!printDocument()) setPrintRows(null);
    });

    // `afterprint` is the reliable signal that the dialog closed; without it the
    // full result set would stay mounted until the next navigation.
    const clear = () => setPrintRows(null);
    window.addEventListener('afterprint', clear);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', clear);
    };
  }, [printRows]);

  const exportOptions = { departmentId: user?.department_id, canReadAllMail: seesAllDepartments };

  async function handleExportCsv() {
    setExporting('csv');
    setFailure('');
    setNotice('');
    try {
      const rows = await listAll(applied, exportOptions);
      if (rows.length === 0) {
        setNotice(t('registry.exportEmpty'));
        return;
      }
      downloadTextFile(registryFilename('csv'), registryCsv(rows, t));
      setNotice(t('registry.exportReady', { count: rows.length }));
    } catch (problem) {
      setFailure(errorMessage(problem, t('registry.exportFailed')));
    } finally {
      setExporting(null);
    }
  }

  async function handlePrint() {
    setExporting('print');
    setFailure('');
    setNotice('');
    try {
      const rows = await listAll(applied, exportOptions);
      if (rows.length === 0) {
        setNotice(t('registry.exportEmpty'));
        return;
      }
      setPrintRows(rows);
      setPrintSeq((n) => n + 1);
    } catch (problem) {
      setFailure(errorMessage(problem, t('registry.exportFailed')));
    } finally {
      setExporting(null);
    }
  }

  async function saveEdit(id, payload) {
    setBusy(true);
    try {
      await updateMail(id, payload);
      setNotice('Letter updated');
      setEditing(null);
      load();
    } catch (problem) {
      setFailure(errorMessage(problem, 'The letter could not be updated.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await removeMail(deleting.id);
      setNotice('Letter deleted');
      setDeleting(null);
      load();
    } catch (problem) {
      setFailure(errorMessage(problem, 'The letter could not be deleted.'));
    } finally {
      setBusy(false);
    }
  }

  const isFiltered = FIELDS.some((key) => filters[key] !== '');

  return (
    <>
      <div className="no-print space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-ink">{t('registry.title')}</h1>
          {canCreateMail && (
            <Link
              to="/mail/new"
              className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink transition hover:brightness-95"
            >
              {t('registry.logLetter')}
            </Link>
          )}
        </div>

        {notice && (
          <p className="text-sm text-slate-700" role="status">
            {notice}
          </p>
        )}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        <Card
          title={t('registry.filters')}
          subtitle={isFiltered ? 'Filters apply automatically as you change them.' : undefined}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply();
            }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Field label={t('common.search')} hint="Day stamp, reference, subject or sender">
              <input
                value={filters.search}
                onChange={(event) => setFilter('search', event.target.value)}
                className={INPUT}
                placeholder="procurement"
              />
            </Field>

            <Field label="State">
              <select
                value={filters.status}
                onChange={(event) => setFilter('status', event.target.value, { immediate: true })}
                className={INPUT}
              >
                <option value="">{t('registry.allStates')}</option>
                {STATES.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Priority">
              <select
                value={filters.priority}
                onChange={(event) => setFilter('priority', event.target.value, { immediate: true })}
                className={INPUT}
              >
                <option value="">{t('registry.allPriorities')}</option>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sender type">
              <select
                value={filters.sender_type}
                onChange={(event) => setFilter('sender_type', event.target.value, { immediate: true })}
                className={INPUT}
              >
                <option value="">{t('registry.allSenders')}</option>
                {SENDER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Category">
              <input
                value={filters.category}
                onChange={(event) => setFilter('category', event.target.value)}
                className={INPUT}
                placeholder="Procurement"
              />
            </Field>

            <Field label="Received from">
              <input
                type="date"
                value={filters.from}
                onChange={(event) => setFilter('from', event.target.value, { immediate: true })}
                className={INPUT}
              />
            </Field>

            <Field label="Received to">
              <input
                type="date"
                value={filters.to}
                onChange={(event) => setFilter('to', event.target.value, { immediate: true })}
                className={INPUT}
              />
            </Field>

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t('common.clear')}
              </button>
            </div>
          </form>
        </Card>

        {notice && (
          <p className="text-sm text-slate-700" role="status">
            {notice}
          </p>
        )}
        {failure && <ErrorNote>{failure}</ErrorNote>}

        <Card
          title={`${result.total} ${t('mail.title')}`}
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {result.total > 0 && (
                <span className="text-sm text-slate-500">
                  {t('common.showing', { from: offset + 1, to: Math.min(offset + PAGE_SIZE, result.total), total: result.total })}
                </span>
              )}
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={exporting !== null || result.total === 0}
                className="rounded-btn border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting === 'csv' ? t('registry.exporting') : t('registry.exportCsv')}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={exporting !== null || result.total === 0}
                className="rounded-btn border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting === 'print' ? t('registry.exporting') : t('registry.exportPdf')}
              </button>
            </div>
          }
        >
          <MailTable
            rows={result.rows}
            categories={categories}
            loading={loading}
            total={result.total}
            offset={offset}
            pageSize={PAGE_SIZE}
            sort={sort}
            onSortChange={changeSort}
            onOffsetChange={setOffset}
            onEdit={setEditing}
            onDelete={setDeleting}
            empty={
              <EmptyState title={t('registry.noMatches')}>
                {t('registry.clearFilters')}
              </EmptyState>
            }
          />
        </Card>

        {editing && (
          <EditLetterDialog
            letter={editing}
            busy={busy}
            onClose={() => setEditing(null)}
            onSave={saveEdit}
          />
        )}
        {deleting && (
          <Modal
            title={`Delete ${deleting.day_stamp_no}`}
            onClose={() => setDeleting(null)}
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setDeleting(null)}
                  className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="rounded-btn bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger-hover disabled:opacity-60"
                  disabled={busy}
                >
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              </>
            }
          >
            <p className="text-sm text-slate-700">
              Delete <span className="font-mono">{deleting.day_stamp_no}</span> — <span className="font-medium">{deleting.subject}</span>?
            </p>
            <p className="mt-2 text-xs text-slate-500">
              This removes the letter and any scanned attachment. This cannot be undone.
            </p>
          </Modal>
        )}
      </div>
    <PrintRegistryTable key={printSeq} rows={printRows ?? result.rows} filters={applied} />
    </>
  );
}

function EditLetterDialog({ letter, busy, onClose, onSave }) {
  const [subject, setSubject] = useState(letter.subject ?? '');
  const [senderName, setSenderName] = useState(letter.sender_name ?? '');
  const [senderType, setSenderType] = useState(letter.sender_type ?? 'Government Office');
  const [receiptDate, setReceiptDate] = useState(letter.receipt_date ?? '');
  const [priority, setPriority] = useState(letter.priority ?? 'Normal');
  const [category, setCategory] = useState(letter.category ?? 'General Administration');
  const [letterRef, setLetterRef] = useState(letter.letter_ref_no ?? '');
  const [departmentId, setDepartmentId] = useState(letter.department_id ?? '');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    let live = true;
    categoryApi
      .list()
      .then((rows) => {
        if (live) setCategories(rows);
      })
      .catch(() => {
        // The select stays usable with the letter's existing category; the
        // registry must not block an edit because the dictionary did not load.
      });
    return () => {
      live = false;
    };
  }, []);

  // Keep the letter's current category as an option even if it is no longer in
  // the dictionary, so the value is never silently blanked.
  const categoryOptions = (() => {
    const names = categories.map((item) => item.name);
    if (category && !names.includes(category)) names.push(category);
    return names.length > 0 ? names : [category].filter(Boolean);
  })();

  async function submit(event) {
    event.preventDefault();
    const payload = {
      subject: subject.trim(),
      sender_name: senderName.trim(),
      sender_type: senderType,
      receipt_date: receiptDate || undefined,
      priority,
      category: category.trim() || undefined,
      letter_ref_no: letterRef.trim() || undefined,
      department_id: departmentId ? Number(departmentId) : undefined,
    };
    await onSave(letter.id, payload);
  }

  return (
    <Modal
      title={`Edit ${letter.day_stamp_no}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-letter-form"
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink hover:bg-brand-700 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="edit-letter-form" onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Subject</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className={INPUT}
            required
            maxLength={2000}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Sender name</span>
          <input
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
            className={INPUT}
            required
            maxLength={200}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Sender type</span>
          <select value={senderType} onChange={(event) => setSenderType(event.target.value)} className={INPUT}>
            {SENDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Receipt date</span>
          <input
            type="date"
            value={receiptDate}
            onChange={(event) => setReceiptDate(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className={INPUT}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Category</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={INPUT}
          >
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Reference</span>
          <input
            value={letterRef}
            onChange={(event) => setLetterRef(event.target.value)}
            className={INPUT}
            maxLength={100}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Department id</span>
          <input
            type="number"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            className={INPUT}
          />
        </label>
      </form>
    </Modal>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
