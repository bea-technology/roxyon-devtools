import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';
import type { TokenScope } from './tokens.js';

export interface AccountSubscription {
  id: string;
  name: string;
  status: string;
  node: string;
  datacenter: string;
  container: string;
}

export interface AccountDomain {
  id: string;
  name: string;
  subscription: string;
}

export interface AccountContext {
  user: { id: string; email: string };
  scopes: (TokenScope | '*')[];
  subscriptions: AccountSubscription[];
  domains: AccountDomain[];
}

/**
 * `GET /account/context` — one call the CLI / MCP server use to plan a deploy:
 * the signed-in user, their subscriptions (with node), and their domains.
 * Resolvable by a session token OR a Personal Access Token, so a CI job with
 * only a PAT never has to touch the BaaS.
 */
export class AccountApi {
  private cache?: Promise<AccountContext>;

  constructor(private readonly client: RoxyonClient) {}

  context(opts: { fresh?: boolean } = {}): Promise<AccountContext> {
    if (!this.cache || opts.fresh) this.cache = this.fetch();
    return this.cache;
  }

  private async fetch(): Promise<AccountContext> {
    const r = await this.client.console<AccountContext & { ok?: boolean; error?: string }>(
      'GET',
      '/account/context',
      { tolerateHttpError: true },
    );
    if (!r?.ok || !r.user?.id) {
      throw new RoxyonApiError(r?.error || 'Could not load the account context.', { body: r });
    }
    return {
      user: r.user,
      scopes: r.scopes ?? [],
      subscriptions: r.subscriptions ?? [],
      domains: r.domains ?? [],
    };
  }

  /** Pick the subscription to deploy against — the preferred one, else the only/first. */
  async resolveSubscription(preferred?: string): Promise<AccountSubscription> {
    const { subscriptions } = await this.context();
    if (subscriptions.length === 0) {
      throw new RoxyonApiError('This account has no subscriptions.');
    }
    if (preferred) {
      const hit = subscriptions.find((s) => s.id === preferred || s.name === preferred);
      if (hit) return hit;
    }
    return subscriptions[0]!;
  }
}
