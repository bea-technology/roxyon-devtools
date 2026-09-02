import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SERVER_VERSION, createServer } from './server.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      `${[
        'roxyon-mcp — Model Context Protocol server for Roxyon',
        '',
        'Runs on stdio. Add to an MCP client, e.g.:',
        '  { "command": "npx", "args": ["-y", "@roxyon/mcp"] }',
        '',
        'Auth: run `roxyon login` in a terminal, or set ROXYON_TOKEN in this',
        "server's environment. Optional: ROXYON_API_URL, ROXYON_CONSOLE_URL.",
      ].join('\n')}\n`,
    );
    return;
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs on a stdio server (stdout is the protocol channel).
  process.stderr.write('roxyon-mcp: ready on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`roxyon-mcp: fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
