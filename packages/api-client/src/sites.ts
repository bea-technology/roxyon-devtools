import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface StaticDeployResult {
  ok: boolean;
  host: string;
  path: string;
  files?: number;
  bytes?: number;
  error?: string;
}

export interface DeployOptions {
  /** Replace the docroot contents instead of overlaying (keeps `.well-known`). */
  clean?: boolean;
  /** Flip the host to SPA routing: unmatched paths serve `/index.html`. */
  spa?: boolean;
}

export interface SiteFile {
  /** POSIX path relative to the site root. */
  path: string;
  size: number;
  type: 'file' | 'dir';
}

export interface SiteFileContent {
  path: string;
  size: number;
  encoding: 'utf8' | 'base64';
  content: string;
}

/**
 * Static-site hosting: the files under a host's document root
 * (`public_html[/<folder>]`), served directly by nginx. No Application row, no
 * process. All routes go to the console (`POST /sites/deploy`, `GET /sites/files`,
 * `GET /sites/file`) and authenticate with a session token or a `roxp_` PAT.
 */
export class SitesApi {
  constructor(private readonly client: RoxyonClient) {}

  /** Upload a gzip tarball into `host`'s docroot (+ optional sub-`folder`). */
  async deploy(
    host: string,
    folder: string,
    tarball: Uint8Array,
    opts: DeployOptions = {},
  ): Promise<StaticDeployResult> {
    const query: Record<string, string> = { host, folder };
    if (opts.clean) query.clean = '1';
    if (opts.spa) query.spa = '1';
    const r = await this.client.console<StaticDeployResult>('POST', '/sites/deploy', {
      query,
      headers: { 'content-type': 'application/gzip' },
      body: tarball,
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Static deploy failed.', { body: r });
    return r;
  }

  /** List the files currently in `host`'s docroot (optionally under `path`). */
  async listFiles(host: string, folder = '', path = ''): Promise<SiteFile[]> {
    const r = await this.client.console<{ ok?: boolean; files?: SiteFile[]; error?: string }>(
      'GET',
      '/sites/files',
      { query: { host, folder, path }, tolerateHttpError: true },
    );
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not list site files.', { body: r });
    return r.files ?? [];
  }

  /** Read one file from `host`'s docroot. */
  async readFile(host: string, folder: string, path: string): Promise<SiteFileContent> {
    const r = await this.client.console<SiteFileContent & { ok?: boolean; error?: string }>(
      'GET',
      '/sites/file',
      { query: { host, folder, path }, tolerateHttpError: true },
    );
    if (!r?.ok || typeof r.content !== 'string') {
      throw new RoxyonApiError(r?.error || 'Could not read the file.', { body: r });
    }
    return { path: r.path, size: r.size, encoding: r.encoding, content: r.content };
  }
}
