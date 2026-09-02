import * as p from '@clack/prompts';
import { isCancel } from '@clack/prompts';
import { RoxyonApiError } from '@roxyon/api-client';
import { type Credentials, clearCredentials, loadCredentials, saveCredentials } from '../config.js';
import { anonymousRoxyon } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export interface LoginOptions {
  email?: string;
  password?: string;
  token?: string;
  otp?: string;
}

export async function login(opts: LoginOptions): Promise<void> {
  const roxyon = anonymousRoxyon();

  // Non-interactive: a token was handed in directly.
  if (opts.token) {
    roxyon.client.setSessionToken(opts.token);
    const user = await roxyon.auth.me().catch((e) => {
      fail(`That token did not authenticate: ${(e as Error).message}`, EXIT.authRequired);
    });
    await persist({ sessionToken: opts.token, userId: user.objectId, email: user.Email });
    ui.success(`Signed in as ${user.Email ?? user.objectId} (via --token).`);
    return;
  }

  const interactive = process.stdin.isTTY && !opts.password;

  const email =
    opts.email ??
    (interactive
      ? await prompt(() =>
          p.text({
            message: 'Email',
            validate: (v) => (v.includes('@') ? undefined : 'Enter an email'),
          }),
        )
      : fail(
          'Provide --email (and --password), or run in an interactive terminal.',
          EXIT.configError,
        ));

  const password =
    opts.password ??
    (interactive
      ? await prompt(() => p.password({ message: 'Password' }))
      : fail('Provide --password.', EXIT.configError));

  const spin = p.spinner();
  spin.start('Signing in');
  try {
    let result = await roxyon.auth.login(email, password, { via: 'cli' });

    if (result.stepUpRequired) {
      spin.stop('A one-time code was sent to you.');
      const code =
        opts.otp ??
        (interactive
          ? await prompt(() => p.text({ message: 'One-time code' }))
          : fail('This account requires OTP — pass --otp <code>.', EXIT.authRequired));
      spin.start('Verifying code');
      result = await roxyon.auth.verifyOtp(result.challengeId ?? '', code);
    }

    roxyon.client.setSessionToken(result.sessionToken);
    const user = await roxyon.auth.me();
    await persist({
      sessionToken: result.sessionToken,
      refreshToken: result.refreshToken,
      userId: user.objectId,
      email: user.Email,
    });
    spin.stop(`Signed in as ${user.Email ?? user.objectId}.`);
    ui.dim('Token stored in ~/.roxyon/config.json (permissions 0600).');
  } catch (err) {
    spin.stop('Sign-in failed.');
    if (err instanceof RoxyonApiError) fail(err.message, EXIT.authRequired);
    throw err;
  }
}

export async function logout(): Promise<void> {
  const creds = await loadCredentials();
  await clearCredentials();
  ui.success(creds ? `Signed out ${creds.email ?? creds.userId}.` : 'Nothing to sign out.');
}

async function persist(partial: Omit<Credentials, 'savedAt'>): Promise<void> {
  await saveCredentials({ ...partial, savedAt: new Date().toISOString() });
}

async function prompt<T>(fn: () => Promise<T | symbol>): Promise<T> {
  const value = await fn();
  if (isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(EXIT.ok);
  }
  return value as T;
}
