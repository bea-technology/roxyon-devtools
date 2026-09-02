import { ApplicationsApi } from './applications.js';
import { AuthApi } from './auth.js';
import { RoxyonClient, type RoxyonClientOptions } from './client.js';
import { DomainsApi } from './domains.js';
import { SitesApi } from './sites.js';
import { SubscriptionsApi } from './subscriptions.js';

export { RoxyonClient } from './client.js';
export type { RoxyonClientOptions, RequestOptions } from './client.js';
export { AuthApi } from './auth.js';
export type { RoxyonUser, LoginResult, LoginPrecheck, SessionGrant } from './auth.js';
export { ApplicationsApi } from './applications.js';
export type {
  Application,
  ApplicationProcess,
  ApplicationRoute,
  CreateApplicationInput,
  DeployResult,
} from './applications.js';
export { SitesApi } from './sites.js';
export type { StaticDeployResult } from './sites.js';
export { DomainsApi } from './domains.js';
export type { Domain } from './domains.js';
export { SubscriptionsApi } from './subscriptions.js';
export type { Subscription, Privilege } from './subscriptions.js';
export { RoxyonApiError, rxError, isAuthError, assertOk } from './errors.js';
export { parseEnv, formatEnv, envFromStored } from './env.js';
export { RUNTIMES, LUMEN_BUILD } from './runtimes.js';
export type { RuntimeName, RuntimeSpec, DeployKind } from './runtimes.js';
export { toQueryString } from './query.js';
export {
  DEFAULT_BAAS_URL,
  DEFAULT_CONSOLE_URL,
  DEFAULT_APP,
} from './constants.js';

/**
 * Convenience facade bundling every sub-API over one {@link RoxyonClient}.
 *
 * ```ts
 * const roxyon = new Roxyon({ sessionToken });
 * const me = await roxyon.auth.me();
 * const sub = await roxyon.subscriptions.resolve(me.objectId);
 * const apps = await roxyon.applications.list(sub.objectId);
 * ```
 */
export class Roxyon {
  readonly client: RoxyonClient;
  readonly auth: AuthApi;
  readonly subscriptions: SubscriptionsApi;
  readonly domains: DomainsApi;
  readonly applications: ApplicationsApi;
  readonly sites: SitesApi;

  constructor(options: RoxyonClientOptions | RoxyonClient = {}) {
    this.client = options instanceof RoxyonClient ? options : new RoxyonClient(options);
    this.auth = new AuthApi(this.client);
    this.subscriptions = new SubscriptionsApi(this.client);
    this.domains = new DomainsApi(this.client);
    this.applications = new ApplicationsApi(this.client);
    this.sites = new SitesApi(this.client);
  }

  get sessionToken(): string | undefined {
    return this.client.getSessionToken();
  }
}
