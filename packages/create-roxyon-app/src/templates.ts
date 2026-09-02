import type { FileOut } from './agent-files.js';

export type TemplateId = 'lumen' | 'lumen-baas' | 'node';

export interface Template {
  id: TemplateId;
  label: string;
  runtime: 'lumen' | 'node';
  baas: boolean;
  /** LumenJS templates are scaffolded by @lmjs/cli, then overlaid. */
  viaLmjs: boolean;
}

export const TEMPLATES: Record<TemplateId, Template> = {
  lumen: { id: 'lumen', label: 'LumenJS SPA', runtime: 'lumen', baas: false, viaLmjs: true },
  'lumen-baas': {
    id: 'lumen-baas',
    label: 'LumenJS SPA + Roxyon BaaS (auth + data example)',
    runtime: 'lumen',
    baas: true,
    viaLmjs: true,
  },
  node: {
    id: 'node',
    label: 'Node.js app (minimal HTTP server)',
    runtime: 'node',
    baas: false,
    viaLmjs: false,
  },
};

// ---------------------------------------------------------------------------
// Node template — bundled inline (no framework, no deps).
// ---------------------------------------------------------------------------

export function nodeTemplateFiles(name: string): FileOut[] {
  return [
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name,
          version: '0.1.0',
          private: true,
          type: 'module',
          scripts: {
            start: 'node src/server.js',
            dev: 'node --watch src/server.js',
          },
          engines: { node: '>=20' },
        },
        null,
        2,
      )}\n`,
    },
    {
      path: 'src/server.js',
      content: `import { createServer } from 'node:http';

// The platform sets PORT and HOST. Never hard-code or override them.
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ hello: 'from ${name} on Roxyon', url: req.url }));
});

server.listen(port, host, () => {
  console.log(\`listening on http://\${host}:\${port}\`);
});
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

A Node.js app on Roxyon.

\`\`\`bash
npm install
npm run dev        # local, http://localhost:3000
roxyon deploy      # to Roxyon (first run creates the app)
\`\`\`

See [AGENTS.md](AGENTS.md).
`,
    },
  ];
}

// ---------------------------------------------------------------------------
// LumenJS BaaS overlay — added on top of the @lmjs/cli skeleton.
// ---------------------------------------------------------------------------

export function baasOverlayFiles(): FileOut[] {
  return [
    {
      path: 'src/roxyon-baas.js',
      content: `// Roxyon BaaS client. The RX SDK is loaded in index.html from the CDN.
//
// A FAILED WRITE RESOLVES with an { error } field (top-level or inside
// results[]) — it does NOT reject. Always run rxError() on a write response.
window.rx = new RX({
  'Application-ID': 'YOUR_APPLICATION_ID',
  'JavaScript-KEY': 'YOUR_JAVASCRIPT_KEY',
});

window.rxError = function (r) {
  if (!r) return 'No response from the server.';
  if (r.error) return r.error;
  var rows = r.results;
  if (Object.prototype.toString.call(rows) === '[object Array]') {
    for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].error) return rows[i].error;
  }
  return '';
};
`,
    },
    {
      path: 'src/views/items.view',
      content: `<div class="ph50 pv30" bind="items">
  <div class="fs20 b mb20">Items ({{items.length}})</div>
  <form o-sub="addItem" class="mb20">
    <input name="Title" placeholder="New item" required class="p10" />
    <button type="submit" class="p10">Add</button>
  </form>
  <div :if="msg != ''" class="cr mb10">{{msg}}</div>
  <div :for="items as it">
    <div class="pv5">{{it.Title}}</div>
  </div>
</div>

<script>
  // 'var' — not let/const. Reactive because it's named in bind="items".
  var items = [];
  var msg = '';

  function loadItems() {
    rx.get('/Items', { fields: 'objectId,Title', order: '-createdAt', limit: 50 }).then(function (r) {
      var err = rxError(r);
      if (err) { msg = err; return; }
      items = r.results || [];
    });
  }

  function addItem(f, d) {
    msg = '';
    rx.post('/Items', { Title: d.Title }).then(function (r) {
      var err = rxError(r);          // a failed write still lands here
      if (err) { msg = err; return; }
      f.find('[name="Title"]').val('');
      loadItems();
    });
  }

  loadItems();
</script>

<settings> { hasFooter: false, hasHeader: false, hasNav: false } </settings>
`,
    },
  ];
}
