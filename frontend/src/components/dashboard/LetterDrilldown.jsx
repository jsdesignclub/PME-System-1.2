/**
 * The drill-down: the letters behind one figure.
 *
 * Opens when a tile or a chart segment is chosen, and takes ONE `request` object
 * holding a title and the registry filters that produce the rows — rather than
 * the name of a figure. The figures are already labelled by whoever opened this,
 * so the modal's only job is to fetch and show, and it needs no table of its own
 * mapping "Overdue" to a filter. That is what lets the same modal serve all four
 * tiles, all five workflow states, all three priorities and all four sender types.
 *
 * `GET /mail` is the endpoint, not a new one. Every drill-down this dashboard can
 * express is a filter the registry already accepts, so this is the registry's
 * filter form with the chrome removed — and the rows are produced by the same
 * query, under the same `mailScope`. A drill-down with its own narrower query is
 * a dashboard that can quote a figure its own list cannot reproduce.
 *
 * The ONE figure that is not a registry filter is Overdue, which asks for
 * `?overdue=true`. That filter exists precisely so the count on the tile and the
 * rows in this list are the same set.
 *
 * The count in the heading is the one this request actually returned, not the
 * figure the tile showed. They come from different endpoints and the registry is
 * scoped per caller, so when they disagree the list's own number is the honest
 * one to display; the disagreement is stated rather than hidden.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { errorMessage } from '../../api/axiosClient.js';
import { list } from '../../api/mailApi.js';
import { EmptyState } from '../common/EmptyState.jsx';
import { ErrorNote } from '../common/ErrorNote.jsx';
import { MailTable } from '../mail/MailTable.jsx';
import { Modal } from '../common/Modal.jsx';
import { Spinner } from '../common/Spinner.jsx';

/** Rows shown at once. The modal scrolls; this is not a page. */
const PREVIEW_LIMIT = 50;

export function LetterDrilldown({ request, scope, onClose }) {
  const { title, filters, figureCount } = request;

  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    let cancelled = false;

    setResult(null);
    setFailure('');

    // `scope` narrows the rows to the caller's own department for a branch
    // clerk, so the list behind a figure matches the figure itself.
    list(filters, { limit: PREVIEW_LIMIT }, scope)
      .then((page) => {
        if (!cancelled) setResult(page);
      })
      .catch((problem) => {
        if (!cancelled) setFailure(errorMessage(problem));
      });

    return () => {
      cancelled = true;
    };
  }, [filters, scope]);

  const close = useCallback(() => onClose(), [onClose]);

  // The mismatch case, decided once. Spelled out rather than derived inline
  // because it is a sentence, not a value.
  const shortfall =
    figureCount !== undefined && result !== null && result.total !== figureCount
      ? ` The tile read ${figureCount}, which counts the whole registry; this list is what your role may see.`
      : '';

  return (
    <Modal
      open
      wide
      title={title}
      onClose={close}
      footer={
        <>
          {/*
            The escape hatch, and the reason this is not simply a list: 50 rows is
            a preview, and a figure of 340 with no way onward is a dead end. The
            same filters go to the registry, which pages and sorts.
          */}
          <Link
            to={`/mail?${toQuery(filters)}`}
            onClick={close}
            className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            Open in the registry
          </Link>
          <button
            type="button"
            onClick={close}
            className="rounded-btn bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Close
          </button>
        </>
      }
    >
      {failure && <ErrorNote>{failure}</ErrorNote>}

      {!failure && result === null && <Spinner label="Loading letters" />}

      {!failure && result !== null && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <strong className="font-semibold text-ink tabular-nums">{result.total}</strong>{' '}
            {result.total === 1 ? 'letter' : 'letters'} in this figure
            {result.total > result.rows.length && (
              <span>
                {' '}
                — showing the {result.rows.length} most recent. The rest are in the registry.
              </span>
            )}
            {shortfall && <span className="text-amber-800">{shortfall}</span>}
          </p>

          {result.rows.length === 0 ? (
            <EmptyState title="No letters match this figure." />
          ) : (
            <MailTable rows={result.rows} staggerRows />
          )}
        </div>
      )}
    </Modal>
  );
}

/** The registry URL for a set of filters, for the "open in the registry" link. */
function toQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}
