export function normaliseError(error, fallback = 'Cannot reach the server.') {
  const status = error?.status ?? error?.response?.status ?? null;
  const message = error?.message || error?.response?.data?.message || '';
  const code = error?.code || null;

  // An RLS refusal is checked BEFORE the status code. Supabase Storage returns
  // its bucket policy refusals as `status: 400` ("new row violates row-level
  // security policy"), which the status table below would otherwise file as a
  // *validation* error and tell the user to "Correct the highlighted field" —
  // a field that does not exist. A row-level security refusal is never a
  // validation problem, whichever layer produced it.
  const refusedByRls = code === '42501' || /row-level security/i.test(message);

  // Supabase Storage reports its failures with `errorCode`/`statusCode`, not
  // PostgREST's `code`. So a refusal by the bucket's policies arrives as
  // status 400 with the message "new row violates row-level security policy" —
  // which the table below would file as a *validation* error and answer with
  // "Correct the highlighted field", there being no field. It is not the
  // caller's permission that is missing; the bucket has no INSERT policy.
  const fromStorage = Boolean(error?.errorCode || error?.statusCode);

  let kind;
  if (refusedByRls) {
    kind = fromStorage ? 'storage-refused' : 'forbidden';
  } else if (typeof status === 'number') {
    if (status === 401) kind = 'unauthenticated';
    else if (status === 403) kind = 'forbidden';
    else if (status === 404) kind = 'not-found';
    else if (status === 409) kind = 'conflict';
    else if (status === 422 || status === 400) kind = 'validation';
    else if (status === 415) kind = 'unsupported-file';
    else if (status >= 500) kind = 'server';
    else kind = 'unknown';
  } else if (code === 'PGRST116') {
    // A singular read matched no row. For a scoped caller that is "not here",
    // which is exactly what D29/Q7 want a hidden letter to look like.
    kind = 'not-found';
  } else if (code === 'PGRST301') {
    kind = 'unauthenticated';
  } else if (code) {
    // Supabase/PostgREST errors carry a `code` but no HTTP status. Reporting
    // them as "the server could not be reached" buries the server's own message
    // behind a connectivity fix that cannot help.
    kind = 'server';
  } else {
    kind = 'network';
  }

  return {
    status,
    code: code || (status === null ? 'NETWORK' : `HTTP_${status}`),
    kind,
    field: error?.details?.field ?? null,
    message: message || (status === null ? fallback : `Request failed (${status}).`),
    raw: error,
  };
}

export function errorMessage(error, fallback = 'Cannot reach the server.') {
  return normaliseError(error, fallback).message;
}
