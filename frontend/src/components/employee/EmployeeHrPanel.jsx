/**
 * The HR half of an employee's file.
 *
 * This is shared by the Officers screen (an administrator, or an officer looking
 * at their own chart) and the My Profile screen (every signed-in employee). It
 * owns the data for the four HR blocks plus the document list, so the two
 * screens cannot drift into different validation, different ordering, or a
 * different idea of what "current" means.
 *
 * `canEdit` is the UI's mirror of what RLS will accept: an administrator, or the
 * owner of the row. It is a convenience, never the control - the database
 * policies in database/patch_hrm_self_service.sql are what actually stop a
 * colleague from writing someone else's file.
 *
 * A missing `employee_details` row is `null`, not an error: an employee who has
 * not filled their file in yet is a normal state, and the UI says "not recorded"
 * rather than showing a failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../../api/axiosClient.js';
import {
  createExperience,
  createQualification,
  createServiceRecord,
  downloadDocument,
  getEmployeeDetails,
  listDocuments,
  listExperience,
  listQualifications,
  listServiceHistory,
  removeDocument,
  removeExperience,
  removeQualification,
  removeServiceRecord,
  saveEmployeeDetails,
  updateExperience,
  updateQualification,
  updateServiceRecord,
  uploadDocument,
} from '../../api/hrmApi.js';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { useApiError } from '../../hooks/useApiError.js';
import { formatBytes, formatDate, formatDateTime } from '../../utils/dateUtils.js';
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_MB,
  extensionOf,
} from '../../utils/fileTypes.js';
import { DataTable } from '../common/DataTable.jsx';
import { EmptyState } from '../common/EmptyState.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';
import { Modal } from '../common/Modal.jsx';
import { Spinner } from '../common/Spinner.jsx';

const INPUT =
  'w-full rounded-btn border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none';

/**
 * The basic-information block, in the order the HR file reads it, and the same
 * list drives the edit form. `wide` fields span the two-column form grid;
 * `input` overrides the browser input type where one matters.
 */
const PROFILE_FIELDS = [
  { key: 'date_of_birth', label: 'employee.dateOfBirth', date: true },
  {
    key: 'gender',
    label: 'employee.gender',
    options: ['Male', 'Female', 'Other'],
  },
  {
    key: 'marital_status',
    label: 'employee.maritalStatus',
    options: ['Single', 'Married', 'Divorced', 'Widowed'],
  },
  {
    key: 'nationality',
    label: 'employee.nationality',
    options: ['Sinhala', 'Tamil', 'Burgher', 'Indian Tamil', 'Others'],
  },
  {
    key: 'blood_group',
    label: 'employee.bloodGroup',
    options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  },
  { key: 'phone', label: 'employee.phone', input: 'tel' },
  { key: 'personal_email', label: 'employee.personalEmail', input: 'email' },
  {
    key: 'employment_type',
    label: 'employee.employmentType',
    options: ['Permanent', 'Temporary', 'Contract', 'Casual'],
  },
  { key: 'join_date', label: 'employee.joinDate', date: true },
  { key: 'confirmation_date', label: 'employee.confirmationDate', date: true },
  { key: 'retirement_date', label: 'employee.retirementDate', date: true },
  {
    key: 'service_grade',
    label: 'employee.serviceGrade',
    options: ['Grade I', 'Grade II', 'Grade III'],
  },
  { key: 'salary_scale', label: 'employee.salaryScale' },
  { key: 'emergency_contact_name', label: 'employee.emergencyContactName' },
  { key: 'emergency_contact_phone', label: 'employee.emergencyContactPhone', input: 'tel' },
  { key: 'permanent_address', label: 'employee.permanentAddress', wide: true },
  { key: 'residential_address', label: 'employee.residentialAddress', wide: true },
  { key: 'notes', label: 'employee.notes', wide: true },
];

/**
 * One child list, loaded per officer.
 *
 * The token is not ceremony. Clicking another officer can start a second load
 * before the first answers, and without it the slower response for the previous
 * officer overwrites the current one - which looks like the app showing someone
 * else's qualifications, not like a race.
 */
