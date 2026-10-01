import type { RoxyonClient } from './client.js';
import { RoxyonApiError } from './errors.js';

export interface ResetSshPasswordInput {
  /** Subscription to reset. Omit when the account has exactly one. */
  subscription?: string;
  /** Omit to have the platform generate one meeting the strength rules. */
  password?: string;
}

export interface ResetSshPasswordResult {
  ok: boolean;
  subscription: string;
  /** Shown once — the platform never stores or re-shows it. */
  password: string;
  status: 'pending' | 'active' | 'failed';
}

/**
 * The shared shell password used for SSH, SFTP and the file manager on a
 * subscription's container (SSHpiper maps the username to the container).
 */
export class SshApi {
  constructor(private readonly client: RoxyonClient) {}

  /** `POST /ssh/password` */
  async resetPassword(input: ResetSshPasswordInput = {}): Promise<ResetSshPasswordResult> {
    const r = await this.client.console<ResetSshPasswordResult>('POST', '/ssh/password', {
      body: input,
      tolerateHttpError: true,
    });
    if (!r?.ok) {
      throw new RoxyonApiError(
        (r as { error?: string })?.error || 'Could not reset the password.',
        {
          body: r,
        },
      );
    }
    return r;
  }
}
