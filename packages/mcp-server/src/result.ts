import { isSessionGone } from './session.js';

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  /** SDK's CallToolResult carries an open index signature. */
  [k: string]: unknown;
}

export function text(body: string, structured?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: body }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function errorResult(message: string, structured?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    ...(structured ? { structuredContent: structured } : {}),
    isError: true,
  };
}

/** Wrap a tool body so thrown errors become clean `isError` results. */
export async function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (isSessionGone(err)) {
      return errorResult(
        (err as Error).message ||
          'Roxyon session expired — run `roxyon login` again, or refresh ROXYON_TOKEN.',
      );
    }
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}
