import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { DeployKind, RuntimeName } from '@roxyon/api-client';

// ---------------------------------------------------------------------------
// Global credentials — ~/.roxyon/config.json (0600)
// ---------------------------------------------------------------------------

export interface Credentials {
  sessionToken: string;
  refreshToken?: string;
  userId: string;
  email?: string;
  /** Preferred subscription (objectId / Name), when the account has several. */
  subscription?: string;
  savedAt: string;
}

export interface Endpoints {
  apiUrl?: string;
  consoleUrl?: string;
}

const CONFIG_DIR = join(homedir(), '.roxyon');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function endpointsFromEnv(): Endpoints {
  return {
    apiUrl: process.env.ROXYON_API_URL,
    consoleUrl: process.env.ROXYON_CONSOLE_URL,
  };
}

/** A token supplied out-of-band for CI (skips `roxyon login`). */
export function tokenFromEnv(): string | undefined {
  return process.env.ROXYON_TOKEN || undefined;
}

export async function loadCredentials(): Promise<Credentials | undefined> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return undefined;
  }
}

export async function saveCredentials(creds: Credentials): Promise<string> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  await chmod(CONFIG_FILE, 0o600).catch(() => undefined);
  return CONFIG_FILE;
}

export async function clearCredentials(): Promise<void> {
  await rm(CONFIG_FILE, { force: true });
}

// ---------------------------------------------------------------------------
// Project config — roxyon.json at the project root
// ---------------------------------------------------------------------------

export interface ProjectConfig {
  name: string;
  /** `Applications.objectId`, filled after the first `app`-kind deploy. */
  application?: string;
  /** Route host — `Domains.Name`. */
  host: string;
  /** Sub-path under the host's docroot / source tree. `""` = root. */
  folder: string;
  runtime: RuntimeName;
  runtimeVersion?: string;
  preset?: string;
  /** How this project reaches the platform. */
  kind: DeployKind;
  /** Local build command (LumenJS / static). Empty for server runtimes. */
  build?: string;
  /** Directory the build writes to (relative to project root). */
  outDir?: string;
  /** Web-process start command (app kind only). */
  start?: string;
  /** Serve the app on the host instead of the host's own files. */
  public?: boolean;
}

const PROJECT_FILE = 'roxyon.json';

export function projectConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, PROJECT_FILE);
}

export async function loadProjectConfig(cwd = process.cwd()): Promise<ProjectConfig | undefined> {
  try {
    const raw = await readFile(projectConfigPath(cwd), 'utf8');
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return undefined;
  }
}

export async function saveProjectConfig(
  config: ProjectConfig,
  cwd = process.cwd(),
): Promise<string> {
  const path = projectConfigPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}
