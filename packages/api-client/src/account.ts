import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';
import type { TokenScope } from './tokens.js';

export interface AccountSubscription {
  id: string;
  name: string;
  status: string;
}

export interface AccountDomain {
  id: string;
  name: string;
  subscription: string;
  /** `active`, or `provisioning` while a freshly-added host comes up. */
  status?: string;
}

export interface AccountContext {
  user: { id: string; email: string };
  scopes: (TokenScope | '*')[];
  subscriptions: AccountSubscription[];
  domains: AccountDomain[];
}

export interface AccountApp {
  id: string;
  name: string;
  status: string;
  desiredState: string;
  runtime: string;
  configRevision: number;
  appliedRevision: number;
  lastError: string | null;
  repo: { url: string; branch: string } | null;
}

/**
 * `GET /account/context` — one call the CLI / MCP server use to plan a deploy:
 * the signed-in user, their subscriptions, and their domains. Resolvable by a
 * session token OR a Personal Access Token, so a CI job with only a PAT never
 * has to touch the BaaS. Infra details (nodes, datacenters, container names,
 * filesystem paths) are deliberately not surfaced here.
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
    // Map explicitly — the endpoint may carry infra fields (node/datacenter/
    // container); keep only what a deploy actually needs so they never reach
    // an AI assistant's context or a log.
    return {
      user: { id: r.user.id, email: r.user.email },
      scopes: r.scopes ?? [],
      subscriptions: (r.subscriptions ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
      })),
      domains: (r.domains ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        subscription: d.subscription,
        ...(d.status ? { status: d.status } : {}),
      })),
    };
  }

  /** `GET /account/apps` — the account's applications (list, PAT-safe). */
  async apps(): Promise<AccountApp[]> {
    const r = await this.client.console<{
      ok?: boolean;
      applications?: AccountApp[];
      error?: string;
    }>('GET', '/account/apps', { tolerateHttpError: true });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not list applications.', { body: r });
    return (r.applications ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      desiredState: a.desiredState,
      runtime: a.runtime,
      configRevision: a.configRevision,
      appliedRevision: a.appliedRevision,
      lastError: a.lastError,
      repo: a.repo,
    }));
  }

  /** One application by id, PAT-safe (filters {@link apps}). */
  async getApp(id: string): Promise<AccountApp | undefined> {
    return (await this.apps()).find((a) => a.id === id);
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
