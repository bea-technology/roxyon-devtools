import { basename, resolve } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { scaffold } from './scaffold.js';
import { TEMPLATES, type TemplateId } from './templates.js';

interface Args {
  dir?: string;
  template?: TemplateId;
  host?: string;
  folder?: string;
  install: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { install: true, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--no-install') a.install = false;
    else if (arg === '-y' || arg === '--yes') a.yes = true;
    else if (arg === '--template' || arg === '-t') a.template = argv[++i] as TemplateId;
    else if (arg === '--host') a.host = argv[++i];
    else if (arg === '--folder') a.folder = argv[++i];
    else if (arg === '--help' || arg === '-h') a.dir = '--help';
    else if (!arg.startsWith('-') && !a.dir) a.dir = arg;
  }
  return a;
}

const HELP = `${pc.bold('create-roxyon-app')} — scaffold a Roxyon project

  npm create roxyon-app@latest my-app
  npx create-roxyon-app my-app --template lumen-baas

Options:
  -t, --template <id>   ${Object.keys(TEMPLATES).join(' | ')}
      --host <domain>    deploy host (a domain on your Roxyon subscription)
      --folder <path>    sub-path under the host
      --no-install       skip npm install
  -y, --yes             accept defaults, no prompts
`;

async function ask<T>(fn: () => Promise<T | symbol>): Promise<T> {
  const v = await fn();
  if (p.isCancel(v)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  return v as T;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.dir === '--help') {
    process.stdout.write(HELP);
    return;
  }

  p.intro(pc.bgYellow(pc.black(' create-roxyon-app ')));

  const dirInput =
    args.dir ??
    (args.yes
      ? 'roxyon-app'
      : await ask<string>(() =>
          p.text({ message: 'Project directory', placeholder: 'my-app', defaultValue: 'my-app' }),
        ));
  const dir = resolve(dirInput);
  const name = basename(dir);

  const templateId: TemplateId =
    args.template ??
    (args.yes
      ? 'lumen'
      : await ask<TemplateId>(() =>
          p.select({
            message: 'Template',
            initialValue: 'lumen' as TemplateId,
            options: Object.values(TEMPLATES).map((t) => ({ value: t.id, label: t.label })),
          }),
        ));
  const template = TEMPLATES[templateId];
  if (!template) {
    p.cancel(`Unknown template "${templateId}". Choose: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }

  const host =
    args.host ??
    (args.yes
      ? ''
      : await ask<string>(() =>
          p.text({
            message:
              'Deploy host (a domain on your Roxyon subscription — leave blank to set later)',
            placeholder: 'example.com',
            defaultValue: '',
          }),
        ));

  const folder =
    args.folder ??
    (args.yes || template.runtime === 'lumen'
      ? ''
      : await ask<string>(() =>
          p.text({ message: 'Folder under the host', placeholder: name, defaultValue: name }),
        ));

  const s = p.spinner();
  s.start('Scaffolding');
  try {
    const result = await scaffold({
      dir,
      name,
      template,
      host: host || 'example.com',
      folder,
      install: args.install,
    });
    s.stop('Scaffolded.');

    const rel = dir.startsWith(process.cwd()) ? `.${dir.slice(process.cwd().length)}` : dir;
    const steps = [
      `cd ${rel}`,
      ...(result.installed ? [] : ['npm install']),
      template.runtime === 'lumen' ? 'npm run dev' : 'npm run dev',
      ...(host ? [] : [pc.dim('# set "host" in roxyon.json (or run `roxyon init`)')]),
      'roxyon login',
      'roxyon deploy',
    ];
    p.note(steps.join('\n'), 'Next');
    p.outro(
      `${pc.green('Ready.')} ${template.baas ? 'Set your BaaS keys in src/roxyon-baas.js. ' : ''}AGENTS.md tells any AI assistant how to build & deploy this.`,
    );
  } catch (err) {
    s.stop('Failed.');
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
