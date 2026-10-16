/**
 * The matcher's answer, fetched.
 *
 * This hook HOLDS NO SCORING LOGIC, and that is its most important property
 * (D8, D59). The rules — whole-word matching, the stop-word list, the two
 * description caps, the tie-break — live in the client-side mailApi.js
 * suggestions function and have a dedicated test file. A tokenizer written here
 * would be a second implementation of those rules: it would agree with the server
 * until the first rule changed, and then the UI would rank officers differently
 * from the suggestion the clerk is looking at, with nothing on screen to say why.
 *
 * So this file fetches a URL and holds it.
 */
import { useEffect, useState } from 'react';

import * as mailApi from '../api/mailApi.js';
import { errorMessage } from '../api/axiosClient.js';

export function useDutyMatcher(letterId, enabled = true) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !letterId) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);

    mailApi
      .suggestions(letterId)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((failure) => {
        if (!cancelled) setError(errorMessage(failure, 'The duty matcher could not be reached.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [letterId, enabled]);

  return { result, loading, error };
}
