---
"@roxyon/mcp": patch
---

Advertise the hosted **`https://mcp.roxyon.com/mcp`** endpoint as a
`streamable-http` remote in the MCP registry entry, so OAuth-capable clients
(claude.ai, ChatGPT, Cursor) can connect without installing anything. The stdio
package entry is unchanged.
