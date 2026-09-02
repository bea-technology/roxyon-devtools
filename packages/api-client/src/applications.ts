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
  configRevision?: number;
  error?: string;
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

  /** Merge `Env` (JSON object) and bump `ConfigRevision` so the next deploy applies it. */
  async setEnv(
    app: Pick<Application, 'objectId' | 'ConfigRevision'>,
    env: Record<string, string>,
  ): Promise<void> {
    assertOk(
      await this.client.put('/Applications', {
        objectId: app.objectId,
        Env: JSON.stringify(env),
        ConfigRevision: Number(app.ConfigRevision ?? 0) + 1,
      }),
    );
  }

  // ---- console endpoints (session-authed) ----

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

  /** Tail the app's journal. `POST /applications/logs`. Returns formatted lines. */
  async logs(applicationId: string, lines = 100): Promise<string[]> {
    const r = await this.client.console<{ lines?: string[]; log?: string; error?: string }>(
      'POST',
      '/applications/logs',
      { body: { application: applicationId, lines }, tolerateHttpError: true },
    );
    if (r?.error) throw new RoxyonApiError(r.error);
    if (Array.isArray(r?.lines)) return r.lines;
    if (typeof r?.log === 'string') return r.log.split('\n');
    return [];
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
  async uploadSource(applicationId: string, tarball: Uint8Array): Promise<DeployResult> {
    const form = new FormData();
    form.set('application', applicationId);
    form.set('archive', new Blob([tarball], { type: 'application/gzip' }), 'source.tar.gz');
    const r = await this.client.console<DeployResult>('POST', '/applications/deploy', {
      body: form,
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Upload failed.', { body: r });
    return r;
  }
}
