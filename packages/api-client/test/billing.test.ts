import { describe, expect, it, vi } from 'vitest';
import { BillingApi } from '../src/billing.js';
import { RoxyonClient } from '../src/client.js';

function setup(reply: (url: URL) => unknown, sessionToken?: string) {
  const urls: URL[] = [];
  const headers: Record<string, string>[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    urls.push(url);
    headers.push((init?.headers ?? {}) as Record<string, string>);
    if (url.pathname.endsWith('/Auth')) {
      return new Response(JSON.stringify({ access_token: 'anon', expires_in: 3600 }));
    }
    return new Response(JSON.stringify(reply(url) ?? {}));
  });
  const client = new RoxyonClient({ sessionToken, fetch: fetchImpl as unknown as typeof fetch });
  return { api: new BillingApi(client), urls, headers };
}

const plan = {
  objectId: 'WDE9ZDLpe7',
  Name: 'Scale S',
  Code: 'SCALE-S',
  Limits: '{"vcpu":2,"memory_mb":4096,"disk_gb":128,"cpu_type":"shared"}',
  Features: '{"Network":{"Dedicated IPv4":1}}',
  _Service: { results: [{ Type: 'cloud.vps.scale' }] },
  _Pricing: {
    results: [
      {
        Prices: '{"monthly":4.99,"yearly":59.88}',
        SetupFee: '{"monthly":0,"yearly":0}',
        MetaData: '{"stock":"in"}',
      },
    ],
  },
};

describe('BillingApi', () => {
  it('reads the public catalog anonymously, even for a PAT caller', async () => {
    const { api, urls, headers } = setup(() => ({ results: [plan] }), 'roxp_secret');
    const [p] = await api.catalog();
    expect(p).toMatchObject({
      planId: 'WDE9ZDLpe7',
      sku: 'SCALE-S',
      category: 'cloud.vps.scale',
      vcpu: 2,
      ramGb: 4,
      diskGb: 128,
      ipv4Included: 1,
      pricesUSD: { monthly: 4.99, yearly: 59.88 },
      stock: 'in',
    });
    expect(p?.setupFeeUSD).toBeUndefined();
    const plans = urls.find((u) => u.pathname.endsWith('/Plans'));
    expect(decodeURIComponent(plans?.search ?? '')).toContain('where[Service][nin]=bjMqdLqAKl');
    expect(JSON.stringify(headers)).not.toContain('roxp_secret');
  });

  it('asks the server for a subscription.new quote with setup', async () => {
    const { api, urls } = setup(() => ({
      ok: true,
      currency: 'SAR',
      total: '258.23',
      lineItems: [],
    }));
    const q = await api.quote({
      planId: 'WDE9ZDLpe7',
      cycle: 'yearly',
      currency: 'sar',
      country: 'sa',
    });
    expect(q.total).toBe('258.23');
    const u = urls.find((x) => x.pathname.endsWith('/_payment/quote'));
    expect(u?.searchParams.get('type')).toBe('subscription.new');
    expect(u?.searchParams.get('setup')).toBe('1');
    expect(u?.searchParams.get('currency')).toBe('SAR');
    expect(u?.searchParams.get('country')).toBe('SA');
  });

  it('reads subscriptions and invoices from the console with the bearer PAT', async () => {
    const { api, urls, headers } = setup(
      (u) =>
        u.pathname.endsWith('/account/invoices')
          ? { ok: true, invoices: [{ id: 'i1', status: 'pending' }] }
          : { ok: true, subscriptions: [{ id: 's1' }] },
      'roxp_secret',
    );
    expect(await api.subscriptions()).toEqual([{ id: 's1' }]);
    expect(await api.invoices({ status: 'pending', limit: 5 })).toEqual([
      { id: 'i1', status: 'pending' },
    ]);
    expect(urls[1]?.searchParams.get('status')).toBe('pending');
    expect(headers[0]?.authorization).toBe('Bearer roxp_secret');
  });

  it('rejects bad input before any request', async () => {
    const { api, urls } = setup(() => ({}));
    await expect(api.quote({ planId: '../x', cycle: 'monthly' })).rejects.toThrow(/planId/);
    expect(urls).toHaveLength(0);
  });
});

describe('BillingApi invoices', () => {
  it('drops the pay link from invoices that cannot be paid', async () => {
    const url = 'https://console.roxyon.com/account/invoices';
    const { api } = setup(
      () => ({
        ok: true,
        invoices: [
          { id: 'a', status: 'void', payUrl: url },
          { id: 'b', status: 'pending', payUrl: url },
        ],
      }),
      'roxp_x',
    );
    const [a, b] = await api.invoices();
    expect(a?.payUrl).toBeNull();
    expect(b?.payUrl).toBe(url);
  });
});

describe('BillingApi order', () => {
  it('posts the order to the console with the PAT and surfaces refusals', async () => {
    const { api, urls, headers } = setup(
      () => ({ ok: false, error: 'Over budget: this order is 59.88 USD (before tax)' }),
      'roxp_secret',
    );
    await expect(
      api.order({ sku: 'SCALE-S', cycle: 'yearly', name: 'x', username: 'xy' }),
    ).rejects.toThrow(/Over budget/);
    expect(urls[0]?.pathname).toBe('/account/order');
    expect(headers[0]?.authorization).toBe('Bearer roxp_secret');
  });
});

describe('RoxyonClient', () => {
  it('turns an HTML page (route not deployed) into a short error', async () => {
    const client = new RoxyonClient({
      sessionToken: 'roxp_x',
      fetch: (async () => new Response('<!DOCTYPE html><html></html>')) as unknown as typeof fetch,
    });
    const r = await client.console<{ error?: string }>('POST', '/account/order', {
      tolerateHttpError: true,
    });
    expect(r.error).toMatch(/not available on this server yet/);
  });
});
