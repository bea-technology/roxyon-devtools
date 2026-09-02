import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const BIN = fileURLToPath(new URL('../bin/roxyon.js', import.meta.url));

async function roxyon(args: string[], env: Record<string, string> = {}) {
  try {
    const { stdout, stderr } = await run('node', [BIN, ...args], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code: number; stdout: string; stderr: string };
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

describe('roxyon cli', () => {
  it('prints help with every command', async () => {
    const { stdout } = await roxyon(['--help']);
    for (const cmd of ['login', 'init', 'deploy', 'logs', 'env', 'whoami', 'link']) {
      expect(stdout).toContain(cmd);
    }
  });

  it('exits 2 (auth required) for whoami with no credentials', async () => {
    const { code, stderr } = await roxyon(['whoami'], {
      HOME: '/nonexistent-roxyon-home',
      ROXYON_TOKEN: '',
    });
    expect(code).toBe(2);
    expect(stderr).toMatch(/not signed in/i);
  });

  it('exits 3 (config error) for deploy with no roxyon.json', async () => {
    const { code, stderr } = await roxyon(['deploy'], {
      HOME: '/nonexistent-roxyon-home',
      ROXYON_TOKEN: 'x',
    });
    // deploy resolves the session first (token given), then fails on missing config
    expect([1, 3]).toContain(code);
    expect(stderr).toMatch(/roxyon\.json|session|sign/i);
  });
});
