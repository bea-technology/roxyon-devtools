import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runWithContext } from '../src/context.js';
import { type HttpConfig, buildApp } from '../src/http.js';
import { getSession } from '../src/session.js';

const CFG: HttpConfig = {
  port: 0,
  host: '127.0.0.1',
  publicUrl: 'https://mcp.roxyon.com',
  oauthIssuer: 'https://console.roxyon.com',
  consoleUrl: 'https://console.roxyon.com',
  authMode: 'permissive',
  allowedHosts: ['mcp.roxyon.com', 'localhost', '127.0.0.1'],
};

let base: string;
let port: number;
let close: () => Promise<void>;

/** Raw request so we can force a `Host` header — `fetch` forbids overriding it. */
function rawRequest(
  path: string,
  opts: { host?: string; method?: string; body?: string } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: opts.method ?? 'GET',
        headers: { Host: opts.host ?? '127.0.0.1' },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

beforeAll(async () => {
  const app = buildApp(CFG);
  const srv = app.listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  port = (srv.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
  close = () => new Promise((r) => srv.close(() => r(undefined)));
});

afterAll(() => close());

describe('remote HTTP server', () => {
  it('serves /health regardless of Host header', async () => {
    const res = await rawRequest('/health', { host: 'evil.example' });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, service: 'roxyon' });
  });

  it('rejects /mcp with an unknown Host (DNS-rebinding guard)', async () => {
    const res = await rawRequest('/mcp', { host: 'evil.example', method: 'POST', body: '{}' });
    expect(res.status).toBe(403);
  });

  it('serves RFC 9728 protected-resource metadata', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.resource).toBe('https://mcp.roxyon.com/mcp');
    expect(body.authorization_servers).toEqual(['https://console.roxyon.com']);
  });

  it('401s an unauthenticated POST /mcp with a resource_metadata hint', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate') ?? '').toContain('resource_metadata=');
  });

  it('rejects a non-roxp_ bearer', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer nope',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('handshakes and lists tools with a valid bearer', async () => {
    const client = new Client({ name: 'test', version: '0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { authorization: 'Bearer roxp_testtoken000000000000' } },
    });
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('roxyon_whoami');
    expect(names).toContain('roxyon_deploy');
    expect(names.length).toBe(11);
    await client.close();
  });

  it('blocks filesystem tools over the remote transport', async () => {
    const client = new Client({ name: 'test', version: '0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: { authorization: 'Bearer roxp_testtoken000000000000' } },
    });
    await client.connect(transport);
    const res = (await client.callTool({
      name: 'roxyon_init',
      arguments: { dir: '/tmp/whatever' },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain('hosted Roxyon MCP');
    await client.close();
  });
});

describe('per-request token isolation', () => {
  it('keeps 20 concurrent requests on their own token', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_v, i) => {
        const token = `roxp_${String(i).padStart(40, '0')}`;
        return runWithContext({ token, remote: true }, async () => {
          // jittered await to interleave the async contexts
          await new Promise((r) => setTimeout(r, Math.random() * 15));
          const session = await getSession();
          return { i, seen: session.roxyon.sessionToken, source: session.source };
        });
      }),
    );
    for (const { i, seen, source } of results) {
      expect(seen).toBe(`roxp_${String(i).padStart(40, '0')}`);
      expect(source).toBe('oauth');
    }
  });

  it('falls back to env/stored auth with no request context', async () => {
    // Outside runWithContext, getSession must not see a token from another request.
    const session = await getSession().catch((e) => e);
    // Either it resolved from env/stored creds, or it threw NotAuthenticated —
    // both are fine; what matters is it is not the 'oauth' path.
    if (session && typeof session === 'object' && 'source' in session) {
      expect(session.source).not.toBe('oauth');
    }
  });
});
