import { spawn } from 'node:child_process';
import type { DeployReporter } from './deploy.js';

/**
 * Default build-command runner: spawn a shell, stream output to the reporter.
 * Callers in a non-local context (a hosted server) can pass their own.
 */
export function runShellCommand(
  command: string,
  cwd: string,
  reporter?: DeployReporter,
): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const pipe = (buf: Buffer) => {
      for (const line of buf.toString('utf8').split('\n')) {
        if (line.trim()) reporter?.log?.(line);
      }
    };
    child.stdout?.on('data', pipe);
    child.stderr?.on('data', pipe);
    child.on('close', (code) => resolvePromise(code ?? 0));
    child.on('error', () => resolvePromise(127));
  });
}
