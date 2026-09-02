import type { ProjectConfig } from '@roxyon/deploy-core';

export interface FileOut {
  path: string;
  content: string;
}

/**
 * The files every scaffolded project gets on top of its framework skeleton, so
 * any AI assistant — and any human — knows how to build and deploy it.
 */
export function agentFiles(config: ProjectConfig, opts: { baas: boolean }): FileOut[] {
  const isLumen = config.runtime === 'lumen';
  const dev = isLumen ? 'npm run dev' : `(your app: ${config.start ?? 'npm run start'})`;
  const build = config.build ? config.build : '(no build step)';

  const agents = `# AGENTS.md

Working notes for AI assistants and humans. Also read as \`CLAUDE.md\`,
\`GEMINI.md\`, \`.cursor/rules/roxyon.mdc\`, \`.github/copilot-instructions.md\`.

## This project

- **${config.name}** — a ${config.runtime} project deployed on **Roxyon**.
- Config: \`roxyon.json\` (host \`${config.host}\`${config.folder ? `, folder \`${config.folder}\`` : ''}).
- Local dev: \`${dev}\`
- Build: \`${build}\`

${
  isLumen
    ? `## LumenJS (V1) — the rules that bite

Vanilla JS/HTML/CSS, **no build step** for the framework. \`.view\` files under
\`src/views/\` are one per route. Full reference: https://lumenjs.com/llms/lumenjs.md

- State is \`var\` (never \`let\`/\`const\`) in a \`<script>\` in the view; reactive
  only when named in \`bind="name"\` on an ancestor element.
- **Never nest a \`bind\` inside another \`bind\`** — the inner subtree stops
  rendering, interpolations come out empty.
- \`bind\` renders its descendants, not the element's own attributes — put it on
  the parent of whatever interpolates.
- \`:for\` does not resolve the loop variable in nested loops or in an element's
  own plain attributes. Build that markup as a JS string and inject with
  \`.html()\`. Backtick the moustache on a \`:for\` element's own attribute.
- A \`{{ fn() }}\` moustache runs once and goes stale — compute into a \`var\`.
- Forms: \`o-sub\` / \`b-sub\` on the \`<form>\`. There is no \`v-model\`.
`
    : `## Runtime

${config.runtime} app. \`PORT\` and \`HOST\` are set by the platform — read them
from the environment, never hard-code or override them. The start command is
\`${config.start ?? 'npm run start'}\` (see \`roxyon.json\`).
`
}${
  opts.baas
    ? `
## Roxyon BaaS

Configured in \`src/roxyon-baas.js\`. Reference: https://roxyon.com/llms/baas.md

- **A failed write returns HTTP 200 with an \`error\` field** — check for it
  before treating any create/update/delete as successful.
- The \`in\` operator takes a comma-joined string, not an array.
- Auth: \`rx.login({Email,Password})\`, \`rx.me()\`, \`rx.logout()\`.
`
    : ''
}
## Deploy

Do **not** SFTP files or edit them on the server. Deploy with:

\`\`\`bash
roxyon deploy          # or the roxyon_deploy MCP tool (dry run, then confirm:true)
\`\`\`

- Env vars live on the platform: \`roxyon env set KEY=value\`, then redeploy.
- Git push-to-deploy: \`roxyon link <repo-url>\`.
- First deploy creates the app automatically.
`;

  const llmsTxt = `# ${config.name}

> A ${config.runtime} project on Roxyon. Deploy with \`roxyon deploy\`.

## Docs

- [How to build & deploy](AGENTS.md)
${isLumen ? '- [LumenJS reference](https://lumenjs.com/llms/lumenjs.md)\n' : ''}${opts.baas ? '- [Roxyon BaaS reference](https://roxyon.com/llms/baas.md)\n' : ''}- [Deploying to Roxyon](https://roxyon.com/llms/deploy.md)
`;

  const cursorRule = `---
description: How to build and deploy this Roxyon project
alwaysApply: true
---

${agents}`;

  return [
    { path: 'AGENTS.md', content: agents },
    { path: 'CLAUDE.md', content: 'See [AGENTS.md](AGENTS.md).\n' },
    { path: 'GEMINI.md', content: 'See [AGENTS.md](AGENTS.md).\n' },
    { path: 'llms.txt', content: llmsTxt },
    { path: '.cursor/rules/roxyon.mdc', content: cursorRule },
    { path: '.github/copilot-instructions.md', content: agents },
    {
      path: '.roxyonignore',
      content: ['node_modules', '.git', '.next', '.venv', 'dist/.cache', '.DS_Store', ''].join(
        '\n',
      ),
    },
  ];
}
