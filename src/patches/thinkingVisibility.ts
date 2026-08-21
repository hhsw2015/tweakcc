// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * CC v2.0.50
 * ```diff
 *  case "thinking":
 * -  if (!V && !I) return null;
 *    return w3.createElement(Q$Q, {
 *      addMargin: B,
 *      param: A,
 * -    isTranscriptMode: V,
 * +    isTranscriptMode: true,
 *      verbose: I,
 *    });
 * ```
 *
 * CC v2.1.18
 * ```diff
 *  case "thinking": {
 * -  if (!D && !H) return null;
 *    let T = D && !(!P || f === P),
 *      k;
 *    if (K[22] !== Y || K[23] !== D || K[24] !== q || K[25] !== T || K[26] !== H)
 *      k = Y9.createElement(YW1, {
 *        addMargin: Y,
 *        param: q,
 * -      isTranscriptMode: D,
 * +      isTranscriptMode: true,
 *        verbose: H,
 *        hideInTranscript: T,
 *      });
 *  }
 * ```
 */

export const writeThinkingVisibility = (oldFile: string): string | null => {
  // CC ≥ 2.1.87 ships with thinking blocks always visible — skip if already configured.
  const nativeCheck =
    /case"thinking":\{(?:(?!case")[^]){0,600}isTranscriptMode:true/;
  if (nativeCheck.test(oldFile)) {
    console.log(
      'patch: thinkingVisibility: already configured natively — skipping'
    );
    return oldFile;
  }

  // Unified pattern that matches all three formats:
  // - Group 1: `case"thinking":` (+/- `{`)
  // - Group 2: the early return we want to remove.
  //   pre-2.1.18:  `if(!V&&!I)return null;`
  //   2.1.18+:     `if(!D&&!H)return null;` (case body wrapped in `{}`)
  //   2.1.204+:    `if(!cit&&!BY){return null}` (braces, no trailing semicolon)
  //   Anchored on the two negated vars so the lazy body can't span to an
  //   unrelated `return null` (e.g. the separate `case"thinking":` spinner-icon
  //   block that has no early return).
  // - Group 3: Everything from `{` or return up to `isTranscriptMode:`
  // - Then the variable name followed by comma (replaced with `true,`)
  const pattern =
    /(case"thinking":\{?)(if\(![$\w]+&&![$\w]+\)\{?return null\}?;?)(.{0,400}isTranscriptMode:).+?,/;

  const match = oldFile.match(pattern);

  if (match && match.index !== undefined) {
    // Replacement: skip match[2] (removes the if-return-null), set isTranscriptMode to true
    const replacement = match[1] + match[3] + 'true,';

    const startIndex = match.index;
    const endIndex = startIndex + match[0].length;

    const newFile =
      oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

    showDiff(oldFile, newFile, replacement, startIndex, endIndex);

    return newFile;
  }

  // CC 2.1.238+: the `case"thinking":` caller no longer decides visibility.
  // Rendering moved into a React-Compiler-memoized component that destructures
  // `{...,isTranscriptMode:V,verbose:I}=props` and derives a single gate:
  //   let G=V||I;  ... _=G?<full multi-line>:<collapsed single-line>
  // (`if(!txt){C=null;break}` above it only nulls when there is no thinking
  // text — that must stay.) Force the gate true so thinking always renders in
  // full/expanded form, matching the old `isTranscriptMode:true` intent.
  // Anchored on the isTranscriptMode/verbose destructure names so the generic
  // `let X=Y||Z;` can only bind to those two.
  const gatePattern =
    /isTranscriptMode:([$\w]+),verbose:([$\w]+)\}=[$\w]+,[\s\S]{0,600}?let ([$\w]+)=\1\|\|\2;/;
  const gateMatch = oldFile.match(gatePattern);

  if (gateMatch && gateMatch.index !== undefined) {
    // Replace only the `=V||I` initializer with `=!0`, keeping the surrounding
    // destructure/body untouched.
    const gateVar = gateMatch[3];
    const original = gateMatch[0];
    const replaced = original.replace(
      new RegExp(`let ${gateVar}=${gateMatch[1]}\\|\\|${gateMatch[2]};$`),
      `let ${gateVar}=!0;`
    );

    const startIndex = gateMatch.index;
    const endIndex = startIndex + original.length;

    const newFile =
      oldFile.slice(0, startIndex) + replaced + oldFile.slice(endIndex);

    showDiff(oldFile, newFile, replaced, startIndex, endIndex);

    return newFile;
  }

  console.error(
    'patch: thinkingVisibility: failed to find thinking visibility pattern'
  );
  return null;
};
