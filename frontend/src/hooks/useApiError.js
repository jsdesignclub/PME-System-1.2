/**
 * Turn an API failure into something the user can act on (D62).
 *
 * The point of this hook is that 403 and 409 must not read the same. They are
 * both refusals, and the Phase 2 UI reported both as one line of text, which
 * cost the user the only information that distinguishes them:
 *
 *   403  the server will refuse again. Retrying is pointless and offering
 *        "Try again" is an invitation to fail in a loop. The way out is to go
 *        somewhere else, or to ask someone who holds the permission.
 *   409  somebody else moved the letter first — a shared machine, two people on
 *        the same file. Nothing is wrong with the user. A Refresh WILL fix it.
 *   404  the letter is not here, which for a scoped caller means it is not theirs
 *        to see, and the honest response is a way back rather than a retry.
 *
 * `retryable` is therefore computed, not guessed at the call site, and the UI
 * renders a Refresh only when it is true.
 */
import { useCallback, useMemo, useState } from 'react';

import { normaliseError } from '../api/axiosClient.js';

/**
 * @typedef {object} ApiFailure
 * @property {string} message     the server's own message, verbatim
 * @property {number|null} status
 * @property {string} kind        network | unauthenticated | forbidden |
 *                                 not-found | conflict | validation | server | unknown
 * @property {string} code
 * @property {string|null} field  the offending input, when the server names one
 * @property {boolean} retryable  whether a Refresh is worth offering
 * @property {string} remedy      what the UI should offer alongside the message
 */

/**
 * Maps a normalised error to the action the UI should take.
 *
 * Split out as a pure function so the mapping can be reasoned about (and
 * eventually unit-tested) without mounting anything.
 *
 * @param {import('../api/axiosClient.js').ApiError} [failure]
 * @returns {ApiFailure|null}
 */
export function describeFailure(failure) {
  if (!failure) return null;

  const table = {
    network: {
      retryable: true,
      remedy: 'The server could not be reached. Check that the API is running, then try again.',
    },
    unauthenticated: {
      retryable: false,
      remedy: 'Your session has ended. Sign in again to continue.',
    },
    forbidden: {
      retryable: false,
      remedy: 'Your role does not permit this. Nothing you retry will change that.',
    },
    'not-found': {
      retryable: false,
      remedy: 'That letter is not here. It may have been reassigned, or it may never have been visible to you.',
    },
    conflict: {
      retryable: true,
      remedy: 'This letter moved while you were looking at it. Refresh to see where it is now.',
    },
    validation: {
      retryable: false,
      remedy: 'Correct the highlighted field and submit again.',
    },
    'unsupported-file': {
      retryable: false,
      remedy:
        'The server refused this file type. Convert it to PDF, or to a JPEG or PNG image, and attach that instead.',
    },
    'storage-refused': {
      retryable: false,
      remedy:
        'The file could not be stored: the server\'s rules for the attachments bucket refuse it. The storage policies for the mail-attachments bucket must be applied.',
    },
    server: {
      retryable: true,
      remedy: 'The server failed while handling this. Trying again is reasonable.',
    },
    unknown: {
      retryable: true,
      remedy: '',
    },
  };

  const { retryable, remedy } = table[failure.kind] ?? table.unknown;

  return {
    message: failure.message,
    status: failure.status,
    kind: failure.kind,
    code: failure.code,
    field: failure.field,
    retryable,
    remedy,
  };
}

/**
 * Per-request error state, so a component can report a failure and clear it.
 *
 * A hook rather than a global store on purpose: error state belongs to the
 * request that produced it, and a screen that fails to load must not overwrite
 * the "saved successfully" notice on an unrelated panel with its own problem.
 *
 * @returns {{
 *   failure: ApiFailure|null,
 *   report: (error: unknown, fallback?: string) => void,
 *   clear: () => void,
 *   run: <T>(work: () => Promise<T>, { success?: string }?) => Promise<T|null>,
 * }}
 */
export function useApiError(fallback) {
  const [failure, setFailure] = useState(null);

  const report = useCallback(
    (error, message) => {
      setFailure(describeFailure(normaliseError(error, message)));
    },
    // `fallback` is NOT a dependency and must not become one: `report` takes the
    // message as its own second argument and uses THAT, so depending on the hook's
    // fallback would re-create `report` whenever a caller's fallback string changed
    // identity — and `report` is in the dependency list of every `load` callback
    // that calls it, so that would re-fire those effects. It was an unnecessary
    // dependency, and depending on it would have been a request-per-render bug.
    [],
  );

  const clear = useCallback(() => setFailure(null), []);

  /**
   * Run a mutation, translating any rejection into failure state.
   *
   * Returns the value on success and `null` on failure, so a caller can decide
   * what to do next without a try/catch of its own. Swallowing the rejection is
   * the point: a mutation that failed and was not handled produces an
   * *unhandled rejection* in the console, which is one of the two things the
   * phase's acceptance check watches for.
   *
   * @template T
   * @param {() => Promise<T>} work
   * @returns {Promise<T|null>}
   */
  const run = useCallback(
    async (work) => {
      try {
        const result = await work();
        setFailure(null);
        return result;
      } catch (error) {
        setFailure(describeFailure(normaliseError(error, fallback)));
        return null;
      }
    },
    [fallback],
  );

  return useMemo(() => ({ failure, report, clear, run }), [failure, report, clear, run]);
}
