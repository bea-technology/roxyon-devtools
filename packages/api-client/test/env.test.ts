import { describe, expect, it } from 'vitest';
import { envFromStored, formatEnv, parseEnv } from '../src/env.js';

describe('parseEnv', () => {
  it('parses KEY=value lines, tolerating export/# and quotes', () => {
    const env = parseEnv(
      [
        '# comment',
        'export FOO=bar',
        'BAZ="quoted value"',
        "Q='single'",
        'bad line',
        '=nokey',
      ].join('\n'),
    );
    expect(env).toEqual({ FOO: 'bar', BAZ: 'quoted value', Q: 'single' });
  });

  it('drops invalid keys', () => {
    expect(parseEnv('1BAD=x\nGOOD=y')).toEqual({ GOOD: 'y' });
  });
});

describe('formatEnv / envFromStored round-trip', () => {
  it('round-trips through the stored JSON form', () => {
    const obj = { A: '1', B: 'two words' };
    const stored = JSON.stringify(obj);
    expect(envFromStored(stored)).toEqual(obj);
    expect(parseEnv(formatEnv(obj))).toEqual(obj);
  });

  it('envFromStored is safe on junk', () => {
    expect(envFromStored('not json')).toEqual({});
    expect(envFromStored(undefined)).toEqual({});
  });
});
