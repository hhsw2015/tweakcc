import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { applyAllCspPatches } from './index';

// 完整二进制交叉验证:
// - 从 pristine 2.1.201 binary 起
// - 用 TS 版 applyAllCspPatches 全应用
// - 与 Python patcher 完整输出 (/tmp/python-full-patched.bin) 字节比对

const PRISTINE = '/tmp/claude-original/package/claude';
const PY_FULL = '/tmp/python-full-patched.bin';

const sha256Buf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const hasFiles = existsSync(PRISTINE) && existsSync(PY_FULL);

describe.skipIf(!hasFiles)('csp: full binary cross-check', () => {
  it('TS-full-patched matches Python-full-patched byte-for-byte', () => {
    const pristine = readFileSync(PRISTINE, 'latin1');
    const pyFull = readFileSync(PY_FULL);

    const { output, applied, failed } = applyAllCspPatches(pristine);
    console.log(`TS applied: ${applied.length} patches: ${applied.join(',')}`);
    console.log(`TS failed:  ${failed.length}: ${failed.join(',')}`);

    const tsFull = Buffer.from(output, 'latin1');

    expect(tsFull.length).toBe(pyFull.length);
    const tsHash = sha256Buf(tsFull);
    const pyHash = sha256Buf(pyFull);
    if (tsHash !== pyHash) {
      // 找第一个 diff 位置便于调试
      const size = Math.min(tsFull.length, pyFull.length);
      let firstDiff = -1;
      for (let i = 0; i < size; i++) {
        if (tsFull[i] !== pyFull[i]) { firstDiff = i; break; }
      }
      if (firstDiff !== -1) {
        const ctx = 30;
        const from = Math.max(0, firstDiff - ctx);
        const to = Math.min(size, firstDiff + ctx);
        console.error(`First diff at offset ${firstDiff}`);
        console.error(`  py: ${pyFull.slice(from, to).toString('latin1').replace(/\n/g, '\\n')}`);
        console.error(`  ts: ${tsFull.slice(from, to).toString('latin1').replace(/\n/g, '\\n')}`);
      }
    }
    expect(tsHash).toBe(pyHash);
  }, 30000);
});
