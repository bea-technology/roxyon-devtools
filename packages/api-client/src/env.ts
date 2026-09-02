/**
 * `.env`-style block <-> JSON object, ported verbatim from `appfEnvParse` /
 * `appfEnvToLines` in `console.roxyon.com/.../modals/app_form.view` so the CLI
 * and the console form agree byte-for-byte on what `Applications.Env` holds.
 *
 * The server re-sanitises again (`ApplicationRenderer::envPair`), so this only
 * needs to be reasonable. `PORT` and `HOST` are set by the platform — callers
 * should not write them.
 */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    line = line.replace(/^export\s+/, '');
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) {
      v = v.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) out[k] = v;
  }
  return out;
}

export function formatEnv(obj: Record<string, string> | null | undefined): string {
  if (!obj || typeof obj !== 'object') return '';
  return Object.keys(obj)
    .map((k) => `${k}=${obj[k] == null ? '' : String(obj[k])}`)
    .join('\n');
}

/** Parse the JSON string stored on `Applications.Env`. */
export function envFromStored(jsonStr: string | undefined): Record<string, string> {
  if (!jsonStr) return {};
  try {
    const obj = JSON.parse(jsonStr);
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {};
  } catch {
    return {};
  }
}
