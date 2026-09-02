import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type AccountApp,
  RUNTIMES,
  type Roxyon,
  RoxyonApiError,
  isAuthError,
} from '@roxyon/api-client';
import { packDirectory } from './archive.js';
import { type ProjectConfig, loadProjectConfig, saveProjectConfig } from './project.js';
import { runShellCommand } from './run-command.js';

export interface DeployReporter {
  /** A high-level phase change ("Building", "Uploading", "Live"). */
  step?: (msg: string) => void;
  /** A single build- or runtime-log line. */
  log?: (line: string) => void;
}

export interface DeployParams {
  cwd: string;
  /** An authenticated client. */
  roxyon: Roxyon;
  /** Subscription objectId / Name to prefer when the account has several. */
  preferredSubscription?: string;
  /** Run the configured build command (default true). */
  build?: boolean;
  /** For app deploys: poll until running/failed (default true). */
  follow?: boolean;
  pollMs?: number;
  timeoutMs?: number;
  reporter?: DeployReporter;
  /** Override the build-command runner (default: spawn a shell). */
  runCommand?: (command: string, cwd: string, reporter?: DeployReporter) => Promise<number>;
}

export type DeployOutcome =
  | { kind: 'static'; ok: true; url: string; files: number; config: ProjectConfig }
  | {
      kind: 'app';
      ok: true;
      application: string;
      status: string;
      revision: number;
      url?: string;
      config: ProjectConfig;
      logs: string[];
    }
  | {
      kind: 'app';
      ok: false;
      application: string;
      status: string;
      error: string;
      config: ProjectConfig;
      logs: string[];
    };

