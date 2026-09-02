import { Command } from 'commander';
import { deploy } from './commands/deploy.js';
import { envPull, envRm, envSet } from './commands/env.js';
import { init } from './commands/init.js';
import { login, logout } from './commands/login.js';
import { logs } from './commands/logs.js';
import { link, open, restart } from './commands/misc.js';
import { tokenCreate, tokenList, tokenRevoke } from './commands/token.js';
import { whoami } from './commands/whoami.js';
import { CliError, EXIT, ui } from './ui.js';

const VERSION = '0.1.0';

const program = new Command();

program
  .name('roxyon')
  .description('Deploy LumenJS apps and web projects to Roxyon infrastructure.')
  .version(VERSION, '-v, --version');

program
  .command('login')
  .description('Sign in to Roxyon (email + password, with OTP if required)')
  .option('--email <email>')
  .option('--password <password>')
  .option('--otp <code>', 'one-time code, for non-interactive step-up')
  .option('--token <token>', 'use a session/personal token directly (CI)')
  .action((opts) => run(() => login(opts)));

program
  .command('logout')
  .description('Remove stored credentials')
  .action(() => run(logout));

program
  .command('whoami')
  .description('Show the signed-in user and subscriptions')
  .action(() => run(whoami));

program
  .command('init')
  .description('Create roxyon.json for this project')
  .option('--host <host>', 'route host')
  .option('--folder <folder>', 'sub-path / source folder')
  .option('--runtime <runtime>', 'lumen | node | python | php')
  .option('-y, --yes', 'accept detected defaults, no prompts')
  .action((opts) => run(() => init(opts)));

program
  .command('deploy')
  .description('Build (if configured) and deploy this project')
  .option('--no-build', 'skip the configured build command')
  .option('--no-follow', 'return once the build is queued (app runtimes)')
  .option('--lines <n>', 'log lines to stream while building', (v) => Number.parseInt(v, 10))
  .action((opts) => run(() => deploy(opts)));

program
  .command('logs')
  .description('Show application logs')
  .option('-f, --follow', 'stream new lines')
  .option('--lines <n>', 'how many lines', (v) => Number.parseInt(v, 10))
  .option('--app <id>', 'application id (defaults to roxyon.json)')
  .action((opts) => run(() => logs(opts)));

const env = program.command('env').description('Manage application environment variables');
env
  .command('pull')
  .description('Print the current environment as KEY=value lines')
  .option('--app <id>')
  .action((opts) => run(() => envPull(opts)));
env
  .command('set <pairs...>')
  .description('Set one or more KEY=value pairs')
  .option('--app <id>')
  .action((pairs, opts) => run(() => envSet(pairs, opts)));
env
  .command('rm <keys...>')
  .description('Remove one or more variables')
  .option('--app <id>')
  .action((keys, opts) => run(() => envRm(keys, opts)));

program
  .command('restart')
  .description('Restart the application process (no rebuild)')
  .option('--app <id>')
  .action((opts) => run(() => restart(opts)));

program
  .command('open')
  .description("Open the project's URL in a browser")
  .action(() => run(open));

const token = program
  .command('token')
  .description('Manage personal access tokens (for CI and the MCP server)');
token
  .command('create <name>')
  .description('Create a token — prints the secret once')
  .option('--scopes <list>', 'comma-separated: deploy,logs,read', 'deploy,logs')
  .option('--expires <days>', 'expire after N days', (v) => Number.parseInt(v, 10))
  .action((name, opts) => run(() => tokenCreate(name, opts)));
token
  .command('list')
  .description('List your tokens')
  .action(() => run(tokenList));
token
  .command('revoke <id>')
  .description('Revoke a token')
  .action((id) => run(() => tokenRevoke(id)));

program
  .command('link [repoUrl]')
  .description('Connect a git remote for push-to-deploy')
  .option('--branch <branch>', 'branch to deploy', 'main')
  .option('--app <id>')
  .action((repoUrl, opts) => run(() => link(repoUrl, opts)));

program.parseAsync().catch((err) => {
  ui.error(err instanceof Error ? err.message : String(err));
  process.exit(EXIT.failure);
});

async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof CliError) {
      ui.error(err.message);
      process.exit(err.exitCode);
    }
    ui.error(err instanceof Error ? err.message : String(err));
    process.exit(EXIT.failure);
  }
}
