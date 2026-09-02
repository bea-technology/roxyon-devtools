import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import * as p from '@clack/prompts';
import { isCancel } from '@clack/prompts';
import { RoxyonApiError } from '@roxyon/api-client';
import { loadProjectConfig, saveProjectConfig } from '../config.js';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export async function restart(opts: { app?: string }): Promise<void> {
  const appId = opts.app ?? (await loadProjectConfig())?.application;
  if (!appId)
    fail('No application. Pass --app <id> or deploy this project first.', EXIT.configError);
  const { roxyon } = await requireSession();
  try {
    await roxyon.applications.restart(appId);
    ui.success('Restart queued.');
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}

export async function open(): Promise<void> {
  const config = await loadProjectConfig();
  if (!config) fail('No roxyon.json here.', EXIT.configError);
  const url = `https://${config.host}${config.folder ? `/${config.folder}` : ''}`;
  const cmd = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: platform() === 'win32' }).unref();
  ui.info(`Opening ${url}`);
}

export async function link(
  repoUrl: string | undefined,
  opts: { branch?: string; app?: string },
): Promise<void> {
  const config = await loadProjectConfig();
  const appId = opts.app ?? config?.application;
  if (!appId)
    fail(
      'Deploy the project once first so an application exists, then `roxyon link`.',
      EXIT.configError,
    );

  const url =
    repoUrl ??
    (process.stdin.isTTY
      ? await ask(() =>
          p.text({ message: 'Git remote (SSH URL)', placeholder: 'git@github.com:you/app.git' }),
        )
      : fail('Pass the git remote URL: roxyon link <url>', EXIT.configError));
  const branch = opts.branch ?? 'main';

  const { roxyon } = await requireSession();
  try {
    const res = await roxyon.applications.repoConnect(appId, url, branch);
    ui.success(`Connected ${url} (${branch}).`);
    ui.line();
    if (res.deployKey) {
      ui.info('Add this deploy key to the repo (read-only is enough):');
      ui.line(res.deployKey);
      ui.line();
    }
    if (res.webhookUrl) {
      ui.info('Add a push webhook:');
      ui.kv('URL', res.webhookUrl);
      if (res.secret) ui.kv('Secret', res.secret);
      ui.line();
    }
    if (res.hint) ui.dim(res.hint);
    if (config) {
      // Record the remote so `roxyon deploy` can note that pushes auto-deploy.
      await saveProjectConfig({ ...config }, process.cwd());
    }
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}

async function ask<T>(fn: () => Promise<T | symbol>): Promise<T> {
  const v = await fn();
  if (isCancel(v)) {
    p.cancel('Cancelled.');
    process.exit(EXIT.ok);
  }
  return v as T;
}
