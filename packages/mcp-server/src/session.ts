import { Roxyon, isAuthError } from '@roxyon/api-client';
import { endpointsFromEnv, loadCredentials, tokenFromEnv } from '@roxyon/deploy-core';

export interface RoxyonSession {
  roxyon: Roxyon;
  preferredSubscription?: string;
  /** how the session was authenticated, for diagnostics */
  source: 'env-token' | 'stored-login';
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super(
      'Not signed in to Roxyon. Run `roxyon login` in a terminal, or set ROXYON_TOKEN ' +
        "in this MCP server's environment.",
    );
    this.name = 'NotAuthenticatedError';
  }
}

/**
 * Resolve a Roxyon client for a tool call. Order: `ROXYON_TOKEN` env var, then
 * the login stored by the CLI at `~/.roxyon/config.json`.
 */
export async function getSession(): Promise<RoxyonSession> {
  const { apiUrl, consoleUrl } = endpointsFromEnv();
  const envToken = tokenFromEnv();
  if (envToken) {
    return {
      roxyon: new Roxyon({ sessionToken: envToken, baseUrl: apiUrl, consoleUrl }),
      source: 'env-token',
    };
  }
  const creds = await loadCredentials();
  if (!creds?.sessionToken) throw new NotAuthenticatedError();
  return {
    roxyon: new Roxyon({ sessionToken: creds.sessionToken, baseUrl: apiUrl, consoleUrl }),
    preferredSubscription: creds.subscription,
    source: 'stored-login',
  };
}

export function isSessionGone(err: unknown): boolean {
  return err instanceof NotAuthenticatedError || isAuthError(err);
}
