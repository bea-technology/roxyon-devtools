import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface SessionGrant {
  session_token: string;
  refresh_token?: string;
  expires_in?: number;
  status?: string;
}

export interface RoxyonUser {
  objectId: string;
  Email?: string;
  Username?: string;
  Name?: string;
  Currency?: string;
  Language?: string;
  [k: string]: unknown;
}

export interface LoginPrecheck {
  ok?: boolean;
  error?: string;
  stepUpRequired?: boolean;
  challengeId?: string;
}

export interface LoginResult {
  sessionToken: string;
  refreshToken?: string;
  expiresIn?: number;
  /** True when an OTP code is still required — call {@link AuthApi.verifyOtp}. */
  stepUpRequired?: boolean;
  challengeId?: string;
}

/**
 * Wraps the console's login flow:
 *   1. `POST /_account/login-precheck` — validates credentials, decides whether
 *      an OTP step-up is required, and (when it is) returns a `challengeId`.
 *   2a. no step-up -> `POST /Auth/login` finalises and returns a session token.
 *   2b. step-up    -> caller collects the code, then `POST /Auth/login/otp-verify`.
 *
 * Mirrors `signin.view` / `otp.view` in `console.roxyon.com`.
 */
export class AuthApi {
  constructor(private readonly client: RoxyonClient) {}

  /**
   * Best-effort device/step-up precheck. `/_account/login-precheck` is a console
   * cloud function that may be gated behind the REST key (not reachable from a
   * public client) — in that case this resolves to `{}` and login falls back to
   * `/Auth/login`, which is itself the security boundary and re-checks the
   * device. Only a definitive `{ ok: false }` / `stepUpRequired` is acted on.
   */
  async precheck(
    email: string,
    password: string,
    metadata: Record<string, string> = {},
  ): Promise<LoginPrecheck> {
    try {
      const r = await this.client.post<LoginPrecheck & { code?: number }>(
        '/_account/login-precheck',
        { Email: email, Password: password, metadata },
        { tolerateHttpError: true },
      );
      // Endpoint not available to this client — ignore, let /Auth/login decide.
      if (r?.code === 401 || (r?.error && /rest api key/i.test(r.error))) return {};
      return r ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Full login. Returns a session token on success, or `stepUpRequired` with a
   * `challengeId` when an OTP code is needed next.
   */
  async login(
    email: string,
    password: string,
    metadata: Record<string, string> = {},
  ): Promise<LoginResult> {
    const pre = await this.precheck(email, password, metadata);
    if (pre.ok === false && pre.error && !pre.stepUpRequired) {
      throw new RoxyonApiError(pre.error, { type: 'CredentialsError' });
    }
    if (pre.stepUpRequired) {
      return { sessionToken: '', stepUpRequired: true, challengeId: pre.challengeId };
    }

    const grant = await this.client.post<
      SessionGrant & { error?: string; stepUpRequired?: boolean; challengeId?: string }
    >('/Auth/login', { Email: email, Password: password, metadata }, { tolerateHttpError: true });

    // Some accounts step up at /Auth/login itself rather than at precheck.
    if (grant?.stepUpRequired || (grant?.challengeId && !grant.session_token)) {
      return { sessionToken: '', stepUpRequired: true, challengeId: grant.challengeId };
    }
    if (!grant?.session_token) {
      throw new RoxyonApiError(grant?.error || 'Wrong email or password.', {
        type: 'CredentialsError',
      });
    }
    this.client.setSessionToken(grant.session_token);
    return {
      sessionToken: grant.session_token,
      refreshToken: grant.refresh_token,
      expiresIn: grant.expires_in,
    };
  }

  /** Complete an OTP step-up with the code the user received. */
  async verifyOtp(challengeId: string, code: string): Promise<LoginResult> {
    const grant = await this.client.post<SessionGrant & { error?: string }>(
      '/Auth/login/otp-verify',
      { challengeId, code },
      { tolerateHttpError: true },
    );
    if (grant?.status !== 'authenticated' || !grant.session_token) {
      throw new RoxyonApiError(grant?.error || 'That code did not verify.', {
        type: 'OtpError',
        body: grant,
      });
    }
    this.client.setSessionToken(grant.session_token);
    return {
      sessionToken: grant.session_token,
      refreshToken: grant.refresh_token,
      expiresIn: grant.expires_in,
    };
  }

  /** Start an OTP-only sign-in (no password). Returns a `challengeId`. */
  async startOtp(email: string): Promise<{ challengeId: string }> {
    const r = await this.client.post<{ challengeId?: string; error?: string }>(
      '/Auth/login/otp',
      { Email: email },
      { tolerateHttpError: true },
    );
    if (!r?.challengeId) {
      throw new RoxyonApiError(r?.error || 'Could not start OTP sign-in.', { body: r });
    }
    return { challengeId: r.challengeId };
  }

  /** The currently authenticated user. Requires a session token on the client. */
  async me(): Promise<RoxyonUser> {
    const user = await this.client.post<RoxyonUser & { error?: string }>('/Auth/me', {});
    if (!user?.objectId) {
      throw new RoxyonApiError(user?.error || 'Not signed in.', { status: 401, body: user });
    }
    return user;
  }

  async logout(): Promise<void> {
    await this.client.post('/Auth/logout', {}, { tolerateHttpError: true }).catch(() => undefined);
    this.client.setSessionToken(undefined);
  }
}
