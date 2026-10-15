import { describe, expect, it, vi } from 'vitest';
import { BaasDataApi } from '../src/baas-data.js';
import { RoxyonApiError } from '../src/errors.js';

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function setup(reply: (c: Call) => unknown = () => ({ ok: true }), status = 200) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const c: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    return new Response(JSON.stringify(reply(c) ?? {}), { status });
  });
  const api = new BaasDataApi({
    secretKey: 'rxsk_TEST',
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { api, calls };
}

describe('BaasDataApi (V2)', () => {
  it('refuses anything but a secret key', () => {
    expect(() => new BaasDataApi({ secretKey: 'rxpk_app_x' })).toThrow(/rxsk_/);
  });

  it('calls /2/records with the secret key header', async () => {
    const { api, calls } = setup(() => ({ ok: true, results: [{ objectId: 'a' }], count: 7 }));
    const r = await api.query('Todos', { where: { Status: 'open' }, limit: 5, count: true });
    expect(r).toEqual({ rows: [{ objectId: 'a' }], count: 7 });
    const c = calls[0];
    expect(c?.headers['x-rx-secret-key']).toBe('rxsk_TEST');
    const url = new URL(c?.url ?? '');
    expect(url.origin + url.pathname).toBe('https://www.beaapis.com/2/records/Todos');
    expect(url.searchParams.get('fields')).toBe('*');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('count')).toBe('1');
    expect(JSON.parse(url.searchParams.get('where') ?? '')).toEqual({ Status: 'open' });
  });

  it('sends writes as {data} and returns the stored row', async () => {
    const { api, calls } = setup(() => ({ ok: true, result: { objectId: 'n1', Title: 'x' } }));
    expect(await api.create('Todos', { Title: 'x' })).toEqual({ objectId: 'n1', Title: 'x' });
    await api.update('Todos', 'n1', { Title: 'y' });
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toEqual({ data: { Title: 'x' } });
    expect(calls[1]?.method).toBe('PUT');
    expect(calls[1]?.url).toMatch(/\/2\/records\/Todos\/n1$/);
    expect(calls[1]?.body).toEqual({ data: { Title: 'y' } });
  });

  it('puts the objectId in the DELETE path, never the body', async () => {
    const { api, calls } = setup(() => ({ ok: true, id: 'abc123' }));
    await api.delete('Todos', 'abc123');
    expect(calls[0]?.method).toBe('DELETE');
    expect(calls[0]?.url).toMatch(/\/2\/records\/Todos\/abc123$/);
    expect(calls[0]?.body).toBeUndefined();
  });

  it('throws V2 errors with their status and code', async () => {
    const { api } = setup(
      () => ({ ok: false, error: 'forbidden', message: "you can't read Todos" }),
      403,
    );
    const err = await api.query('Todos').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RoxyonApiError);
    expect((err as RoxyonApiError).status).toBe(403);
    expect((err as RoxyonApiError).type).toBe('forbidden');
    expect((err as RoxyonApiError).message).toBe("you can't read Todos");
  });

  it('posts a batch and returns each answer in order', async () => {
    const { api, calls } = setup(() => ({
      ok: true,
      results: [
        { status: 200, ok: true, result: { objectId: 'a' } },
        { status: 403, ok: false, error: 'forbidden', message: 'no' },
      ],
    }));
    const out = await api.batch([
      { method: 'POST', path: '/Todos', body: { data: { Title: 'a' } } },
      { method: 'DELETE', path: '/Todos/zz' },
    ]);
    expect(calls[0]?.url).toMatch(/\/2\/batch$/);
    expect(out[1]?.ok).toBe(false);
  });

  it('rejects unsafe names, ids, limits and batch sizes before any request', async () => {
    const { api, calls } = setup();
    await expect(api.query('../Users')).rejects.toThrow(/Invalid class/);
    await expect(api.query('_Users')).rejects.toThrow(/Invalid class/);
    await expect(api.delete('Todos', 'a/b')).rejects.toThrow(/Invalid objectId/);
    await expect(api.query('Todos', { limit: 500 })).rejects.toThrow(/limit/);
    await expect(api.batch([])).rejects.toThrow(/1 to 50/);
    await expect(api.batch([{ method: 'GET', path: '/A/b/c' }])).rejects.toThrow(/must be/);
    expect(calls).toHaveLength(0);
  });
});
