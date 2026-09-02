import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as p from '@clack/prompts';
import {
  type Application,
  RUNTIMES,
  type Roxyon,
  RoxyonApiError,
  isAuthError,
} from '@roxyon/api-client';
import { packDirectory } from '../archive.js';
import { type ProjectConfig, loadProjectConfig, saveProjectConfig } from '../config.js';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export interface DeployOptions {
  follow?: boolean;
  build?: boolean;
  lines?: number;
}

export async function deploy(opts: DeployOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await loadProjectConfig(cwd);
  if (!config) fail('No roxyon.json here. Run `roxyon init` first.', EXIT.configError);

  const { roxyon, credentials } = await requireSession();
  const user = await roxyon.auth.me().catch((e) => {
    if (isAuthError(e)) fail('Session expired. Run `roxyon login`.', EXIT.authRequired);
    throw e;
  });
  const sub = await roxyon.subscriptions.resolve(user.objectId, credentials?.subscription);
  const domains = await roxyon.domains.list(sub.objectId);
  const domain = domains.find((d) => d.Name === config.host);
  if (!domain) {
    fail(
      `Host "${config.host}" is not on this subscription. Hosts: ${domains.map((d) => d.Name).join(', ') || '(none)'}`,
      EXIT.configError,
    );
  }

  // ---- build ----
  if (config.build && opts.build !== false) {
    await runBuild(config.build, cwd);
  } else if (config.build) {
    ui.warn('Skipping build (--no-build).');
  }

  // ---- pick the artifact directory ----
  const artifactDir = config.kind === 'static' && config.outDir ? resolve(cwd, config.outDir) : cwd;
  if (config.kind === 'static' && config.outDir) {
    await access(artifactDir).catch(() =>
      fail(`Build output "${config.outDir}" not found. Did the build run?`, EXIT.failure),
    );
  }

  ui.info(`Packing ${artifactDir === cwd ? '.' : config.outDir}`);
  const pack = await packDirectory(artifactDir);
  ui.dim(`${pack.files.length} files · ${(pack.bytes / 1024).toFixed(0)} KB compressed`);

  if (config.kind === 'static') {
    await deployStatic(roxyon, config, pack.buffer);
    return;
  }
  await deployApp(roxyon, config, domain.objectId, sub.objectId, pack.buffer, cwd, opts);
}

// ---------------------------------------------------------------------------

async function deployStatic(roxyon: Roxyon, config: ProjectConfig, buffer: Buffer): Promise<void> {
  const spin = p.spinner();
  spin.start(`Uploading to ${config.host}${config.folder ? `/${config.folder}` : ''}`);
  try {
    const res = await roxyon.sites.deploy(config.host, config.folder, buffer);
    spin.stop('Deployed.');
    ui.success(
      `https://${res.host}${res.path && res.path !== '/' ? res.path : ''} is live (${res.files ?? '?'} files).`,
    );
  } catch (err) {
    spin.stop('Upload failed.');
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}

async function deployApp(
  roxyon: Roxyon,
  config: ProjectConfig,
  domainId: string,
  subscriptionId: string,
  buffer: Buffer,
  cwd: string,
  opts: DeployOptions,
): Promise<void> {
  let appId = config.application;

  if (!appId) {
    ui.info('First deploy — creating the application.');
    const runtime = config.runtime === 'lumen' ? 'node' : config.runtime;
    const spec = RUNTIMES[runtime];
    const sourcePath = `/home/www/${config.host}/public_html${config.folder ? `/${config.folder}` : ''}`;
    try {
      const created = await roxyon.applications.create({
        subscription: subscriptionId,
        name: config.name,
        sourcePath,
        runtime,
        runtimeVersion: config.runtimeVersion ?? spec.defaultVersion,
        preset: config.preset ?? spec.presets[0]?.[0] ?? runtime,
        command: config.start ?? spec.command,
        domainId,
        public: config.public ?? true,
      });
      appId = created.application;
      config.application = appId;
      await saveProjectConfig(config, cwd);
      ui.success(`Application ${appId} created; id saved to roxyon.json.`);
    } catch (err) {
      if (err instanceof RoxyonApiError) fail(`Could not create the application: ${err.message}`);
      throw err;
    }
  }

  const spin = p.spinner();
  spin.start('Uploading source');
  try {
    const res = await roxyon.applications.uploadSource(appId, buffer);
    spin.stop(`Uploaded — building revision ${res.configRevision ?? '?'}.`);
  } catch (err) {
    spin.stop('Upload failed.');
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }

  if (opts.follow === false) {
    ui.info('Build queued. Watch it with `roxyon logs --follow`.');
    return;
  }
  await watchDeploy(roxyon, appId, opts.lines ?? 40);
}

// ---------------------------------------------------------------------------

async function watchDeploy(roxyon: Roxyon, appId: string, lines: number): Promise<void> {
  const spin = p.spinner();
  spin.start('Building');
  const started = Date.now();
  let seen = new Set<string>();
  let lastStatus = '';

  while (true) {
    await sleep(3000);
    let app: Application | undefined;
    try {
      app = await roxyon.applications.get(appId);
    } catch {
      /* transient — keep polling */
    }
    if (!app) continue;

    const cfg = Number(app.ConfigRevision ?? 0);
    const applied = Number(app.AppliedRevision ?? 0);
    const status = String(app.Status ?? '');
    if (status !== lastStatus) {
      spin.message(`Building — ${status || 'pending'} (${applied}/${cfg})`);
      lastStatus = status;
    }

    // stream new log lines
    try {
      const log = await roxyon.applications.logs(appId, lines);
      for (const l of log) {
        if (l && !seen.has(l)) {
          seen.add(l);
          ui.dim(`  ${l}`);
        }
      }
      if (seen.size > 2000) seen = new Set([...seen].slice(-1000));
    } catch {
      /* logs endpoint transient */
    }

    const settled = cfg <= applied;
    if (settled && status === 'running') {
      spin.stop(
        `Live — revision ${applied} running (${((Date.now() - started) / 1000).toFixed(0)}s).`,
      );
      return;
    }
    if (status === 'failed') {
      spin.stop('Deploy failed.');
      if (app.LastError) {
        ui.line();
        ui.error(app.LastError.trim());
      }
      process.exitCode = EXIT.failure;
      return;
    }
    if (Date.now() - started > 10 * 60 * 1000) {
      spin.stop('Still building after 10 min — check `roxyon logs`.');
      return;
    }
  }
}

async function runBuild(command: string, cwd: string): Promise<void> {
  ui.info(`Build: ${command}`);
  const code = await new Promise<number>((res) => {
    const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
    child.on('close', (c) => res(c ?? 0));
    child.on('error', () => res(127));
  });
  if (code !== 0) fail(`Build command exited ${code}.`, EXIT.failure);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { join };
