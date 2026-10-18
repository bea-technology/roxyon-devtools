# The Roxyon MCP server (@roxyon/mcp, packages/mcp-server) over stdio, for directories that build MCP servers
# from source (Glama). It starts and answers initialize / tools/list without credentials; to act on an account,
# pass a personal access token: docker run -i --rm -e ROXYON_TOKEN=roxp_... <image>
# The hosted server needs no Docker: https://mcp.roxyon.com/mcp (Streamable HTTP, OAuth).

FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile --filter "@roxyon/mcp..." \
 && pnpm --filter "@roxyon/mcp..." build \
 && pnpm --filter @roxyon/mcp deploy --prod /out

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
ENTRYPOINT ["node", "bin/roxyon-mcp.js"]
