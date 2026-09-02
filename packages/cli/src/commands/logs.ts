import { RoxyonApiError } from '@roxyon/api-client';
import { loadProjectConfig } from '../config.js';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export interface LogsOptions {
  follow?: boolean;
  lines?: number;
  app?: string;
}

export async function logs(opts: LogsOptions): Promise<void> {
  const appId = opts.app ?? (await loadProjectConfig())?.application;
  if (!appId) {
    fail(
      'No application. Pass --app <id>, or run from a project whose roxyon.json has one.',
      EXIT.configError,
    );
  }

  const { roxyon } = await requireSession();
  const lines = opts.lines ?? 100;

  if (!opts.follow) {
    for (const l of await fetchLogs(
      roxyon.applications.logs.bind(roxyon.applications),
      appId,
      lines,
    )) {
      ui.line(l);
    }
    return;
  }

  ui.dim(`Following ${appId} — Ctrl-C to stop.`);
  let seen = new Set<string>();
  const tick = async () => {
    try {
      for (const l of await roxyon.applications.logs(appId, lines)) {
        if (l && !seen.has(l)) {
          seen.add(l);
          ui.line(l);
        }
      }
      if (seen.size > 4000) seen = new Set([...seen].slice(-2000));
    } catch (err) {
      ui.warn((err as Error).message);
    }
  };
  await tick();
  const timer = setInterval(tick, 7000);
  process.on('SIGINT', () => {
    clearInterval(timer);
    process.exit(EXIT.ok);
  });
}

async function fetchLogs(
  fn: (id: string, n: number) => Promise<string[]>,
  appId: string,
  lines: number,
): Promise<string[]> {
  try {
    return await fn(appId, lines);
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}
