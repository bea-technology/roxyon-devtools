import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface Subscription {
  objectId: string;
  Name?: string;
  Status?: string;
  Username?: string;
  /** Infra node the subscription's container lives on (internal). */
  Node?: string;
  Datacenter?: string;
  [k: string]: unknown;
}

export interface Privilege {
  objectId: string;
  Type?: string;
  Subscription?: string;
  _Subscription?: { results: Subscription[] };
  [k: string]: unknown;
}

interface ListResponse<T> {
  results?: T[];
  error?: string;
}

/** Access to the caller's subscriptions (via their Privileges rows). */
export class SubscriptionsApi {
  constructor(private readonly client: RoxyonClient) {}

  /** All subscriptions the signed-in user has a Privilege on. */
  async list(userId: string): Promise<Subscription[]> {
    const r = await this.client.get<ListResponse<Privilege>>('/Privileges', {
      where: { User: userId },
      fields: 'objectId,Type,Subscription',
      limit: -1,
      include: [
        {
          className: 'Subscriptions',
          field: 'Subscription',
          fields: 'objectId,Name,Status,Username,Node,Datacenter',
        },
      ],
    });
    if (!Array.isArray(r.results)) {
      throw new RoxyonApiError(r.error || 'Could not load subscriptions.', {
        status: 401,
        body: r,
      });
    }
    const subs: Subscription[] = [];
    for (const priv of r.results) {
      const sub = priv._Subscription?.results?.[0];
      if (sub) subs.push(sub);
    }
    return subs;
  }

  /**
   * Resolve the subscription to act on. Prefers an exact `objectId` or `Name`
   * match against `preferred`; otherwise the first active subscription; otherwise
   * the first one. Throws when the account has none.
   */
  async resolve(userId: string, preferred?: string): Promise<Subscription> {
    const subs = await this.list(userId);
    if (subs.length === 0) {
      throw new RoxyonApiError(
        'This account has no active subscription — add a plan in the console first.',
      );
    }
    if (preferred) {
      const hit = subs.find(
        (s) => s.objectId === preferred || s.Name === preferred || s.Username === preferred,
      );
      if (hit) return hit;
      throw new RoxyonApiError(`No subscription matches "${preferred}".`);
    }
    return subs.find((s) => s.Status === 'active') ?? subs[0]!;
  }
}
