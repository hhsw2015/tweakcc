import { describe, expect, it } from 'vitest';
import { writeScrubMetadata } from './specialPatches';

const PRISTINE_ORIG =
  'let r={...e,device_id:Hj(),account_uuid:it(Ie.CLAUDE_CODE_REMOTE)&&Ie.CLAUDE_CODE_ACCOUNT_UUID||Cc()?.accountUuid||"",session_id:Pt()};return{user_id:De(r)}';

const wrap = (inner: string): string =>
  `xxx head noise ${inner} yyy tail noise`;

describe('csp #26: scrubMetadata (pMe)', () => {
  it('neutralizes device_id + account_uuid, keeps session_id, equal length', () => {
    const input = wrap(PRISTINE_ORIG);
    const output = writeScrubMetadata(input);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(input.length);
    expect(output).toContain('session_id:Pt()');
    expect(output).toContain('user_id:De(r)');
    expect(output).not.toContain('device_id:Hj()');
    expect(output).not.toContain('account_uuid:');
    expect(output).not.toContain('CLAUDE_CODE_ACCOUNT_UUID');
  });

  it('preserves head/tail bytes exactly', () => {
    const input = wrap(PRISTINE_ORIG);
    const output = writeScrubMetadata(input)!;
    expect(output.startsWith('xxx head noise ')).toBe(true);
    expect(output.endsWith(' yyy tail noise')).toBe(true);
  });

  it('is idempotent (already-patched → no more matches)', () => {
    const input = wrap(PRISTINE_ORIG);
    const once = writeScrubMetadata(input)!;
    const twice = writeScrubMetadata(once);
    expect(twice).toBeNull();
  });

  it('returns null when anchor absent', () => {
    expect(writeScrubMetadata('random content')).toBeNull();
  });

  it('accepts arbitrary minified identifier names (incl. it/Ie renamed)', () => {
    const alt = PRISTINE_ORIG.replace(/\br=/g, 'z=')
      .replace(/\.{3}e,/g, '...q,')
      .replace(/Hj\(\)/g, 'a1()')
      .replace(/Cc\(\)/g, 'b2()')
      .replace(/Pt\(\)/g, 'c3()')
      .replace(/De\(/g, 'd4(')
      .replace(/account_uuid:it\(/g, 'account_uuid:x9(')
      .replace(/Ie\.CLAUDE_CODE/g, 'y8.CLAUDE_CODE')
      .replace('user_id:d4(r)', 'user_id:d4(z)');
    const input = wrap(alt);
    const output = writeScrubMetadata(input);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(input.length);
    expect(output).toContain('session_id:c3()');
    expect(output).toContain('user_id:d4(z)');
  });
});
