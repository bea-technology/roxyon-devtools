import { basename } from 'node:path';
import * as p from '@clack/prompts';
import { isCancel } from '@clack/prompts';
import type { RuntimeName } from '@roxyon/api-client';
import {
  buildProjectConfig,
  detectRuntime,
  loadProjectConfig,
  saveProjectConfig,
} from '@roxyon/deploy-core';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export interface InitOptions {
  host?: string;
  folder?: string;
  runtime?: RuntimeName;
  yes?: boolean;
}

export async function init(opts: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const existing = await loadProjectConfig(cwd);
  if (existing && !opts.yes) {
    const overwrite = await ask(() =>
      p.confirm({ message: 'roxyon.json already exists — overwrite it?', initialValue: false }),
    );
    if (!overwrite) return;
  }

  const { roxyon, credentials } = await requireSession();
  const user = await roxyon.auth.me();
  const sub = await roxyon.subscriptions.resolve(user.objectId, credentials?.subscription);
  const domains = await roxyon.domains.list(sub.objectId);
  if (domains.length === 0) {
    fail(
      'This subscription has no hosts yet. Add a domain in the console, then run `roxyon init` again.',
      EXIT.configError,
    );
  }

  const detected = await detectRuntime(cwd);
  ui.info(`Detected runtime: ${detected.runtime} — ${detected.reason}`);

  const runtime: RuntimeName = opts.runtime
    ? opts.runtime
    : opts.yes
      ? detected.runtime
      : await ask<RuntimeName>(() =>
          p.select({
            message: 'Runtime',
            initialValue: detected.runtime,
            options: [
              { value: 'lumen', label: 'LumenJS (static SPA, no server)' },
              { value: 'node', label: 'Node.js app' },
              { value: 'python', label: 'Python app' },
              { value: 'php', label: 'PHP app' },
            ],
          }),
        );

  const host: string =
    opts.host ??
    (opts.yes
      ? (domains[0]?.Name ?? fail('No host available.', EXIT.configError))
      : await ask<string>(() =>
          p.select({
            message: 'Host',
            options: domains.map((d) => ({ value: d.Name, label: d.Name })),
          }),
        ));

  const defaultFolder = basename(cwd).replace(/[^a-z0-9._-]/gi, '-');
  const folder =
    opts.folder ??
    (opts.yes
      ? runtime === 'lumen'
        ? ''
        : defaultFolder
      : await ask<string>(() =>
          p.text({
            message:
              runtime === 'lumen'
                ? 'Sub-path under the host root (blank = site root)'
                : 'Folder under the host (source location)',
            placeholder: runtime === 'lumen' ? '(root)' : defaultFolder,
            defaultValue: runtime === 'lumen' ? '' : defaultFolder,
          }),
        ));

  const config = buildProjectConfig({
    cwd,
    runtime,
    host,
    folder,
    name: basename(cwd),
    start: detected.start,
  });

  const path = await saveProjectConfig(config, cwd);
  ui.success(`Wrote ${path}`);
  ui.line();
  ui.dim(JSON.stringify(config, null, 2));
  ui.line();
  ui.info('Next: `roxyon deploy`');
}

async function ask<T>(fn: () => Promise<T | symbol>): Promise<T> {
  const v = await fn();
  if (isCancel(v)) {
    p.cancel('Cancelled.');
    process.exit(EXIT.ok);
  }
  return v as T;
}
