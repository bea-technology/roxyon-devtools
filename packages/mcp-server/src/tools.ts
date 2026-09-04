import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type Roxyon, envFromStored, formatEnv } from '@roxyon/api-client';
import {
  buildIgnore,
  buildProjectConfig,
  deployProject,
  detectRuntime,
  listFiles,
  loadProjectConfig,
  packFiles,
  saveProjectConfig,
} from '@roxyon/deploy-core';
import { z } from 'zod';
import { currentContext } from './context.js';
import { type ToolResult, errorResult, guard, text } from './result.js';
import { type RoxyonSession, getSession } from './session.js';

/** `roxyon_deploy_content` budget — keeps the whole JSON-RPC body under the 4 MB cap. */
const MAX_FILES = 60;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

/**
 * `roxyon_init` / `roxyon_deploy` read and write the caller's local project
 * directory — impossible over the remote HTTP server. Returns an explanatory
 * result when running in that mode, `null` otherwise (proceed).
 */
function remoteFilesystemBlock(tool: 'roxyon_init' | 'roxyon_deploy'): ToolResult | null {
  if (!currentContext().remote) return null;
  return errorResult(
    [
      `${tool} needs access to your local project files, which the hosted Roxyon MCP`,
      'server does not have. Either:',
      '  • run the `roxyon` CLI locally (`npm i -g @roxyon/cli`, then `roxyon deploy`), or',
      '  • use `roxyon_link_github` to connect a git repo for push-to-deploy, then',
      '    `roxyon_app_status` / `roxyon_logs` to watch it here.',
    ].join('\n'),
  );
}

/** Resolve an application id from an explicit id or a project directory. */
async function resolveApp(args: { application?: string; dir?: string }): Promise<{
  applicationId: string;
  host?: string;
}> {
  if (args.application) return { applicationId: args.application };
  if (args.dir) {
    const cfg = await loadProjectConfig(args.dir);
    if (cfg?.application) return { applicationId: cfg.application, host: cfg.host };
    throw new Error(
      `No application linked in ${args.dir}/roxyon.json. Deploy it once (roxyon_deploy) or pass "application".`,
    );
  }
  throw new Error('Pass either "application" (an id) or "dir" (a project directory).');
}

/** The account context (user + subscriptions + domains) — one call, PAT-safe. */
function accountContext(session: RoxyonSession) {
  return session.roxyon.account.context();
}

