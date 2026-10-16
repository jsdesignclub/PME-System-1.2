/**
 * Registry filters, paging and selection, shared by the pages that need them.
 *
 * The reason this is a context and not two independent pieces of page state is
 * the path a user actually takes: filter the registry, open a letter, press
 * Back. With page-local state the filters are gone, and the user has to rebuild
 * a query they had just constructed — which is how a clerk ends up believing
 * "no letter matches" when they are looking at an unfiltered first page.
 *
 * `detailCache` exists for the same reason at a finer grain. Re-opening a letter
 * the user just read should not re-fetch and re-flash it; the cache is bounded
 * and cleared on sign-out, so it cannot serve one user another's data.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/** The seven resting states, in workflow order. Mirrors MAIL_STATES server-side. */
export const STATES = Object.freeze([
  'Logged',
  'Forwarded to AO',
  'Forwarded to Subject',
  'Assigned',
  'In Progress',
  'Pending Approval',
  'Completed',
]);

export const SENDER_TYPES = Object.freeze([
  'Government Office',
  'Non-Government / Public',
  'Private Organization',
  'Judicial / Court',
]);

export const PRIORITIES = Object.freeze(['Normal', 'Urgent', 'Confidential']);

export const PAGE_SIZE = 25;

/** Every filter the registry accepts, empty. */
export const BLANK_FILTERS = Object.freeze({
  search: '',
  status: '',
  priority: '',
  sender_type: '',
  category: '',
  department_id: '',
  assigned_officer_id: '',
  from: '',
  to: '',
});

/** How many letters the detail cache holds before the oldest is dropped. */
const DETAIL_CACHE_LIMIT = 20;

/**
 * How long a text filter must be still before its query is sent. A select or a
 * date picker skips this wait entirely — see `setFilter` — because it is one
 * deliberate event rather than a stream of keystrokes.
 */
const FILTER_DEBOUNCE_MS = 350;

