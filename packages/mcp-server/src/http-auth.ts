import { createHash } from 'node:crypto';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

/** OAuth 2.0 Authorization Server Metadata (the subset the clients read). */
export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
}

/**
 * The AS metadata for the Roxyon console. In production this is confirmed by
 * fetching `${issuer}/.well-known/oauth-authorization-server` at boot
 * ({@link fetchAuthServerMetadata}); this is the fallback / offline shape.
 */
export function staticAuthServerMetadata(issuer: string): AuthServerMetadata {
  const b = issuer.replace(/\/+$/, '');
  return {
    issuer: b,
    authorization_endpoint: `${b}/oauth/authorize`,
    token_endpoint: `${b}/oauth/token`,
    registration_endpoint: `${b}/oauth/register`,
    revocation_endpoint: `${b}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['read', 'deploy', 'logs'],
  };
}

/** GET the console's live AS metadata, falling back to {@link staticAuthServerMetadata}. */
export async function fetchAuthServerMetadata(
  issuer: string,
  doFetch: typeof fetch = fetch,
): Promise<AuthServerMetadata> {
  const url = `${issuer.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`;
  try {
    const res = await doFetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as Partial<AuthServerMetadata>;
    if (!body.issuer || !body.authorization_endpoint || !body.token_endpoint) {
      throw new Error('incomplete metadata');
    }
    return { ...staticAuthServerMetadata(issuer), ...body } as AuthServerMetadata;
  } catch {
    return staticAuthServerMetadata(issuer);
  }
}

/**
 * Phase 1 / local-dev verifier: accepts any `roxp_…` bearer and trusts the
 * console to reject it downstream. No audience or expiry enforcement — never
 * enable this in production (`MCP_AUTH=introspect` selects the real one).
 */
export function permissiveVerifier(resource: string): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      if (!token.startsWith('roxp_')) {
        throw new InvalidTokenError('not a Roxyon access token');
      }
      return {
        token,
        clientId: 'dev',
        scopes: ['read', 'deploy', 'logs'],
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        resource: new URL(resource),
      };
    },
  };
}

export interface IntrospectionConfig {
  /** Console base for the introspection call — on-box (`http://127.0.0.1:9001`) in prod. */
  consoleUrl: string;
  /** Shared secret presented as `Authorization: Bearer` to `/oauth/introspect`. */
  secret: string;
  /** Canonical resource identifier this server accepts tokens for. */
  resource: string;
  fetch?: typeof fetch;
  /** Result cache TTL cap in ms (default 60_000). */
  cacheMs?: number;
}

/**
 * Production verifier: RFC 7662 token introspection against the console. Enforces
 * `active`, `kind === "oauth"`, and RFC 8707 audience binding, and caches the
 * result briefly to avoid a console round-trip per tool call.
 */
export function introspectionVerifier(cfg: IntrospectionConfig): OAuthTokenVerifier {
  const doFetch = cfg.fetch ?? fetch;
  const cacheMs = cfg.cacheMs ?? 60_000;
  const cache = new Map<string, { info: AuthInfo; until: number }>();

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const key = createHash('sha256').update(token).digest('hex');
      const hit = cache.get(key);
      if (hit && hit.until > Date.now()) return hit.info;

      let res: Response;
      try {
        res = await doFetch(`${cfg.consoleUrl.replace(/\/+$/, '')}/oauth/introspect`, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            authorization: `Bearer ${cfg.secret}`,
          },
          body: new URLSearchParams({ token }).toString(),
        });
      } catch (cause) {
        throw new InvalidTokenError(`introspection request failed: ${(cause as Error).message}`);
      }

      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || j.active !== true) throw new InvalidTokenError('token is not active');
      if (j.kind !== 'oauth') {
        throw new InvalidTokenError('token was not issued for a connector');
      }
      const aud = typeof j.aud === 'string' ? j.aud : '';
      if (aud && aud !== cfg.resource) {
        throw new InvalidTokenError('token audience does not match this server');
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = typeof j.exp === 'number' ? j.exp : now + 60;
      const info: AuthInfo = {
        token,
        clientId: typeof j.client_id === 'string' ? j.client_id : 'unknown',
        scopes: typeof j.scope === 'string' ? j.scope.split(/\s+/).filter(Boolean) : [],
        expiresAt,
        resource: new URL(cfg.resource),
        extra: { uid: typeof j.sub === 'string' ? j.sub : undefined },
      };

      const ttl = Math.min(cacheMs, Math.max(0, (expiresAt - now) * 1000));
      if (ttl > 0) cache.set(key, { info, until: Date.now() + ttl });
      return info;
    },
  };
}
