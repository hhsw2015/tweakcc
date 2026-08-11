import { describe, expect, it } from 'vitest';
import { writeForceV0True } from './specialPatches';

// CC 2.1.227 shape: the available/defaultOn source moved from a plain function
// call `X()` to a method call `Rhs.resolve()` (main gate) and
// `Rhs.resolve().available` (short-chain gate).
const MAIN_227 =
  'function vx(){if(rhr())return!1;if(!Tbo())return!1;let{available:e,defaultOn:t}=Rhs.resolve();if(!e)return!1;return H4()?.settings.enableWorkflows??t}';
const SHORT_227 =
  'function jin(){return Tbo()&&!br(process.env.CLAUDE_CODE_DISABLE_WORKFLOWS)&&Rhs.resolve().available}';

// Pre-2.1.227 shape: bare function calls.
const MAIN_LEGACY =
  'function KA(){if(a())return!1;if(!b())return!1;let{available:X,defaultOn:Y}=c();if(!X)return!1;return d()??Y}';
const SHORT_LEGACY =
  'function RNr(){return b()&&!z(process.env.CLAUDE_CODE_DISABLE_WORKFLOWS)&&c().available}';

const wrap = (inner: string): string => `head noise;${inner};tail noise`;

describe('csp #16: forceV0True (workflow gates)', () => {
  it('neutralizes the 2.1.227 method-call main + short-chain gates', () => {
    const input = wrap(MAIN_227 + SHORT_227);
    const output = writeForceV0True(input);
    expect(output).not.toBeNull();
    expect(output).toContain('function vx(){return!0');
    expect(output).toContain('function jin(){return!0');
    // Neither gate should keep its original conditional body.
    expect(output).not.toContain('Rhs.resolve().available}');
    expect(output).not.toContain('if(!e)return!1');
  });

  it('still handles the legacy bare-call gates', () => {
    const input = wrap(MAIN_LEGACY + SHORT_LEGACY);
    const output = writeForceV0True(input);
    expect(output).not.toBeNull();
    expect(output).toContain('function KA(){return!0');
    expect(output).toContain('function RNr(){return!0');
  });

  it('is idempotent (already-neutralized → no more matches)', () => {
    const input = wrap(MAIN_227 + SHORT_227);
    const once = writeForceV0True(input)!;
    const twice = writeForceV0True(once);
    expect(twice).toBeNull();
  });

  it('returns null when no gate is present', () => {
    expect(writeForceV0True('unrelated content')).toBeNull();
  });
});
