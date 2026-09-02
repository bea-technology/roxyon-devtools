import type { RoxyonClient } from './client.js';

export interface Domain {
  objectId: string;
  Name: string;
}

/** Domains (hosts) attached to a subscription — used to place an application. */
export class DomainsApi {
  constructor(private readonly client: RoxyonClient) {}

  async list(subscriptionId: string): Promise<Domain[]> {
    const r = await this.client.get<{ results?: Domain[] }>('/Domains', {
      fields: 'objectId,Name',
      limit: -1,
      order: 'Name',
      where: { Subscription: subscriptionId },
    });
    return r.results ?? [];
  }
}
