/**
 * All config lives in `@roxyon/deploy-core` so the CLI and the MCP server share
 * one implementation. This module just re-exports it.
 */
export {
  buildProjectConfig,
  clearCredentials,
  type Credentials,
  credentialsPath,
  type Endpoints,
  endpointsFromEnv,
  loadCredentials,
  loadProjectConfig,
  type ProjectConfig,
  projectConfigPath,
  saveCredentials,
  saveProjectConfig,
  tokenFromEnv,
} from '@roxyon/deploy-core';
