import type { RoxyonClient } from './client.js';
import { RoxyonApiError, assertOk } from './errors.js';

export interface Application {
  objectId: string;
  Name: string;
  Status?: string;
  DesiredState?: string;
  SourcePath?: string;
  Runtime?: string;
  RuntimeVersion?: string;
  Preset?: string;
  ConfigRevision?: number;
  AppliedRevision?: number;
  LastError?: string;
  Env?: string;
  RepoUrl?: string;
  Subscription?: string;
  [k: string]: unknown;
}

export interface ApplicationProcess {
  objectId: string;
  Application?: string;
  Type?: string;
  Command?: string;
  Status?: string;
  Port?: number;
}

export interface ApplicationRoute {
  objectId: string;
  Application?: string;
  Domain?: string;
  Path?: string;
  Enabled?: number | string;
}

interface Results<T> {
  results?: T[];
  error?: string;
}

export interface DeployResult {
  ok: boolean;
  application: string;
  created?: boolean;
  configRevision?: number;
  files?: number;
  bytes?: number;
  error?: string;
}

/** Params for creating an application on its first deploy (no id yet). */
export interface CreateOnDeploy {
  host: string;
  folder?: string;
  runtime: 'node' | 'python' | 'php';
  runtimeVersion?: string;
  preset?: string;
  command?: string;
  public?: boolean;
}

export interface CreateApplicationInput {
  subscription: string;
  name: string;
  /** Absolute source path: `/home/www/<host>/public_html/<folder>`. */
  sourcePath: string;
  runtime: string;
  runtimeVersion: string;
  preset: string;
  /** The web process start command. */
  command: string;
  /** Route host (`Domains.objectId`). */
  domainId: string;
  /** `.env`-style object stored as JSON on `Applications.Env`. */
  env?: Record<string, string>;
  /** Make the app public (route serves the app instead of the host's files). */
  public?: boolean;
}

/**
 * The Roxyon Applications system. Deployment is declarative: rows describe the
 * desired state and every meaningful change bumps `ConfigRevision`; a
 * server-side reconciler builds the source in an isolated release dir and
 * (re)starts a systemd unit, writing back `Status` / `AppliedRevision` /
 * `LastError`. Mirrors `applications.view` + `modals/app_form.view`.
 */
export class ApplicationsApi {
  constructor(private readonly client: RoxyonClient) {}

  async list(subscriptionId: string): Promise<Application[]> {
    const r = await this.client.get<Results<Application>>('/Applications', {
      fields:
        'objectId,Name,Status,DesiredState,SourcePath,Runtime,RuntimeVersion,Preset,ConfigRevision,AppliedRevision,LastError,Env,RepoUrl,Subscription',
      limit: -1,
      order: 'Name',
      where: { Subscription: subscriptionId },
    });
    return r.results ?? [];
  }

  async get(id: string): Promise<Application | undefined> {
    const r = await this.client.get<Results<Application>>('/Applications', {
      fields:
        'objectId,Name,Status,DesiredState,SourcePath,Runtime,RuntimeVersion,Preset,ConfigRevision,AppliedRevision,LastError,Env,RepoUrl,Subscription',
      limit: 1,
      where: { objectId: id },
    });
    return r.results?.[0];
  }

  /** Create the application + its web process + a route, matching `createNew()`. */
  async create(
    input: CreateApplicationInput,
  ): Promise<{ application: string; process: string; route: string }> {
    const appRes = assertOk(
      await this.client.post<Results<{ objectId: string }>>('/Applications', {
        Subscription: input.subscription,
        Name: input.name,
        Preset: input.preset,
        SourcePath: input.sourcePath,
        Runtime: input.runtime,
        RuntimeVersion: input.runtimeVersion,
        Env: JSON.stringify(input.env ?? {}),
        Status: 'pending',
        DesiredState: 'running',
        ConfigRevision: 1,
        AppliedRevision: 0,
        LastError: '',
      }),
    );
    const appId = appRes.results?.[0]?.objectId;
    if (!appId) throw new RoxyonApiError('No application id returned.', { body: appRes });

    const procRes = assertOk(
      await this.client.post<Results<{ objectId: string }>>('/ApplicationProcesses', {
        Application: appId,
        Type: 'web',
        Port: 0, // allocated by the backend at deploy time
        Command: input.command,
        Status: 'pending',
      }),
    );
    const procId = procRes.results?.[0]?.objectId ?? '';

    const routeRes = assertOk(
      await this.client.post<Results<{ objectId: string }>>('/ApplicationRoutes', {
        Application: appId,
        Domain: input.domainId,
        Path: '/',
        Enabled: input.public ? 1 : 0,
      }),
    );
    const routeId = routeRes.results?.[0]?.objectId ?? '';

    return { application: appId, process: procId, route: routeId };
  }

  // ---- console endpoints (session token or PAT) ----

