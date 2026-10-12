import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Load the browser script with a fake window + a fake V2 server behind fetch. */
function load(server) {
  const store = new Map();
  globalThis.window = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    crypto: globalThis.crypto,
  };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path: u.pathname.replace(/^\/2/, ''), query: u.search, auth: init.headers.authorization ?? null, device: init.headers['x-bea-installation-id'], body });
    const [status, json] = await server({ method: init.method, path: u.pathname.replace(/^\/2/, ''), search: u.searchParams, auth: init.headers.authorization ?? null, body });
    return new Response(JSON.stringify(json), { status });
  };
  const src = readFileSync(new URL('../src/rx.js', import.meta.url), 'utf8');
  new Function(src)();
  const RX = globalThis.window.RX;
  return { RX, calls, store };
}

const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
let tokens = 0;

function server(over = {}) {
  return async (r) => {
    if (over[`${r.method} ${r.path}`]) return over[`${r.method} ${r.path}`](r);
    if (r.method === 'POST' && r.path === '/auth/public') return [200, { ok: true, access_token: `pub${++tokens}`, expires_in: 3600 }];
    if (!r.auth) return [401, { ok: false, error: 'not_signed_in', message: 'sign in' }];
    if (r.method === 'GET' && r.path === '/records/Plans') {
      const skip = Number(r.search.get('skip') ?? 0);
      const limit = Number(r.search.get('limit'));
      const all = Array.from({ length: 450 }, (_, i) => ({ objectId: `p${i}` }));
      return [200, { ok: true, results: all.slice(skip, skip + limit) }];
    }
    if (r.method === 'GET' && r.path === '/records/Plans/p1') return [200, { ok: true, result: { objectId: 'p1', Name: 'One' } }];
    if (r.method === 'POST' && r.path === '/records/Notes') return [200, { ok: true, result: { objectId: 'n1', ...r.body.data } }];
    if (r.method === 'PUT' && r.path === '/records/Notes/n1') return [200, { ok: true, result: { objectId: 'n1', ...r.body.data } }];
    if (r.method === 'DELETE' && r.path === '/records/Notes/n1') return [200, { ok: true, id: 'n1' }];
    if (r.method === 'PUT' && r.path === '/records/Users/u1') return [403, { ok: false, error: 'field_forbidden', message: "you can't write Wallet" }];
    return [404, { ok: false, error: 'not_found', message: 'no such route' }];
  };
}

