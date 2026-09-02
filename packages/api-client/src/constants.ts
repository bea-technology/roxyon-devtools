/**
 * Default endpoints and the public application credentials the client uses to
 * mint an anonymous token before a user logs in.
 *
 * `X-BEA-JavaScript-Key` is a **public** key (it ships in browser bundles by
 * design — see `console.roxyon.com/src/index.js`). It is safe to embed here.
 * The REST key is never embedded — user actions always run under a session
 * token or a Personal Access Token.
 *
 * TODO(M1): provision a dedicated `roxyon-cli` BaaS application and swap these
 * for its App-ID / JavaScript-Key so CLI traffic is attributable and rate-limited
 * separately from the web console. Until then the client reuses the console's
 * public pair, which is already exposed in shipped frontend code.
 */
export const DEFAULT_BAAS_URL = 'https://www.beaapis.com/1';
export const DEFAULT_CONSOLE_URL = 'https://console.roxyon.com';

export const DEFAULT_APP = {
  appId: 'jAtp2zHGU3FbnrQWrToALFakd_vbiY0ywihn4Hj54lw',
  javascriptKey: 'w2Y9USRg0COtNe-fUqOaC1OOOlNCnV2BG8GZF80w4x8',
} as const;

/** Header names, lower-cased (the API is case-insensitive but the SDK uses these). */
export const H = {
  appId: 'x-bea-application-id',
  jsKey: 'x-bea-javascript-key',
  restKey: 'x-bea-authorization',
  sessionToken: 'x-bea-session-token',
  accessToken: 'x-bea-access-token',
  refreshToken: 'x-bea-refresh-token',
} as const;
