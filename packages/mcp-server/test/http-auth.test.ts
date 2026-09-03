import { describe, expect, it, vi } from 'vitest';
import {
  fetchAuthServerMetadata,
  introspectionVerifier,
  permissiveVerifier,
  staticAuthServerMetadata,
} from '../src/http-auth.js';

const RESOURCE = 'https://mcp.roxyon.com/mcp';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('permissiveVerifier', () => {
  it('accepts any roxp_ token with a synthetic expiry', async () => {
    const info = await permissiveVerifier(RESOURCE).verifyAccessToken('roxp_abc');
    expect(info.token).toBe('roxp_abc');
    expect(info.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(info.resource?.href).toBe(RESOURCE);
  });

  it('rejects a non-roxp_ token', async () => {
    await expect(permissiveVerifier(RESOURCE).verifyAccessToken('bearer-xyz')).rejects.toThrow();
  });
});

describe('introspectionVerifier', () => {
  const cfg = (fetchImpl: typeof fetch) => ({
    consoleUrl: 'http://127.0.0.1:9001',
    secret: 's3cr3t',
    resource: RESOURCE,
    fetch: fetchImpl,
  });

  it('accepts an active oauth token bound to this resource', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe('http://127.0.0.1:9001/oauth/introspect');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer s3cr3t');
      return jsonResponse({
        active: true,
        kind: 'oauth',
        aud: RESOURCE,
        sub: 'user_1',
        scope: 'read deploy',
        client_id: 'rxc_1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
    });
    const info = await introspectionVerifier(
      cfg(fetchImpl as unknown as typeof fetch),
    ).verifyAccessToken('roxp_live');
    expect(info.clientId).toBe('rxc_1');
    expect(info.scopes).toEqual(['read', 'deploy']);
    expect(info.extra?.uid).toBe('user_1');
  });

  it('rejects an inactive token', async () => {
    const f = vi.fn(async () => jsonResponse({ active: false }));
    await expect(
      introspectionVerifier(cfg(f as unknown as typeof fetch)).verifyAccessToken('roxp_dead'),
    ).rejects.toThrow(/not active/);
  });

  it('rejects a token that is not kind=oauth (a raw CLI PAT)', async () => {
    const f = vi.fn(async () => jsonResponse({ active: true, kind: '', aud: '' }));
    await expect(
      introspectionVerifier(cfg(f as unknown as typeof fetch)).verifyAccessToken('roxp_cli'),
    ).rejects.toThrow(/connector/);
  });

  it('rejects an audience mismatch (RFC 8707)', async () => {
    const f = vi.fn(async () =>
      jsonResponse({ active: true, kind: 'oauth', aud: 'https://evil.example/mcp' }),
    );
    await expect(
      introspectionVerifier(cfg(f as unknown as typeof fetch)).verifyAccessToken('roxp_wrongaud'),
    ).rejects.toThrow(/audience/);
  });

  it('caches a positive result (one console round-trip for repeated calls)', async () => {
    const f = vi.fn(async () =>
      jsonResponse({
        active: true,
        kind: 'oauth',
        aud: RESOURCE,
        sub: 'u',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const v = introspectionVerifier(cfg(f as unknown as typeof fetch));
    await v.verifyAccessToken('roxp_cacheme');
    await v.verifyAccessToken('roxp_cacheme');
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAuthServerMetadata', () => {
  it('returns the console metadata when reachable', async () => {
    const live = {
      ...staticAuthServerMetadata('https://console.roxyon.com'),
      issuer: 'https://console.roxyon.com',
    };
    const f = vi.fn(async () => jsonResponse(live));
    const md = await fetchAuthServerMetadata(
      'https://console.roxyon.com',
      f as unknown as typeof fetch,
    );
    expect(md.token_endpoint).toBe('https://console.roxyon.com/oauth/token');
  });

  it('falls back to the static shape when the console is unreachable', async () => {
    const f = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const md = await fetchAuthServerMetadata(
      'https://console.roxyon.com',
      f as unknown as typeof fetch,
    );
    expect(md.issuer).toBe('https://console.roxyon.com');
    expect(md.registration_endpoint).toBe('https://console.roxyon.com/oauth/register');
  });
});
