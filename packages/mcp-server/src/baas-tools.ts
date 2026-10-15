import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BAAS_MAX_BATCH, BAAS_MAX_PAGE, BaasDataApi, parseEnv } from '@roxyon/api-client';
import { z } from 'zod';
import { currentContext } from './context.js';
import { type ToolResult, errorResult, guard, text } from './result.js';

const MAX_TEXT = 40_000;

const dirArg = z
  .string()
  .optional()
  .describe('Project directory whose .env holds RX_SECRET_KEY. Defaults to cwd.');

/**
 * These tools act on the user's OWN app on BaaS V2 with that app's secret key, read from the
 * project's local `.env`. The hosted server has no local files, and must not accept keys
 * through the conversation, so it refuses.
 */
function remoteBlock(): ToolResult | null {
  if (!currentContext().remote) return null;
  return errorResult(
    'The roxyon_baas_* tools read your app secret key from your local project .env, so they only ' +
      'run in the local MCP server (`npx -y @roxyon/mcp`). Manage data in the hosted connector via ' +
      "the console's Roxyon Base panel for now.",
  );
}

async function baasFor(dir: string | undefined): Promise<BaasDataApi> {
  const root = resolve(dir ?? process.cwd());
  let fileEnv: Record<string, string> = {};
  try {
    fileEnv = parseEnv(await readFile(join(root, '.env'), 'utf8'));
  } catch {
    // No .env — fall back to the process environment.
  }
  const secretKey = fileEnv.RX_SECRET_KEY || process.env.RX_SECRET_KEY || '';
  if (!secretKey) {
    throw new Error(
      `No BaaS V2 secret key found. Put RX_SECRET_KEY=rxsk_… in ${join(root, '.env')} (console.roxyon.com → Roxyon Base → your project → API keys). Keep it out of git and out of browser code.`,
    );
  }
  return new BaasDataApi({ secretKey });
}

function clip(s: string): string {
  return s.length > MAX_TEXT
    ? `${s.slice(0, MAX_TEXT)}\n… (truncated — narrow with fields/where/limit)`
    : s;
}

function dryRun(what: string): ToolResult {
  return text(`Would ${what}. Pass confirm:true to do it.`, { dryRun: true });
}

const SERVER_SCOPE =
  'Runs as the app backend (server scope, which passes every class rule). Local MCP only.';

