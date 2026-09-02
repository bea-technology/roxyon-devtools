/**
 * GET query serialisation for the BaaS, matching the `Obj2Par` helper in the
 * browser SDK (`rx.js`): nested objects become PHP-style bracket keys
 * (`where[User]=abc`, `where[Status][in]=a,b,c`).
 *
 * Two hard-won rules (see the `roxyon-api-write-failures` notes):
 *  - The `in` operator takes a **comma-joined string, not an array**. An array
 *    serialises to `where[X][in][0]=…` bracket notation the API does not read.
 *    Pass `{ in: ['a', 'b'] }` here and we join it for you.
 *  - A `select` subquery nested inside an `or` group crashes the API. Resolve
 *    ids in a first query, then `or: [..., { objectId: { in: 'a,b' } }]`.
 */

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | QueryValue[]
  | { [k: string]: QueryValue };

export type QueryObject = Record<string, QueryValue>;

function encode(k: string, v: string): string {
  return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
}

function walk(value: QueryValue, prefix: string, out: string[]): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    // A bare array under a normal key -> repeated bracket-index entries. The
    // only array we actually want is `in`, and that is handled below before we
    // ever get here, so this branch is a best-effort fallback.
    value.forEach((item, i) => walk(item, `${prefix}[${i}]`, out));
    return;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === 'in' || key === 'nin' || key === 'notIn') {
        const joined = Array.isArray(child) ? child.join(',') : String(child);
        out.push(encode(`${prefix}[${key === 'notIn' ? 'nin' : key}]`, joined));
        continue;
      }
      walk(child, `${prefix}[${key}]`, out);
    }
    return;
  }

  out.push(encode(prefix, String(value)));
}

/** Serialise a query object to a `key=value&...` string (no leading `?`). */
export function toQueryString(query: QueryObject | undefined): string {
  if (!query) return '';
  const out: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    walk(value, key, out);
  }
  return out.join('&');
}
