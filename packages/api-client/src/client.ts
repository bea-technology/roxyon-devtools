import { DEFAULT_APP, DEFAULT_BAAS_URL, DEFAULT_CONSOLE_URL, H } from './constants.js';
import { RoxyonApiError } from './errors.js';
import { type QueryObject, toQueryString } from './query.js';

export interface RoxyonClientOptions {
  /** BaaS application id. Defaults to the public console app. */
  appId?: string;
  /** Public JavaScript key, used to mint an anonymous token. */
  javascriptKey?: string;
  /** REST API key. Optional; grants full access — only for trusted server use. */
  restKey?: string;
  /** A user session token (from {@link AuthApi.login}). */
  sessionToken?: string;
  /** BaaS REST base, e.g. `https://www.beaapis.com/1`. */
  baseUrl?: string;
  /** Console base that serves the `/applications/*` endpoints. */
  consoleUrl?: string;
  /** Custom fetch (tests / proxies). */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  query?: QueryObject;
  body?: unknown;
  headers?: Record<string, string>;
  /** Skip the Authorization/session header entirely (used for token minting). */
  skipAuth?: boolean;
  /** Send/parse the response even on a non-2xx status instead of throwing. */
  tolerateHttpError?: boolean;
  signal?: AbortSignal;
}

interface AnonToken {
  access_token?: string;
  session_token?: string;
  refresh_token?: string;
  expires_in?: number;
  /** epoch ms this token becomes unusable */
  _expiresAt?: number;
}

/**
 * Low-level transport for the Roxyon BaaS and console app endpoints.
 *
 * Auth precedence per request: explicit `sessionToken` -> `restKey` ->
 * a lazily-minted anonymous access token (public app credentials).
 */
export class RoxyonClient {
  readonly baseUrl: string;
  readonly consoleUrl: string;
  private readonly appId: string;
  private readonly javascriptKey: string;
  private readonly restKey?: string;
  private readonly _fetch: typeof fetch;
  private sessionToken?: string;
  private anon?: AnonToken;

  constructor(opts: RoxyonClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BAAS_URL).replace(/\/+$/, '');
    this.consoleUrl = (opts.consoleUrl ?? DEFAULT_CONSOLE_URL).replace(/\/+$/, '');
    this.appId = opts.appId ?? DEFAULT_APP.appId;
    this.javascriptKey = opts.javascriptKey ?? DEFAULT_APP.javascriptKey;
    this.restKey = opts.restKey;
    this.sessionToken = opts.sessionToken;
    this._fetch = opts.fetch ?? globalThis.fetch;
    if (typeof this._fetch !== 'function') {
      throw new Error('No fetch implementation available (need Node >= 20 or pass opts.fetch).');
    }
  }

  getSessionToken(): string | undefined {
    return this.sessionToken;
  }

  setSessionToken(token: string | undefined): void {
    this.sessionToken = token;
  }

  /** Mint (or reuse) an anonymous access token from the public app credentials. */
  private async anonToken(): Promise<AnonToken> {
    if (this.anon?._expiresAt && this.anon._expiresAt > Date.now() + 5_000) {
      return this.anon;
    }
    const res = await this._fetch(`${this.baseUrl}/Auth`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [H.appId]: this.appId,
        [H.jsKey]: this.javascriptKey,
      },
      body: JSON.stringify({ scope: 'public' }),
    });
    const json = (await res.json().catch(() => ({}))) as AnonToken;
    if (!json.access_token && !json.session_token) {
      throw new RoxyonApiError('Could not obtain an anonymous BaaS token.', {
        status: res.status,
        body: json,
      });
    }
    json._expiresAt = Date.now() + (json.expires_in ? json.expires_in * 1000 : 3_600_000);
    this.anon = json;
    return json;
  }

  /** A Personal Access Token (`roxp_…`) authenticates the console endpoints via
   * `Authorization: Bearer`; it is not a BaaS session token. */
  private get isPat(): boolean {
    return this.sessionToken?.startsWith('roxp_') ?? false;
  }

  private async authHeaders(
    skipAuth: boolean,
    isConsole: boolean,
  ): Promise<Record<string, string>> {
    const base: Record<string, string> = { [H.appId]: this.appId };
    if (skipAuth) return base;
    if (this.isPat) {
      // Console: Bearer. BaaS: nothing useful — PAT clients resolve identity and
      // subscriptions through the console's /account/context instead.
      return isConsole ? { ...base, authorization: `Bearer ${this.sessionToken}` } : base;
    }
    if (this.sessionToken) return { ...base, [H.sessionToken]: this.sessionToken };
    if (this.restKey) return { ...base, [H.restKey]: this.restKey };
    const anon = await this.anonToken();
    if (anon.session_token) return { ...base, [H.sessionToken]: anon.session_token };
    return { ...base, [H.accessToken]: anon.access_token ?? '' };
  }

  /** A raw BaaS request. `path` is relative to {@link baseUrl} (leading `/`). */
  async request<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    return this.rawRequest<T>(this.baseUrl, method, path, opts);
  }

  /** A request against the console app endpoints ({@link consoleUrl}). */
  async console<T = unknown>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    return this.rawRequest<T>(this.consoleUrl, method, path, opts);
  }

  private async rawRequest<T>(
    root: string,
    method: string,
    path: string,
    opts: RequestOptions,
  ): Promise<T> {
    const qs = toQueryString(opts.query);
    const url = `${root}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`;
    const headers: Record<string, string> = {
      ...(await this.authHeaders(opts.skipAuth ?? false, root === this.consoleUrl)),
      ...opts.headers,
    };
    const hasBody = method !== 'GET' && method !== 'HEAD' && opts.body !== undefined;
    let body: string | Uint8Array | ArrayBuffer | FormData | undefined;
    if (hasBody) {
      if (
        typeof opts.body === 'string' ||
        opts.body instanceof Uint8Array ||
        opts.body instanceof ArrayBuffer ||
        (typeof FormData !== 'undefined' && opts.body instanceof FormData)
      ) {
        body = opts.body as string | Uint8Array | ArrayBuffer | FormData;
      } else {
        headers['content-type'] = headers['content-type'] ?? 'application/json';
        body = JSON.stringify(opts.body);
      }
    }

    let res: Response;
    try {
      res = await this._fetch(url, { method, headers, body, signal: opts.signal });
    } catch (cause) {
      throw new RoxyonApiError(`Network error calling ${method} ${url}`, { body: cause });
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { error: text || `HTTP ${res.status}`, _raw: text };
    }

    if (!res.ok && !opts.tolerateHttpError) {
      const msg =
        (json &&
          typeof json === 'object' &&
          'error' in json &&
          (json as { error: string }).error) ||
        `HTTP ${res.status} calling ${method} ${path}`;
      throw new RoxyonApiError(String(msg), { status: res.status, body: json });
    }
    return json as T;
  }

  get<T = unknown>(path: string, query?: QueryObject, opts?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, { ...opts, query });
  }
  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('POST', path, { ...opts, body });
  }
  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('PUT', path, { ...opts, body });
  }
  del<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, { ...opts, body });
  }
}
