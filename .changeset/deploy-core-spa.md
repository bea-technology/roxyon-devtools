---
"@roxyon/deploy-core": minor
"@roxyon/cli": patch
"@roxyon/mcp": patch
---

`roxyon.json` accepts `"spa": true` for static projects: `roxyon deploy` (and the local MCP server's `roxyon_deploy`) then turns on single-page routing for the host, so links like `/about` serve `/index.html` instead of a 404. Before, SPA routing could only be set when the host was created or in the console.
