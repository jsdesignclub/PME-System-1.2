/**
 * Write the endorsement, and route the letter.
 *
 * The four instruction types are spec §7.2's example and parent plan task 3.16's
 * list. They are CHIPS, not an enum: the API accepts free text, and a ministry
 * that wants a fifth instruction type should be able to type it rather than
 * blocked by a dropdown. The presets are the common four, not a whitelist.
 *
 * The body sent is exactly `{ instruction_type, minutes_text, department_id }`.
 * `author_name` and `author_role` are deliberately absent: the server derives
 * them from the token, and sending them is a 400 (Phase 2 D63). Forging
 * authorship is not merely discouraged, it is unrepresentable.
 *
 * WHY THERE IS A DEPARTMENT PICKER HERE. The department is chosen at INTAKE —
 * reception reads it off the envelope — and this picker starts on that value, so
 * the Secretary normally just confirms it. They change it when reception filed
 * the letter under the wrong desk, which is the correction path and the only
 * one there is: `forward` is the one-way `Logged -> Forwarded to Subject` edge,
 * so a letter mis-routed at intake could not otherwise be fixed through the API.
 *
 * Sending the field is optional and the server treats an absent one as "keep
 * what intake recorded". It is pre-filled rather than optional purely so the
 * value is on screen and the Secretary can see whether it is right — a
 * correction nobody notices is not a correction.
 *
 * The body sent is `{ instruction_type, minutes_text, department_id }`.
 * `author_name` and `author_role` are deliberately absent: the server derives
 * them from the token, and sending them is a 400 (Phase 2 D63). Forging
 * authorship is not merely discouraged, it is unrepresentable.
 *
 * The panel says plainly that this ALSO forwards the letter, because it does —
 * one action server-side, one transaction. A Secretary who does not know their
 * endorsement moves the status will be surprised by it exactly once, and that
 * surprise is worth one sentence of explanation.
 */
import { useEffect, useState } from 'react';

import * as departmentApi from '../../api/departmentApi.js';
import * as mailApi from '../../api/mailApi.js';
import { useApiError } from '../../hooks/useApiError.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';

const INSTRUCTION_PRESETS = Object.freeze([
  'For Immediate Report',
  'Prepare Draft Reply',
  'For Information',
  'For Necessary Action',
]);

/** Over this, the text is a second letter rather than an endorsement. */
const SOFT_LIMIT = 2000;

export function AddMinutesForm({ letterId, departmentId: currentDepartmentId, onSaved }) {
  const { t } = useLanguage();
  const [instruction, setInstruction] = useState(INSTRUCTION_PRESETS[0]);
  const [text, setText] = useState('');
  const [departmentId, setDepartmentId] = useState(currentDepartmentId ?? '');
  const [departments, setDepartments] = useState([]);
  const [departmentsFailed, setDepartmentsFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { failure, run, clear } = useApiError(t('new.failed'));

  // GET /departments is open to every signed-in user, so this needs no
  // permission of its own. Loading here rather than passing the list down from
  // the page keeps this form self-contained: it is the only consumer, and the
  // alternative is a prop every future caller has to remember to thread.
  useEffect(() => {
    let live = true;
    departmentApi
      .list()
      .then((rows) => {
        if (live) setDepartments(rows);
      })
      .catch(() => {
        // A failure here leaves the picker empty, and an empty picker cannot be
        // submitted — so the form degrades to "cannot forward yet" with a stated
        // reason, rather than to a submit that 400s on a missing id. A silent
        // empty <select> would look like "this letter has no departments".
        if (live) setDepartmentsFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const over = text.length > SOFT_LIMIT;

  // A letter with no department is the one case where the blank selection is
  // NOT "keep what intake chose" - there is nothing to keep. Sending it anyway
  // produces a 400 naming a field the Secretary cannot see on this form, so the
  // button stays disabled until a department is actually chosen.
  const needsDepartment = !currentDepartmentId;
  const canSubmit = text.trim() !== '' && !departmentsFailed && (!needsDepartment || departmentId !== '');

  async function submit() {
    setBusy(true);
    const payload = {
      instruction_type: instruction,
      minutes_text: text.trim(),
      department_id: departmentId === '' ? undefined : Number(departmentId),
    };
    console.log('AddMinutesForm: submitting', payload);
    const saved = await run(() => mailApi.addMinutes(letterId, payload));
    setBusy(false);

    if (saved) {
      console.log('AddMinutesForm: saved successfully');
      setText('');
      onSaved();
    } else {
      console.log('AddMinutesForm: save failed, failure state set');
    }
  }

  return (
    <section className="no-print rounded-lg border border-slate-200 bg-surface shadow-sm">
      <header className="border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-ink uppercase">
          {t('minutes.formTitle')}
        </h2>
      </header>

      <div className="space-y-3 p-5">
        <p className="text-sm text-slate-600">
          {t('minutes.formHint')}
        </p>

        <div>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t('minutes.department')}</span>
            <select
              value={departmentId}
              disabled={departmentsFailed || departments.length === 0}
              onChange={(event) => setDepartmentId(event.target.value)}
              aria-label={t('minutes.departmentLabel')}
              className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
            >
              <option value="">
                {departmentsFailed
                  ? t('minutes.departmentError')
                  : departments.length === 0
                    ? t('minutes.departmentLoading')
                    : needsDepartment
                      ? t('minutes.departmentPlaceholder')
                      : t('minutes.keepDepartment')}
              </option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            {currentDepartmentId
              ? t('minutes.currentDepartmentHint')
              : t('minutes.noDepartmentHint')}
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">{t('minutes.instruction')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {INSTRUCTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setInstruction(preset)}
                aria-pressed={instruction === preset}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition ${
                  instruction === preset
                    ? 'bg-brand text-white ring-ink'
                    : 'bg-surface text-slate-700 ring-slate-400 hover:bg-slate-50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <input
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            aria-label="Instruction type"
            className="mt-2 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{t('minutes.endorsement')}</span>
            <textarea
              rows={5}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('minutes.endorsementPlaceholder')}
              className="mt-1 w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none"
            />
          </label>
          <p className={`mt-0.5 text-xs ${over ? 'text-amber-700' : 'text-slate-500'}`}>
            {over ? t('minutes.charCountLong', { count: text.length }) : t('minutes.charCount', { count: text.length })}
          </p>
        </div>

        {failure && (
          <ErrorNote
            remedy={failure.remedy}
            onRetry={failure.retryable ? submit : undefined}
          >
            {failure.message}
          </ErrorNote>
        )}

        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() => {
            clear();
            submit();
          }}
          className="w-full rounded-btn bg-brand px-4 py-2 text-sm font-medium text-ink transition hover:brightness-95 disabled:opacity-50"
        >
          {busy ? t('minutes.recording') : t('minutes.submit')}
        </button>
      </div>
    </section>
  );
}
