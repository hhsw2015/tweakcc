import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  CMD_PATCHED_TEMPLATE,
  PS1_PATCHED_TEMPLATE,
  shimIsPatched,
  patchShim,
  revertShim,
} from './shim';

describe('csp: Windows npm shim', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-shim-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const write = (name: string, content: string): void => {
    fs.writeFileSync(path.join(tmpDir, name), content);
  };

  it('templates contain override.md conditional injection', () => {
    expect(CMD_PATCHED_TEMPLATE).toContain('override.md');
    expect(CMD_PATCHED_TEMPLATE).toContain('--append-system-prompt-file');
    expect(PS1_PATCHED_TEMPLATE).toContain('override.md');
    expect(PS1_PATCHED_TEMPLATE).toContain('--append-system-prompt-file');
  });

  it('shimIsPatched detects patched marker', () => {
    write('claude.cmd', '@ECHO off\nclaude.exe %*\n');
    expect(shimIsPatched(path.join(tmpDir, 'claude.cmd'))).toBe(false);
    write('claude.cmd', CMD_PATCHED_TEMPLATE);
    expect(shimIsPatched(path.join(tmpDir, 'claude.cmd'))).toBe(true);
  });

  it('patchShim patches cmd + ps1 and creates .orig backup', () => {
    write('claude.cmd', '@ECHO off\noriginal.exe %*\n');
    write('claude.ps1', '# original ps1\n$claudeExe = "orig"');
    const r = patchShim(tmpDir);
    expect(r['claude.cmd']).toBe('patched');
    expect(r['claude.ps1']).toBe('patched');
    expect(fs.existsSync(path.join(tmpDir, 'claude.cmd.orig'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'claude.ps1.orig'))).toBe(true);
    const cmd = fs.readFileSync(path.join(tmpDir, 'claude.cmd'), 'utf-8');
    expect(cmd).toContain('override.md');
  });

  it('patchShim is idempotent (marks already_patched)', () => {
    write('claude.cmd', '@ECHO off\noriginal.exe %*\n');
    patchShim(tmpDir);
    const r = patchShim(tmpDir);
    expect(r['claude.cmd']).toBe('already_patched');
  });

  it('patchShim marks missing when shim not present', () => {
    const r = patchShim(tmpDir);
    expect(r['claude.cmd']).toBe('missing');
    expect(r['claude.ps1']).toBe('missing');
  });

  it('revertShim restores from .orig backup', () => {
    write('claude.cmd', '@ECHO off\noriginal.exe %*\n');
    write('claude.ps1', 'original\n');
    patchShim(tmpDir);
    expect(fs.readFileSync(path.join(tmpDir, 'claude.cmd'), 'utf-8')).toContain(
      'override.md'
    );
    revertShim(tmpDir);
    expect(fs.readFileSync(path.join(tmpDir, 'claude.cmd'), 'utf-8')).toBe(
      '@ECHO off\noriginal.exe %*\n'
    );
    // .orig should be removed after revert
    expect(fs.existsSync(path.join(tmpDir, 'claude.cmd.orig'))).toBe(false);
  });
});
