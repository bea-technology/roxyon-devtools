import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildIgnore, listFiles, packDirectory, packFiles } from '../src/archive.js';

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

describe('packFiles', () => {
  const site = [
    { path: 'index.html', content: '<!doctype html><h1>hi</h1>' },
    { path: 'about/index.html', content: '<!doctype html><h1>about</h1>' },
    { path: 'assets/logo.png', content: 'iVBORw0KGgo=', encoding: 'base64' as const },
  ];

  it('packs an in-memory file list into a gzip tarball', async () => {
    const { buffer, files, bytes } = await packFiles(site);
    expect(files).toEqual(['about/index.html', 'assets/logo.png', 'index.html']);
    expect(bytes).toBeGreaterThan(0);
    expect(buffer[0]).toBe(0x1f);
    expect(buffer[1]).toBe(0x8b);
  });

  it('is deterministic for identical input', async () => {
    const a = await packFiles(site);
    const b = await packFiles(site);
    expect(Buffer.compare(a.buffer, b.buffer)).toBe(0);
  });

  it('rejects absolute paths and `..` traversal', async () => {
    await expect(packFiles([{ path: '/etc/passwd', content: 'x' }])).rejects.toThrow(/Unsafe/);
    await expect(packFiles([{ path: '../x', content: 'x' }])).rejects.toThrow(/Unsafe/);
    await expect(packFiles([{ path: 'a/../../b', content: 'x' }])).rejects.toThrow(/Unsafe/);
  });

  it('rejects duplicates and empty input', async () => {
    await expect(
      packFiles([
        { path: 'a.txt', content: '1' },
        { path: './a.txt', content: '2' },
      ]),
    ).rejects.toThrow(/Duplicate/);
    await expect(packFiles([])).rejects.toThrow(/No files/);
  });

  it('enforces the size cap', async () => {
    const big = 'x'.repeat(200 * 1024);
    await expect(
      packFiles([{ path: 'big.txt', content: big }], { maxBytes: 1024 }),
    ).rejects.toThrow(/exceeds/);
  });
});
