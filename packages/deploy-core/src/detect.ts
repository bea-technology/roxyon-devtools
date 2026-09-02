import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { RuntimeName } from '@roxyon/api-client';

export interface Detection {
  runtime: RuntimeName;
  /** why we think so — shown to the user, who can override */
  reason: string;
  /** best-guess start command for a server runtime */
  start?: string;
}

async function exists(root: string, name: string): Promise<boolean> {
  try {
    await readFile(join(root, name));
    return true;
  } catch {
    return false;
  }
}

async function readJson(root: string, name: string): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(join(root, name), 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Best-effort project-type detection. Deterministic; the caller confirms. */
export async function detectRuntime(root: string): Promise<Detection> {
  const pkg = await readJson(root, 'package.json');
  const hasConfigJson = await exists(root, 'config.json');
  let hasViews = false;
  try {
    hasViews = (await readdir(join(root, 'src', 'views'))).length >= 0;
  } catch {
    hasViews = false;
  }

  if (hasConfigJson && hasViews) {
    const deps = {
      ...(pkg?.dependencies as object),
      ...(pkg?.devDependencies as object),
    } as Record<string, string>;
    if (!('next' in deps) && !('nuxt' in deps) && !('express' in deps) && !('fastify' in deps)) {
      return { runtime: 'lumen', reason: 'config.json + src/views/ and no server framework' };
    }
  }

  if (pkg) {
    const scripts = (pkg.scripts as Record<string, string>) ?? {};
    const start = scripts.start ? 'npm run start' : scripts.serve ? 'npm run serve' : 'node .';
    const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<
      string,
      string
    >;
    if ('next' in deps)
      return { runtime: 'node', reason: 'Next.js in package.json', start: 'npm run start' };
    if ('nuxt' in deps)
      return { runtime: 'node', reason: 'Nuxt in package.json', start: 'npm run start' };
    return { runtime: 'node', reason: 'package.json present', start };
  }

  if ((await exists(root, 'requirements.txt')) || (await exists(root, 'pyproject.toml'))) {
    return {
      runtime: 'python',
      reason: 'requirements.txt / pyproject.toml',
      start: 'gunicorn app:app',
    };
  }

  if ((await exists(root, 'composer.json')) || (await exists(root, 'server.php'))) {
    return { runtime: 'php', reason: 'composer.json / server.php', start: 'php8.4 server.php' };
  }

  return { runtime: 'lumen', reason: 'no framework markers — treating as a static site' };
}
