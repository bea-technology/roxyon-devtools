import pc from 'picocolors';

export const ui = {
  info: (msg: string) => process.stdout.write(`${pc.cyan('›')} ${msg}\n`),
  success: (msg: string) => process.stdout.write(`${pc.green('✓')} ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`${pc.yellow('!')} ${msg}\n`),
  error: (msg: string) => process.stderr.write(`${pc.red('✗')} ${msg}\n`),
  line: (msg = '') => process.stdout.write(`${msg}\n`),
  dim: (msg: string) => process.stdout.write(`${pc.dim(msg)}\n`),
  kv: (key: string, value: string) =>
    process.stdout.write(`  ${pc.dim(key.padEnd(14))} ${value}\n`),
};

/** Exit codes — kept stable for scripting / CI. */
export const EXIT = {
  ok: 0,
  failure: 1,
  authRequired: 2,
  configError: 3,
} as const;

export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number = EXIT.failure) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

export function fail(message: string, exitCode: number = EXIT.failure): never {
  throw new CliError(message, exitCode);
}
