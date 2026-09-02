import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from './prompts.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

export const SERVER_NAME = 'roxyon';
export const SERVER_VERSION = '0.1.0';

/** Build the Roxyon MCP server with every tool, resource and prompt registered. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        'Roxyon lets you build LumenJS SPAs, use the Roxyon BaaS, and deploy apps and web ' +
        'projects to Roxyon infrastructure. Read the roxyon://docs/* resources before writing ' +
        'LumenJS or calling the BaaS. To deploy: roxyon_init once per project, then roxyon_deploy ' +
        '(dry run, then confirm:true). Side-effecting tools require confirm:true.',
    },
  );

  registerResources(server);
  registerPrompts(server);
  registerTools(server);
  return server;
}