export function registerBaasTools(server: McpServer): void {
  server.registerTool(
    'roxyon_baas_query',
    {
      title: 'Roxyon BaaS: query records',
      description: `Read records of a class in the project's own app on BaaS V2. \`where\` is an object like {"Status":"active","Age":{"gt":18}}; for \`in\`, pass a comma-joined string. \`fields\` defaults to "*"; built-in meta columns must be named. Up to ${BAAS_MAX_PAGE} rows a page (use skip to page). ${SERVER_SCOPE}`,
      inputSchema: {
        dir: dirArg,
        class: z.string(),
        where: z.record(z.any()).optional(),
        fields: z.string().optional(),
        order: z.string().optional().describe('e.g. "-createdAt"'),
        limit: z.number().int().min(1).max(BAAS_MAX_PAGE).optional(),
        skip: z.number().int().min(0).optional(),
        count: z.boolean().optional().describe('Also return the total number of matches.'),
      },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteBlock();
        if (blocked) return blocked;
        const api = await baasFor(args.dir);
        const { rows, count } = await api.query(args.class, {
          where: args.where,
          fields: args.fields,
          order: args.order,
          limit: args.limit,
          skip: args.skip,
          count: args.count,
        });
        const head = `${rows.length} row(s)${count !== undefined ? ` of ${count}` : ''}`;
        return text(clip(`${head}\n${JSON.stringify(rows, null, 2)}`), { rows, count });
      }),
  );

  server.registerTool(
    'roxyon_baas_get',
    {
      title: 'Roxyon BaaS: read one record',
      description: `Read one record by objectId. ${SERVER_SCOPE}`,
      inputSchema: { dir: dirArg, class: z.string(), objectId: z.string() },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteBlock();
        if (blocked) return blocked;
        const api = await baasFor(args.dir);
        const row = await api.get(args.class, args.objectId);
        return text(clip(JSON.stringify(row, null, 2)), { row });
      }),
  );

  server.registerTool(
    'roxyon_baas_create',
    {
      title: 'Roxyon BaaS: create a record',
      description: `Insert one record into an existing class (V2 has no schema changes with a secret key: add classes and columns in the console). For relations store the other row's objectId in a string column. Needs confirm:true. ${SERVER_SCOPE}`,
      inputSchema: {
        dir: dirArg,
        class: z.string(),
        data: z.record(z.any()),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteBlock();
        if (blocked) return blocked;
        if (!args.confirm) return dryRun(`insert into ${args.class}: ${JSON.stringify(args.data)}`);
        const api = await baasFor(args.dir);
        const row = await api.create(args.class, args.data);
        return text(`✓ Created ${args.class} ${String(row.objectId ?? '')}.`, { ok: true, row });
      }),
  );

  server.registerTool(
    'roxyon_baas_update',
    {
      title: 'Roxyon BaaS: update a record',
      description: `Set fields on one record by objectId. Needs confirm:true. ${SERVER_SCOPE}`,
      inputSchema: {
        dir: dirArg,
        class: z.string(),
        objectId: z.string(),
        data: z.record(z.any()),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteBlock();
        if (blocked) return blocked;
        if (!args.confirm) {
          return dryRun(`update ${args.class} ${args.objectId}: ${JSON.stringify(args.data)}`);
        }
        const api = await baasFor(args.dir);
        const row = await api.update(args.class, args.objectId, args.data);
        return text(`✓ Updated ${args.class} ${args.objectId}.`, { ok: true, row });
      }),
  );

  server.registerTool(
    'roxyon_baas_delete',
    {
      title: 'Roxyon BaaS: delete a record',
      description: `Delete one record by objectId. Needs confirm:true. ${SERVER_SCOPE}`,
      inputSchema: {
        dir: dirArg,
        class: z.string(),
        objectId: z.string(),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteBlock();
        if (blocked) return blocked;
        if (!args.confirm) return dryRun(`delete ${args.class} ${args.objectId}`);
        const api = await baasFor(args.dir);
        await api.delete(args.class, args.objectId);
        return text(`✓ Deleted ${args.class} ${args.objectId}.`, { ok: true });
      }),
  );

  server.registerTool(
    'roxyon_baas_batch',
    {
      title: 'Roxyon BaaS: batch of record requests',
      description: `1 to ${BAAS_MAX_BATCH} record requests in one call, each answered on its own (one failing doesn't stop the others). path is /Class or /Class/<objectId>; for POST/PUT the body is {"data":{...}}; for GET the body holds query options (where, fields, limit…). A batch with any write needs confirm:true. ${SERVER_SCOPE}`,
      inputSchema: {
        dir: dirArg,
        requests: z
          .array(
            z.object({
              method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
              path: z.string(),
              body: z.record(z.any()).optional(),
            }),
          )
          .min(1)
          .max(BAAS_MAX_BATCH),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteBlock();
        if (blocked) return blocked;
        const writes = args.requests.filter((r) => r.method !== 'GET');
        if (writes.length && !args.confirm) {
          return dryRun(
            `run ${args.requests.length} request(s), ${writes.length} of them writes: ${writes.map((r) => `${r.method} ${r.path}`).join(', ')}`,
          );
        }
        const api = await baasFor(args.dir);
        const results = await api.batch(args.requests);
        const failed = results.filter((r) => r.ok === false).length;
        return text(
          clip(
            `${results.length} answer(s), ${failed} failed\n${JSON.stringify(results, null, 2)}`,
          ),
          { results },
        );
      }),
  );
}
