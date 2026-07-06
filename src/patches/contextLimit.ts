// Please see the note about writing patches in ./index

const OVERRIDE = '(+process.env.CLAUDE_CODE_CONTEXT_LIMIT||200000)';

// String.replace treats `$$` in the replacement string as an escape for a
// single `$`. When minified identifiers like `$$t` are spliced in via
// backrefs, the `$$` collapses to `$` and the variable name changes — every
// other reference then points to an undefined name. Escape by doubling every
// `$` in captured identifiers before inlining them.
const esc = (s: string): string => s.replace(/\$/g, '$$$$');

export const writeContextLimit = (oldFile: string): string | null => {
  // CC >= ~2.1.18x split the single 200000 context-limit constant into TWO
  // adjacent ones: `var fkt=200000,KQ=200000,Akt=20000,MWu=32000,NWu=128000;`.
  //   - the 2nd (`KQ`) is the context window — used as `configured: KQ,
  //     source: "model-default"` and in the `vti(...) > KQ` exceeds-check;
  //   - the 1st (`fkt`) is the per-model token limit feeding `o = floor(fkt*n)`,
  //     and the effective window is `min(o, KQ)`.
  // Because the window is `min(o-from-fkt, KQ)`, RAISING the limit requires
  // overriding BOTH (overriding only one leaves the window capped by the other).
  // Env-unset → both stay 200000 → identical to stock CC.
  const patternTwo =
    /var ([\w$]+)=200000,([\w$]+)=200000,([\w$]+)=20000,([\w$]+)=32000,([\w$]+)=(128000|64000);/;
  const matchTwo = oldFile.match(patternTwo);
  if (matchTwo) {
    return oldFile.replace(
      patternTwo,
      `var ${esc(matchTwo[1])}=${OVERRIDE},${esc(matchTwo[2])}=${OVERRIDE},${esc(matchTwo[3])}=20000,${esc(matchTwo[4])}=32000,${esc(matchTwo[5])}=${matchTwo[6]};`
    );
  }

  // Older CC (a single 200000 constant): keep the original behavior.
  const patternOne =
    /var ([\w$]+)=200000,([\w$]+)=20000,([\w$]+)=32000,([\w$]+)=(128000|64000);/;
  const matchOne = oldFile.match(patternOne);
  if (matchOne) {
    return oldFile.replace(
      patternOne,
      `var ${esc(matchOne[1])}=${OVERRIDE},${esc(matchOne[2])}=20000,${esc(matchOne[3])}=32000,${esc(matchOne[4])}=${matchOne[5]};`
    );
  }

  // CC 2.1.201: the 20000 constant was removed from the block.
  // Actual shape: `var X=200000,Y=200000,Z=32000,W=128000;` (no 20000)
  const patternTwoNoLower =
    /var ([\w$]+)=200000,([\w$]+)=200000,([\w$]+)=32000,([\w$]+)=(128000|64000);/;
  const matchTwoNoLower = oldFile.match(patternTwoNoLower);
  if (matchTwoNoLower) {
    return oldFile.replace(
      patternTwoNoLower,
      `var ${esc(matchTwoNoLower[1])}=${OVERRIDE},${esc(matchTwoNoLower[2])}=${OVERRIDE},${esc(matchTwoNoLower[3])}=32000,${esc(matchTwoNoLower[4])}=${matchTwoNoLower[5]};`
    );
  }

  // Idempotent: if patched already, treat as no-op
  if (oldFile.includes('CLAUDE_CODE_CONTEXT_LIMIT')) {
    return oldFile;
  }

  console.error('patch: contextLimit: failed to find context limit constants');
  return null;
};
