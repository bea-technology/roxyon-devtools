import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express, { type Express } from 'express';
import { runWithContext } from './context.js';
import {
  type AuthServerMetadata,
  fetchAuthServerMetadata,
  introspectionVerifier,
  permissiveVerifier,
  staticAuthServerMetadata,
} from './http-auth.js';
import { SERVER_NAME, SERVER_VERSION, createServer } from './server.js';

const SCOPES = ['read', 'deploy', 'logs'];

export interface HttpConfig {
  port: number;
  host: string;
  /** Public origin this server is reached at, e.g. `https://mcp.roxyon.com`. */
  publicUrl: string;
  /** OAuth authorization server (the public console origin). */
  oauthIssuer: string;
  /** Console base for API + introspection calls (on-box in prod). */
  consoleUrl: string;
  authMode: 'permissive' | 'introspect';
  introspectSecret?: string;
  allowedHosts: string[];
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const port = Number(env.PORT ?? env.MCP_PORT ?? 3000);
  const publicUrl = (env.MCP_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, '');
  const oauthIssuer = (env.MCP_OAUTH_ISSUER ?? 'https://console.roxyon.com').replace(/\/+$/, '');
  const consoleUrl = (env.ROXYON_CONSOLE_URL ?? 'https://console.roxyon.com').replace(/\/+$/, '');
  const authMode = env.MCP_AUTH === 'introspect' ? 'introspect' : 'permissive';
  const hosts = new Set<string>(['localhost', '127.0.0.1']);
  try {
    hosts.add(new URL(publicUrl).hostname);
  } catch {
    /* keep the defaults */
  }
  for (const h of (env.MCP_ALLOWED_HOSTS ?? '').split(',')) {
    if (h.trim()) hosts.add(h.trim());
  }
  return {
    port,
    host: env.HOST ?? env.MCP_HOST ?? '0.0.0.0',
    publicUrl,
    oauthIssuer,
    consoleUrl,
    authMode,
    introspectSecret: env.MCP_INTROSPECT_SECRET,
    allowedHosts: [...hosts],
  };
}

function buildVerifier(cfg: HttpConfig): OAuthTokenVerifier {
  const resource = `${cfg.publicUrl}/mcp`;
  if (cfg.authMode === 'introspect') {
    if (!cfg.introspectSecret) {
      throw new Error('MCP_AUTH=introspect requires MCP_INTROSPECT_SECRET');
    }
    return introspectionVerifier({
      consoleUrl: cfg.consoleUrl,
      secret: cfg.introspectSecret,
      resource,
    });
  }
  return permissiveVerifier(resource);
}

/**
 * Build the Express app for the remote MCP server. `oauthMetadata` is the
 * authorization-server descriptor advertised to clients; pass one to avoid the
 * boot-time fetch (tests), otherwise {@link startHttpServer} fetches it.
 */
export function buildApp(cfg: HttpConfig, oauthMetadata?: AuthServerMetadata): Express {
  const app = express();
  app.disable('x-powered-by');

  // Health check first — no Host-header / auth requirements (HAProxy httpchk).
  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: SERVER_NAME, version: SERVER_VERSION });
  });

  app.use(hostHeaderValidation(cfg.allowedHosts));
  app.use(express.json({ limit: '4mb' }));

  // RFC 9728 protected-resource metadata + RFC 8414 AS metadata mirror.
  const resourceUrl = new URL(`${cfg.publicUrl}/mcp`);
  app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: (oauthMetadata ?? staticAuthServerMetadata(cfg.oauthIssuer)) as never,
      resourceServerUrl: resourceUrl,
      scopesSupported: SCOPES,
      resourceName: 'Roxyon',
    }),
  );

  const bearer = requireBearerAuth({
    verifier: buildVerifier(cfg),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
  });

  app.post('/mcp', bearer, async (req, res) => {
    const token = req.auth?.token;
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await runWithContext({ token, remote: true }, () =>
        transport.handleRequest(req, res, req.body),
      );
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: (err as Error).message || 'internal error' },
          id: null,
        });
      }
    }
  });

  // Stateless: no server->client stream, no session to delete.
  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST /mcp.' },
      id: null,
    });
  };
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);

  return app;
}

export async function startHttpServer(cfg: HttpConfig = configFromEnv()): Promise<void> {
  const oauthMetadata =
    cfg.authMode === 'introspect'
      ? await fetchAuthServerMetadata(cfg.oauthIssuer)
      : staticAuthServerMetadata(cfg.oauthIssuer);

  const app = buildApp(cfg, oauthMetadata);
  await new Promise<void>((resolve, reject) => {
    const srv = app.listen(cfg.port, cfg.host, () => resolve());
    srv.on('error', reject);
  });
  process.stderr.write(
    `roxyon-mcp: HTTP on ${cfg.host}:${cfg.port} — resource ${cfg.publicUrl}/mcp, ` +
      `auth=${cfg.authMode}, issuer=${cfg.oauthIssuer}\n`,
  );
}
