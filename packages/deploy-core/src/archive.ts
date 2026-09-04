import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { create as tarCreate } from 'tar';

/** Always excluded, regardless of ignore files — build artefacts and VCS/OS cruft. */
export const ALWAYS_IGNORE = [
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.venv',
  '__pycache__',
  '.DS_Store',
  '.roxyon',
  'dist/.cache',
];

async function readIgnoreFile(root: string, name: string): Promise<string[]> {
  try {
    return (await readFile(join(root, name), 'utf8')).split(/\r?\n/);
  } catch {
    return [];
  }
}

/** Build the ignore matcher: `.roxyonignore` if present, else `.gitignore`, plus the always-list. */
export async function buildIgnore(root: string): Promise<Ignore> {
  const ig = ignore().add(ALWAYS_IGNORE);
  const roxyon = await readIgnoreFile(root, '.roxyonignore');
  if (roxyon.length) ig.add(roxyon);
  else ig.add(await readIgnoreFile(root, '.gitignore'));
  return ig;
}

/** Recursively list files under `root` that survive the ignore matcher (POSIX-relative paths). */
export async function listFiles(root: string, ig: Ignore): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (!rel || ig.ignores(rel) || ig.ignores(`${rel}/`)) continue;
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(rel);
      }
    }
  }

  await walk(root);
  return files.sort();
}

export interface PackResult {
  buffer: Buffer;
  files: string[];
  bytes: number;
}

/**
 * Create a deterministic gzipped tarball of `root` (minus ignored paths).
 * `prefix`, when given, is prepended to every entry path inside the archive.
 */
export async function packDirectory(
  root: string,
  opts: { prefix?: string; maxBytes?: number } = {},
): Promise<PackResult> {
  const ig = await buildIgnore(root);
  const files = await listFiles(root, ig);
  if (files.length === 0) {
    throw new Error(
      `Nothing to deploy from ${root} — every file is ignored or the folder is empty.`,
    );
  }

  const stream = tarCreate(
    {
      gzip: true,
      cwd: root,
      portable: true,
      mtime: new Date(0), // stable -> byte-identical archive for an unchanged tree
      prefix: opts.prefix,
      follow: false,
    },
    files,
  );

  const chunks: Buffer[] = [];
  let bytes = 0;
  const max = opts.maxBytes ?? 512 * 1024 * 1024;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    bytes += chunk.length;
    if (bytes > max) {
      throw new Error(
        `Deploy archive exceeds ${(max / 1024 / 1024) | 0} MB. Add large files to .roxyonignore.`,
      );
    }
    chunks.push(chunk);
  }

  return { buffer: Buffer.concat(chunks), files, bytes };
}

export interface FileEntry {
  /** POSIX-style relative path inside the site, e.g. `index.html`, `about/index.html`. */
  path: string;
  /** File body — UTF-8 text, or base64 when `encoding: 'base64'`. */
  content: string;
  encoding?: 'utf8' | 'base64';
}

/** A path is safe if it is relative, has no `..`/`.` segment, and no NUL. */
function safeEntryPath(p: string): string | null {
  const norm = p.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!norm || norm.startsWith('/') || isAbsolute(norm) || norm.includes('\0')) return null;
  if (norm.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return null;
  return norm;
}

/**
 * Pack an in-memory list of `{ path, content }` into the same deterministic
 * gzip tarball {@link packDirectory} produces — materialise to a temp dir, then
 * reuse that path so the archive format and determinism are identical. Rejects
 * absolute paths and `..` traversal; `maxBytes` caps the total *decoded* content.
 */
export async function packFiles(
  entries: FileEntry[],
  opts: { prefix?: string; maxBytes?: number } = {},
): Promise<PackResult> {
  if (entries.length === 0) throw new Error('No files to deploy.');

  const seen = new Set<string>();
  const clean: { path: string; buf: Buffer }[] = [];
  let total = 0;
  for (const e of entries) {
    const rel = safeEntryPath(e.path);
    if (!rel) throw new Error(`Unsafe file path: ${JSON.stringify(e.path)}`);
    if (seen.has(rel)) throw new Error(`Duplicate file path: ${rel}`);
    seen.add(rel);
    const buf = Buffer.from(e.content, e.encoding === 'base64' ? 'base64' : 'utf8');
    total += buf.length;
    clean.push({ path: rel, buf });
  }
  const max = opts.maxBytes ?? 512 * 1024 * 1024;
  if (total > max) {
    throw new Error(
      `Content is ${(total / 1024 / 1024).toFixed(1)} MB, which exceeds the ${(max / 1024 / 1024).toFixed(1)} MB limit.`,
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'roxyon-content-'));
  try {
    for (const { path: rel, buf } of clean) {
      const abs = join(dir, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, buf);
    }
    return await packDirectory(dir, opts);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Total on-disk size of a set of files. */
export async function measure(root: string, files: string[]): Promise<number> {
  let total = 0;
  for (const f of files) {
    try {
      total += (await stat(join(root, f))).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}
