import { describe, it, expect, vi } from 'vitest';
import { writeThinkingVisibility } from './thinkingVisibility';

// thinking-visibility removes the `if(!V&&!I)return null;` early return inside
// `case"thinking":` and forces `isTranscriptMode:` to `true`, so thinking
// blocks always render. FIXTURE mirrors the documented CC v2.1.18 shape:
//   case"thinking":{if(!D&&!H)return null; ... isTranscriptMode:D, ...}
const FIXTURE =
  'case"thinking":{if(!D&&!H)return null;let T=D&&!(!P||f===P),k;k=Y9.createElement(YW1,{addMargin:Y,param:q,isTranscriptMode:D,verbose:H,hideInTranscript:T});}rest';

// Older CC v2.0.50 shape: no `{` after the case, single-quote-free early return.
//   case"thinking":if(!V&&!I)return null; ... isTranscriptMode:V, ...
const FIXTURE_LEGACY =
  'case"thinking":if(!V&&!I)return null;return w3.createElement(Q$Q,{addMargin:B,param:A,isTranscriptMode:V,verbose:I});rest';

// CC 2.1.204 shape: the early return is brace-wrapped with no trailing semicolon
// (`{return null}`) and the element is a React-Compiler-memoized jsx() call.
//   case"thinking":{if(!cit&&!BY){return null}let xU;if(...)xU=Kd.jsx(Rer,{...isTranscriptMode:cit,...})...}
const FIXTURE_2_1_204 =
  'case"thinking":{if(!cit&&!BY){return null}let xU;if(ekt[32]!==ej||ekt[33]!==cit||ekt[34]!==XO||ekt[35]!==BY)xU=Kd.jsx(Rer,{addMargin:ej,param:XO,isTranscriptMode:cit,verbose:BY}),ekt[32]=ej;else xU=ekt[36];return xU}rest';

// CC 2.1.238 shape: the `case"thinking":` caller no longer gates visibility.
// Rendering moved into a memoized component that destructures
// `{...,isTranscriptMode:V,verbose:I}=props` and derives a single gate
// `let G=V||I;` driving `G?<full>:<collapsed>`. The empty-text guard
// `if(!txt){C=null;break}` must be preserved; only the gate is forced true.
const FIXTURE_2_1_238 =
  'function Fsn(JeM){let f9l=ADh.c(27),{param:XeM,addMargin:rIw,isTranscriptMode:vDh,verbose:TDh}=JeM,{thinking:wDh}=XeM,EDh=rIw===void 0?!1:rIw;if(f9l[0]!==EDh){let kDh=AD(wDh);if(!kDh){CDh=null;break bb0}let ZeM=vDh||TDh;_9l=ZeM?Mwe.jsx(Mg,{children:kDh.trim()}):Mwe.jsx(b,{children:kDh.trim().replace(/\\s+/g," ")})}}rest';

describe('writeThinkingVisibility', () => {
  it('removes the early return and forces isTranscriptMode:true (2.1.18 shape)', () => {
    const out = writeThinkingVisibility(FIXTURE);

    expect(out).not.toBeNull();
    // The if-return-null guard is gone...
    expect(out).not.toContain('if(!D&&!H)return null;');
    // ...and isTranscriptMode is now hardcoded true (not the old `D` variable).
    expect(out).toContain('isTranscriptMode:true,');
    expect(out).not.toContain('isTranscriptMode:D,');
    // Surrounding shape is preserved.
    expect(out).toContain('case"thinking":{');
    expect(out).toContain('verbose:H');
  });

  it('removes the brace-wrapped early return in the 2.1.204 jsx shape', () => {
    const out = writeThinkingVisibility(FIXTURE_2_1_204);

    expect(out).not.toBeNull();
    // The brace-wrapped guard `if(!cit&&!BY){return null}` is gone...
    expect(out).not.toContain('if(!cit&&!BY){return null}');
    expect(out).not.toContain('return null');
    // ...and isTranscriptMode is hardcoded true (not the `cit` variable).
    expect(out).toContain('isTranscriptMode:true,');
    expect(out).not.toContain('isTranscriptMode:cit,');
    // The memoized jsx() element and surrounding shape are preserved.
    expect(out).toContain('Kd.jsx(Rer,{addMargin:ej,param:XO');
    expect(out).toContain('verbose:BY');
  });

  it('handles the older 2.0.50 shape with no brace after the case', () => {
    const out = writeThinkingVisibility(FIXTURE_LEGACY);

    expect(out).not.toBeNull();
    expect(out).not.toContain('if(!V&&!I)return null;');
    expect(out).toContain('isTranscriptMode:true,');
    expect(out).not.toContain('isTranscriptMode:V,');
    expect(out).toContain('case"thinking":');
  });

  it('forces the derived visibility gate true in the 2.1.238 component shape', () => {
    const out = writeThinkingVisibility(FIXTURE_2_1_238);

    expect(out).not.toBeNull();
    // The derived gate `let ZeM=vDh||TDh;` is forced to `!0`...
    expect(out).not.toContain('let ZeM=vDh||TDh;');
    expect(out).toContain('let ZeM=!0;');
    // ...the empty-thinking-text guard is preserved (not a visibility gate)...
    expect(out).toContain('if(!kDh){CDh=null;break bb0}');
    // ...and both render branches survive.
    expect(out).toContain('Mwe.jsx(Mg,{children:kDh.trim()})');
    expect(out).toContain('kDh.trim().replace(/\\s+/g," ")');
  });

  it('is idempotent: already-natively-configured input is returned unchanged', () => {
    // CC >=2.1.87 ships with isTranscriptMode:true already in place; the native
    // check short-circuits and returns the file untouched.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const native =
      'case"thinking":{let T=D&&!(!P||f===P),k;k=Y9.createElement(YW1,{addMargin:Y,param:q,isTranscriptMode:true,verbose:H,hideInTranscript:T});}rest';
    const out = writeThinkingVisibility(native);
    expect(out).toBe(native);
    logSpy.mockRestore();
  });

  it('returns null (logging) when the thinking-visibility pattern is absent', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeThinkingVisibility('x=1;function y(){return null}')).toBeNull();
    errSpy.mockRestore();
  });
});
