import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface CreateDatabaseInput {
  /** DB name suffix — the platform prefixes it with the subscription's own username (globally unique). */
  name: string;
  /** Subscription to attach it to. Omit when the account has exactly one. */
  subscription?: string;
  /** Omit to have the platform generate one. */
  password?: string;
  /**
   * `mysql` (default: MySQL/MariaDB on the shared cluster) or `postgres` (PostgreSQL 15 inside the account's own hosting
   * container, at localhost:5432; the first one installs it, a few minutes). Every hosting account has both.
   */
  engine?: 'mysql' | 'postgres';
}

export interface CreateDatabaseResult {
  ok: boolean;
  objectId: string;
  engine?: 'mysql' | 'postgres';
  port?: number;
  /** How to connect (PostgreSQL: the URL shape and the no-password psql login over SSH). */
  note?: string;
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
  /** `postgres` for PostgreSQL; empty or `mysql` for MySQL/MariaDB. */
  Engine?: string;
}

export interface DeleteDatabaseResult {
  ok: boolean;
  objectId: string;
  status: 'deleting' | 'deleted' | 'failed';
  error?: string;
}

/** Databases attached to a subscription: MySQL/MariaDB (shared Galera cluster) or PostgreSQL (in the account's container). */
export class DatabasesApi {
  constructor(private readonly client: RoxyonClient) {}

  /** `POST /databases/list` — through the console, because PAT/OAuth callers can't read /Databases directly. */
  async list(subscriptionId: string): Promise<DatabaseSummary[]> {
    const r = await this.client.console<{
      ok?: boolean;
      error?: string;
      databases?: DatabaseSummary[];
    }>('POST', '/databases/list', {
      body: { subscription: subscriptionId },
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not list the databases.', { body: r });
    return r.databases ?? [];
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