export function registerTools(server: McpServer): void {
  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_whoami',
    {
      title: 'Roxyon: who am I',
      description: 'Show the signed-in Roxyon user and their subscriptions (which one is active).',
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const session = await getSession();
        const ctx = await accountContext(session);
        const lines = [
          `User: ${ctx.user.email || ctx.user.id} (${ctx.user.id})`,
          `Auth: ${session.source}${ctx.scopes.length ? ` (scopes: ${ctx.scopes.join(', ')})` : ''}`,
          '',
          'Subscriptions:',
          ...ctx.subscriptions.map((s) => `  ${s.name || s.id} — ${s.status || '?'}`),
          '',
          `Hosts: ${ctx.domains.map((d) => d.name).join(', ') || '(none)'}`,
        ];
        return text(lines.join('\n'), {
          user: ctx.user,
          scopes: ctx.scopes,
          subscriptions: ctx.subscriptions,
          hosts: ctx.domains.map((d) => d.name),
        });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_list_domains',
    {
      title: 'Roxyon: list hosts',
      description:
        'List the domains (hosts) on the active subscription — the possible deploy targets.',
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const session = await getSession();
        const { domains } = await accountContext(session);
        return text(
          domains.length
            ? domains
                .map(
                  (d) => `- ${d.name}${d.status && d.status !== 'active' ? ` (${d.status})` : ''}`,
                )
                .join('\n')
            : '(no hosts on this account)',
          { hosts: domains },
        );
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_list_apps',
    {
      title: 'Roxyon: list applications',
      description:
        'List the applications on the active subscription with their status and revision.',
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const session = await getSession();
        const apps = await session.roxyon.account.apps();
        const body = apps.length
          ? apps
              .map(
                (a) =>
                  `- ${a.name} [${a.id}] — ${a.status || '?'} ` +
                  `(rev ${a.appliedRevision}/${a.configRevision})` +
                  `${a.repo ? ` · git:${a.repo.branch}` : ''}`,
              )
              .join('\n')
          : '(no applications)';
        return text(body, { applications: apps });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_init',
    {
      title: 'Roxyon: initialise a project',
      description:
        "Detect a project's type and write roxyon.json. Run this once per project before roxyon_deploy. " +
        'Does not create anything on the platform.',
      inputSchema: {
        dir: z.string().describe('Absolute path to the project directory.'),
        runtime: z.enum(['lumen', 'node', 'python', 'php']).optional(),
        host: z.string().optional().describe('Deploy host (a domain on the subscription).'),
        folder: z.string().optional().describe('Sub-path under the host; "" = site root.'),
        overwrite: z.boolean().optional().describe('Replace an existing roxyon.json.'),
      },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteFilesystemBlock('roxyon_init');
        if (blocked) return blocked;
        const session = await getSession();
        const existing = await loadProjectConfig(args.dir);
        if (existing && !args.overwrite) {
          return errorResult(
            `roxyon.json already exists in ${args.dir}. Pass overwrite:true to replace it.`,
            { config: existing },
          );
        }
        const { domains } = await accountContext(session);
        if (domains.length === 0) {
          return errorResult(
            'This account has no hosts. Add a domain in the Roxyon console first.',
          );
        }
        const detected = await detectRuntime(args.dir);
        const runtime = args.runtime ?? detected.runtime;
        const host = args.host ?? domains[0]!.name;
        if (!domains.some((d) => d.name === host)) {
          return errorResult(
            `Host "${host}" is not on this account (have: ${domains.map((d) => d.name).join(', ')}).`,
          );
        }
        const config = buildProjectConfig({
          cwd: args.dir,
          runtime,
          host,
          folder: args.folder,
          start: detected.start,
        });
        const path = await saveProjectConfig(config, args.dir);
        return text(
          `Wrote ${path}\nDetected: ${detected.runtime} (${detected.reason})\n\n${JSON.stringify(config, null, 2)}`,
          { path, detected: detected.runtime, config },
        );
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_deploy',
    {
      title: 'Roxyon: deploy a project',
      description:
        'Build (if configured) and deploy the project in "dir" to Roxyon. Without confirm:true this ' +
        'returns a dry-run plan (what would build, where it would go, how many files). With confirm:true ' +
        'it runs the build, uploads, and — for app runtimes — waits for it to go live. Requires roxyon.json ' +
        '(run roxyon_init first).',
      inputSchema: {
        dir: z
          .string()
          .describe('Absolute path to the project directory (must contain roxyon.json).'),
        confirm: z.boolean().optional().describe('Actually deploy. Omit for a dry-run plan.'),
        build: z.boolean().optional().describe('Run the configured build command (default true).'),
        follow: z
          .boolean()
          .optional()
          .describe('For app runtimes, wait until running/failed (default true).'),
      },
    },
    (args) =>
      guard(async () => {
        const blocked = remoteFilesystemBlock('roxyon_deploy');
        if (blocked) return blocked;
        const session = await getSession();
        const config = await loadProjectConfig(args.dir);
        if (!config) {
          return errorResult(`No roxyon.json in ${args.dir}. Run roxyon_init first.`);
        }

        if (!args.confirm) {
          const ig = await buildIgnore(args.dir);
          const packRoot =
            config.kind === 'static' && config.outDir ? `${args.dir}/${config.outDir}` : args.dir;
          let files: string[] = [];
          try {
            files = await listFiles(packRoot, ig);
          } catch {
            /* outDir may not exist until the build runs */
          }
          const plan = [
            'DRY RUN — pass confirm:true to deploy.',
            '',
            `Project:  ${config.name} (${config.runtime}, ${config.kind})`,
            `Target:   ${config.host}${config.folder ? `/${config.folder}` : ''}`,
            config.build ? `Build:    ${config.build}` : 'Build:    (none)',
            config.kind === 'app'
              ? `App:      ${config.application ?? '(created on first deploy)'}`
              : 'Serve:    static files from the host document root',
            files.length
              ? `Would pack ${files.length} file(s) from ${config.kind === 'static' && config.outDir ? config.outDir : '.'}`
              : `Would pack the build output (${config.outDir ?? 'dist'}) after building`,
          ].join('\n');
          return text(plan, { dryRun: true, config });
        }

        const logLines: string[] = [];
        const outcome = await deployProject({
          cwd: args.dir,
          roxyon: session.roxyon,
          preferredSubscription: session.preferredSubscription,
          build: args.build,
          follow: args.follow ?? true,
          timeoutMs: 5 * 60 * 1000,
          reporter: {
            step: (m) => logLines.push(`» ${m}`),
            log: (l) => logLines.push(`  ${l}`),
          },
        });

        const tail = logLines.slice(-60).join('\n');
        if (outcome.kind === 'static' && outcome.ok) {
          return text(`${tail}\n\n✓ Live: ${outcome.url} (${outcome.files} files)`, {
            ok: true,
            kind: 'static',
            url: outcome.url,
          });
        }
        if (outcome.kind === 'app' && outcome.ok) {
          return text(
            `${tail}\n\n✓ ${outcome.status === 'running' ? `Live: ${outcome.url ?? outcome.application}` : `Build queued (revision ${outcome.revision})`}`,
            {
              ok: true,
              kind: 'app',
              application: outcome.application,
              status: outcome.status,
              url: outcome.url,
            },
          );
        }
        return errorResult(
          `${tail}\n\n✗ Deploy failed: ${'error' in outcome ? outcome.error : 'unknown'}`,
          { ok: false, application: 'application' in outcome ? outcome.application : undefined },
        );
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_app_status',
    {
      title: 'Roxyon: application status',
      description:
        'Current status, revisions and last error for an application (by id or project dir).',
      inputSchema: {
        application: z.string().optional(),
        dir: z
          .string()
          .optional()
          .describe('A project directory whose roxyon.json links an application.'),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const { applicationId } = await resolveApp(args);
        const app = await session.roxyon.account.getApp(applicationId);
        if (!app) return errorResult(`Application ${applicationId} not found.`);
        const settled = app.configRevision <= app.appliedRevision;
        const body = [
          `${app.name} [${app.id}]`,
          `Status:   ${app.status || '?'}${settled ? '' : ' (applying)'}`,
          `Revision: ${app.appliedRevision} / ${app.configRevision}`,
          `Runtime:  ${app.runtime}`.trim(),
          app.lastError ? `\nLast error:\n${app.lastError}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        return text(body, {
          id: app.id,
          status: app.status,
          settled,
          configRevision: app.configRevision,
          appliedRevision: app.appliedRevision,
          lastError: app.lastError || undefined,
        });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_logs',
    {
      title: 'Roxyon: application logs',
      description: 'Recent journal lines for an application (by id or project dir).',
      inputSchema: {
        application: z.string().optional(),
        dir: z.string().optional(),
        lines: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('How many lines (default 100).'),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const { applicationId } = await resolveApp(args);
        const lines = await session.roxyon.applications.logs(applicationId, args.lines ?? 100);
        return text(lines.join('\n') || '(no log lines)', { lines });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_restart',
    {
      title: 'Roxyon: restart an application',
      description: 'Bounce the application process (no rebuild). Needs confirm:true.',
      inputSchema: {
        application: z.string().optional(),
        dir: z.string().optional(),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const { applicationId } = await resolveApp(args);
        if (!args.confirm)
          return text(`Would restart ${applicationId}. Pass confirm:true.`, { dryRun: true });
        await session.roxyon.applications.restart(applicationId);
        return text(`Restart queued for ${applicationId}.`, { ok: true });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_env_get',
    {
      title: 'Roxyon: read environment variables',
      description: "An application's environment variables as KEY=value lines.",
      inputSchema: { application: z.string().optional(), dir: z.string().optional() },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const { applicationId } = await resolveApp(args);
        const env = await session.roxyon.applications.getEnv(applicationId);
        return text(formatEnv(env) || '(none set)', { env });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_env_set',
    {
      title: 'Roxyon: set environment variables',
      description:
        "Merge variables into an application's environment and bump its revision. Run roxyon_deploy " +
        'afterwards to apply. Needs confirm:true. PORT and HOST are platform-managed and ignored.',
      inputSchema: {
        application: z.string().optional(),
        dir: z.string().optional(),
        vars: z.record(z.string()).describe('{ KEY: "value", ... } to set.'),
        remove: z.array(z.string()).optional().describe('Keys to delete.'),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const { applicationId } = await resolveApp(args);
        const set: Record<string, string> = {};
        for (const [k, v] of Object.entries(args.vars)) {
          if (k === 'PORT' || k === 'HOST') continue;
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return errorResult(`Invalid env key "${k}".`);
          set[k] = v;
        }
        const planned = [...Object.keys(set), ...(args.remove ?? []).map((k) => `-${k}`)];
        if (!args.confirm) {
          return text(`Would update: ${planned.join(', ') || '(nothing)'}. Pass confirm:true.`, {
            dryRun: true,
            changed: planned,
          });
        }
        const r = await session.roxyon.applications.setEnv(applicationId, {
          set,
          remove: args.remove ?? [],
        });
        return text(`Updated ${r.changed.join(', ') || '(nothing)'}. Run roxyon_deploy to apply.`, {
          ok: true,
          changed: r.changed,
        });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_link_github',
    {
      title: 'Roxyon: connect a git remote',
      description:
        'Connect a git repository to an application for push-to-deploy. Returns the deploy key and ' +
        'webhook URL to add to the repo. Needs confirm:true.',
      inputSchema: {
        application: z.string().optional(),
        dir: z.string().optional(),
        repoUrl: z.string().describe('SSH git URL, e.g. git@github.com:you/app.git'),
        branch: z.string().optional().describe('Branch to deploy (default main).'),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const { applicationId } = await resolveApp(args);
        if (!args.confirm) {
          return text(
            `Would connect ${args.repoUrl} (${args.branch ?? 'main'}) to ${applicationId}. Pass confirm:true.`,
            { dryRun: true },
          );
        }
        const res = await session.roxyon.applications.repoConnect(
          applicationId,
          args.repoUrl,
          args.branch ?? 'main',
        );
        const body = [
          `Connected ${args.repoUrl} (${args.branch ?? 'main'}).`,
          res.deployKey ? `\nDeploy key (add to the repo, read-only):\n${res.deployKey}` : '',
          res.webhookUrl ? `\nWebhook URL: ${res.webhookUrl}` : '',
          res.secret ? `Webhook secret: ${res.secret}` : '',
          res.hint ? `\n${res.hint}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        return text(body, {
          ok: true,
          deployKey: res.deployKey,
          webhookUrl: res.webhookUrl,
          secret: res.secret,
        });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_add_domain',
    {
      title: 'Roxyon: add a subdomain / host',
      description:
        'Provision a host — DNS + web server + automatic HTTPS. The host must be a subdomain ' +
        'of a domain the account already hosts (or a *.roxyon.com subdomain). Returns while it ' +
        'is still coming up; TLS follows a minute or two later. Needs confirm:true.',
      inputSchema: {
        host: z.string().describe('The full hostname, e.g. promo.mycompany.com'),
        subscription: z
          .string()
          .optional()
          .describe('Which subscription to attach it to (omit if the account has one).'),
        spa: z.boolean().optional().describe('Single-page app: unmatched paths serve /index.html.'),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        if (!args.confirm) {
          return text(
            `Would provision ${args.host}${args.spa ? ' (SPA routing)' : ''}. Pass confirm:true.`,
            { dryRun: true },
          );
        }
        const res = await session.roxyon.domains.create({
          host: args.host,
          subscription: args.subscription ?? session.preferredSubscription,
          siteType: args.spa ? 'spa' : undefined,
        });
        const live = res.status === 'active';
        return text(
          [
            `${res.host} — ${res.type}, ${res.status}.`,
            live
              ? 'The host is up. HTTPS may take another minute to issue.'
              : 'DNS + web server are being set up (~1–2 min), then HTTPS. ' +
                'Check roxyon_list_domains, or just deploy now — files are kept and served once it is live.',
          ].join('\n'),
          { ok: true, host: res.host, type: res.type, status: res.status },
        );
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_deploy_content',
    {
      title: 'Roxyon: deploy generated files',
      description: [
        'Publish a set of files you generated (HTML/CSS/JS/assets) to a host on the account.',
        'The host must already exist (roxyon_add_domain, or an existing site). Overlay by',
        'default — pass clean:true to replace the whole document root. Needs confirm:true.',
        `Limits: ${MAX_FILES} files, ${(MAX_FILE_BYTES / 1024) | 0} KB per file,`,
        `${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB total (base64-encode binaries).`,
      ].join(' '),
      inputSchema: {
        host: z.string().describe('Target host, e.g. promo.mycompany.com'),
        folder: z.string().optional().describe('Sub-path under the host; "" = site root.'),
        files: z
          .array(
            z.object({
              path: z.string().describe('Relative path, e.g. index.html, about/index.html'),
              content: z.string(),
              encoding: z.enum(['utf8', 'base64']).optional(),
            }),
          )
          .min(1),
        clean: z.boolean().optional().describe('Replace the whole docroot (keeps .well-known).'),
        spa: z.boolean().optional().describe('Also flip the host to SPA routing.'),
        confirm: z.boolean().optional(),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        if (args.files.length > MAX_FILES) {
          return errorResult(`Too many files (${args.files.length}); the limit is ${MAX_FILES}.`);
        }
        let total = 0;
        for (const f of args.files) {
          const n = Buffer.byteLength(f.content, f.encoding === 'base64' ? 'base64' : 'utf8');
          if (n > MAX_FILE_BYTES) {
            return errorResult(
              `"${f.path}" is ${(n / 1024) | 0} KB; the per-file limit is ${(MAX_FILE_BYTES / 1024) | 0} KB.`,
            );
          }
          total += n;
        }
        if (total > MAX_TOTAL_BYTES) {
          return errorResult(
            `Total content is ${(total / 1024 / 1024).toFixed(1)} MB; the limit is ` +
              `${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB. Deploy in parts or use the CLI.`,
          );
        }

        const folder = args.folder ?? '';
        if (!args.confirm) {
          return text(
            [
              'DRY RUN — pass confirm:true to deploy.',
              '',
              `Host:   ${args.host}${folder ? `/${folder}` : ''}`,
              `Files:  ${args.files.length} (${(total / 1024) | 0} KB)`,
              `Mode:   ${args.clean ? 'clean (replaces the document root)' : 'overlay'}${args.spa ? ' + SPA routing' : ''}`,
              ...args.files.slice(0, 20).map((f) => `  ${f.path}`),
              args.files.length > 20 ? `  … ${args.files.length - 20} more` : '',
            ]
              .filter(Boolean)
              .join('\n'),
            { dryRun: true },
          );
        }

        const { buffer, files } = await packFiles(args.files, { maxBytes: MAX_TOTAL_BYTES });
        const r = await session.roxyon.sites.deploy(args.host, folder, buffer, {
          clean: args.clean,
          spa: args.spa,
        });
        const size = r.bytes ? ` (${(r.bytes / 1024) | 0} KB)` : '';
        const spaNote = args.spa ? '\nSPA routing enabled — deep links resolve to index.html.' : '';
        return text(
          `✓ Deployed ${files.length} file(s) to https://${args.host}${folder ? `/${folder}` : ''}${size}.${spaNote}`,
          { ok: true, host: args.host, files: files.length },
        );
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_list_files',
    {
      title: 'Roxyon: list a site’s files',
      description: "The files currently deployed to a host's document root.",
      inputSchema: {
        host: z.string(),
        folder: z.string().optional(),
        path: z.string().optional().describe('List under this sub-path only.'),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const files = await session.roxyon.sites.listFiles(
          args.host,
          args.folder ?? '',
          args.path ?? '',
        );
        const body = files.length
          ? files
              .map(
                (f) => `${f.type === 'dir' ? 'd' : '-'} ${String(f.size).padStart(8)}  ${f.path}`,
              )
              .join('\n')
          : '(empty)';
        return text(body, { files });
      }),
  );

  // -----------------------------------------------------------------------
  server.registerTool(
    'roxyon_read_file',
    {
      title: 'Roxyon: read a site file',
      description: "Read one file from a host's document root (to review or edit it).",
      inputSchema: {
        host: z.string(),
        folder: z.string().optional(),
        path: z.string().describe('Relative path, e.g. index.html'),
      },
    },
    (args) =>
      guard(async () => {
        const session = await getSession();
        const f = await session.roxyon.sites.readFile(args.host, args.folder ?? '', args.path);
        if (f.encoding === 'base64') {
          return text(
            `${f.path} — ${f.size} bytes, binary (base64):\n\n${f.content.slice(0, 4096)}`,
            { path: f.path, size: f.size, encoding: 'base64' },
          );
        }
        return text(f.content, { path: f.path, size: f.size, encoding: 'utf8' });
      }),
  );
}

// Re-exported for tests.
export { resolveApp };
export type { Roxyon, ToolResult };
