import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const RESOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');

interface Doc {
  uri: string;
  name: string;
  file: string;
  title: string;
  description: string;
}

const DOCS: Doc[] = [
  {
    uri: 'roxyon://docs/lumenjs',
    name: 'lumenjs-reference',
    file: 'lumenjs.md',
    title: 'LumenJS — complete reference',
    description:
      'Full LumenJS V1 reference for building SPAs with vanilla JS/HTML/CSS (no build step), ' +
      'contrasted with Vue/React. Read before writing .view files.',
  },
  {
    uri: 'roxyon://docs/baas',
    name: 'baas-reference',
    file: 'baas.md',
    title: 'Roxyon BaaS reference',
    description:
      'The Roxyon Backend-as-a-Service REST API: endpoints, auth flow, query rules, and the ' +
      'resolve-on-failure write behaviour.',
  },
  {
    uri: 'roxyon://docs/deploy',
    name: 'deploy-reference',
    file: 'deploy.md',
    title: 'Deploying to Roxyon',
    description:
      'How roxyon_init / roxyon_deploy work, the roxyon.json schema, static vs app deploys, env ' +
      'vars, and git push-to-deploy.',
  },
];

export function registerResources(server: McpServer): void {
  for (const doc of DOCS) {
    server.registerResource(
      doc.name,
      doc.uri,
      { title: doc.title, description: doc.description, mimeType: 'text/markdown' },
      async () => {
        const body = await readFile(join(RESOURCE_DIR, doc.file), 'utf8');
        return { contents: [{ uri: doc.uri, mimeType: 'text/markdown', text: body }] };
      },
    );
  }
}
