import { describe, expect, it, vi } from 'vitest';
import { RoxyonClient } from '../src/client.js';
import { DatabasesApi } from '../src/databases.js';
import { EmailApi } from '../src/email.js';
import { SshApi } from '../src/ssh.js';

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

describe('DatabasesApi', () => {
  it('create() posts JSON to /databases/create', async () => {
    const { client, calls } = capturingClient({
      ok: true,
      objectId: 'Db1',
      name: 'acme_wordpress',
      username: 'acme_wordpress',
      password: 'sekret',
      host: '10.0.0.2:6033',
      status: 'active',
    });
    const res = await new DatabasesApi(client).create({ name: 'wordpress' });
    expect(res.status).toBe('active');
    expect(res.host).toBe('10.0.0.2:6033');
    const call = calls.at(-1)!;
    expect(call.url).toBe('https://console.example/databases/create');
    expect(JSON.parse(String(call.body))).toEqual({ name: 'wordpress' });
  });

  it('delete() posts { database } to /databases/delete', async () => {
    const { client, calls } = capturingClient({ ok: true, objectId: 'Db1', status: 'deleted' });
    const res = await new DatabasesApi(client).delete('Db1');
    expect(res.status).toBe('deleted');
    expect(JSON.parse(String(calls.at(-1)!.body))).toEqual({ database: 'Db1' });
  });

  it('throws RoxyonApiError when the endpoint returns ok:false', async () => {
    const { client } = capturingClient({ error: 'Too many databases created recently' });
    await expect(new DatabasesApi(client).create({ name: 'x' })).rejects.toThrow(/Too many/);
  });
});

describe('EmailApi', () => {
  it('create() posts JSON to /emails/create', async () => {
    const { client, calls } = capturingClient({
      ok: true,
      objectId: 'Em1',
      email: 'info@acme.com',
      password: 'sekret',
      status: 'active',
    });
    const res = await new EmailApi(client).create({ localPart: 'info', domain: 'acme.com' });
    expect(res.email).toBe('info@acme.com');
    const call = calls.at(-1)!;
    expect(call.url).toBe('https://console.example/emails/create');
    expect(JSON.parse(String(call.body))).toEqual({ localPart: 'info', domain: 'acme.com' });
  });

  it('delete() posts { email } to /emails/delete', async () => {
    const { client, calls } = capturingClient({ ok: true, objectId: 'Em1', status: 'deleted' });
    const res = await new EmailApi(client).delete('Em1');
    expect(res.status).toBe('deleted');
    expect(JSON.parse(String(calls.at(-1)!.body))).toEqual({ email: 'Em1' });
  });
});

describe('SshApi', () => {
  it('resetPassword() posts JSON to /ssh/password', async () => {
    const { client, calls } = capturingClient({
      ok: true,
      subscription: 'Sub1',
      password: 'Aa1!Aa1!Aa1!',
      status: 'active',
    });
    const res = await new SshApi(client).resetPassword({ subscription: 'Sub1' });
    expect(res.status).toBe('active');
    expect(res.password).toBe('Aa1!Aa1!Aa1!');
    const call = calls.at(-1)!;
    expect(call.url).toBe('https://console.example/ssh/password');
    expect(JSON.parse(String(call.body))).toEqual({ subscription: 'Sub1' });
  });

  it('throws RoxyonApiError when the endpoint returns ok:false', async () => {
    const { client } = capturingClient({ error: 'Include a symbol.' });
    await expect(new SshApi(client).resetPassword({})).rejects.toThrow(/Include a symbol/);
  });
});
