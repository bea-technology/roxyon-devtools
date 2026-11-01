import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { setAccountTools } from '../src/account-tools.js';
import { runWithContext } from '../src/context.js';
import { createServer } from '../src/server.js';

const seen: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
const fakeFetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
  seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  return new Response(
    JSON.stringify({ ok: true, result: { jobs: [{ id: 'c1', schedule: '30 6 * * *' }] } }),
    { status: 200 },
  );
}) as unknown as typeof fetch;

async function connect() {
  const server = createServer();
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '0' });
  await Promise.all([client.connect(a), server.connect(b)]);
  return client;
}

afterEach(() => setAccountTools([], null));

describe("Roxyon AI's account tools on the connector (D-20261101-41)", () => {
  it('offers each as roxyon_<name> with its schema; the connector keeps its own tool names', async () => {
    setAccountTools(
      [
        {
          name: 'site_tools',
          description: 'Site jobs: cron, php_settings',
          inputSchema: {
            type: 'object',
            properties: {
              siteId: { type: 'string' },
              action: { type: 'string', enum: ['cron', 'php_settings'] },
              confirmed: { type: 'boolean' },
            },
            required: ['siteId', 'action'],
          },
        },
        {
          name: 'list_databases',
          description: 'theirs',
          inputSchema: { type: 'object', properties: {} },
          readOnly: true,
        },
      ],
      { url: 'https://engage.test', key: 'K', fetch: fakeFetch },
    );
    const { tools } = await (await connect()).listTools();
    const st = tools.find((t) => t.name === 'roxyon_site_tools')!;
    expect(st.description).toContain('cron');
    expect((st.inputSchema.properties as Record<string, { enum?: string[] }>).action?.enum).toEqual(
      ['cron', 'php_settings'],
    );
    expect(st.inputSchema.required).toEqual(['siteId', 'action']);
    expect(tools.filter((t) => t.name === 'roxyon_list_databases')).toHaveLength(1);
    expect(tools.find((t) => t.name === 'roxyon_list_databases')!.description).not.toBe('theirs');
  });

  it("calls Engage with the caller's own token and the connector key", async () => {
    seen.length = 0;
    setAccountTools(
      [
        {
          name: 'site_tools',
          description: 'x',
          inputSchema: { type: 'object', properties: { siteId: { type: 'string' } } },
        },
      ],
      {
        url: 'https://engage.test',
        key: 'K',
        fetch: fakeFetch,
      },
    );
    const client = await connect();
    const r = await runWithContext({ token: 'roxp_user', remote: true }, () =>
      client.callTool({ name: 'roxyon_site_tools', arguments: { siteId: 's1' } }),
    );
    expect(JSON.stringify(r.content)).toContain('30 6 * * *');
    expect(seen[0]).toMatchObject({
      url: 'https://engage.test/api/connector/call',
      headers: { authorization: 'Bearer roxp_user', 'x-roxyon-connector-key': 'K' },
      body: { tool: 'site_tools', args: { siteId: 's1' } },
    });
  });
});
