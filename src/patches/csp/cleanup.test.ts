import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { cleanupOldVersions } from './cleanup';

describe('csp: cleanupOldVersions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csp-cleanup-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const touch = (name: string, size = 100): string => {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, 'x'.repeat(size));
    return p;
  };

  it('keeps current exe + current .pristine', () => {
    const current = touch('2.1.201');
    touch('2.1.201.pristine', 200);
    const deleted = cleanupOldVersions(current);
    expect(deleted).toHaveLength(0);
    expect(fs.existsSync(current)).toBe(true);
    expect(fs.existsSync(current + '.pristine')).toBe(true);
  });

  it('deletes CC official .bak (not pristine, not used)', () => {
    const current = touch('2.1.201');
    touch('2.1.201.bak', 200); // CC 官方 .bak, 语义是"上次 patched", 不是 pristine — 清
    touch('2.1.200.bak', 500);
    touch('2.1.195.bak', 300);
    const deleted = cleanupOldVersions(current);
    expect(deleted).toHaveLength(3);
    const deletedNames = deleted.map((d) => path.basename(d.path)).sort();
    expect(deletedNames).toEqual(['2.1.195.bak', '2.1.200.bak', '2.1.201.bak']);
  });

  it('deletes old binary versions + their pristines', () => {
    const current = touch('2.1.201', 1000);
    touch('2.1.201.pristine');
    touch('2.1.200', 800);
    touch('2.1.200.pristine', 400);
    touch('2.1.199', 700);
    const deleted = cleanupOldVersions(current);
    expect(deleted).toHaveLength(3);
    const totalSize = deleted.reduce((s, d) => s + d.size, 0);
    expect(totalSize).toBe(800 + 400 + 700);
  });

  it('deletes lock residue', () => {
    const current = touch('2.1.201');
    touch('2.1.201.locked-by-running');
    touch('2.1.200.locked-abc');
    const deleted = cleanupOldVersions(current);
    expect(deleted).toHaveLength(2);
  });

  it('handles nonexistent dir gracefully', () => {
    const deleted = cleanupOldVersions('/nonexistent/dir/claude');
    expect(deleted).toEqual([]);
  });

  it('reports total size correctly', () => {
    const current = touch('2.1.201');
    touch('2.1.200', 500);
    touch('2.1.199', 700);
    const deleted = cleanupOldVersions(current);
    const total = deleted.reduce((s, d) => s + d.size, 0);
    expect(total).toBe(1200);
  });
});
