---
"@roxyon/mcp": minor
---

Add a remote **Streamable HTTP** transport (`roxyon-mcp-http` bin) alongside the
stdio server. It exposes RFC 9728 / RFC 8414 OAuth discovery, requires a bearer
token (audience-checked RFC 7662 introspection in `MCP_AUTH=introspect` mode),
and serves each request with a fresh stateless transport. The nine API-shaped
tools work remotely; `roxyon_init` / `roxyon_deploy` return a "use the CLI
locally / `roxyon_link_github`" message since they need the caller's filesystem.
