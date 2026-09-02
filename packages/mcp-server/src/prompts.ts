import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'scaffold-lumen-app',
    {
      title: 'Scaffold a LumenJS + Roxyon app',
      description:
        'Guidance for creating a new LumenJS SPA wired to the Roxyon BaaS and ready to deploy.',
      argsSchema: {
        idea: z.string().describe('What the app should do.'),
        dir: z.string().optional().describe('Where to create it.'),
      },
    },
    ({ idea, dir }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a LumenJS single-page app: ${idea}\n\nSteps:\n1. Read the "roxyon://docs/lumenjs" resource — follow V1 rules exactly (one bind per region, no nested bind, build option lists in JS not :for, check every BaaS write for an error field).\n2. Read "roxyon://docs/baas" for the data/auth API.\n3. Scaffold with the LumenJS CLI: \`lm create <name>\`${dir ? ` in ${dir}` : ''}. Put views under src/views/, wire the BaaS in src/index.js via config.json.\n4. When it runs locally (\`lm serve\`), call roxyon_init then roxyon_deploy (dry run first, then confirm:true).`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'deploy-to-roxyon',
    {
      title: 'Deploy this project to Roxyon',
      description: 'Walk through deploying the current project to Roxyon infrastructure.',
      argsSchema: { dir: z.string().describe('Absolute path to the project.') },
    },
    ({ dir }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Deploy the project at ${dir} to Roxyon.\n\n1. If there is no roxyon.json, call roxyon_init (it detects the runtime; ask me which host if there are several).\n2. Call roxyon_deploy with just the dir first to see the plan.\n3. If the plan looks right, call roxyon_deploy again with confirm:true.\n4. For an app runtime, report the final status and, if it failed, the last error from roxyon_app_status.`,
          },
        },
      ],
    }),
  );
}