function useHrList(loader, officerId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState('');
  const request = useRef(0);

  const refresh = useCallback(() => {
    const token = ++request.current;

    if (!officerId) {
      setRows([]);
      setFailure('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setFailure('');
    loader(officerId)
      .then((data) => {
        if (token === request.current) setRows(data);
      })
      .catch((problem) => {
        if (token === request.current) setFailure(errorMessage(problem));
      })
      .finally(() => {
        if (token === request.current) setLoading(false);
      });
  }, [loader, officerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, failure, refresh };
}

export function EmployeeHrPanel({ officerId, person, canEdit, tab }) {
  const { t } = useLanguage();

  const [employee, setEmployee] = useState(null);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeFailure, setEmployeeFailure] = useState('');
  const employeeRequest = useRef(0);

  const refreshEmployee = useCallback(() => {
    const request = ++employeeRequest.current;

    if (!officerId) {
      setEmployee(null);
      setEmployeeFailure('');
      setEmployeeLoading(false);
      return;
    }

    setEmployeeLoading(true);
    setEmployeeFailure('');
    getEmployeeDetails(officerId)
      .then((row) => {
        if (request === employeeRequest.current) setEmployee(row);
      })
      .catch((problem) => {
        if (request === employeeRequest.current) setEmployeeFailure(errorMessage(problem));
      })
      .finally(() => {
        if (request === employeeRequest.current) setEmployeeLoading(false);
      });
  }, [officerId]);

  useEffect(() => {
    refreshEmployee();
  }, [refreshEmployee]);

  const qualifications = useHrList(listQualifications, officerId);
  const experience = useHrList(listExperience, officerId);
  const serviceHistory = useHrList(listServiceHistory, officerId);
  const documents = useHrList(listDocuments, officerId);

  const [recordDialog, setRecordDialog] = useState(null);
  const [recordDelete, setRecordDelete] = useState(null);
  const [recordNotice, setRecordNotice] = useState('');
  const [downloadFailure, setDownloadFailure] = useState('');
  const {
    failure: recordFailure,
    run: runRecord,
    clear: clearRecordFailure,
  } = useApiError('The employee record could not be saved.');

  // A notice belongs to the block that produced it, so moving to another tab or
  // another officer starts clean. Without this, "Qualification added." sits
  // above the profile fields and reads as if the profile had just been saved.
  useEffect(() => {
    setRecordNotice('');
    setDownloadFailure('');
    clearRecordFailure();
  }, [officerId, tab, clearRecordFailure]);

  async function saveRecord(fields, id) {
    if (!recordDialog) return;

    const { type } = recordDialog;
    const saved = await runRecord(() => {
      if (type === 'profile') return saveEmployeeDetails(officerId, fields);
      if (type === 'qualification') {
        return id
          ? updateQualification(id, fields)
          : createQualification(officerId, fields);
      }
      if (type === 'experience') {
        return id ? updateExperience(id, fields) : createExperience(officerId, fields);
      }
      if (type === 'document') return uploadDocument(officerId, fields);
      return id ? updateServiceRecord(id, fields) : createServiceRecord(officerId, fields);
    });

    // `run` returns null AND sets `recordFailure`; leaving the dialog open keeps
    // the typed values next to the message that rejected them.
    if (saved === null) return;

    setRecordDialog(null);

    if (type === 'profile') {
      setEmployee(saved);
      setRecordNotice(t('employee.detailsUpdated'));
    } else if (type === 'qualification') {
      setRecordNotice(
        id ? t('employee.qualificationUpdated') : t('employee.qualificationAdded'),
      );
      qualifications.refresh();
    } else if (type === 'experience') {
      setRecordNotice(id ? t('employee.experienceUpdated') : t('employee.experienceAdded'));
      experience.refresh();
    } else if (type === 'document') {
      setRecordNotice(t('employee.documentUploaded'));
      documents.refresh();
    } else {
      setRecordNotice(
        id ? t('employee.serviceRecordUpdated') : t('employee.serviceRecordAdded'),
      );
      serviceHistory.refresh();
    }
  }

  async function confirmDeleteRecord() {
    if (!recordDelete) return false;

    const { type, record } = recordDelete;
    const result = await runRecord(() => {
      if (type === 'qualification') return removeQualification(record.id);
      if (type === 'experience') return removeExperience(record.id);
      if (type === 'document') return removeDocument(record);
      return removeServiceRecord(record.id);
    });
    if (result === null) return false;

    if (type === 'qualification') {
      setRecordNotice(t('employee.qualificationRemoved'));
      qualifications.refresh();
    } else if (type === 'experience') {
      setRecordNotice(t('employee.experienceRemoved'));
      experience.refresh();
    } else if (type === 'document') {
      setRecordNotice(t('employee.documentRemoved'));
      documents.refresh();
    } else {
      setRecordNotice(t('employee.serviceRecordRemoved'));
      serviceHistory.refresh();
    }

    return true;
  }

  async function download(record) {
    setDownloadFailure('');
    try {
      const blob = await downloadDocument(record);
      const typed = new Blob([blob], {
        type: record.mime_type || blob.type || 'application/octet-stream',
      });
      const url = URL.createObjectURL(typed);
      const link = document.createElement('a');
      link.href = url;
      link.download = record.file_name || record.title || 'document';
      document.body.append(link);
      link.click();
      link.remove();
      // Revoked on the next tick: revoking in the same statement as `click()`
      // cancels the download in some browsers before the navigation starts.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (problem) {
      setDownloadFailure(errorMessage(problem, t('employee.downloadFailed')));
    }
  }

  function openRecordDialog(type, record = {}) {
    clearRecordFailure();
    setRecordNotice('');
    setRecordDialog({ type, record });
  }

  function openRecordDelete(type, record) {
    clearRecordFailure();
    setRecordNotice('');
    setRecordDelete({ type, record });
  }

  const notice = recordNotice ? (
    <p className="text-sm text-slate-700" role="status">
      {recordNotice}
    </p>
  ) : null;
  const mutationFailure = recordFailure && !recordDialog ? (
    <ErrorNote>{recordFailure.message}</ErrorNote>
  ) : null;

  return (
    <>
      <div className="space-y-3">
        {notice}
        {mutationFailure}

        {tab === 'profile' && (
          <ProfileBlock
            person={person}
            employee={employee}
            loading={employeeLoading}
            failure={employeeFailure}
            canEdit={canEdit}
            onEdit={() => openRecordDialog('profile', employee ?? {})}
          />
        )}

        {tab === 'qualifications' && (
          <QualificationList
            rows={qualifications.rows}
            loading={qualifications.loading}
            failure={qualifications.failure}
            canEdit={canEdit}
            onAdd={() => openRecordDialog('qualification')}
            onEdit={(record) => openRecordDialog('qualification', record)}
            onDelete={(record) => openRecordDelete('qualification', record)}
          />
        )}

        {tab === 'experience' && (
          <ExperienceList
            rows={experience.rows}
            loading={experience.loading}
            failure={experience.failure}
            canEdit={canEdit}
            onAdd={() => openRecordDialog('experience')}
            onEdit={(record) => openRecordDialog('experience', record)}
            onDelete={(record) => openRecordDelete('experience', record)}
          />
        )}

        {tab === 'service' && (
          <ServiceHistoryList
            rows={serviceHistory.rows}
            loading={serviceHistory.loading}
            failure={serviceHistory.failure}
            canEdit={canEdit}
            onAdd={() => openRecordDialog('service')}
            onEdit={(record) => openRecordDialog('service', record)}
            onDelete={(record) => openRecordDelete('service', record)}
          />
        )}

        {tab === 'documents' && (
          <>
            {downloadFailure && <ErrorNote>{downloadFailure}</ErrorNote>}
            <DocumentList
              rows={documents.rows}
              loading={documents.loading}
              failure={documents.failure}
              canEdit={canEdit}
              onAdd={() => openRecordDialog('document')}
              onDownload={download}
              onDelete={(record) => openRecordDelete('document', record)}
            />
          </>
        )}
      </div>

      {recordDialog?.type === 'profile' && (
        <DetailsDialog
          record={recordDialog.record}
          person={person}
          failure={recordFailure}
          onClose={() => {
            clearRecordFailure();
            setRecordDialog(null);
          }}
          onSave={saveRecord}
        />
      )}

      {recordDialog?.type === 'qualification' && (
        <QualificationDialog
          record={recordDialog.record}
          failure={recordFailure}
          onClose={() => {
            clearRecordFailure();
            setRecordDialog(null);
          }}
          onSave={saveRecord}
        />
      )}

      {recordDialog?.type === 'experience' && (
        <ExperienceDialog
          record={recordDialog.record}
          failure={recordFailure}
          onClose={() => {
            clearRecordFailure();
            setRecordDialog(null);
          }}
          onSave={saveRecord}
        />
      )}

      {recordDialog?.type === 'service' && (
        <ServiceHistoryDialog
          record={recordDialog.record}
          failure={recordFailure}
          onClose={() => {
            clearRecordFailure();
            setRecordDialog(null);
          }}
          onSave={saveRecord}
        />
      )}

      {recordDialog?.type === 'document' && (
        <DocumentDialog
          failure={recordFailure}
          onClose={() => {
            clearRecordFailure();
            setRecordDialog(null);
          }}
          onSave={saveRecord}
        />
      )}

      {recordDelete && (
        <RecordDeleteDialog
          record={recordDelete}
          failure={recordFailure}
          onClose={() => {
            clearRecordFailure();
            setRecordDelete(null);
          }}
          onConfirm={confirmDeleteRecord}
        />
      )}
    </>
  );
}

function ProfileBlock({ person, employee, loading, failure, canEdit, onEdit }) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {canEdit ? t('employee.profileHint') : t('employee.readOnly')}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded-btn bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {employee ? t('employee.editDetails') : t('employee.addDetails')}
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label={t('officers.loadingProfile')} />
      ) : failure ? (
        <ErrorNote>{failure}</ErrorNote>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-slate-600">
            {person?.department?.name && <span>{person.department.name}</span>}
            {person?.nic_no && <span className="font-mono text-xs">{person.nic_no}</span>}
          </div>

          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {t('employee.currentDesignation')}
              </dt>
              <dd className="mt-0.5 text-sm text-slate-800">{person?.designation || '—'}</dd>
            </div>
            {employee &&
              PROFILE_FIELDS.map(({ key, label, date, wide }) => (
                <div key={key} className={wide ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                    {t(label)}
                  </dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-line text-slate-800">
                    {date ? formatDate(employee[key]) : employee[key] || '—'}
                  </dd>
                </div>
              ))}
          </dl>

          {!employee && <EmptyState title={t('officers.profileEmpty')} />}
        </>
      )}
    </div>
  );
}

