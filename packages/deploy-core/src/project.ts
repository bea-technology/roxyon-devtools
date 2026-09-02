import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { type DeployKind, LUMEN_BUILD, RUNTIMES, type RuntimeName } from '@roxyon/api-client';

export type { DeployKind };

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

export const PROJECT_FILE = 'roxyon.json';

export function projectConfigPath(cwd: string = process.cwd()): string {
  return resolve(cwd, PROJECT_FILE);
}

export async function loadProjectConfig(
  cwd: string = process.cwd(),
): Promise<ProjectConfig | undefined> {
  try {
    return JSON.parse(await readFile(projectConfigPath(cwd), 'utf8')) as ProjectConfig;
  } catch {
    return undefined;
  }
}

export async function saveProjectConfig(
  config: ProjectConfig,
  cwd: string = process.cwd(),
): Promise<string> {
  const path = projectConfigPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
  return path;
}

export interface BuildConfigInput {
  cwd: string;
  runtime: RuntimeName;
  host: string;
  folder?: string;
  name?: string;
  start?: string;
}

/**
 * Produce a `ProjectConfig` from a resolved runtime + host. Shared by the CLI's
 * `roxyon init` and the MCP `roxyon_init` tool so both write the same shape.
 */
export function buildProjectConfig(input: BuildConfigInput): ProjectConfig {
  const folder = String(input.folder ?? '').replace(/^\/+|\/+$/g, '');
  const config: ProjectConfig = {
    name: input.name ?? basename(input.cwd),
    host: input.host,
    folder,
    runtime: input.runtime,
    kind: input.runtime === 'lumen' ? 'static' : 'app',
  };

  if (input.runtime === 'lumen') {
    config.build = LUMEN_BUILD.command;
    config.outDir = LUMEN_BUILD.outDir;
  } else {
    const spec = RUNTIMES[input.runtime];
    config.runtimeVersion = spec.defaultVersion;
    config.preset = spec.presets[0]?.[0];
    config.start = input.start ?? spec.command;
    config.public = true;
    config.build = '';
  }
  return config;
}
