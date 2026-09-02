import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type ProjectConfig, buildProjectConfig, saveProjectConfig } from '@roxyon/deploy-core';
import { type FileOut, agentFiles } from './agent-files.js';
import { type Template, baasOverlayFiles, nodeTemplateFiles } from './templates.js';

export interface ScaffoldInput {
  dir: string;
  name: string;
  template: Template;
  host: string;
  folder: string;
  install: boolean;
}

export interface ScaffoldResult {
  dir: string;
  config: ProjectConfig;
  installed: boolean;
}

function run(cmd: string, args: string[], cwd: string): Promise<number> {
  return new Promise((res) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('close', (code) => res(code ?? 1));
    child.on('error', () => res(127));
  });
}

async function writeFileOut(dir: string, f: FileOut): Promise<void> {
  const path = join(dir, f.path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, f.content);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isEmptyish(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir);
    return entries.filter((e) => e !== '.git' && e !== '.DS_Store').length === 0;
  } catch {
    return true; // does not exist yet
  }
}

/** Merge `scripts` and `devDependencies` into a package.json, seeding one if absent. */
async function patchPackageJson(
  dir: string,
  name: string,
  patch: { scripts?: Record<string, string>; devDependencies?: Record<string, string> },
): Promise<void> {
  const path = join(dir, 'package.json');
  let pkg: Record<string, unknown> = {};
  try {
    pkg = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    pkg = { name, version: '0.1.0', private: true };
  }
  pkg.scripts = { ...(pkg.scripts as object), ...patch.scripts };
  if (patch.devDependencies) {
    pkg.devDependencies = { ...(pkg.devDependencies as object), ...patch.devDependencies };
  }
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

export async function scaffold(input: ScaffoldInput): Promise<ScaffoldResult> {
  const dir = resolve(input.dir);
  if (!(await isEmptyish(dir))) {
    throw new Error(`${dir} is not empty.`);
  }
  await mkdir(dir, { recursive: true });

  const config = buildProjectConfig({
    cwd: dir,
    name: input.name,
    runtime: input.template.runtime,
    host: input.host,
    folder: input.folder,
  });

  // ---- framework skeleton ----
  if (input.template.viaLmjs) {
    // `lm create <name>` fills the CURRENT directory (the name is only used for
    // [ProjectName] substitution, not as a subdirectory).
    const code = await run('npx', ['--yes', '@lmjs/cli', 'create', input.name], dir);
    if (code !== 0 || !(await exists(join(dir, 'src', 'index.html')))) {
      throw new Error(
        'Could not scaffold the LumenJS skeleton (npx @lmjs/cli create failed). Is npm online?',
      );
    }

    await patchPackageJson(dir, input.name, {
      scripts: {
        dev: 'lm serve',
        build: 'lm build --serverless',
        deploy: 'lm build --serverless && roxyon deploy',
      },
      devDependencies: { '@lmjs/cli': '^1.0.51' },
    });

    if (input.template.baas) {
      for (const f of baasOverlayFiles()) await writeFileOut(dir, f);
      // Load the RX SDK + our client before index.js.
      const htmlPath = join(dir, 'src', 'index.html');
      try {
        const html = await readFile(htmlPath, 'utf8');
        if (!html.includes('rxjs')) {
          await writeFile(
            htmlPath,
            html.replace(
              '<script src="/js/bea.js"',
              '<script src="https://cdn.roxyon.com/libs/rxjs/1.0.0/rx.js"></script>\n    ' +
                '<script src="/roxyon-baas.js"></script>\n    <script src="/js/bea.js"',
            ),
          );
        }
      } catch {
        /* template shape changed upstream — the file is still copied, just not linked */
      }
    }
  } else {
    for (const f of nodeTemplateFiles(input.name)) await writeFileOut(dir, f);
  }

  // ---- Roxyon overlay (every template) ----
  for (const f of agentFiles(config, { baas: input.template.baas })) {
    await writeFileOut(dir, f);
  }
  await saveProjectConfig(config, dir);

  // ---- .gitignore ----
  const gitignore = join(dir, '.gitignore');
  const existing = await readFile(gitignore, 'utf8').catch(() => '');
  if (!existing.includes('node_modules')) {
    await writeFile(gitignore, `${existing}${existing ? '\n' : ''}node_modules\ndist\n.DS_Store\n`);
  }

  // ---- install ----
  let installed = false;
  if (input.install) {
    const code = await run('npm', ['install'], dir);
    installed = code === 0;
  }

  return { dir, config, installed };
}
