// Utilities for working with slash commands in Claude Code

import { showDiff } from './index';

/**
 * Walk forward from an opening '[' counting top-level items.
 * Returns the position of the matching ']' and the item count, or null if
 * the array isn't well-formed (EOF reached). Handles strings, nested brackets,
 * parens, braces, and template literals.
 */
const analyzeArrayFromOpenBracket = (
  fileContents: string,
  openBracketIndex: number
): { itemCount: number; closingBracket: number } | null => {
  let depth = 1;
  let i = openBracketIndex + 1;
  let itemCount = 0;
  let inItem = false;
  let inString: string | null = null;
  let escape = false;

  while (i < fileContents.length) {
    const c = fileContents[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === inString) {
        inString = null;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      inItem = true;
    } else if (c === '[' || c === '(' || c === '{') {
      depth++;
      inItem = true;
    } else if (c === ']') {
      if (depth === 1) {
        if (inItem) itemCount++;
        return { itemCount, closingBracket: i };
      }
      depth--;
    } else if (c === ')' || c === '}') {
      depth--;
    } else if (c === ',' && depth === 1) {
      if (inItem) itemCount++;
      inItem = false;
    } else if (!/\s/.test(c)) {
      inItem = true;
    }
    i++;
  }
  return null;
};

/**
 * CC 2.1.227+ builds the slash command list by memoizing a builder function
 * into `builtinCommandTable`:
 *   function Pti(){let e=gf();return e.builtinCommandTable??=uQb(),e.builtinCommandTable}
 *   function uQb(){return[sGu,V...,...gT4?[gT4]:[],...,C$p,...[]]}
 * The command definitions themselves moved into per-command lazy modules
 * (`var xnp=v(()=>{fmb={type:"local",name:"clear",...}})`), so the builder's
 * array holds bare identifier + spread references rather than inline objects —
 * the old "name/description within 12KB of the array" anchor no longer holds.
 * Anchor on `builtinCommandTable??=NAME()` instead, then size NAME's returned
 * array. Inserting an inline command object beside the bare refs is still valid:
 * CC iterates the array treating each element as a command object.
 */
const findViaBuiltinCommandTable = (fileContents: string): number | null => {
  const anchor = /builtinCommandTable\s*\?\?=\s*([$\w]+)\(\)/;
  const anchorMatch = fileContents.match(anchor);
  if (!anchorMatch) return null;

  const builderName = anchorMatch[1];
  const builderPattern = new RegExp(
    `function ${builderName.replace(/\$/g, '\\$')}\\(\\)\\{return\\[`
  );
  const builderMatch = fileContents.match(builderPattern);
  if (!builderMatch || builderMatch.index === undefined) return null;

  const bracketIndex = builderMatch.index + builderMatch[0].length - 1;
  const info = analyzeArrayFromOpenBracket(fileContents, bracketIndex);
  return info ? info.closingBracket : null;
};

/**
 * Find the end position of the slash command array using stack machine.
 *
 * Tries the CC 2.1.227+ `builtinCommandTable` builder first, then falls back to
 * the pre-2.1.227 inline-array form: plain `=>[ID,ID,...]` with 30+ bare
 * identifiers (2.1.138+ mixes in spread operators for conditional commands,
 * e.g. `=L8(()=>[AUK,pL4,...gT4?[gT4]:[],...,W94(),...])`). The fallback
 * candidate must sit near command metadata (name/description) so unrelated
 * large arrow-return arrays are rejected.
 */
export const findSlashCommandListEndPosition = (
  fileContents: string
): number | null => {
  const viaTable = findViaBuiltinCommandTable(fileContents);
  if (viaTable !== null) return viaTable;

  // Walk every `=>[` candidate. The slash command array is the (only) array
  // following an arrow-return that contains >= 30 top-level items.
  const arrowPattern = /=>\s*\[/g;
  let m: RegExpExecArray | null;
  let best: { closing: number; items: number } | null = null;
  while ((m = arrowPattern.exec(fileContents)) !== null) {
    const bracketIndex = m.index + m[0].length - 1; // position of '['
    const anchorWindow = fileContents.slice(
      Math.max(0, m.index - 12000),
      Math.min(fileContents.length, m.index + 12000)
    );
    if (!/name:"[^"]+"[\s\S]{0,1200}description:/.test(anchorWindow)) {
      continue;
    }
    const info = analyzeArrayFromOpenBracket(fileContents, bracketIndex);
    if (info && info.itemCount >= 30) {
      if (!best || info.itemCount > best.items) {
        best = { closing: info.closingBracket, items: info.itemCount };
      }
    }
  }

  if (best) return best.closing;

  console.error(
    'patch: findSlashCommandListEndPosition: failed to find arrayStartPattern'
  );
  return null;
};

/**
 * Generic function to write a slash command definition
 */
export const writeSlashCommandDefinition = (
  oldFile: string,
  commandDef: string
): string | null => {
  const arrayEnd = findSlashCommandListEndPosition(oldFile);
  if (arrayEnd === null) {
    console.error(
      'patch: writeSlashCommandDefinition: failed to find slash command array end position'
    );
    return null;
  }

  // Insert before the closing ']'
  const newFile =
    oldFile.slice(0, arrayEnd) + commandDef + oldFile.slice(arrayEnd);

  showDiff(oldFile, newFile, commandDef, arrayEnd, arrayEnd);

  return newFile;
};
