import { RoxyonApiError, type TokenScope } from '@roxyon/api-client';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

const SCOPES: TokenScope[] = ['deploy', 'logs', 'read'];

export async function tokenCreate(
  name: string | undefined,
  opts: { scopes?: string; expires?: number },
): Promise<void> {
  if (!name) fail('A name is required: roxyon token create <name>', EXIT.configError);

  const scopes = (opts.scopes ? opts.scopes.split(',') : ['deploy', 'logs'])
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is TokenScope => (SCOPES as string[]).includes(s));
  if (scopes.length === 0)
    fail(`--scopes must be a subset of: ${SCOPES.join(', ')}`, EXIT.configError);

  const { roxyon } = await requireSession();
  try {
    const t = await roxyon.tokens.create(name, {
      scopes,
      expiresInDays: opts.expires && opts.expires > 0 ? opts.expires : undefined,
    });
    ui.success(
      `Created "${t.name}" (${t.scopes.join(', ')})${t.expiresAt ? ` · expires ${t.expiresAt.slice(0, 10)}` : ''}`,
    );
    ui.line();
    ui.line(t.token);
    ui.line();
    ui.dim(
      'Copy it now — it will not be shown again. Use it as ROXYON_TOKEN in CI or the MCP server.',
    );
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}

export async function tokenList(): Promise<void> {
  const { roxyon } = await requireSession();
  try {
    const tokens = await roxyon.tokens.list();
    if (tokens.length === 0) {
      ui.info('No personal access tokens.');
      return;
    }
    ui.line();
    for (const t of tokens) {
      ui.kv(
        t.name,
        `${t.prefix}… · ${t.scopes.join(',')}` +
          `${t.expiresAt ? ` · expires ${t.expiresAt.slice(0, 10)}` : ''}` +
          `${t.lastUsedAt ? ` · used ${t.lastUsedAt.slice(0, 10)}` : ' · never used'}`,
      );
      ui.dim(`  id ${t.id}`);
    }
    ui.line();
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}

export async function tokenRevoke(id: string | undefined): Promise<void> {
  if (!id) fail('A token id is required: roxyon token revoke <id>', EXIT.configError);
  const { roxyon } = await requireSession();
  try {
    await roxyon.tokens.revoke(id);
    ui.success(`Revoked ${id}.`);
  } catch (err) {
    if (err instanceof RoxyonApiError) fail(err.message);
    throw err;
  }
}
