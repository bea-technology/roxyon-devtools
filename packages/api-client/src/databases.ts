import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface CreateDatabaseInput {
  /** DB name suffix — the platform prefixes it with the subscription's own username (globally unique). */
  name: string;
  /** Subscription to attach it to. Omit when the account has exactly one. */
  subscription?: string;
  /** Omit to have the platform generate one. */
  password?: string;
}

export interface CreateDatabaseResult {
  ok: boolean;
  objectId: string;
  name: string;
  username: string;
  /** Shown once — not retrievable afterwards. */
  password?: string;
  /** `<node-ip>:6033` — the ProxySQL endpoint to connect the app to. */
  host?: string;
  status: 'provisioning' | 'active' | 'failed';
  error?: string;
}

export interface DatabaseSummary {
  objectId: string;
  Name: string;
  Username: string;
  Status: string;
}

export interface DeleteDatabaseResult {
  ok: boolean;
  objectId: string;
  status: 'deleting' | 'deleted' | 'failed';
  error?: string;
}

/** Databases (MySQL/MariaDB on the shared Galera cluster) attached to a subscription. */
export class DatabasesApi {
  constructor(private readonly client: RoxyonClient) {}

  async list(subscriptionId: string): Promise<DatabaseSummary[]> {
    const r = await this.client.get<{ results?: DatabaseSummary[] }>('/Databases', {
      fields: 'objectId,Name,Username,Status',
      limit: -1,
      order: '-createdAt',
      where: { Subscription: subscriptionId, eye: { in: '1,0' } },
    });
    return r.results ?? [];
  }

  /** `POST /databases/create` — provision a database + user; the reconciler does the rest. */
  async create(input: CreateDatabaseInput): Promise<CreateDatabaseResult> {
    const r = await this.client.console<CreateDatabaseResult>('POST', '/databases/create', {
      body: input,
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not create the database.', { body: r });
    return r;
  }

  /** `POST /databases/delete` */
  async delete(databaseId: string): Promise<DeleteDatabaseResult> {
    const r = await this.client.console<DeleteDatabaseResult>('POST', '/databases/delete', {
      body: { database: databaseId },
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not delete the database.', { body: r });
    return r;
  }
}
