import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface Domain {
  objectId: string;
  Name: string;
}

export interface CreateDomainInput {
  /** FQDN to host — a subdomain of a domain the account already hosts, or `*.roxyon.com`. */
  host: string;
  /** Subscription to attach it to. Omit when the account has exactly one. */
  subscription?: string;
  /** `spa` → unmatched paths serve `/index.html`; default `static`. */
  siteType?: 'static' | 'spa';
}

export interface CreateDomainResult {
  ok: boolean;
  objectId: string;
  host: string;
  /** `subdomain` of an owned parent, or `primary`. */
  type: 'subdomain' | 'primary';
  /** `provisioning` while DNS/vhost/TLS come up, then `active` (or `failed`). */
  status: 'provisioning' | 'active' | 'failed';
  error?: string;
}

/** Domains (hosts) attached to a subscription. */
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

  /**
   * `POST /domains/create` — provision a subdomain (DNS + vhost + auto-TLS). The
   * server decides subdomain vs primary from the caller's existing hosts and
   * writes the `pending` row; the platform's reconciler does the rest.
   */
  async create(input: CreateDomainInput): Promise<CreateDomainResult> {
    const r = await this.client.console<CreateDomainResult>('POST', '/domains/create', {
      body: input,
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not create the domain.', { body: r });
    return r;
  }
}
