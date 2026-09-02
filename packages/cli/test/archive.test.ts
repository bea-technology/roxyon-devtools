import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildIgnore, listFiles, packDirectory } from '../src/archive.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'roxyon-arch-'));
  await writeFile(join(dir, 'index.html'), '<!doctype html>');
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'app.js'), 'console.log(1)');
  await mkdir(join(dir, 'node_modules', 'x'), { recursive: true });
  await writeFile(join(dir, 'node_modules', 'x', 'index.js'), 'module.exports={}');
  await mkdir(join(dir, '.git'), { recursive: true });
  await writeFile(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main');
  await writeFile(join(dir, 'secret.env'), 'TOKEN=abc');
  await writeFile(join(dir, '.roxyonignore'), 'secret.env\n*.log\n');
  await writeFile(join(dir, 'debug.log'), 'noise');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('listFiles', () => {
  it('excludes node_modules, .git, and ignore-file matches', async () => {
    const ig = await buildIgnore(dir);
    const files = await listFiles(dir, ig);
    expect(files).toEqual(['.roxyonignore', 'index.html', 'src/app.js']);
  });
});

describe('packDirectory', () => {
  it('produces a non-empty gzip buffer and lists the kept files', async () => {
    const { buffer, files, bytes } = await packDirectory(dir);
    expect(files).toContain('index.html');
    expect(files).not.toContain('secret.env');
    expect(bytes).toBeGreaterThan(0);
    // gzip magic
    expect(buffer[0]).toBe(0x1f);
    expect(buffer[1]).toBe(0x8b);
  });

  it('is deterministic for an unchanged tree', async () => {
    const a = await packDirectory(dir);
    const b = await packDirectory(dir);
    expect(Buffer.compare(a.buffer, b.buffer)).toBe(0);
  });

  it('rejects when everything is ignored', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'roxyon-empty-'));
    await writeFile(join(empty, '.roxyonignore'), '*\n');
    await expect(packDirectory(empty)).rejects.toThrow(/Nothing to deploy/);
    await rm(empty, { recursive: true, force: true });
  });
});