/** Compare two filter sets by value; every filter is a flat string. */
function sameFilters(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

const MailContext = createContext(null);

/**
 * @param {{children: React.ReactNode}} props
 */
export function MailProvider({ children }) {
  // `filters` is what the user has typed; `applied` is what the last request
  // used. The auto-apply effect below bridges them after a pause, so a text
  // filter costs one request per typing burst rather than one per keystroke.
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [applied, setApplied] = useState(BLANK_FILTERS);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  // The state value is only ever read through `remember`/`forget`, which update it
  // functionally — nothing reads the current object. It is still `useState` rather
  // than a ref so that a write re-renders consumers holding `detailCache` in the
  // context value, which is the point of the cache existing.
  const [detailCache, setDetailCache] = useState({});
  // Set by a filter change that may skip the debounce; read by the auto-apply
  // effect below. A ref, not state: it must not itself trigger a render.
  const immediateRef = useRef(false);

  const setFilter = useCallback((key, value, options = {}) => {
    if (options.immediate) immediateRef.current = true;
    setFilters((current) => ({ ...current, [key]: value }));
    // Any filter change resets to page one. Staying on page 4 of a 2-page result
    // set is the kind of empty screen that reads as "the search found nothing".
    setOffset(0);
  }, []);

  /**
   * Auto-apply: copy `filters` into `applied` once the user pauses, so the table
   * follows the form without a click on Apply.
   *
   * The equality guard is what keeps this honest. `adoptFilters` and
   * `clearFilters` set both values together, and the URL-seeded path sets them
   * to the same object — none of those should cost a second request. Only a
   * change that leaves `filters` ahead of `applied` starts the timer.
   */
  useEffect(() => {
    if (sameFilters(filters, applied)) return;

    if (immediateRef.current) {
      immediateRef.current = false;
      setApplied(filters);
      setOffset(0);
      return;
    }

    const id = setTimeout(() => {
      setApplied(filters);
      setOffset(0);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [filters, applied]);

  const apply = useCallback(() => {
    setApplied(filters);
    setOffset(0);
  }, [filters]);

  const clearFilters = useCallback(() => {
    setFilters(BLANK_FILTERS);
    setApplied(BLANK_FILTERS);
    setOffset(0);
  }, []);

  /**
   * Adopt a set of filters wholesale, without a form.
   *
   * This is what makes a FILTERED REGISTRY URL mean something. The drill-down
   * modal links out to `/mail?status=Open`, and without this the registry would
   * load, show its own remembered (blank) filters and ignore the query entirely —
   * a link that looks like it carries the filter and does not is worse than one
   * with no filter in it at all.
   *
   * Returns whether anything was adopted, and the caller uses that to decide
   * whether it should clear. The distinction is deliberate: an unfiltered `/mail`
   * must leave the existing filters alone, because the path this whole context
   * exists for is registry → open a letter → Back, and blanking the filters
   * because the user arrived at a URL with no query string would undo that. A URL
   * that DOES carry filter keys is an explicit request and wins.
   *
   * Only keys `BLANK_FILTERS` knows are read, and only non-empty values, so a
   * hand-edited `?search=` or an unrelated tracking parameter cannot land in the
   * query. The server would reject the first and ignore the second; neither
   * should reach the filter form.
   */
  const adoptFilters = useCallback((values) => {
    const next = { ...BLANK_FILTERS };
    let adopted = false;

    for (const key of Object.keys(BLANK_FILTERS)) {
      const value = values?.[key];
      if (value !== undefined && value !== null && value !== '') {
        next[key] = String(value);
        adopted = true;
      }
    }

    if (!adopted) return false;

    setFilters(next);
    setApplied(next);
    setOffset(0);
    return true;
  }, []);

  const page = useCallback((step) => {
    setOffset((current) => Math.max(0, current + step * PAGE_SIZE));
  }, []);

  /**
   * Cache one letter's full detail.
   *
   * Bounded by insertion order rather than by a `Map` alone, because a registry
   * session can open dozens of letters and an unbounded cache is a slow leak on
   * a long shift. The entry is REPLACED wholesale on every save, so a letter
   * whose status moved is never served from a stale copy — that is the one bug
   * a detail cache is capable of causing, and it is why `remember` is called
   * after each successful mutation rather than only on first load.
   */
  const remember = useCallback((id, detail) => {
    setDetailCache((current) => {
      const next = { ...current, [id]: detail };
      const keys = Object.keys(next);
      if (keys.length > DETAIL_CACHE_LIMIT) {
        for (const key of keys.slice(0, keys.length - DETAIL_CACHE_LIMIT)) delete next[key];
      }
      return next;
    });
  }, []);

  const forget = useCallback((id) => {
    setDetailCache((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const clearCache = useCallback(() => {
    setDetailCache({});
    setSelectedId(null);
    setFilters(BLANK_FILTERS);
    setApplied(BLANK_FILTERS);
    setOffset(0);
  }, []);

  const value = useMemo(
    () => ({
      STATES,
      SENDER_TYPES,
      PRIORITIES,
      PAGE_SIZE,
      filters,
      applied,
      offset,
      selectedId,
      // Exposed, not just written: the detail page caches on every load so
      // navigating back does not re-fetch, and a cache no consumer can read is a
      // cache that only wastes memory.
      detailCache,
      setFilter,
      apply,
      adoptFilters,
      clearFilters,
      setOffset,
      page,
      setSelectedId,
      remember,
      forget,
      clearCache,
    }),
    [
      filters,
      applied,
      offset,
      selectedId,
      detailCache,
      setFilter,
      apply,
      adoptFilters,
      clearFilters,
      setOffset,
      page,
      remember,
      forget,
      clearCache,
    ],
  );

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>;
}

/**
 * Registry state. Throws outside the provider rather than returning a default —
 * a `context` of `null`s would fail later and further from the mistake.
 */
export function useMail() {
  const value = useContext(MailContext);
  if (!value) throw new Error('useMail must be used inside <MailProvider>');
  return value;
}

export { DETAIL_CACHE_LIMIT };
