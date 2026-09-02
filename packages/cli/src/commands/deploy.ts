import * as p from '@clack/prompts';
import { DeployError, deployProject } from '@roxyon/deploy-core';
import { requireSession } from '../context.js';
import { EXIT, fail, ui } from '../ui.js';

export interface DeployOptions {
  follow?: boolean;
  build?: boolean;
  lines?: number;
}

const CODE: Record<DeployError['code'], number> = {
  'no-config': EXIT.configError,
  auth: EXIT.authRequired,
  'bad-host': EXIT.configError,
  'build-failed': EXIT.failure,
  'no-build-output': EXIT.failure,
  'upload-failed': EXIT.failure,
  'create-failed': EXIT.failure,
};

export async function deploy(opts: DeployOptions): Promise<void> {
  const { roxyon, credentials } = await requireSession();
  const spin = p.spinner();
  let spinning = false;

  const reporter = {
    step: (msg: string) => {
      if (spinning) spin.message(msg);
      else {
        spin.start(msg);
        spinning = true;
      }
    },
    log: (line: string) => ui.dim(`  ${line}`),
  };

  try {
    const outcome = await deployProject({
      cwd: process.cwd(),
      roxyon,
      preferredSubscription: credentials?.subscription,
      build: opts.build,
      follow: opts.follow,
      reporter,
    });

    if (outcome.kind === 'static' && outcome.ok) {
      spin.stop('Deployed.');
      ui.success(`${outcome.url} is live (${outcome.files} files).`);
      return;
    }
    if (outcome.kind === 'app' && outcome.ok) {
      spin.stop(
        outcome.status === 'running'
          ? `Live — revision ${outcome.revision} running.`
          : `Build queued (revision ${outcome.revision}).`,
      );
      if (outcome.url) ui.success(outcome.url);
      return;
    }
    // app, not ok
    spin.stop('Deploy failed.');
    if ('error' in outcome && outcome.error) {
      ui.line();
      ui.error(outcome.error);
    }
    process.exitCode = EXIT.failure;
  } catch (err) {
    if (spinning) spin.stop('Failed.');
    if (err instanceof DeployError) fail(err.message, CODE[err.code]);
    throw err;
  }
}
