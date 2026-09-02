import { Roxyon } from '@roxyon/api-client';
import { type Credentials, endpointsFromEnv, loadCredentials, tokenFromEnv } from './config.js';
import { EXIT, fail } from './ui.js';

export interface Session {
  roxyon: Roxyon;
  /** Present when authenticated via a stored login (not a bare CI token). */
  credentials?: Credentials;
}

/** Build a client from a `ROXYON_TOKEN` env var or the stored login. Fails if neither. */
export async function requireSession(): Promise<Session> {
  const { apiUrl, consoleUrl } = endpointsFromEnv();
  const envToken = tokenFromEnv();
  if (envToken) {
    return {
      roxyon: new Roxyon({ sessionToken: envToken, baseUrl: apiUrl, consoleUrl: consoleUrl }),
    };
  }

  const creds = await loadCredentials();
  if (!creds?.sessionToken) {
    fail('Not signed in. Run `roxyon login` (or set ROXYON_TOKEN for CI).', EXIT.authRequired);
  }
  return {
    roxyon: new Roxyon({ sessionToken: creds.sessionToken, baseUrl: apiUrl, consoleUrl }),
    credentials: creds,
  };
}

/** A client with no user auth — for the login flow itself. */
export function anonymousRoxyon(): Roxyon {
  const { apiUrl, consoleUrl } = endpointsFromEnv();
  return new Roxyon({ baseUrl: apiUrl, consoleUrl });
}