const ROW_ACTION =
  'rounded-btn border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50';
const ROW_ACTION_DANGER =
  'rounded-btn border border-danger/40 px-2.5 py-1 text-xs text-danger transition hover:bg-danger/10';

function RowActions({ row, onEdit, onDelete }) {
  const { t } = useLanguage();

  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => onEdit(row)} className={ROW_ACTION}>
        {t('common.edit')}
      </button>
      <button type="button" onClick={() => onDelete(row)} className={ROW_ACTION_DANGER}>
        {t('common.delete')}
      </button>
    </div>
  );
}

function QualificationList({ rows, loading, failure, canEdit, onAdd, onEdit, onDelete }) {
  const { t } = useLanguage();

  if (failure) return <ErrorNote>{failure}</ErrorNote>;

  const columns = [
    { key: 'title', header: t('employee.title') },
    { key: 'level', header: t('employee.level'), render: (row) => row.level || '—' },
    {
      key: 'institution',
      header: t('employee.institution'),
      render: (row) => row.institution || '—',
    },
    {
      key: 'year_completed',
      header: t('employee.yearCompleted'),
      render: (row) => row.year_completed ?? '—',
    },
    { key: 'grade', header: t('employee.grade'), render: (row) => row.grade || '—' },
  ];

  if (canEdit) {
    columns.push({
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (row) => <RowActions row={row} onEdit={onEdit} onDelete={onDelete} />,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {canEdit ? t('employee.qualificationsHint') : t('employee.readOnly')}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-btn bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {t('employee.addQualification')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={rows.length}
        empty={<EmptyState title={t('employee.noQualifications')} />}
      />
    </div>
  );
}

function ExperienceList({ rows, loading, failure, canEdit, onAdd, onEdit, onDelete }) {
  const { t } = useLanguage();

  if (failure) return <ErrorNote>{failure}</ErrorNote>;

  const columns = [
    { key: 'employer', header: t('employee.employer') },
    {
      key: 'designation',
      header: t('employee.jobTitle'),
      render: (row) => row.designation || '—',
    },
    {
      key: 'period',
      header: t('employee.period'),
      render: (row) => {
        if (!row.from_date && !row.to_date) return '—';
        return (
          <span className="whitespace-nowrap">
            {formatDate(row.from_date)} –{' '}
            {row.to_date ? formatDate(row.to_date) : t('employee.current')}
          </span>
        );
      },
    },
    {
      key: 'description',
      header: t('employee.description'),
      render: (row) =>
        row.description ? (
          <span className="block max-w-[18rem] truncate" title={row.description}>
            {row.description}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  if (canEdit) {
    columns.push({
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (row) => <RowActions row={row} onEdit={onEdit} onDelete={onDelete} />,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {canEdit ? t('employee.experienceHint') : t('employee.readOnly')}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-btn bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {t('employee.addExperience')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={rows.length}
        empty={<EmptyState title={t('employee.noExperience')} />}
      />
    </div>
  );
}

function ServiceHistoryList({ rows, loading, failure, canEdit, onAdd, onEdit, onDelete }) {
  const { t } = useLanguage();

  if (failure) return <ErrorNote>{failure}</ErrorNote>;

  const columns = [
    { key: 'designation', header: t('employee.designation') },
    {
      key: 'workplace',
      header: t('employee.workplace'),
      render: (row) => row.workplace || '—',
    },
    { key: 'grade', header: t('employee.grade'), render: (row) => row.grade || '—' },
    {
      key: 'period',
      header: t('employee.period'),
      render: (row) => {
        if (!row.from_date && !row.to_date) return '—';
        return (
          <span className="whitespace-nowrap">
            {formatDate(row.from_date)} –{' '}
            {row.to_date ? formatDate(row.to_date) : t('employee.current')}
          </span>
        );
      },
    },
    {
      key: 'remarks',
      header: t('employee.remarks'),
      render: (row) =>
        row.remarks ? (
          <span className="block max-w-[18rem] truncate" title={row.remarks}>
            {row.remarks}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  if (canEdit) {
    columns.push({
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (row) => <RowActions row={row} onEdit={onEdit} onDelete={onDelete} />,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {canEdit ? t('employee.serviceHistoryHint') : t('employee.readOnly')}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-btn bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {t('employee.addServiceRecord')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={rows.length}
        empty={<EmptyState title={t('employee.noServiceHistory')} />}
      />
    </div>
  );
}

function DocumentList({ rows, loading, failure, canEdit, onAdd, onDownload, onDelete }) {
  const { t } = useLanguage();

  if (failure) return <ErrorNote>{failure}</ErrorNote>;

  const columns = [
    { key: 'title', header: t('employee.documentTitle') },
    {
      key: 'document_type',
      header: t('employee.documentType'),
      render: (row) => row.document_type || '—',
    },
    {
      key: 'file_name',
      header: t('employee.documentFile'),
      render: (row) => (
        <span className="block max-w-[16rem] truncate" title={row.file_name}>
          {row.file_name}
        </span>
      ),
    },
    {
      key: 'size_bytes',
      header: t('employee.fileSize'),
      render: (row) => formatBytes(row.size_bytes),
    },
    {
      key: 'created_at',
      header: t('employee.uploaded'),
      render: (row) => (
        <span className="whitespace-nowrap">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onDownload(row)} className={ROW_ACTION}>
            {t('common.download')}
          </button>
          {canEdit && (
            <button type="button" onClick={() => onDelete(row)} className={ROW_ACTION_DANGER}>
              {t('common.delete')}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {canEdit ? t('employee.documentsHint') : t('employee.readOnly')}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="rounded-btn bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            {t('employee.addDocument')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={rows.length}
        empty={<EmptyState title={t('employee.noDocuments')} />}
      />
    </div>
  );
}

function FormField({ label, children, wide }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

function DetailsDialog({ record, person, failure, onClose, onSave }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [fields, setFields] = useState(() =>
    Object.fromEntries(PROFILE_FIELDS.map(({ key }) => [key, record[key] ?? ''])),
  );

  function update(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLocalError('');

    if (fields.confirmation_date && fields.join_date && fields.confirmation_date < fields.join_date) {
      setLocalError(t('employee.dateOrder'));
      return;
    }

    if (fields.retirement_date && fields.join_date && fields.retirement_date < fields.join_date) {
      setLocalError(t('employee.dateOrder'));
      return;
    }

    setBusy(true);
    try {
      await onSave(fields, undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={record.officer_user_id ? t('employee.editDetails') : t('employee.addDetails')}
      onClose={busy ? () => {} : onClose}
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="employee-details-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="employee-details-form" onSubmit={submit} className="space-y-3">
        {localError && <ErrorNote>{localError}</ErrorNote>}
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('employee.currentDesignation')} wide>
            <input
              value={person?.designation ?? ''}
              readOnly
              className={`${INPUT} bg-slate-200 text-slate-600`}
            />
          </FormField>
          {PROFILE_FIELDS.map(({ key, label, date, wide, input, options }) => (
            <FormField key={key} label={t(label)} wide={wide}>
              {date ? (
                <input
                  type="date"
                  value={fields[key]}
                  onChange={(event) => update(key, event.target.value)}
                  className={INPUT}
                />
              ) : options ? (
                <select
                  value={fields[key]}
                  onChange={(event) => update(key, event.target.value)}
                  className={INPUT}
                >
                  <option value="">{t('employee.selectOption')}</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  {fields[key] && !options.includes(fields[key]) && (
                    <option value={fields[key]}>{fields[key]}</option>
                  )}
                </select>
              ) : wide ? (
                <textarea
                  rows={2}
                  value={fields[key]}
                  onChange={(event) => update(key, event.target.value)}
                  className={INPUT}
                />
              ) : (
                <input
                  type={input ?? 'text'}
                  value={fields[key]}
                  onChange={(event) => update(key, event.target.value)}
                  className={INPUT}
                />
              )}
            </FormField>
          ))}
        </div>
      </form>
    </Modal>
  );
}

function QualificationDialog({ record, failure, onClose, onSave }) {
  const { t } = useLanguage();
  const isEdit = Boolean(record.id);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [fields, setFields] = useState({
    level: record.level ?? '',
    title: record.title ?? '',
    institution: record.institution ?? '',
    year_completed: record.year_completed ?? '',
    grade: record.grade ?? '',
  });

  function update(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLocalError('');

    if (!fields.title.trim()) {
      setLocalError(t('employee.titleRequired'));
      return;
    }

    setBusy(true);
    try {
      await onSave(fields, isEdit ? record.id : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? t('employee.editQualification') : t('employee.addQualification')}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="qualification-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="qualification-form" onSubmit={submit} className="space-y-3">
        {localError && <ErrorNote>{localError}</ErrorNote>}
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <FormField label={t('employee.title')}>
          <input
            type="text"
            required
            value={fields.title}
            onChange={(event) => update('title', event.target.value)}
            className={INPUT}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('employee.level')}>
            <input
              type="text"
              value={fields.level}
              onChange={(event) => update('level', event.target.value)}
              className={INPUT}
            />
          </FormField>
          <FormField label={t('employee.yearCompleted')}>
            <input
              type="number"
              min="1900"
              max="2200"
              value={fields.year_completed}
              onChange={(event) => update('year_completed', event.target.value)}
              className={INPUT}
            />
          </FormField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('employee.institution')}>
            <input
              type="text"
              value={fields.institution}
              onChange={(event) => update('institution', event.target.value)}
              className={INPUT}
            />
          </FormField>
          <FormField label={t('employee.grade')}>
            <input
              type="text"
              value={fields.grade}
              onChange={(event) => update('grade', event.target.value)}
              className={INPUT}
            />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}

function ExperienceDialog({ record, failure, onClose, onSave }) {
  const { t } = useLanguage();
  const isEdit = Boolean(record.id);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [fields, setFields] = useState({
    employer: record.employer ?? '',
    designation: record.designation ?? '',
    from_date: record.from_date ?? '',
    to_date: record.to_date ?? '',
    description: record.description ?? '',
  });

  function update(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLocalError('');

    if (!fields.employer.trim()) {
      setLocalError(t('employee.employerRequired'));
      return;
    }

    if (fields.from_date && fields.to_date && fields.to_date < fields.from_date) {
      setLocalError(t('employee.dateOrder'));
      return;
    }

    setBusy(true);
    try {
      await onSave(fields, isEdit ? record.id : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? t('employee.editExperience') : t('employee.addExperience')}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="experience-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="experience-form" onSubmit={submit} className="space-y-3">
        {localError && <ErrorNote>{localError}</ErrorNote>}
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('employee.employer')}>
            <input
              type="text"
              required
              value={fields.employer}
              onChange={(event) => update('employer', event.target.value)}
              className={INPUT}
            />
          </FormField>
          <FormField label={t('employee.jobTitle')}>
            <input
              type="text"
              value={fields.designation}
              onChange={(event) => update('designation', event.target.value)}
              className={INPUT}
            />
          </FormField>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('employee.fromDate')}>
            <input
              type="date"
              value={fields.from_date}
              onChange={(event) => update('from_date', event.target.value)}
              className={INPUT}
            />
          </FormField>
          <FormField label={t('employee.toDate')}>
            <input
              type="date"
              value={fields.to_date}
              onChange={(event) => update('to_date', event.target.value)}
              className={INPUT}
            />
            <span className="mt-1 block text-xs text-slate-500">{t('employee.toDateHint')}</span>
          </FormField>
        </div>

        <FormField label={t('employee.description')}>
          <textarea
            rows={3}
            value={fields.description}
            onChange={(event) => update('description', event.target.value)}
            className={INPUT}
          />
        </FormField>
      </form>
    </Modal>
  );
}

function ServiceHistoryDialog({ record, failure, onClose, onSave }) {
  const { t } = useLanguage();
  const isEdit = Boolean(record.id);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [fields, setFields] = useState({
    designation: record.designation ?? '',
    workplace: record.workplace ?? '',
    grade: record.grade ?? '',
    from_date: record.from_date ?? '',
    to_date: record.to_date ?? '',
    remarks: record.remarks ?? '',
  });

  function update(key, value) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLocalError('');

    if (!fields.designation.trim()) {
      setLocalError(t('employee.designationRequired'));
      return;
    }

    if (fields.from_date && fields.to_date && fields.to_date < fields.from_date) {
      setLocalError(t('employee.dateOrder'));
      return;
    }

    setBusy(true);
    try {
      await onSave(fields, isEdit ? record.id : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={isEdit ? t('employee.editServiceRecord') : t('employee.addServiceRecord')}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="service-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="service-form" onSubmit={submit} className="space-y-3">
        {localError && <ErrorNote>{localError}</ErrorNote>}
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('employee.designation')}>
            <input
              type="text"
              required
              value={fields.designation}
              onChange={(event) => update('designation', event.target.value)}
              className={INPUT}
            />
          </FormField>
          <FormField label={t('employee.workplace')}>
            <input
              type="text"
              value={fields.workplace}
              onChange={(event) => update('workplace', event.target.value)}
              className={INPUT}
            />
          </FormField>
        </div>

        <FormField label={t('employee.grade')}>
          <input
            type="text"
            value={fields.grade}
            onChange={(event) => update('grade', event.target.value)}
            className={INPUT}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('employee.fromDate')}>
            <input
              type="date"
              value={fields.from_date}
              onChange={(event) => update('from_date', event.target.value)}
              className={INPUT}
            />
          </FormField>
          <FormField label={t('employee.toDate')}>
            <input
              type="date"
              value={fields.to_date}
              onChange={(event) => update('to_date', event.target.value)}
              className={INPUT}
            />
            <span className="mt-1 block text-xs text-slate-500">{t('employee.toDateHint')}</span>
          </FormField>
        </div>

        <FormField label={t('employee.remarks')}>
          <textarea
            rows={3}
            value={fields.remarks}
            onChange={(event) => update('remarks', event.target.value)}
            className={INPUT}
          />
        </FormField>
      </form>
    </Modal>
  );
}

function DocumentDialog({ failure, onClose, onSave }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const [fields, setFields] = useState({ title: '', document_type: '', file: null });

  async function submit(event) {
    event.preventDefault();
    setLocalError('');

    if (!fields.file) {
      setLocalError(t('employee.documentFileRequired'));
      return;
    }

    if (!ALLOWED_EXTENSIONS.includes(extensionOf(fields.file.name))) {
      setLocalError(t('employee.fileAllowed'));
      return;
    }

    if (fields.file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setLocalError(t('employee.fileTooLarge', { size: MAX_UPLOAD_MB }));
      return;
    }

    setBusy(true);
    try {
      await onSave({ ...fields, title: fields.title.trim() || fields.file.name });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      title={t('employee.addDocument')}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="document-form"
            disabled={busy}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <form id="document-form" onSubmit={submit} className="space-y-3">
        {localError && <ErrorNote>{localError}</ErrorNote>}
        {failure && <ErrorNote>{failure.message}</ErrorNote>}

        <FormField label={t('employee.documentTitle')}>
          <input
            type="text"
            value={fields.title}
            onChange={(event) =>
              setFields((current) => ({ ...current, title: event.target.value }))
            }
            className={INPUT}
          />
        </FormField>

        <FormField label={t('employee.documentType')}>
          <input
            type="text"
            value={fields.document_type}
            onChange={(event) =>
              setFields((current) => ({ ...current, document_type: event.target.value }))
            }
            className={INPUT}
          />
        </FormField>

        <FormField label={t('employee.documentFile')}>
          <input
            type="file"
            accept={ALLOWED_EXTENSIONS.join(',')}
            onChange={(event) =>
              setFields((current) => ({ ...current, file: event.target.files?.[0] ?? null }))
            }
            className="block w-full text-sm text-slate-700"
          />
          <span className="mt-1 block text-xs text-slate-500">{t('employee.fileAllowed')}</span>
        </FormField>
      </form>
    </Modal>
  );
}

function RecordDeleteDialog({ record, failure, onClose, onConfirm }) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      // The dialog stays open on failure so the reason is not lost with the
      // overlay; `onConfirm` reports whether the row was actually removed.
      const removed = await onConfirm();
      if (removed) onClose();
    } finally {
      setBusy(false);
    }
  }

  const title =
    record.type === 'qualification'
      ? t('employee.deleteQualificationTitle')
      : record.type === 'experience'
        ? t('employee.deleteExperienceTitle')
        : record.type === 'document'
          ? t('employee.deleteDocumentTitle')
          : t('employee.deleteServiceRecordTitle');

  const message =
    record.type === 'qualification'
      ? t('employee.deleteQualificationMessage', { title: record.record.title })
      : record.type === 'experience'
        ? t('employee.deleteExperienceMessage', { employer: record.record.employer })
        : record.type === 'document'
          ? t('employee.deleteDocumentMessage', { title: record.record.title })
          : t('employee.deleteServiceRecordMessage', {
              designation: record.record.designation,
            });

  return (
    <Modal open title={title} onClose={busy ? () => {} : onClose}>
      <p className="text-sm text-slate-700">{message}</p>

      {failure && (
        <div className="mt-3">
          <ErrorNote>{failure.message}</ErrorNote>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={confirm}
          className="rounded-btn bg-danger px-4 py-2 text-sm font-medium text-white transition hover:bg-danger-hover disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('common.delete')}
        </button>
      </div>
    </Modal>
  );
}
