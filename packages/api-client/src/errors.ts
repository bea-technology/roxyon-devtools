/**
 * The Roxyon BaaS ("RX" engine) resolves failed writes rather than rejecting
 * them — a rejected promise never fires and a failure is shaped like a success
 * body with an `error` string on it (top-level, or inside `results[]`). Every
 * write must be run through {@link rxError} before it is treated as having
 * worked. This mirrors `rxError()` in `console.roxyon.com/src/index.js`.
 *
 * Known failure shapes:
 *   { "results": [ { "code": 1054, "error": "Unknown column ...", "type": "DBQueryError" } ] }
 *   { "code": 105, "error": "Invalid Field Name", "type": "InvalidFieldName" }
 */

export interface RxErrorBody {
  code?: number;
  error?: string;
  type?: string;
  results?: unknown;
}

/** Returns the error message from a BaaS response, or `''` when the call worked. */
export function rxError(r: unknown): string {
  if (r === null || r === undefined) return 'No response from the server.';
  if (typeof r !== 'object') return '';
  const body = r as RxErrorBody;
  if (typeof body.error === 'string' && body.error) return body.error;
  const rows = body.results;
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (row && typeof row === 'object' && typeof (row as RxErrorBody).error === 'string') {
        const msg = (row as RxErrorBody).error;
        if (msg) return msg;
      }
    }
  }
  return '';
}

export class RoxyonApiError extends Error {
  readonly code?: number;
  readonly type?: string;
  readonly status?: number;
  readonly body: unknown;

  constructor(
    message: string,
    opts: { code?: number; type?: string; status?: number; body?: unknown } = {},
  ) {
    super(message);
    this.name = 'RoxyonApiError';
    this.code = opts.code;
    this.type = opts.type;
    this.status = opts.status;
    this.body = opts.body;
  }
}

const AUTH_CODES = new Set([101, 141, 209, 1060, 1063, 401]);
const AUTH_HINTS = [
  'invalid session',
  'session token',
  'unauthorized',
  'not authorized',
  'invalid token',
  'expired',
  'log in again',
];

/** True when an error looks like "the session/token is gone", so the caller can re-auth. */
export function isAuthError(err: unknown): boolean {
  if (err instanceof RoxyonApiError) {
    if (err.status === 401 || err.status === 403) return true;
    if (err.code !== undefined && AUTH_CODES.has(err.code)) return true;
  }
  const msg = (
    err instanceof Error ? err.message : typeof err === 'string' ? err : rxError(err)
  ).toLowerCase();
  return AUTH_HINTS.some((h) => msg.includes(h));
}

/** Locate the object (top-level or a `results[]` row) that carries the error. */
function erroringNode(r: unknown): RxErrorBody | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const body = r as RxErrorBody;
  if (typeof body.error === 'string' && body.error) return body;
  if (Array.isArray(body.results)) {
    for (const row of body.results) {
      if (row && typeof row === 'object' && (row as RxErrorBody).error) return row as RxErrorBody;
    }
  }
  return undefined;
}

/** Throw a {@link RoxyonApiError} if `r` carries a BaaS error; otherwise return it typed. */
export function assertOk<T>(r: T): T {
  const msg = rxError(r);
  if (msg) {
    const node = erroringNode(r);
    throw new RoxyonApiError(msg, { code: node?.code, type: node?.type, body: r });
  }
  return r;
}
