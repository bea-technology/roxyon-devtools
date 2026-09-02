import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scaffold } from '../src/scaffold.js';
import { TEMPLATES } from '../src/templates.js';

let dir: string;

beforeAll(async () => {
  const base = await mkdtemp(join(tmpdir(), 'cra-'));
  dir = join(base, 'my-app');
  await scaffold({
    dir,
    name: 'my-app',
    template: TEMPLATES.node, // no network — the lumen templates need @lmjs/cli
    host: 'example.com',
    folder: 'my-app',
    install: false,
  });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

async function read(rel: string): Promise<string> {
  return readFile(join(dir, rel), 'utf8');
}

describe('scaffold (node template)', () => {
  it('writes roxyon.json with the resolved runtime and host', async () => {
    const cfg = JSON.parse(await read('roxyon.json'));
    expect(cfg).toMatchObject({
      name: 'my-app',
      runtime: 'node',
      kind: 'app',
      host: 'example.com',
    });
    expect(cfg.start).toBeTruthy();
  });

  it('emits the agent instruction files', async () => {
    for (const f of [
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
      'llms.txt',
      '.cursor/rules/roxyon.mdc',
      '.github/copilot-instructions.md',
      '.roxyonignore',
    ]) {
      await expect(stat(join(dir, f))).resolves.toBeDefined();
    }
    const agents = await read('AGENTS.md');
    expect(agents).toContain('roxyon deploy');
    expect(agents).toContain('PORT');
    expect(await read('.cursor/rules/roxyon.mdc')).toContain('alwaysApply: true');
  });

  it('writes a runnable server and a package.json with start/dev scripts', async () => {
    const pkg = JSON.parse(await read('package.json'));
    expect(pkg.scripts.start).toBe('node src/server.js');
    expect(pkg.scripts.dev).toContain('--watch');
    expect(await read('src/server.js')).toContain('process.env.PORT');
  });

  it('gitignores node_modules', async () => {
    expect(await read('.gitignore')).toContain('node_modules');
  });

  it('refuses a non-empty directory', async () => {
    await expect(
      scaffold({
        dir,
        name: 'x',
        template: TEMPLATES.node,
        host: 'e.com',
        folder: '',
        install: false,
      }),
    ).rejects.toThrow(/not empty/);
  });
});

describe('templates', () => {
  it('lumen templates go through @lmjs/cli, node does not', () => {
    expect(TEMPLATES.lumen.viaLmjs).toBe(true);
    expect(TEMPLATES['lumen-baas'].viaLmjs).toBe(true);
    expect(TEMPLATES.node.viaLmjs).toBe(false);
  });
});
