/**
 * Runtime / version / framework catalog — a verbatim copy of the `RUNTIMES`
 * table in `console.roxyon.com/.../modals/app_form.view`. These are the versions
 * actually installed in the Cloud Hosting containers; offering an uninstalled
 * one produces a deploy that fails at build time for a reason the user cannot
 * act on.
 *
 * TODO(M4): the console form and this file should both import one shared JSON
 * published at `roxyon.com/runtimes.json` so they never drift.
 */
export type RuntimeName = 'lumen' | 'node' | 'python' | 'php';

export interface RuntimeSpec {
  versions: string[];
  defaultVersion: string;
  presets: Array<[value: string, label: string]>;
  command: string;
}

export const RUNTIMES: Record<Exclude<RuntimeName, 'lumen'>, RuntimeSpec> = {
  node: {
    versions: ['23.11.1', '22.23.1', '20.20.2', '18.20.8'],
    defaultVersion: '20.20.2',
    presets: [
      ['nextjs', 'Next.js'],
      ['nuxt', 'Nuxt'],
      ['node', 'No framework'],
    ],
    command: 'npm run start',
  },
  python: {
    versions: ['3.11'],
    defaultVersion: '3.11',
    presets: [['python', 'No framework']],
    command: 'gunicorn app:app',
  },
  php: {
    versions: ['8.4', '8.3', '8.2', '8.1', '7.4'],
    defaultVersion: '8.4',
    presets: [
      ['swoole', 'Swoole'],
      ['php', 'No framework'],
    ],
    command: 'php8.4 server.php',
  },
};

/**
 * A LumenJS project (`runtime: "lumen"`) builds to static files with
 * `lm build --serverless` and is served straight from the host's document root
 * by nginx — no long-running process, no systemd unit, no Application row. It
 * deploys through the "static" path (upload the built `dist/` to
 * `/home/www/<host>/public_html[/<folder>]`).
 *
 * Node / Python / PHP projects deploy through the "app" path (the Applications
 * system: upload source, bump ConfigRevision, reconciler builds + runs it).
 */
export type DeployKind = 'static' | 'app';

export const LUMEN_BUILD = {
  command: 'lm build --serverless',
  /** Directory `lm build --serverless` writes to, relative to the project root. */
  outDir: 'dist',
} as const;
