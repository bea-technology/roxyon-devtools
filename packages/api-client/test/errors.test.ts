import { describe, expect, it } from 'vitest';
import { RoxyonApiError, assertOk, isAuthError, rxError } from '../src/errors.js';

describe('rxError', () => {
  it('returns empty string on a successful write', () => {
    expect(rxError({ results: [{ objectId: '9GQJl7MZKm' }] })).toBe('');
  });

  it('finds an error inside results[]', () => {
    expect(
      rxError({
        results: [{ code: 1054, error: "Unknown column 'X' in 'SET'", type: 'DBQueryError' }],
      }),
    ).toBe("Unknown column 'X' in 'SET'");
  });

  it('finds a top-level error', () => {
    expect(rxError({ code: 105, error: 'Invalid Field Name', type: 'InvalidFieldName' })).toBe(
      'Invalid Field Name',
    );
  });

  it('flags a null response', () => {
    expect(rxError(null)).toMatch(/No response/);
  });
});

describe('assertOk', () => {
  it('passes a good response through', () => {
    const r = { results: [{ objectId: 'x' }] };
    expect(assertOk(r)).toBe(r);
  });

  it('throws a RoxyonApiError carrying the code', () => {
    try {
      assertOk({ results: [{ code: 1054, error: 'boom', type: 'DBQueryError' }] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RoxyonApiError);
      expect((e as RoxyonApiError).code).toBe(1054);
    }
  });
});

describe('isAuthError', () => {
  it('detects a 401 RoxyonApiError', () => {
    expect(isAuthError(new RoxyonApiError('nope', { status: 401 }))).toBe(true);
  });
  it('detects a lapsed-session message', () => {
    expect(isAuthError({ error: 'Invalid session token' })).toBe(true);
  });
  it('is false for an ordinary error', () => {
    expect(isAuthError(new Error('build failed'))).toBe(false);
  });
});
