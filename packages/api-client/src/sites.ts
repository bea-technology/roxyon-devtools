import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface StaticDeployResult {
  ok: boolean;
  host: string;
  path: string;
  files?: number;
  error?: string;
}

/**
 * Static-site deploy: upload built files (a LumenJS `--serverless` build, or any
 * static output) into a host's document root
 * (`/home/www/<host>/public_html[/<folder>]`), served directly by nginx. No
 * Application row, no process.
 *
 * `POST /sites/deploy` — NEW endpoint (see `backend/` in this repo).
 */
export class SitesApi {
  constructor(private readonly client: RoxyonClient) {}

  async deploy(host: string, folder: string, tarball: Uint8Array): Promise<StaticDeployResult> {
    const r = await this.client.console<StaticDeployResult>('POST', '/sites/deploy', {
      query: { host, folder },
      headers: { 'content-type': 'application/gzip' },
      body: tarball,
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Static deploy failed.', { body: r });
    return r;
  }
}
