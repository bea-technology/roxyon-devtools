import { describe, expect, it, vi } from 'vitest';
import { AuthApi } from '../src/auth.js';
import { RoxyonClient } from '../src/client.js';
import { RoxyonApiError } from '../src/errors.js';

type Handler = (url: string, init: RequestInit) => unknown;

function mockClient(handler: Handler): RoxyonClient {
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // Anonymous token mint — every request needs it before a session exists.
    if (url.endsWith('/Auth') && !url.endsWith('/login') && !url.endsWith('/me')) {
      return json({ access_token: 'anon_abc', refresh_token: 'anon_r', expires_in: 3700 });
    }
    const body = handler(url, init ?? {});
    const status =
      body && typeof body === 'object' && 'code' in body
        ? Number((body as { code: number }).code)
        : 200;
    return json(body ?? {}, Number.isFinite(status) && status >= 400 ? status : 200);
  });
  return new RoxyonClient({ fetch: fetchImpl as unknown as typeof fetch });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AuthApi.login', () => {
  it('finalises a session when no step-up is required', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/_account/login-precheck')) return { ok: true, stepUpRequired: false };
      if (url.endsWith('/Auth/login'))
        return { session_token: 'sess_123', refresh_token: 'r', expires_in: 3600 };
      return {};
    });
    const auth = new AuthApi(client);
    const res = await auth.login('a@b.com', 'pw');
    expect(res.sessionToken).toBe('sess_123');
    expect(client.getSessionToken()).toBe('sess_123');
  });

  it('returns stepUpRequired + challengeId when OTP is needed', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/_account/login-precheck'))
        return { ok: true, stepUpRequired: true, challengeId: 'ch_9' };
      return {};
    });
    const res = await new AuthApi(client).login('a@b.com', 'pw');
    expect(res.stepUpRequired).toBe(true);
    expect(res.challengeId).toBe('ch_9');
    expect(res.sessionToken).toBe('');
  });

  it('throws on bad credentials at precheck', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/_account/login-precheck'))
        return { ok: false, error: 'Wrong Email or Password!' };
      return {};
    });
    await expect(new AuthApi(client).login('a@b.com', 'nope')).rejects.toBeInstanceOf(
      RoxyonApiError,
    );
  });

  it('falls back to /Auth/login when precheck is REST-key gated', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/_account/login-precheck'))
        return { code: 401, error: 'Rest API KEY is required to request this resource.' };
      if (url.endsWith('/Auth/login')) return { session_token: 'sess_ok', expires_in: 3600 };
      return {};
    });
    const res = await new AuthApi(client).login('a@b.com', 'pw');
    expect(res.sessionToken).toBe('sess_ok');
  });

  it('detects a step-up returned by /Auth/login itself', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/_account/login-precheck')) return {};
      if (url.endsWith('/Auth/login')) return { stepUpRequired: true, challengeId: 'ch_login' };
      return {};
    });
    const res = await new AuthApi(client).login('a@b.com', 'pw');
    expect(res.stepUpRequired).toBe(true);
    expect(res.challengeId).toBe('ch_login');
  });

  it('throws when /Auth/login returns no session_token', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/_account/login-precheck')) return { ok: true };
      if (url.endsWith('/Auth/login')) return { error: 'Wrong Email or Password!' };
      return {};
    });
    await expect(new AuthApi(client).login('a@b.com', 'x')).rejects.toThrow(/Wrong Email/);
  });
});

describe('AuthApi.verifyOtp', () => {
  it('sets the session on an authenticated status', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/Auth/login/otp-verify'))
        return { status: 'authenticated', session_token: 'sess_otp', expires_in: 3600 };
      return {};
    });
    const res = await new AuthApi(client).verifyOtp('ch_9', '123456');
    expect(res.sessionToken).toBe('sess_otp');
    expect(client.getSessionToken()).toBe('sess_otp');
  });

  it('rejects a wrong code', async () => {
    const client = mockClient((url) => {
      if (url.endsWith('/Auth/login/otp-verify')) return { error: 'bad code' };
      return {};
    });
    await expect(new AuthApi(client).verifyOtp('ch_9', '000000')).rejects.toBeInstanceOf(
      RoxyonApiError,
    );
  });
});
