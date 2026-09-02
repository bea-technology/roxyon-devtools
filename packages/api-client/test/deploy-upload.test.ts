import { describe, expect, it, vi } from 'vitest';
import { ApplicationsApi } from '../src/applications.js';
import { RoxyonClient } from '../src/client.js';
import { SitesApi } from '../src/sites.js';

interface Captured {
  url: string;
  method?: string;
  contentType?: string;
  body?: unknown;
}

function capturingClient(response: unknown): { client: RoxyonClient; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/Auth')) {
      return new Response(
        JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3700 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    calls.push({
      url,
      method: init?.method,
      contentType: new Headers(init?.headers).get('content-type') ?? undefined,
      body: init?.body,
    });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return {
    client: new RoxyonClient({
      sessionToken: 'sess_1',
      consoleUrl: 'https://console.example',
      fetch: fetchImpl as unknown as typeof fetch,
    }),
    calls,
  };
}

const TARBALL = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02]);

describe('source/site upload wire format', () => {
  it('uploadSource posts a raw gzip body with ?application= and no multipart', async () => {
    const { client, calls } = capturingClient({
      ok: true,
      application: 'App123',
      configRevision: 4,
      files: 12,
    });
    const res = await new ApplicationsApi(client).uploadSource('App123', TARBALL);

    expect(res.configRevision).toBe(4);
    const call = calls.at(-1)!;
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://console.example/applications/deploy?application=App123');
    expect(call.contentType).toBe('application/gzip');
    expect(call.body).toBe(TARBALL);
  });

  it('sites.deploy posts a raw gzip body with ?host=&folder=', async () => {
    const { client, calls } = capturingClient({ ok: true, host: 'x.com', path: '/', files: 3 });
    const res = await new SitesApi(client).deploy('x.com', 'app', TARBALL);

    expect(res.files).toBe(3);
    const call = calls.at(-1)!;
    expect(call.url).toBe('https://console.example/sites/deploy?host=x.com&folder=app');
    expect(call.contentType).toBe('application/gzip');
    expect(call.body).toBe(TARBALL);
  });

  it('throws RoxyonApiError when the endpoint returns ok:false', async () => {
    const { client } = capturingClient({ error: 'This application deploys from git' });
    await expect(new ApplicationsApi(client).uploadSource('App123', TARBALL)).rejects.toThrow(
      /deploys from git/,
    );
  });
});
