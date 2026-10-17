import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

/** `billing:order` lets the token place orders (human pays) within its monthly budget; never a default. */
export type TokenScope = 'deploy' | 'logs' | 'read' | 'billing:order';

export interface TokenSummary {
  id: string;
  name: string;
  prefix: string;
  scopes: TokenScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** For `billing:order` tokens: the most it may order per calendar month, in USD before tax. */
  monthlyBudgetUSD?: number | null;
  /** For `billing:order` tokens: plan codes it may order (empty = any). */
  allowedSkus?: string[];
}

export interface CreatedToken {
  /** The full `roxp_…` secret — shown once. Use it as `ROXYON_TOKEN`. */
  token: string;
  name: string;
  scopes: TokenScope[];
  expiresAt: string | null;
}

/**
 * Personal Access Tokens — for the CLI in CI and for the MCP server running
 * headless. Managed only while signed in with a session (`roxyon login`); a PAT
 * cannot mint or revoke another PAT.
 *
 * `GET/POST/DELETE /account/tokens` — console endpoints.
 */
export class TokensApi {
  constructor(private readonly client: RoxyonClient) {}

  async list(): Promise<TokenSummary[]> {
    const r = await this.client.console<{ ok?: boolean; tokens?: TokenSummary[]; error?: string }>(
      'GET',
      '/account/tokens',
      { tolerateHttpError: true },
    );
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not list tokens.', { body: r });
    return r.tokens ?? [];
  }

  async create(
    name: string,
    opts: {
      scopes?: TokenScope[];
      expiresInDays?: number;
      /** Required with `billing:order`. */
      monthlyBudgetUSD?: number;
      allowedSkus?: string[];
    } = {},
  ): Promise<CreatedToken> {
    const r = await this.client.console<CreatedToken & { ok?: boolean; error?: string }>(
      'POST',
      '/account/tokens',
      {
        body: {
          name,
          scopes: opts.scopes ?? ['deploy', 'logs'],
          ...(opts.expiresInDays ? { expiresInDays: opts.expiresInDays } : {}),
          ...(opts.monthlyBudgetUSD ? { monthlyBudgetUSD: opts.monthlyBudgetUSD } : {}),
          ...(opts.allowedSkus?.length ? { allowedSkus: opts.allowedSkus } : {}),
        },
        tolerateHttpError: true,
      },
    );
    if (!r?.ok || !r.token) {
      throw new RoxyonApiError(r?.error || 'Could not create the token.', { body: r });
    }
    return { token: r.token, name: r.name, scopes: r.scopes, expiresAt: r.expiresAt ?? null };
  }

  async revoke(id: string): Promise<void> {
    const r = await this.client.console<{ ok?: boolean; error?: string }>(
      'DELETE',
      '/account/tokens',
      { query: { id }, tolerateHttpError: true },
    );
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not revoke the token.', { body: r });
  }
}
