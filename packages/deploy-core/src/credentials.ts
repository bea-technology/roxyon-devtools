import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Stored login for Roxyon tooling — `~/.roxyon/config.json`, mode 0600. Written
 * by `roxyon login`; read by the CLI and the MCP server alike.
 */
export interface Credentials {
  sessionToken: string;
  refreshToken?: string;
  userId: string;
  email?: string;
  /** Preferred subscription (objectId / Name) when the account has several. */
  subscription?: string;
  savedAt: string;
}

export interface Endpoints {
  apiUrl?: string;
  consoleUrl?: string;
}

export function credentialsDir(): string {
  return join(homedir(), '.roxyon');
}
export function credentialsPath(): string {
  return join(credentialsDir(), 'config.json');
}

/** Endpoint overrides from the environment (`ROXYON_API_URL`, `ROXYON_CONSOLE_URL`). */
export function endpointsFromEnv(): Endpoints {
  return {
    apiUrl: process.env.ROXYON_API_URL,
    consoleUrl: process.env.ROXYON_CONSOLE_URL,
  };
}

/** A token supplied out-of-band (CI, or an MCP host env). Skips the stored login. */
export function tokenFromEnv(): string | undefined {
  return process.env.ROXYON_TOKEN || undefined;
}

export async function loadCredentials(): Promise<Credentials | undefined> {
  try {
    return JSON.parse(await readFile(credentialsPath(), 'utf8')) as Credentials;
  } catch {
    return undefined;
  }
}

export async function saveCredentials(creds: Credentials): Promise<string> {
  const path = credentialsPath();
  await mkdir(credentialsDir(), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
  return path;
}

export async function clearCredentials(): Promise<void> {
  await rm(credentialsPath(), { force: true });
}