  /** Read an application's environment. `GET /applications/env`. */
  async getEnv(applicationId: string): Promise<Record<string, string>> {
    const r = await this.client.console<{
      ok?: boolean;
      env?: Record<string, string>;
      error?: string;
    }>('GET', '/applications/env', {
      query: { application: applicationId },
      tolerateHttpError: true,
    });
    if (!r?.ok)
      throw new RoxyonApiError(r?.error || 'Could not read the environment.', { body: r });
    return r.env ?? {};
  }

  /**
   * Merge `set` and delete `remove`, bumping `ConfigRevision`. `PORT`/`HOST` are
   * ignored (platform-managed). `POST /applications/env`. Returns the new env.
   */
  async setEnv(
    applicationId: string,
    changes: { set?: Record<string, string>; remove?: string[] },
  ): Promise<{ env: Record<string, string>; changed: string[]; configRevision: number }> {
    const r = await this.client.console<{
      ok?: boolean;
      env?: Record<string, string>;
      changed?: string[];
      configRevision?: number;
      error?: string;
    }>('POST', '/applications/env', {
      query: { application: applicationId },
      body: { set: changes.set ?? {}, remove: changes.remove ?? [] },
      tolerateHttpError: true,
    });
    if (!r?.ok)
      throw new RoxyonApiError(r?.error || 'Could not update the environment.', { body: r });
    return { env: r.env ?? {}, changed: r.changed ?? [], configRevision: r.configRevision ?? 0 };
  }

  /** Rebuild from the latest source and restart. `POST /applications/action`. */
  async deploy(applicationId: string): Promise<void> {
    const r = await this.client.console<{ error?: string }>('POST', '/applications/action', {
      body: { application: applicationId, action: 'deploy' },
      tolerateHttpError: true,
    });
    if (r?.error) throw new RoxyonApiError(r.error);
  }

  /** Bounce the process only — no rebuild. `POST /applications/action`. */
  async restart(applicationId: string): Promise<void> {
    const r = await this.client.console<{ error?: string }>('POST', '/applications/action', {
      body: { application: applicationId, action: 'restart' },
      tolerateHttpError: true,
    });
    if (r?.error) throw new RoxyonApiError(r.error);
  }

  /**
   * Tail the app's journal. `POST /applications/logs` returns one block per
   * process (`{ type, unit, output }`); this flattens them to lines, each
   * prefixed with the process type when there is more than one.
   */
  async logs(applicationId: string, lines = 100): Promise<string[]> {
    const r = await this.client.console<{
      processes?: Array<{ type?: string; unit?: string; output?: string }>;
      error?: string;
    }>('POST', '/applications/logs', {
      body: { application: applicationId, lines },
      tolerateHttpError: true,
    });
    if (r?.error) throw new RoxyonApiError(r.error);
    const procs = r?.processes ?? [];
    const multi = procs.length > 1;
    const out: string[] = [];
    for (const p of procs) {
      const body = (p.output ?? '').split('\n').filter(Boolean);
      for (const line of body) out.push(multi ? `[${p.type ?? 'web'}] ${line}` : line);
    }
    return out;
  }

  /** Connect a git remote for push-to-deploy. `POST /applications/repo/connect`. */
  async repoConnect(
    applicationId: string,
    repoUrl: string,
    branch = 'main',
  ): Promise<{
    provider?: string;
    deployKey?: string;
    webhookUrl?: string;
    secret?: string;
    hint?: string;
  }> {
    const r = await this.client.console<{
      error?: string;
      provider?: string;
      deployKey?: string;
      webhookUrl?: string;
      secret?: string;
      hint?: string;
      branch?: string;
    }>('POST', '/applications/repo/connect', {
      body: { application: applicationId, repoUrl, branch },
      tolerateHttpError: true,
    });
    if (r?.error) throw new RoxyonApiError(r.error);
    return r;
  }

  /**
   * Upload a gzipped tarball of the project source. The endpoint lands it in the
   * application's `SourcePath` and bumps `ConfigRevision` (the reconciler then
   * builds it in a release dir exactly as for a git deploy).
   *
   * `POST /applications/deploy` — NEW endpoint (see `backend/` in this repo).
   */
  async uploadSource(target: string | CreateOnDeploy, tarball: Uint8Array): Promise<DeployResult> {
    const query: Record<string, string> =
      typeof target === 'string'
        ? { application: target }
        : {
            host: target.host,
            folder: target.folder ?? '',
            runtime: target.runtime,
            ...(target.runtimeVersion ? { runtimeVersion: target.runtimeVersion } : {}),
            ...(target.preset ? { preset: target.preset } : {}),
            ...(target.command ? { command: target.command } : {}),
            public: target.public === false ? '0' : '1',
          };
    const r = await this.client.console<DeployResult>('POST', '/applications/deploy', {
      query,
      headers: { 'content-type': 'application/gzip' },
      body: tarball,
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Upload failed.', { body: r });
    return r;
  }
}