export class DeployError extends Error {
  readonly code:
    | 'no-config'
    | 'auth'
    | 'bad-host'
    | 'build-failed'
    | 'no-build-output'
    | 'upload-failed'
    | 'create-failed';
  constructor(message: string, code: DeployError['code']) {
    super(message);
    this.name = 'DeployError';
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Build (if configured), archive, upload, and — for app runtimes — poll until
 * the deploy settles. Self-contained: one `/account/context` call validates the
 * host (works with a session token or a `roxp_` PAT), and the console creates
 * the application on the first deploy — the new id is written back to
 * `roxyon.json`.
 */
export async function deployProject(params: DeployParams): Promise<DeployOutcome> {
  const { cwd, roxyon, reporter } = params;
  const runCommand = params.runCommand ?? runShellCommand;

  const config = await loadProjectConfig(cwd);
  if (!config) {
    throw new DeployError('No roxyon.json in this directory — run init first.', 'no-config');
  }

  // One call — works with a session token or a PAT.
  const ctx = await roxyon.account.context().catch((e) => {
    if (isAuthError(e)) throw new DeployError('Session expired — sign in again.', 'auth');
    throw e;
  });
  const domain = ctx.domains.find((d) => d.name === config.host);
  if (!domain) {
    throw new DeployError(
      `Host "${config.host}" is not on this account (have: ${
        ctx.domains.map((d) => d.name).join(', ') || 'none'
      }).`,
      'bad-host',
    );
  }

  // ---- build ----
  if (config.build && params.build !== false) {
    reporter?.step?.(`Build: ${config.build}`);
    const code = await runCommand(config.build, cwd, reporter);
    if (code !== 0) throw new DeployError(`Build command exited ${code}.`, 'build-failed');
  }

  // ---- pack ----
  const artifactDir = config.kind === 'static' && config.outDir ? resolve(cwd, config.outDir) : cwd;
  if (config.kind === 'static' && config.outDir) {
    await access(artifactDir).catch(() => {
      throw new DeployError(
        `Build output "${config.outDir}" not found — did the build run?`,
        'no-build-output',
      );
    });
  }
  reporter?.step?.(`Packing ${artifactDir === cwd ? '.' : config.outDir}`);
  const pack = await packDirectory(artifactDir);
  reporter?.log?.(`${pack.files.length} files · ${(pack.bytes / 1024).toFixed(0)} KB`);

  // ---- static ----
  if (config.kind === 'static') {
    reporter?.step?.(`Uploading to ${config.host}${config.folder ? `/${config.folder}` : ''}`);
    let res: Awaited<ReturnType<typeof roxyon.sites.deploy>>;
    try {
      res = await roxyon.sites.deploy(config.host, config.folder, pack.buffer);
    } catch (err) {
      throw new DeployError(
        err instanceof RoxyonApiError ? err.message : String(err),
        'upload-failed',
      );
    }
    const url = `https://${res.host}${res.path && res.path !== '/' ? res.path : ''}`;
    reporter?.step?.(`Live — ${url}`);
    return { kind: 'static', ok: true, url, files: res.files ?? pack.files.length, config };
  }

  // ---- app ----
  // The console's /applications/deploy creates the app rows on the first deploy
  // (no `application` id yet) from the host + runtime params — one trusted call,
  // so a PAT-only CI job needs no BaaS write access.
  const runtime = config.runtime === 'lumen' ? 'node' : config.runtime;
  const spec = RUNTIMES[runtime];
  const target = config.application ?? {
    host: config.host,
    folder: config.folder,
    runtime,
    runtimeVersion: config.runtimeVersion ?? spec.defaultVersion,
    preset: config.preset ?? spec.presets[0]?.[0] ?? runtime,
    command: config.start ?? spec.command,
    public: config.public ?? true,
  };

  reporter?.step?.(
    config.application ? 'Uploading source' : 'Creating the application & uploading',
  );
  let revision = 0;
  let appId: string;
  try {
    const res = await roxyon.applications.uploadSource(target, pack.buffer);
    revision = res.configRevision ?? 0;
    appId = res.application;
    if (res.created && appId && appId !== config.application) {
      config.application = appId;
      await saveProjectConfig(config, cwd);
      reporter?.log?.(`application ${appId} created`);
    }
  } catch (err) {
    throw new DeployError(
      err instanceof RoxyonApiError ? err.message : String(err),
      config.application ? 'upload-failed' : 'create-failed',
    );
  }

  const url = config.public
    ? `https://${config.host}${config.folder ? `/${config.folder}` : ''}`
    : undefined;

  if (params.follow === false) {
    reporter?.step?.(`Build queued (revision ${revision})`);
    return {
      kind: 'app',
      ok: true,
      application: appId,
      status: 'building',
      revision,
      url,
      config,
      logs: [],
    };
  }

  return watch(roxyon, appId, {
    reporter,
    url,
    config,
    pollMs: params.pollMs ?? 3000,
    timeoutMs: params.timeoutMs ?? 10 * 60 * 1000,
  });
}

async function watch(
  roxyon: Roxyon,
  appId: string,
  opts: {
    reporter?: DeployReporter;
    url?: string;
    config: ProjectConfig;
    pollMs: number;
    timeoutMs: number;
  },
): Promise<DeployOutcome> {
  const started = Date.now();
  const seen = new Set<string>();
  const collected: string[] = [];
  let lastStatus = '';

  opts.reporter?.step?.('Building');
  while (true) {
    await sleep(opts.pollMs);

    let app: AccountApp | undefined;
    try {
      app = await roxyon.account.getApp(appId);
    } catch {
      /* transient */
    }
    if (!app) {
      if (Date.now() - started > opts.timeoutMs) break;
      continue;
    }

    const cfg = app.configRevision;
    const applied = app.appliedRevision;
    const status = app.status;
    if (status !== lastStatus) {
      opts.reporter?.step?.(`${status || 'pending'} (${applied}/${cfg})`);
      lastStatus = status;
    }

    try {
      for (const line of await roxyon.applications.logs(appId, 40)) {
        if (line && !seen.has(line)) {
          seen.add(line);
          collected.push(line);
          opts.reporter?.log?.(line);
        }
      }
    } catch {
      /* transient */
    }

    if (cfg <= applied && status === 'running') {
      opts.reporter?.step?.(`Live${opts.url ? ` — ${opts.url}` : ''}`);
      return {
        kind: 'app',
        ok: true,
        application: appId,
        status: 'running',
        revision: applied,
        url: opts.url,
        config: opts.config,
        logs: collected,
      };
    }
    if (status === 'failed') {
      return {
        kind: 'app',
        ok: false,
        application: appId,
        status: 'failed',
        error: (app.lastError || 'Deploy failed.').trim(),
        config: opts.config,
        logs: collected,
      };
    }
    if (Date.now() - started > opts.timeoutMs) break;
  }

  return {
    kind: 'app',
    ok: false,
    application: appId,
    status: 'timeout',
    error: 'Still building after the timeout — check `roxyon logs`.',
    config: opts.config,
    logs: collected,
  };
}