describe('rx.js 2.0.0 (V2)', () => {
  it('opens a public session from the publishable key once, bound to this device, and lists in 1.0.0 shape', async () => {
    const { RX, calls } = load(server());
    const rx = new RX({ publishableKey: 'rxpk_test_123' });
    const [a, b] = await Promise.all([rx.get('/Plans', { where: { Status: 'active' }, limit: 2 }), rx.get('/Plans', { limit: 1 })]);
    expect(a).toEqual({ results: [{ objectId: 'p0' }, { objectId: 'p1' }] });
    expect(b.results).toHaveLength(1);
    expect(calls.filter((c) => c.path === '/auth/public')).toHaveLength(1);
    expect(calls[0].body).toEqual({ key: 'rxpk_test_123' });
    const list = calls.find((c) => c.path === '/records/Plans' && c.query.includes('Status'));
    expect(decodeURIComponent(list.query)).toBe('?where[Status]=active&limit=2');
    expect(list.auth).toMatch(/^Bearer pub/);
    expect(new Set(calls.map((c) => c.device)).size).toBe(1);
  });

  it('limit -1 reads every page (V2 caps a page at 200)', async () => {
    const { RX } = load(server());
    const r = await new RX({ publishableKey: 'k' }).get('/Plans', { limit: -1 });
    expect(r.results).toHaveLength(450);
    expect(r.results.at(-1).objectId).toBe('p449');
  });

  it('one row, create, update (id in the body like 1.0.0), delete; errors resolve as {error}', async () => {
    const { RX } = load(server());
    const rx = new RX({ publishableKey: 'k' });
    expect(await rx.get('/Plans/p1')).toEqual({ results: [{ objectId: 'p1', Name: 'One' }] });
    expect((await rx.post('/Notes', { Text: 'hi' })).results[0]).toEqual({ objectId: 'n1', Text: 'hi' });
    expect((await rx.put('/Notes', { objectId: 'n1', Text: 'edited' })).results[0].Text).toBe('edited');
    expect(await rx.delete('/Notes/n1')).toEqual({ results: [{ objectId: 'n1' }] });
    expect(await rx.put('/Users/u1', { Wallet: 9 })).toEqual({ error: "you can't write Wallet", code: 'field_forbidden', status: 403 });
  });

  it('batch, engine endpoints and tasks', async () => {
    const { RX, calls } = load(
      server({
        'POST /batch': (r) => [200, { ok: true, results: [{ status: 200, ok: true, results: [{ objectId: 'p0' }], count: 9 }, { status: 404, ok: false, error: 'not_found', message: 'no such record' }, { status: 200, ok: true, result: { objectId: 'x1' } }] }],
        'GET /engine/_payment/methods': () => [200, { ok: true, result: { gateway: 'stripe', savedCards: [] } }],
        'POST /tasks': (r) => [200, { ok: true, id: 't1' }],
      }),
    );
    const rx = new RX({ publishableKey: 'k' });
    const b = await rx.post('/Batch', { requests: [{ path: '/Plans', method: 'get', body: { count: 1, limit: 0 } }, { path: '/Plans/zz', method: 'GET' }, { path: '/Notes', method: 'POST', body: { Text: 'x' } }] });
    expect(b).toEqual([{ results: [{ objectId: 'p0' }], count: 9 }, { error: 'no such record', code: 'not_found', status: 404 }, { results: [{ objectId: 'x1' }] }]);
    expect(calls.find((c) => c.path === '/batch').body.requests[0].method).toBe('GET');
    expect(await rx.get('/_payment/methods', { currency: 'USD' })).toEqual({ gateway: 'stripe', savedCards: [] });
    expect(calls.find((c) => c.path === '/engine/_payment/methods').query).toBe('?currency=USD');
    expect(await rx.post('/tasks', { action: 'ssl.renew', domain: 'd1' })).toEqual({ ok: true, id: 't1' });
  });

  it('email-code sign-in: the user token is used afterwards; me() reads the own Users row; a dead user token signs out', async () => {
    let signedOut = 0;
    const user = jwt({ uid: 'u1', exp: 9999999999 });
    const { RX, calls } = load(
      server({
        'POST /auth/login': (r) => [200, { ok: true, challengeId: 'ch1', destination: 'a***@x.com' }],
        'POST /auth/login/verify': (r) => (r.body.code === '123456' ? [200, { ok: true, access_token: user, expires_in: 3600 }] : [401, { ok: false, error: 'code_rejected', message: 'wrong code' }]),
        'GET /records/Users/u1': (r) => (r.auth === `Bearer ${user}` ? [200, { ok: true, result: { objectId: 'u1', Email: 'a@x.com' } }] : [401, { ok: false, error: 'expired' }]),
      }),
    );
    const rx = new RX({ publishableKey: 'k', onSignedOut: () => signedOut++ });
    expect(await rx.login({ email: 'a@x.com' })).toEqual({ challengeId: 'ch1', destination: 'a***@x.com', resendAfter: undefined });
    expect(await rx.login({ challengeId: 'ch1', code: '000000' })).toMatchObject({ code: 'code_rejected' });
    expect(rx.isLoggedIn()).toBe(false);
    expect(await rx.login({ challengeId: 'ch1', code: '123456' })).toBe('success');
    expect(rx.isLoggedIn()).toBe(true);
    expect(rx.userId()).toBe('u1');
    expect(await rx.me()).toEqual({ objectId: 'u1', Email: 'a@x.com' });
    expect(calls.at(-1).auth).toBe(`Bearer ${user}`);
    // The server ends the session: the next call reports it and the client is signed out.
    const stale = new RX({ publishableKey: 'k', onSignedOut: () => signedOut++ });
    stale._saveToken('user', { access_token: 'dead', expires_in: 3600 });
    expect(await stale.get('/Users/u1')).toMatchObject({ status: 401 });
    expect(stale.isLoggedIn()).toBe(false);
    expect(signedOut).toBe(1);
  });

  it('renews an expired public session once and retries', async () => {
    let first = true;
    const { RX, calls } = load(
      server({
        'GET /records/Plans/p1': (r) => {
          if (first) {
            first = false;
            return [401, { ok: false, error: 'expired' }];
          }
          return [200, { ok: true, result: { objectId: 'p1' } }];
        },
      }),
    );
    const r = await new RX({ publishableKey: 'k' }).get('/Plans/p1');
    expect(r.results[0].objectId).toBe('p1');
    expect(calls.filter((c) => c.path === '/auth/public')).toHaveLength(2);
  });
});

describe('rx.js 2.0.1 scope', () => {
  it('declares no global Engine (V1 pages declare their own), only window.RX / window.RXEngine', () => {
    const src = readFileSync(new URL('../src/rx.js', import.meta.url), 'utf8');
    globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, crypto: globalThis.crypto };
    // A page that already has V1's global class Engine, then loads 2.0.1: no redeclaration error.
    expect(() => new Function(`class Engine {}\n${src}\nreturn typeof Engine;`)()).not.toThrow();
    expect(typeof globalThis.window.RX).toBe('function');
    expect(typeof globalThis.window.RXEngine).toBe('function');
  });
});

describe('rx.js 2.0.2', () => {
  it('lists categories and sends the contact form', async () => {
    const { RX, calls } = load(
      server({
        'GET /records/Resources/categories': () => [200, { ok: true, results: [{ objectId: 'c1', Name: 'Guides' }] }],
        'POST /contact': (r) => [200, { ok: true, sent: true }],
      }),
    );
    const rx = new RX({ publishableKey: 'k' });
    expect(await rx.get('/Resources/categories')).toEqual({ results: [{ objectId: 'c1', Name: 'Guides' }] });
    expect(await rx.contact({ name: 'Rana', email: 'r@x.org', message: 'Hi' })).toEqual({ ok: true, sent: true });
    expect(calls.find((c) => c.path === '/contact').body).toEqual({ name: 'Rana', email: 'r@x.org', subject: '', message: 'Hi', website: '' });
    expect(await rx.post('/contact', { name: 'A', email: 'a@x.org', message: 'm' })).toEqual({ ok: true, sent: true });
  });
});

describe('rx.js 2.0.3', () => {
  it('reads _Locale as records and passes V1 read options through', async () => {
    const { RX, calls } = load(server({ 'GET /records/_Locale': () => [200, { ok: true, results: [{ Key: 'home.title', en: 'Welcome' }] }] }));
    const rx = new RX({ publishableKey: 'k' });
    expect(await rx.get('/_Locale', { fields: '*' })).toEqual({ results: [{ Key: 'home.title', en: 'Welcome' }] });
    await rx.get('/Plans', { limit: 2, media: 'files,images', crops: 'ax600', categories: 'c1' });
    expect(decodeURIComponent(calls.at(-1).query)).toBe('?limit=2&media=files,images&crops=ax600&categories=c1');
  });
});
