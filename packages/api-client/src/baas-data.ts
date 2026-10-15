import { RoxyonApiError } from './errors.js';

/** BaaS V2 base. V1 (`/1`) is frozen; app data tools speak V2 only. */
export const DEFAULT_BAAS_V2_URL = 'https://www.beaapis.com/2';

/** V2 caps one page at 200 rows. */
export const BAAS_MAX_PAGE = 200;
/** V2 takes 1 to 50 requests per batch. */
export const BAAS_MAX_BATCH = 50;

export interface BaasDataOptions {
  /** The app's secret key (`rxsk_…`): server scope, from the project's API keys in Roxyon Base. */
  secretKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type BaasRow = Record<string, unknown>;

export interface BaasQuery {
  /** e.g. `{ Status: 'active', Age: { gt: 18 } }`; `in` takes a comma-joined string. */
  where?: Record<string, unknown>;
  /** `*` and/or column names, comma separated. Defaults to `*`. */
  fields?: string;
  /** Comma list, `-` for descending, e.g. `-createdAt`. */
  order?: string;
  /** 1 to 200 (default 50). */
  limit?: number;
  skip?: number;
  /** Also return the total number of matching rows. */
  count?: boolean;
}

export interface BaasBatchRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** `/Class` or `/Class/<id>`. */
  path: string;
  body?: Record<string, unknown>;
}

/** One batch answer: `ok:false` with `error`/`message`, or that request's own V2 answer. */
export interface BaasBatchResult {
  status: number;
  ok?: boolean;
  error?: string;
  message?: string;
  result?: BaasRow;
  results?: BaasRow[];
  count?: number;
  id?: string;
}

interface V2Body {
  ok?: boolean;
  error?: string;
  message?: string;
  details?: unknown;
  result?: BaasRow;
  results?: unknown[];
  count?: number;
  id?: string;
}

// Mirrors App.php: classes `^[A-Za-z][A-Za-z0-9_]{0,63}$` (no `_` system classes), ids `^[A-Za-z0-9]{1,40}$`.
const CLASS_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ID_RE = /^[A-Za-z0-9]{1,40}$/;

function checkClass(name: string): string {
  if (!CLASS_RE.test(name)) throw new Error(`Invalid class name "${name}".`);
  return name;
}

function checkId(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`Invalid objectId "${id}".`);
  return id;
}

/**
 * Records of ONE app on BaaS V2, as that app's own backend (server scope, `X-RX-Secret-Key`).
 * Server scope passes every class rule, so treat the key like a database password. V2 answers
 * failures as `{ok:false, error, message}` with an HTTP status; every call throws on those.
 * Schema changes are not reachable with a secret key (console API only).
 */
export class BaasDataApi {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly _fetch: typeof fetch;

  constructor(opts: BaasDataOptions) {
    if (!opts.secretKey.startsWith('rxsk_')) {
      throw new Error('BaaS V2 needs the app secret key (starts with rxsk_).');
    }
    this.secretKey = opts.secretKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BAAS_V2_URL).replace(/\/+$/, '');
    this._fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async call(
    method: string,
    path: string,
    opts: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<V2Body> {
    const qs =
      opts.query && Object.keys(opts.query).length ? `?${new URLSearchParams(opts.query)}` : '';
    const headers: Record<string, string> = { 'x-rx-secret-key': this.secretKey };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    let res: Response;
    try {
      res = await this._fetch(`${this.baseUrl}${path}${qs}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    } catch (e) {
      throw new RoxyonApiError(`Could not reach ${this.baseUrl}: ${(e as Error).message}`);
    }
    let body: V2Body = {};
    try {
      body = ((await res.json()) as V2Body) ?? {};
    } catch {
      // Non-JSON (proxy error page): handled below.
    }
    if (!res.ok || body.ok !== true) {
      const msg = body.message || body.error || `HTTP ${res.status}`;
      throw new RoxyonApiError(msg, { status: res.status, type: body.error, body });
    }
    return body;
  }

  private static recordPath(className: string, id?: string): string {
    return `/records/${checkClass(className)}${id === undefined ? '' : `/${checkId(id)}`}`;
  }

  async query(className: string, q: BaasQuery = {}): Promise<{ rows: BaasRow[]; count?: number }> {
    const limit = q.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > BAAS_MAX_PAGE) {
      throw new Error(`limit must be 1 to ${BAAS_MAX_PAGE}.`);
    }
    const query: Record<string, string> = { fields: q.fields || '*', limit: String(limit) };
    // V2 takes where as JSON text, so operators and `in` strings survive unchanged.
    if (q.where && Object.keys(q.where).length) query.where = JSON.stringify(q.where);
    if (q.order) query.order = q.order;
    if (q.skip) query.skip = String(q.skip);
    if (q.count) query.count = '1';
    const r = await this.call('GET', BaasDataApi.recordPath(className), { query });
    return {
      rows: (r.results ?? []) as BaasRow[],
      ...(r.count !== undefined ? { count: r.count } : {}),
    };
  }

  async get(className: string, objectId: string): Promise<BaasRow> {
    const r = await this.call('GET', BaasDataApi.recordPath(className, objectId));
    return r.result ?? {};
  }

  /** Returns the created row as stored. */
  async create(className: string, data: BaasRow): Promise<BaasRow> {
    const r = await this.call('POST', BaasDataApi.recordPath(className), { body: { data } });
    return r.result ?? {};
  }

  async update(className: string, objectId: string, data: BaasRow): Promise<BaasRow> {
    const r = await this.call('PUT', BaasDataApi.recordPath(className, objectId), {
      body: { data },
    });
    return r.result ?? {};
  }

  /** The id goes in the URL path, never the body. */
  async delete(className: string, objectId: string): Promise<void> {
    await this.call('DELETE', BaasDataApi.recordPath(className, objectId));
  }

  /** 1 to 50 record requests in one call; one failing doesn't stop the others. */
  async batch(requests: BaasBatchRequest[]): Promise<BaasBatchResult[]> {
    if (requests.length < 1 || requests.length > BAAS_MAX_BATCH) {
      throw new Error(`A batch takes 1 to ${BAAS_MAX_BATCH} requests.`);
    }
    for (const req of requests) {
      const [cls, id, extra] = req.path.split('/').filter(Boolean);
      if (!cls || extra !== undefined)
        throw new Error(`Batch path "${req.path}" must be /Class or /Class/id.`);
      checkClass(cls);
      if (id !== undefined) checkId(id);
    }
    const r = await this.call('POST', '/batch', { body: { requests } });
    return (r.results ?? []) as BaasBatchResult[];
  }
}
