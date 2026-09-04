import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server.js';

let client: Client;

beforeAll(async () => {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
});

describe('roxyon mcp server', () => {
  it('exposes the expected tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'roxyon_add_domain',
        'roxyon_app_status',
        'roxyon_deploy',
        'roxyon_deploy_content',
        'roxyon_env_get',
        'roxyon_env_set',
        'roxyon_init',
        'roxyon_link_github',
        'roxyon_list_apps',
        'roxyon_list_domains',
        'roxyon_list_files',
        'roxyon_logs',
        'roxyon_read_file',
        'roxyon_restart',
        'roxyon_whoami',
      ].sort(),
    );
  });

  it('every tool declares a description and input schema', async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.description, t.name).toBeTruthy();
      expect(t.inputSchema, t.name).toBeTruthy();
    }
  });

  it('serves the doc resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([
      'roxyon://docs/baas',
      'roxyon://docs/deploy',
      'roxyon://docs/lumenjs',
      'roxyon://docs/recipe',
    ]);

    const doc = await client.readResource({ uri: 'roxyon://docs/deploy' });
    expect(String(doc.contents[0]?.text)).toContain('roxyon.json');
  });

  it('exposes the prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      'build-and-ship-site',
      'deploy-to-roxyon',
      'scaffold-lumen-app',
    ]);
  });

  it('returns a clean error (not a crash) when unauthenticated', async () => {
    // no ROXYON_TOKEN, no ~/.roxyon/config.json in CI
    const res = await client.callTool({ name: 'roxyon_whoami', arguments: {} });
    expect(res.isError).toBe(true);
    expect(String((res.content as Array<{ text: string }>)[0]?.text)).toMatch(
      /not signed in|roxyon login/i,
    );
  });

  it('roxyon_deploy without a roxyon.json reports it cleanly', async () => {
    const res = await client.callTool({
      name: 'roxyon_deploy',
      arguments: { dir: '/nonexistent/roxyon/project' },
    });
    expect(res.isError).toBe(true);
    expect(String((res.content as Array<{ text: string }>)[0]?.text)).toMatch(
      /roxyon\.json|not signed in/i,
    );
  });
});
