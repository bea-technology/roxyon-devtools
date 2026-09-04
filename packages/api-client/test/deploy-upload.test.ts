import { describe, expect, it, vi } from 'vitest';
import { ApplicationsApi } from '../src/applications.js';
import { RoxyonClient } from '../src/client.js';
import { DomainsApi } from '../src/domains.js';
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

  it('sites.deploy adds ?clean=1&spa=1 when opted in', async () => {
    const { client, calls } = capturingClient({ ok: true, host: 'x.com', path: '/' });
    await new SitesApi(client).deploy('x.com', '', TARBALL, { clean: true, spa: true });
    expect(calls.at(-1)!.url).toBe(
      'https://console.example/sites/deploy?host=x.com&folder=&clean=1&spa=1',
    );
  });

  it('sites.listFiles / readFile hit the GET endpoints', async () => {
    const { client, calls } = capturingClient({
      ok: true,
      files: [{ path: 'index.html', size: 12, type: 'file' }],
    });
    const files = await new SitesApi(client).listFiles('x.com', '', 'assets');
    expect(files[0]?.path).toBe('index.html');
    expect(calls.at(-1)!.url).toBe(
      'https://console.example/sites/files?host=x.com&folder=&path=assets',
    );

    const { client: c2, calls: k2 } = capturingClient({
      ok: true,
      path: 'index.html',
      size: 12,
      encoding: 'utf8',
      content: '<!doctype html>',
    });
    const f = await new SitesApi(c2).readFile('x.com', '', 'index.html');
    expect(f.content).toBe('<!doctype html>');
    expect(k2.at(-1)!.url).toBe(
      'https://console.example/sites/file?host=x.com&folder=&path=index.html',
    );
  });

  it('domains.create posts JSON to /domains/create', async () => {
    const { client, calls } = capturingClient({
      ok: true,
      objectId: 'Dom1',
      host: 'promo.acme.com',
      type: 'subdomain',
      status: 'provisioning',
    });
    const res = await new DomainsApi(client).create({ host: 'promo.acme.com', siteType: 'spa' });
    expect(res.status).toBe('provisioning');
    const call = calls.at(-1)!;
    expect(call.url).toBe('https://console.example/domains/create');
    expect(call.contentType).toBe('application/json');
    expect(JSON.parse(String(call.body))).toEqual({ host: 'promo.acme.com', siteType: 'spa' });
  });

  it('throws RoxyonApiError when the endpoint returns ok:false', async () => {
    const { client } = capturingClient({ error: 'This application deploys from git' });
    await expect(new ApplicationsApi(client).uploadSource('App123', TARBALL)).rejects.toThrow(
      /deploys from git/,
    );
  });
});
