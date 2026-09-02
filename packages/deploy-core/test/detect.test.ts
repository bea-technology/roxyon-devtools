import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectRuntime } from '../src/detect.js';

const dirs: string[] = [];
async function scratch(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'roxyon-detect-'));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('detectRuntime', () => {
  it('recognises a LumenJS project', async () => {
    const d = await scratch();
    await writeFile(join(d, 'config.json'), '{}');
    await mkdir(join(d, 'src', 'views'), { recursive: true });
    await writeFile(join(d, 'src', 'views', 'home.view'), '<div></div>');
    expect((await detectRuntime(d)).runtime).toBe('lumen');
  });

  it('recognises a Node app', async () => {
    const d = await scratch();
    await writeFile(
      join(d, 'package.json'),
      JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^4' } }),
    );
    const det = await detectRuntime(d);
    expect(det.runtime).toBe('node');
    expect(det.start).toBe('npm run start');
  });

  it('recognises a Python app', async () => {
    const d = await scratch();
    await writeFile(join(d, 'requirements.txt'), 'flask\n');
    expect((await detectRuntime(d)).runtime).toBe('python');
  });

  it('falls back to static for a bare folder', async () => {
    const d = await scratch();
    await writeFile(join(d, 'index.html'), '<h1>hi</h1>');
    expect((await detectRuntime(d)).runtime).toBe('lumen');
  });
});
