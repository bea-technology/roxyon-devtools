import { startHttpServer } from './http.js';
import { SERVER_VERSION } from './server.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${SERVER_VERSION}\n`);
    return;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      `${[
        'roxyon-mcp-http — remote (Streamable HTTP) Roxyon MCP server',
        '',
        'Env:',
        '  PORT                 listen port (default 3000)',
        '  HOST                 bind address (default 0.0.0.0)',
        '  MCP_PUBLIC_URL       public origin, e.g. https://mcp.roxyon.com',
        '  MCP_OAUTH_ISSUER     authorization server (default https://console.roxyon.com)',
        '  ROXYON_CONSOLE_URL   console base for API + introspection calls',
        '  MCP_AUTH             permissive (default) | introspect',
        '  MCP_INTROSPECT_SECRET   shared secret for MCP_AUTH=introspect',
        '  MCP_ALLOWED_HOSTS    extra comma-separated Host header allowlist',
      ].join('\n')}\n`,
    );
    return;
  }
  await startHttpServer();
}

main().catch((err) => {
  process.stderr.write(
    `roxyon-mcp-http: fatal: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
