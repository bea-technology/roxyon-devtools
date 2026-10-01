import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extract } from 'tar';

const WORDPRESS_TARBALL_URL = 'https://wordpress.org/latest.tar.gz';
const WORDPRESS_SALTS_URL = 'https://api.wordpress.org/secret-key/1.1/salt/';
const PLACEHOLDER = 'put your unique phrase here';

export interface WordPressDbCredentials {
  name: string;
  username: string;
  password: string;
  /** `host:port`, e.g. `10.0.0.2:6033` — WordPress's `DB_HOST` accepts this form directly. */
  host: string;
}

export interface InstallWordPressOptions {
  /** Destination directory — created if missing. Must be empty or not yet exist. */
  dir: string;
  db: WordPressDbCredentials;
  /** Default `wp_`. */
  tablePrefix?: string;
  /** Override for tests — must resolve like the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface InstallWordPressResult {
  dir: string;
}

/**
 * Download WordPress core into `dir` and write a working `wp-config.php`
 * against the given database. Does not touch the network beyond
 * wordpress.org/api.wordpress.org, and does not deploy anywhere — pack `dir`
 * with {@link packDirectory} and upload with `roxyon.sites.deploy()` (the same
 * tar path `roxyon deploy` uses for static/app content; WordPress core is
 * thousands of files, well past the small JSON `roxyon_deploy_content` tool's
 * budget).
 */
export async function installWordPress(
  opts: InstallWordPressOptions,
): Promise<InstallWordPressResult> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  await mkdir(opts.dir, { recursive: true });

  const coreRes = await fetchImpl(WORDPRESS_TARBALL_URL);
  if (!coreRes.ok) {
    throw new Error(`Could not download WordPress core (HTTP ${coreRes.status}).`);
  }
  const coreBuf = Buffer.from(await coreRes.arrayBuffer());

  // The official tarball has one top-level "wordpress/" directory — strip it
  // so core files land directly in `dir`.
  await new Promise<void>((resolvePromise, reject) => {
    const writer = extract({ cwd: opts.dir, strip: 1 });
    Readable.from(coreBuf)
      .pipe(writer)
      .on('finish', () => resolvePromise())
      .on('error', reject);
  });

  const saltsRes = await fetchImpl(WORDPRESS_SALTS_URL);
  const salts = saltsRes.ok ? (await saltsRes.text()).trim() : '';

  const samplePath = `${opts.dir}/wp-config-sample.php`;
  const sample = await readFile(samplePath, 'utf8');
  const config = buildWpConfig(sample, opts.db, opts.tablePrefix, salts);
  await writeFile(`${opts.dir}/wp-config.php`, config, 'utf8');

  return { dir: opts.dir };
}

/** Pure string transform — exported separately so it's testable without any network. */
export function buildWpConfig(
  sample: string,
  db: WordPressDbCredentials,
  tablePrefix = 'wp_',
  salts = '',
): string {
  let out = sample
    .replace(/(['"])database_name_here\1/, `$1${escapePhp(db.name)}$1`)
    .replace(/(['"])username_here\1/, `$1${escapePhp(db.username)}$1`)
    .replace(/(['"])password_here\1/, `$1${escapePhp(db.password)}$1`)
    .replace(/(define\(\s*['"]DB_HOST['"]\s*,\s*)(['"])localhost\2/, `$1$2${escapePhp(db.host)}$2`)
    .replace(/(\$table_prefix\s*=\s*)(['"])wp_\2/, `$1$2${escapePhp(tablePrefix)}$2`);

  if (salts) {
    const lines = out.split('\n');
    const start = lines.findIndex((l) => l.includes(PLACEHOLDER));
    if (start !== -1) {
      let end = start;
      while (end < lines.length && lines[end]!.includes(PLACEHOLDER)) end++;
      lines.splice(start, end - start, salts);
      out = lines.join('\n');
    }
  }

  return out;
}

function escapePhp(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
