/**
 * Test harness: boot the real app on an ephemeral port, talk to it over HTTP.
 *
 * The app is imported from app.js, not server.js (D18). That is the whole point
 * of the split — server.js starts a listening socket as a side effect of being
 * imported, which would make a test run depend on port 4000 being free and
 * would leave the process hanging at the end.
 *
 * Port 0 asks the OS for a free port, so tests never collide with a dev server
 * the developer has running.
 */
import app from '../../app.js';

/**
 * Start the app and return a handle.
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>}
 */
export async function startServer() {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const { port } = server.address();

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  };
}

/**
 * Issue a request and return status plus parsed body.
 *
 * Never throws on a non-2xx. Almost every test in this suite asserts on the
 * status of a *failure*, so a helper that threw would make the interesting
 * cases the awkward ones.
 *
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} path
 * @param {{token?: string, body?: unknown, headers?: Record<string,string>}} [options]
 */
export async function request(baseUrl, method, path, options = {}) {
  const headers = { ...options.headers };

  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();

  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON body is a bug worth surfacing verbatim rather than as a
    // confusing "unexpected token < in JSON".
    body = { _raw: text };
  }

  return { status: response.status, body };
}
