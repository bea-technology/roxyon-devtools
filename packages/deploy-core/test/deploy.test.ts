import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Roxyon } from '@roxyon/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deployProject } from '../src/deploy.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rx-deploy-'));
  await mkdir(join(dir, 'dist'));
  await writeFile(join(dir, 'dist', 'index.html'), '<h1>hi</h1>');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function staticDeploy(extra: Record<string, unknown>) {
  await writeFile(
    join(dir, 'roxyon.json'),
    JSON.stringify({
      name: 't',
      host: 'my-app.roxyon.com',
      folder: '',
      runtime: 'lumen',
      kind: 'static',
      build: '',
      outDir: 'dist',
      ...extra,
    }),
  );
  const sitesDeploy = vi.fn(async () => ({
    ok: true,
    host: 'my-app.roxyon.com',
    path: '/',
    files: 1,
  }));
  const roxyon = {
    account: {
      context: async () => ({
        user: { id: 'u', email: 'a@b.c' },
        scopes: ['deploy'],
        subscriptions: [{ id: 's', name: 'S', status: 'active' }],
        domains: [{ id: 'd', name: 'my-app.roxyon.com', subscription: 's' }],
      }),
    },
    sites: { deploy: sitesDeploy },
  } as unknown as Roxyon;
  const out = await deployProject({ cwd: dir, roxyon });
  return { out, sitesDeploy };
}

describe('static deploy and SPA routing', () => {
  it('sends spa when roxyon.json says "spa": true', async () => {
    const { out, sitesDeploy } = await staticDeploy({ spa: true });
    expect(out.ok).toBe(true);
    expect(sitesDeploy).toHaveBeenCalledTimes(1);
    expect(sitesDeploy.mock.calls[0]?.[3]).toEqual({ spa: true });
  });

  it('does not switch routing when spa is absent', async () => {
    const { sitesDeploy } = await staticDeploy({});
    expect(sitesDeploy.mock.calls[0]?.[3]).toEqual({ spa: false });
  });
});
