import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface CreateEmailInput {
  /** The part before `@`. */
  localPart: string;
  /** A hostname already on the account. */
  domain: string;
  /** Omit to have the platform generate one. */
  password?: string;
  /** Mailbox quota in MB. Default 1024. */
  quota?: number;
  forwardTo?: string;
  saveCopy?: boolean;
}

export interface CreateEmailResult {
  ok: boolean;
  objectId: string;
  email: string;
  /** Shown once — not retrievable afterwards. */
  password?: string;
  quota?: number;
  status: 'provisioning' | 'active' | 'failed';
  error?: string;
}

export interface EmailSummary {
  objectId: string;
  Email: string;
  LocalPart: string;
  Status: string;
  Quota?: number;
}

export interface DeleteEmailResult {
  ok: boolean;
  objectId: string;
  status: 'deleting' | 'deleted' | 'failed';
  error?: string;
}

/** Mailboxes attached to a subscription's domains. */
export class EmailApi {
  constructor(private readonly client: RoxyonClient) {}

  async list(subscriptionId: string): Promise<EmailSummary[]> {
    const r = await this.client.get<{ results?: EmailSummary[] }>('/Emails', {
      fields: 'objectId,Email,LocalPart,Status,Quota',
      limit: -1,
      order: '-createdAt',
      where: { Subscription: subscriptionId, eye: { in: '1,0' } },
    });
    return r.results ?? [];
  }

  /** `POST /emails/create` — provision a mailbox; the reconciler does the rest. */
  async create(input: CreateEmailInput): Promise<CreateEmailResult> {
    const r = await this.client.console<CreateEmailResult>('POST', '/emails/create', {
      body: input,
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not create the mailbox.', { body: r });
    return r;
  }

  /** `POST /emails/delete` */
  async delete(emailId: string): Promise<DeleteEmailResult> {
    const r = await this.client.console<DeleteEmailResult>('POST', '/emails/delete', {
      body: { email: emailId },
      tolerateHttpError: true,
    });
    if (!r?.ok) throw new RoxyonApiError(r?.error || 'Could not delete the mailbox.', { body: r });
    return r;
  }
}
