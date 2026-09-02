import { RoxyonApiError, envFromStored, formatEnv } from '@roxyon/api-client';
import { loadProjectConfig } from '../config.js';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

async function resolveApp(explicit?: string): Promise<string> {
  const appId = explicit ?? (await loadProjectConfig())?.application;
  if (!appId)
    fail('No application. Pass --app <id> or deploy this project first.', EXIT.configError);
  return appId;
}

export async function envPull(opts: { app?: string }): Promise<void> {
  const appId = await resolveApp(opts.app);
  const { roxyon } = await requireSession();
  const app = await roxyon.applications.get(appId);
  if (!app) fail(`Application ${appId} not found.`, EXIT.configError);
  const env = envFromStored(app.Env);
  const text = formatEnv(env);
  ui.line(text || '# (no environment variables set)');
}

export async function envSet(pairs: string[], opts: { app?: string }): Promise<void> {
  if (pairs.length === 0)
    fail('Nothing to set. Usage: roxyon env set KEY=value [KEY2=value2]', EXIT.configError);
  const appId = await resolveApp(opts.app);
  const { roxyon } = await requireSession();
  const app = await roxyon.applications.get(appId);
  if (!app) fail(`Application ${appId} not found.`, EXIT.configError);

  const env = envFromStored(app.Env);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 1) fail(`"${pair}" is not KEY=value.`, EXIT.configError);
    const key = pair.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail(`Invalid env key "${key}".`, EXIT.configError);
    if (key === 'PORT' || key === 'HOST') {
      ui.warn(`${key} is set by the platform — ignoring.`);
      continue;
    }
    env[key] = pair.slice(eq + 1);
  }

  await write(roxyon, app, env);
  ui.success(`Updated ${pairs.length} variable(s). Run \`roxyon deploy\` to apply.`);
}

export async function envRm(keys: string[], opts: { app?: string }): Promise<void> {
  if (keys.length === 0)
    fail('Nothing to remove. Usage: roxyon env rm KEY [KEY2]', EXIT.configError);
  const appId = await resolveApp(opts.app);
  const { roxyon } = await requireSession();
  const app = await roxyon.applications.get(appId);
  if (!app) fail(`Application ${appId} not found.`, EXIT.configError);

  const env = envFromStored(app.Env);
  let removed = 0;
  for (const k of keys) {
    if (k in env) {
      delete env[k];
      removed++;
    }
  }
  await write(roxyon, app, env);
  ui.success(`Removed ${removed} variable(s). Run \`roxyon deploy\` to apply.`);
}

async function write(
  roxyon: Awaited<ReturnType<typeof requireSession>>['roxyon'],
  app: { objectId: string; ConfigRevision?: number },
  env: Record<string, string>,
): Promise<void> {
  try {
    await roxyon.applications.setEnv(app, env);
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}
