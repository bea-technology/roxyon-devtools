import { basename } from 'node:path';
import * as p from '@clack/prompts';
import { isCancel } from '@clack/prompts';
import { LUMEN_BUILD, RUNTIMES, type RuntimeName } from '@roxyon/api-client';
import { type ProjectConfig, loadProjectConfig, saveProjectConfig } from '../config.js';
import { requireSession } from '../context.js';
import { detectRuntime } from '../detect.js';
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
      : await ask(() =>
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
  if (!host) fail('A host is required.', EXIT.configError);

  const defaultFolder = basename(cwd).replace(/[^a-z0-9._-]/gi, '-');
  const folder =
    opts.folder ??
    (opts.yes
      ? runtime === 'lumen'
        ? ''
        : defaultFolder
      : await ask(() =>
          p.text({
            message:
              runtime === 'lumen'
                ? 'Sub-path under the host root (blank = site root)'
                : 'Folder under the host (source location)',
            placeholder: runtime === 'lumen' ? '(root)' : defaultFolder,
            defaultValue: runtime === 'lumen' ? '' : defaultFolder,
          }),
        ));

  const config: ProjectConfig = {
    name: basename(cwd),
    host,
    folder: String(folder).replace(/^\/+|\/+$/g, ''),
    runtime,
    kind: runtime === 'lumen' ? 'static' : 'app',
  };

  if (runtime === 'lumen') {
    config.build = LUMEN_BUILD.command;
    config.outDir = LUMEN_BUILD.outDir;
  } else {
    const spec = RUNTIMES[runtime];
    config.runtimeVersion = spec.defaultVersion;
    config.preset = spec.presets[0]?.[0];
    config.start = detected.start ?? spec.command;
    config.public = true;
    config.build = '';
  }

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
