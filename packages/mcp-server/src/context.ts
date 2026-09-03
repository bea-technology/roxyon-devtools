import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request state for the HTTP transport. The stdio entry never opens a
 * context, so {@link currentContext} returns `{}` there and everything falls
 * back to the env / stored-login behaviour.
 */
export interface RequestContext {
  /** Bearer token presented on this HTTP request (from the OAuth layer). */
  token?: string;
  /**
   * True when serving the remote HTTP server. Tools that need the caller's
   * local filesystem (`roxyon_init`, `roxyon_deploy`) refuse in this mode.
   */
  remote?: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with `ctx` visible to {@link currentContext} for its whole async tree. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The context for the in-flight request, or `{}` on the stdio transport. */
export function currentContext(): RequestContext {
  return storage.getStore() ?? {};
}
