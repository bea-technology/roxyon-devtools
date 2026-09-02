import { isAuthError } from '@roxyon/api-client';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export async function whoami(): Promise<void> {
  const { roxyon, credentials } = await requireSession();
  try {
    // One call — works with a session token or a PAT.
    const ctx = await roxyon.account.context();
    ui.line();
    ui.kv('User', ctx.user.email || ctx.user.id);
    ui.kv('User ID', ctx.user.id);
    if (credentials?.sessionToken?.startsWith('roxp_')) {
      ui.kv('Auth', `personal access token (${ctx.scopes.join(', ') || 'no scopes'})`);
    }
    if (ctx.subscriptions.length === 0) {
      ui.kv('Subscription', '(none — add a plan in the console)');
    } else {
      const active =
        (credentials?.subscription &&
          ctx.subscriptions.find(
            (s) => s.id === credentials.subscription || s.name === credentials.subscription,
          )) ||
        ctx.subscriptions.find((s) => s.status === 'active') ||
        ctx.subscriptions[0];
      for (const s of ctx.subscriptions) {
        const mark = s.id === active?.id ? '→ ' : '  ';
        ui.kv(
          `${mark}${s.name || s.id}`,
          `${s.status || '?'}${s.datacenter ? ` · ${s.datacenter}` : ''}`,
        );
      }
    }
    ui.kv('Hosts', ctx.domains.map((d) => d.name).join(', ') || '(none)');
    ui.line();
  } catch (err) {
    if (isAuthError(err)) fail('Session expired. Run `roxyon login` again.', EXIT.authRequired);
    throw err;
  }
}
