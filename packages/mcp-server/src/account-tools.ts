import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { currentContext } from './context.js';
import { errorResult, text } from './result.js';

/**
 * Roxyon AI's account tools, offered through the connector (D-20261101-41): everything a person can do in the Roxyon
 * Console (sites, files, cron, PHP settings, DNS, SSL, mailboxes, databases, backups and restores, servers, plans and
 * invoices, Roxyon Base, newsletters, social posts...) for the AI they connect. The list comes from Roxyon Engage
 * (`POST /api/connector/tools`) when the remote server starts; each call goes to `POST /api/connector/call` with the
 * caller's own connector token, and Engage applies that person's rights. Only the remote server (mcp.roxyon.com) has the
 * connector key: on stdio these tools are not offered.
 */
export interface AccountToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly?: boolean;
}

interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

interface Bridge {
  url: string;
  key: string;
  fetch: typeof fetch;
}

let catalogue: AccountToolDef[] = [];
let bridge: Bridge | null = null;

/** Load the tool list from Engage (remote server boot, then every 10 minutes). Never throws: no list = no extra tools. */
export async function loadAccountTools(
  env: NodeJS.ProcessEnv,
  doFetch: typeof fetch = globalThis.fetch,
): Promise<number> {
  const url = (env.ROXYON_ENGAGE_URL ?? '').replace(/\/+$/, '');
  const key = env.ROXYON_CONNECTOR_KEY ?? '';
  if (!url || !key) return 0;
  bridge = { url, key, fetch: doFetch };
  try {
    const res = await doFetch(`${url}/api/connector/tools`, {
      method: 'POST',
      headers: { 'x-roxyon-connector-key': key },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { tools?: AccountToolDef[] };
    if (res.ok && Array.isArray(body.tools))
      catalogue = body.tools.filter((t) => /^[a-z][a-z0-9_]{1,60}$/.test(t.name));
  } catch {
    // keep the last good list
  }
  return catalogue.length;
}

/** For tests. */
export function setAccountTools(tools: AccountToolDef[], b: Bridge | null): void {
  catalogue = tools;
  bridge = b;
}

/** Register the loaded tools as roxyon_<name>, skipping names the connector already has (its own tool wins). */
export function registerAccountTools(server: McpServer, taken: Set<string>): void {
  for (const t of catalogue) {
    const name = `roxyon_${t.name}`;
    if (taken.has(name)) continue;
    taken.add(name);
    server.registerTool(
      name,
      {
        title: `Roxyon: ${t.name.replace(/_/g, ' ')}`,
        description: `${t.description}\n\n(Acts on the signed-in user's own Roxyon account with their console permissions. Text that says "the client" means this user.)`,
        inputSchema: shapeOf(t.inputSchema),
        annotations: { readOnlyHint: t.readOnly === true, destructiveHint: t.readOnly !== true },
      },
      async (args) => callTool(t.name, args),
    );
  }
}

async function callTool(tool: string, args: unknown) {
  const token = currentContext().token;
  if (!bridge || !token)
    return errorResult('This tool works only through the Roxyon connector at mcp.roxyon.com.');
  try {
    const res = await bridge.fetch(`${bridge.url}/api/connector/call`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-roxyon-connector-key': bridge.key,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tool, args }),
      signal: AbortSignal.timeout(600_000),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: unknown;
      error?: string;
      message?: string;
    } | null;
    if (!res.ok)
      return errorResult(body?.message ?? body?.error ?? `Roxyon answered ${res.status}`);
    if (!body?.ok) return errorResult(body?.error ?? 'That action failed.');
    const result = body.result;
    return text(
      typeof result === 'string' ? result : JSON.stringify(result, null, 2),
      (result && typeof result === 'object' && !Array.isArray(result)
        ? result
        : { result }) as Record<string, unknown>,
    );
  } catch (err) {
    return errorResult(
      `Could not reach Roxyon: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** JSON Schema (as Roxyon AI's tools write it) -> a zod shape for the SDK. */
export function shapeOf(schema: JsonSchema | undefined): Record<string, z.ZodTypeAny> {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [k, v] of Object.entries(props)) {
    const t = zodOf(v);
    shape[k] = required.has(k) ? t : t.optional();
  }
  return shape;
}

function zodOf(s: JsonSchema): z.ZodTypeAny {
  const type = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type;
  let out: z.ZodTypeAny;
  if (Array.isArray(s.enum) && s.enum.length && s.enum.every((x) => typeof x === 'string')) {
    out = z.enum(s.enum as [string, ...string[]]);
  } else if (type === 'string') out = z.string();
  else if (type === 'number') out = z.number();
  else if (type === 'integer') out = z.number().int();
  else if (type === 'boolean') out = z.boolean();
  else if (type === 'array') out = z.array(s.items ? zodOf(s.items) : z.unknown());
  else if (type === 'object')
    out = s.properties ? z.object(shapeOf(s)).passthrough() : z.record(z.unknown());
  else out = z.unknown();
  return s.description ? out.describe(s.description) : out;
}
