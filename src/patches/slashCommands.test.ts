import { describe, it, expect } from 'vitest';
import {
  findSlashCommandListEndPosition,
  writeSlashCommandDefinition,
} from './slashCommands';

describe('findSlashCommandListEndPosition', () => {
  // CC >=2.1.227: slash commands moved into per-command lazy modules and the
  // registry is a memoized builder — `builtinCommandTable??=NAME()` — whose
  // array (`return[...]`) holds bare identifier + spread references. The finder
  // requires >=30 top-level items with command metadata (name/description)
  // within the proximity window, so the fixture carries both.
  const builderIds = Array.from({ length: 30 }, (_, i) => `c${i}`).join(',');
  const builderShape =
    'let meta={name:"clear",description:"Clear the screen"};' +
    'function Pti(){let e=gf();return e.builtinCommandTable??=uQb(),e.builtinCommandTable}' +
    `function uQb(){return[${builderIds},...gT4?[gT4]:[],Z6o,Cea,...[]]}` +
    'function next(){}';

  it('finds the builtinCommandTable builder array end (CC >=2.1.227)', () => {
    const end = findSlashCommandListEndPosition(builderShape);
    expect(end).not.toBeNull();
    // The closing ] sits right before the builder function's closing }
    expect(builderShape.slice(end!, end! + 2)).toBe(']}');
  });

  it('inserts a command object before the builder array close', () => {
    const def = ',{type:"local",name:"clear-screen"}';
    const out = writeSlashCommandDefinition(builderShape, def);
    expect(out).not.toBeNull();
    expect(out).toContain('Z6o,Cea,...[],{type:"local",name:"clear-screen"}]');
  });

  // Pre-2.1.227 fallback: an inline arrow-return array of 30+ bare identifiers
  // near command metadata (name/description).
  it('falls back to the inline arrow-return array (older CC)', () => {
    const ids = Array.from({ length: 32 }, (_, i) => `C${i}`).join(',');
    const inlineShape =
      'let x=q(()=>[' +
      ids +
      `]);let meta={name:"clear",description:"..."};`;
    const end = findSlashCommandListEndPosition(inlineShape);
    expect(end).not.toBeNull();
    expect(inlineShape[end!]).toBe(']');
  });
});
