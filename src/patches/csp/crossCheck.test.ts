import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { writeCyberRiskInstruction } from './cyberRiskInstruction';

// 交叉验证 TS 移植版 vs Python patcher 输出 (字节级 sha256 相等)
//
// Python patcher 只应用 patch #1 到 pristine binary 后, 存到 /tmp/python-patch1-out.bin
// 我们应用 TS 版 patch #1 到 pristine binary, 输出必须字节相等

const PRISTINE = '/tmp/claude-original/package/claude';
const PY_OUT = '/tmp/python-patch1-out.bin';

const sha256Bin = (bytes: Buffer): string =>
  createHash('sha256').update(bytes).digest('hex');

const skipIfNoBins = existsSync(PRISTINE) && existsSync(PY_OUT);

describe.skipIf(!skipIfNoBins)('csp: cyberRiskInstruction cross-check binary', () => {
  it('TS output matches Python output byte-for-byte', () => {
    // 用 latin1 读, 保证字节级往返
    const pristine = readFileSync(PRISTINE, 'latin1');
    const pyOut = readFileSync(PY_OUT);

    const tsOutStr = writeCyberRiskInstruction(pristine);
    expect(tsOutStr).not.toBeNull();

    const tsOut = Buffer.from(tsOutStr!, 'latin1');

    // 长度必须一致
    expect(tsOut.length).toBe(pyOut.length);

    // 字节相等
    const tsHash = sha256Bin(tsOut);
    const pyHash = sha256Bin(pyOut);
    expect(tsHash).toBe(pyHash);
  });
});
