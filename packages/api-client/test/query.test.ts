import { describe, expect, it } from 'vitest';
import { toQueryString } from '../src/query.js';

describe('toQueryString', () => {
  it('serialises a flat where clause with bracket keys', () => {
    expect(toQueryString({ where: { User: 'abc' } })).toBe('where%5BUser%5D=abc');
  });

  it('joins an `in` array into a comma string (not bracket-indexed)', () => {
    const qs = decodeURIComponent(
      toQueryString({ where: { Subscription: { in: ['a', 'b', 'c'] } } }),
    );
    expect(qs).toBe('where[Subscription][in]=a,b,c');
  });

  it('keeps a string `in` as-is', () => {
    const qs = decodeURIComponent(toQueryString({ where: { objectId: { in: 'x,y' } } }));
    expect(qs).toBe('where[objectId][in]=x,y');
  });

  it('serialises nested include arrays like the SDK Obj2Par', () => {
    const qs = decodeURIComponent(
      toQueryString({ include: [{ className: 'Subscriptions', field: 'Subscription' }] }),
    );
    expect(qs).toBe('include[0][className]=Subscriptions&include[0][field]=Subscription');
  });

  it('drops null / undefined', () => {
    expect(toQueryString({ a: null, b: undefined, c: 1 })).toBe('c=1');
  });
});
