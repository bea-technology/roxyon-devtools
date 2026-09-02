import { describe, expect, it, vi } from 'vitest';
import { AccountApi } from '../src/account.js';
import { RoxyonClient } from '../src/client.js';
import { TokensApi } from '../src/tokens.js';

interface Seen {
  url: string;
  headers: Headers;
  method?: string;
}

function spy(responder: (url: string) => unknown) {
  const seen: Seen[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, headers: new Headers(init?.headers), method: init?.method });
    return new Response(JSON.stringify(responder(url) ?? {}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, seen };
}

describe('personal access token auth', () => {
  it('sends Authorization: Bearer on console calls and nothing token-ish to the BaaS', async () => {
    const { fetchImpl, seen } = spy((url) =>
      url.includes('/account/context')
        ? {
            ok: true,
            user: { id: 'u1', email: 'a@b.c' },
            scopes: ['deploy'],
            subscriptions: [],
            domains: [],
          }
        : { results: [] },
    );
    const client = new RoxyonClient({
      sessionToken: 'roxp_deadbeef00',
      consoleUrl: 'https://console.example',
      baseUrl: 'https://baas.example/1',
      fetch: fetchImpl,
    });

    await new AccountApi(client).context();
    const consoleCall = seen.find((s) => s.url.includes('console.example'))!;
    expect(consoleCall.headers.get('authorization')).toBe('Bearer roxp_deadbeef00');
    expect(consoleCall.headers.get('x-bea-session-token')).toBeNull();

    // A BaaS call with a PAT carries no session/access token (and never mints an anon one).
    await client.get('/Applications').catch(() => undefined);
    const baasCalls = seen.filter((s) => s.url.includes('baas.example'));
    expect(baasCalls.some((s) => s.url.endsWith('/Auth'))).toBe(false);
    for (const c of baasCalls) {
      expect(c.headers.get('x-bea-session-token')).toBeNull();
      expect(c.headers.get('authorization')).toBeNull();
    }
  });

  it('TokensApi create/list/revoke hit /account/tokens', async () => {
    const { fetchImpl, seen } = spy((url) => {
      if (url.includes('/account/tokens') && url.includes('?')) return { ok: true, revoked: 'T1' };
      return {
        ok: true,
        token: 'roxp_new',
        name: 'ci',
        scopes: ['deploy'],
        expiresAt: null,
        tokens: [],
      };
    });
    const client = new RoxyonClient({
      sessionToken: 'sess_1',
      consoleUrl: 'https://c.example',
      fetch: fetchImpl,
    });
    const api = new TokensApi(client);

    const created = await api.create('ci', { scopes: ['deploy'] });
    expect(created.token).toBe('roxp_new');

    await api.list();
    await api.revoke('T1');

    const paths = seen.map((s) => `${s.method} ${new URL(s.url).pathname}`);
    expect(paths).toEqual([
      'POST /account/tokens',
      'GET /account/tokens',
      'DELETE /account/tokens',
    ]);
    expect(seen[2]?.url).toContain('id=T1');
  });

  it('AccountApi.context caches until fresh:true', async () => {
    const { fetchImpl, seen } = spy(() => ({
      ok: true,
      user: { id: 'u1', email: '' },
      scopes: [],
      subscriptions: [
        { id: 's1', name: 'Main', status: 'active', node: 'n1', datacenter: 'us', container: 'c1' },
      ],
      domains: [{ id: 'd1', name: 'x.com', subscription: 's1' }],
    }));
    const api = new AccountApi(
      new RoxyonClient({ sessionToken: 's', consoleUrl: 'https://c.example', fetch: fetchImpl }),
    );
    await api.context();
    await api.context();
    expect(seen.length).toBe(1);
    await api.context({ fresh: true });
    expect(seen.length).toBe(2);

    const sub = await api.resolveSubscription();
    expect(sub.id).toBe('s1');
  });
});
