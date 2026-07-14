// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Patches the CLAUDE.md file reading function to also check for alternative
 * filenames (e.g., AGENTS.md) when CLAUDE.md doesn't exist.
 *
 * Supports two code patterns across CC versions:
 *
 * CC <=2.1.69 (sync): Function uses readFileSync/existsSync/statSync directly
 * CC >=2.1.83 (async): File reading is split into jh1 (async reader) and XB9 (processor)
 *   The async reader catches ENOENT/EISDIR errors and returns {info:null,includePaths:[]}
 */
export const writeAgentsMd = (
  file: string,
  altNames: string[]
): string | null => {
  // CC >= 2.1.87 ships alternative MD file support natively — detect and skip.
  if (/CLAUDE\.md.{0,100}for\(let \w+ of \["AGENTS\.md"/.test(file)) {
    console.log(
      'patch: agentsMd: alternative MD file support already present natively - skipping'
    );
    return file;
  }

  // Try the helper-based null-check reader first (CC >=2.1.196)
  const asyncV2 = writeAgentsMdAsyncNullCheck(file, altNames);
  if (asyncV2) return asyncV2;

  // Try the readFile/try-catch async pattern (CC 2.1.83..2.1.195)
  const asyncResult = writeAgentsMdAsync(file, altNames);
  if (asyncResult) return asyncResult;

  // Fall back to the old sync pattern (CC <=2.1.69)
  return writeAgentsMdSync(file, altNames);
};

// CC >=2.1.196: the async reader was refactored to a helper that returns null
// on failure instead of throwing. Shape:
//   async function Uca(e,t,n){try{let r=Vt(),o=await qN(r,e,Gao);
//     if(o===null)return C(`[CLAUDE.md] skipping ${e}: ...`),{info:null,includePaths:[]};
//     return mpp(o,e,t,n)}catch(r){return hpp(r,e),{info:null,includePaths:[]}}}
// The not-found path is now the `o===null` branch (not the catch), so the
// AGENTS.md reroute goes there.
const writeAgentsMdAsyncNullCheck = (
  file: string,
  altNames: string[]
): string | null => {
  // Two shapes seen:
  //   pre-2.1.209 (3-arg reader, immediate return in null branch):
  //     async function F(e,t,n){try{let r=X(),o=await Y(r,e,LIMIT);
  //       if(o===null)return C(`[CLAUDE.md] skipping ${e}: ...`),{info:null,includePaths:[]};
  //       return P(o,e,t,n)}catch(r){return H(r,e),{info:null,includePaths:[]}}}
  //   2.1.209+ (4-arg reader with directory-check callback, wrapped null-branch):
  //     async function F(e,t,r){try{let n=X(),o=!1,i=await Y(n,e,LIMIT,(s)=>{o=s.isDirectory()});
  //       if(i===null){if(C(`[CLAUDE.md] skipping ...`),!G&&!o)G=!0,Ve(...);return{info:null,includePaths:[]}}
  //       return P(i,e,t,r)}catch(n){return H(n,e),{info:null,includePaths:[]}}}
  // Two separate patterns keep backref numbering simple.
  const legacyPattern =
    /(async function ([$\w]+)\(([$\w]+),([$\w]+),([$\w]+))\)\{try\{let ([$\w]+)=([$\w]+)\(\),([$\w]+)=await ([$\w]+)\(\6,\3,([$\w]+)\);if\(\8===null\)return (([$\w]+)\(`\[CLAUDE\.md\] skipping[^`]*`\),\{info:null,includePaths:\[\]\});return ([$\w]+)\(\8,\3,\4,\5\)\}catch\(([$\w]+)\)\{return (([$\w]+)\(\14,\3\),\{info:null,includePaths:\[\]\})\}\}/;
  // 2.1.209+ shape. Backref indices:
  //   \1 header, \2 fn name, \3 e, \4 t, \5 r, \6 n (let var), \7 Kt,
  //   \8 o (isDir flag), \9 i (result), \10 Nq (reader), \11 f8i (limit),
  //   \12 callback param, \13 zdg (next fn), \14 catch param, \15 err handler
  const memoPattern =
    /(async function ([$\w]+)\(([$\w]+),([$\w]+),([$\w]+))\)\{try\{let ([$\w]+)=([$\w]+)\(\),([$\w]+)=!1,([$\w]+)=await ([$\w]+)\(\6,\3,([$\w]+),\(([$\w]+)\)=>\{\8=\12\.isDirectory\(\)\}\);if\(\9===null\)\{[\s\S]{0,300}?return\{info:null,includePaths:\[\]\}\}return ([$\w]+)\(\9,\3,\4,\5\)\}catch\(([$\w]+)\)\{return ([$\w]+)\(\14,\3\),\{info:null,includePaths:\[\]\}\}\}/;
  // 统一提取字段. 两个 shape 的 group 索引不同, 用一个包装函数把差异隐藏.
  interface AsyncNullCheckMatch {
    funcSig: string;
    funcName: string;
    pathParam: string;
    typeParam: string;
    thirdParam: string;
    ctxVar: string;
    ctxGetter: string;
    contentVar: string;
    reader: string;
    limitVar: string;
    skipReturn: string; // full null-branch body (return + expression)
    processor: string;
    catchVar: string;
    catchReturn: string; // catch body (return + expression)
    index: number;
    length: number;
  }

  const extract = (): AsyncNullCheckMatch | null => {
    const legacyMatch = file.match(legacyPattern);
    if (legacyMatch && legacyMatch.index !== undefined) {
      return {
        funcSig: legacyMatch[1],
        funcName: legacyMatch[2],
        pathParam: legacyMatch[3],
        typeParam: legacyMatch[4],
        thirdParam: legacyMatch[5],
        ctxVar: legacyMatch[6],
        ctxGetter: legacyMatch[7],
        contentVar: legacyMatch[8],
        reader: legacyMatch[9],
        limitVar: legacyMatch[10],
        skipReturn: legacyMatch[11],
        processor: legacyMatch[13],
        catchVar: legacyMatch[14],
        catchReturn: legacyMatch[15],
        index: legacyMatch.index,
        length: legacyMatch[0].length,
      };
    }
    const memoMatch = file.match(memoPattern);
    if (memoMatch && memoMatch.index !== undefined) {
      // 2.1.209 group indices:
      //   1 funcSig, 2 funcName, 3 e, 4 t, 5 r, 6 n(ctxVar),
      //   7 Kt(ctxGetter), 8 o(isDir), 9 i(contentVar),
      //   10 Nq(reader), 11 f8i(limitVar), 12 callback param,
      //   13 zdg(processor), 14 catch var, 15 err handler fn
      // null-branch has extra sad-path logic — replicate a no-op sad path.
      return {
        funcSig: memoMatch[1],
        funcName: memoMatch[2],
        pathParam: memoMatch[3],
        typeParam: memoMatch[4],
        thirdParam: memoMatch[5],
        ctxVar: memoMatch[6],
        ctxGetter: memoMatch[7],
        contentVar: memoMatch[9],
        reader: memoMatch[10],
        limitVar: memoMatch[11],
        skipReturn: `{info:null,includePaths:[]}`,
        processor: memoMatch[13],
        catchVar: memoMatch[14],
        catchReturn: `${memoMatch[15]}(${memoMatch[14]},${memoMatch[3]}),{info:null,includePaths:[]}`,
        index: memoMatch.index,
        length: memoMatch[0].length,
      };
    }
    return null;
  };

  const parsed = extract();
  if (!parsed) return null;

  const {
    funcSig,
    funcName,
    pathParam,
    typeParam,
    thirdParam,
    ctxVar,
    ctxGetter,
    contentVar,
    reader,
    limitVar,
    skipReturn,
    processor,
    catchVar,
    catchReturn,
  } = parsed;

  const altNamesJson = JSON.stringify(altNames);

  // `rerouteResult` (not `r`) — the try block already declares `${ctxVar}` (r).
  const replacement =
    `${funcSig},didReroute){try{let ${ctxVar}=${ctxGetter}(),${contentVar}=await ${reader}(${ctxVar},${pathParam},${limitVar});` +
    `if(${contentVar}===null){` +
    `if(!didReroute&&(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){` +
    `for(let alt of ${altNamesJson}){let altPath=${pathParam}.slice(0,-9)+alt;` +
    `try{let rerouteResult=await ${funcName}(altPath,${typeParam},${thirdParam},true);if(rerouteResult.info)return rerouteResult}catch{}}}` +
    `return ${skipReturn};}` +
    `return ${processor}(${contentVar},${pathParam},${typeParam},${thirdParam})}catch(${catchVar}){return ${catchReturn}}}`;

  const startIndex = parsed.index;
  const endIndex = startIndex + parsed.length;
  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

const writeAgentsMdAsync = (
  file: string,
  altNames: string[]
): string | null => {
  // Match the async reader function that:
  // 1. Contains readFile (async)
  // 2. Has a catch block that calls a function with error code checks (ENOENT/EISDIR)
  // 3. Returns {info:null,includePaths:[]}
  const funcPattern =
    /(async function ([$\w]+)\(([$\w]+),([$\w]+),([$\w]+))\)\{try\{let ([$\w]+)=await ([$\w]+)\(\)\.readFile\(\3,\{encoding:"utf-8"\}\);return ([$\w]+)\(\6,\3,\4,\5\)\}catch\(([$\w]+)\)\{return ([$\w]+)\(\9,\3\),\{info:null,includePaths:\[\]\}\}\}/;

  const funcMatch = file.match(funcPattern);
  if (!funcMatch || funcMatch.index === undefined) {
    return null;
  }

  const fullMatch = funcMatch[0];
  const funcSig = funcMatch[1]; // async function NAME(A,q,K
  const funcName = funcMatch[2]; // jh1
  const pathParam = funcMatch[3]; // A
  const typeParam = funcMatch[4]; // q
  const thirdParam = funcMatch[5]; // K
  const readVar = funcMatch[6]; // z
  const fsGetter = funcMatch[7]; // j8
  const processorFunc = funcMatch[8]; // XB9
  const catchVar = funcMatch[9]; // _
  const errorHandler = funcMatch[10]; // DB9

  const altNamesJson = JSON.stringify(altNames);

  const replacement =
    `${funcSig},didReroute){try{let ${readVar}=await ${fsGetter}().readFile(${pathParam},{encoding:"utf-8"});return ${processorFunc}(${readVar},${pathParam},${typeParam},${thirdParam})}catch(${catchVar}){` +
    `if(!didReroute&&(${pathParam}.endsWith("/CLAUDE.md")||${pathParam}.endsWith("\\\\CLAUDE.md"))){` +
    `for(let alt of ${altNamesJson}){` +
    `let altPath=${pathParam}.slice(0,-9)+alt;` +
    `try{let r=await ${funcName}(altPath,${typeParam},${thirdParam},true);if(r.info)return r}catch{}` +
    `}}` +
    `return ${errorHandler}(${catchVar},${pathParam}),{info:null,includePaths:[]}}}`;

  const startIndex = funcMatch.index;
  const endIndex = startIndex + fullMatch.length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);

  return newFile;
};

const writeAgentsMdSync = (file: string, altNames: string[]): string | null => {
  const funcPattern =
    /(function ([$\w]+)\(([$\w]+),([^)]+?))\)(?:.|\n){0,500}Skipping non-text file in @include/;

  const funcMatch = file.match(funcPattern);
  if (!funcMatch || funcMatch.index === undefined) {
    console.error('patch: agentsMd: failed to find CLAUDE.md reading function');
    return null;
  }
  const upToFuncParamsClosingParen = funcMatch[1];
  const functionName = funcMatch[2];
  const firstParam = funcMatch[3];
  const restParams = funcMatch[4];
  const funcStart = funcMatch.index;

  const fsPattern = /([$\w]+(?:\(\))?)\.(?:readFileSync|existsSync|statSync)/;
  const fsMatch = funcMatch[0].match(fsPattern);
  let callerFsMatch: RegExpMatchArray | null = null;
  if (!fsMatch) {
    // Try the caller function for fs expression
    const callerSearch = file.slice(Math.max(0, funcStart - 5000), funcStart);
    callerFsMatch = callerSearch.match(fsPattern);
    if (!callerFsMatch) {
      console.error(
        'patch: agentsMd: failed to find fs expression in function or caller'
      );
      return null;
    }
  }

  const fsExpr = fsMatch
    ? fsMatch[1]
    : callerFsMatch
      ? callerFsMatch[1]
      : 'require("fs")';

  const altNamesJson = JSON.stringify(altNames);

  const sigIndex = funcStart + upToFuncParamsClosingParen.length;
  let newFile = file.slice(0, sigIndex) + ',didReroute' + file.slice(sigIndex);

  showDiff(file, newFile, ',didReroute', sigIndex, sigIndex);

  const funcBody = newFile.slice(funcStart);

  const oldEarlyReturnPattern = /\.isFile\(\)\)return null/;
  const newEarlyReturnPattern = /==="EISDIR"\)return null/;

  const earlyReturnMatch =
    funcBody.match(oldEarlyReturnPattern) ??
    funcBody.match(newEarlyReturnPattern);

  if (!earlyReturnMatch || earlyReturnMatch.index === undefined) {
    console.error(
      'patch: agentsMd: failed to find early return null for injection'
    );
    return null;
  }

  const isNewPattern = !funcBody.match(oldEarlyReturnPattern);

  const fallback = `if(!didReroute&&(${firstParam}.endsWith("/CLAUDE.md")||${firstParam}.endsWith("\\\\CLAUDE.md"))){for(let alt of ${altNamesJson}){let altPath=${firstParam}.slice(0,-9)+alt;if(${fsExpr}.existsSync(altPath)&&${fsExpr}.statSync(altPath).isFile())return ${functionName}(altPath,${restParams},true);}}`;

  const earlyReturnStart = funcStart + earlyReturnMatch.index;
  const oldStr = earlyReturnMatch[0];
  const newStr = isNewPattern
    ? `==="EISDIR"){${fallback}return null;}`
    : `.isFile()){${fallback}return null;}`;

  newFile =
    newFile.slice(0, earlyReturnStart) +
    newStr +
    newFile.slice(earlyReturnStart + oldStr.length);

  showDiff(file, newFile, newStr, earlyReturnStart, earlyReturnStart);

  return newFile;
};
