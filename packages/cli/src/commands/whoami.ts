import { isAuthError } from '@roxyon/api-client';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export async function whoami(): Promise<void> {
  const { roxyon, credentials } = await requireSession();
  try {
    const user = await roxyon.auth.me();
    const subs = await roxyon.subscriptions.list(user.objectId);
    ui.line();
    ui.kv('User', user.Email ?? user.Username ?? user.objectId);
    ui.kv('User ID', user.objectId);
    if (subs.length === 0) {
      ui.kv('Subscription', '(none — add a plan in the console)');
    } else {
      const active =
        (credentials?.subscription &&
          subs.find(
            (s) => s.objectId === credentials.subscription || s.Name === credentials.subscription,
          )) ||
        subs.find((s) => s.Status === 'active') ||
        subs[0];
      for (const s of subs) {
        const mark = s.objectId === active?.objectId ? '→ ' : '  ';
        ui.kv(
          `${mark}${s.Name ?? s.objectId}`,
          `${s.Status ?? '?'}${s.Datacenter ? ` · ${s.Datacenter}` : ''}`,
        );
      }
    }
    ui.line();
  } catch (err) {
    if (isAuthError(err)) fail('Session expired. Run `roxyon login` again.', EXIT.authRequired);
    throw err;
  }
}
