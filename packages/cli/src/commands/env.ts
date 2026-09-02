import { RoxyonApiError, formatEnv } from '@roxyon/api-client';
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
  try {
    const env = await roxyon.applications.getEnv(appId);
    ui.line(formatEnv(env) || '# (no environment variables set)');
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}

export async function envSet(pairs: string[], opts: { app?: string }): Promise<void> {
  if (pairs.length === 0)
    fail('Nothing to set. Usage: roxyon env set KEY=value [KEY2=value2]', EXIT.configError);
  const appId = await resolveApp(opts.app);

  const set: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 1) fail(`"${pair}" is not KEY=value.`, EXIT.configError);
    const key = pair.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) fail(`Invalid env key "${key}".`, EXIT.configError);
    if (key === 'PORT' || key === 'HOST') {
      ui.warn(`${key} is set by the platform — ignoring.`);
      continue;
    }
    set[key] = pair.slice(eq + 1);
  }

  const { roxyon } = await requireSession();
  try {
    const r = await roxyon.applications.setEnv(appId, { set });
    ui.success(`Updated ${r.changed.join(', ') || 'nothing'}. Run \`roxyon deploy\` to apply.`);
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}

export async function envRm(keys: string[], opts: { app?: string }): Promise<void> {
  if (keys.length === 0)
    fail('Nothing to remove. Usage: roxyon env rm KEY [KEY2]', EXIT.configError);
  const appId = await resolveApp(opts.app);
  const { roxyon } = await requireSession();
  try {
    const r = await roxyon.applications.setEnv(appId, { remove: keys });
    ui.success(`Removed ${r.changed.join(', ') || 'nothing'}. Run \`roxyon deploy\` to apply.`);
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}
