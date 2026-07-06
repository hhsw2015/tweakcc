// 嵌入式 fixture 测试 — 保证 CI 上跑得起来 (不依赖 /tmp/claude-original/)
// 用一个 ~2.8KB 的 pristine binary 窗口验证 patch 1 的字节等价性
//
// 如果全 binary fixture 缺失 (fullCrossCheck.test.ts 会 skip), 至少这个 test 跑,
// 保证 patch 1 逻辑的核心不变.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeCyberRiskInstruction } from './cyberRiskInstruction';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures-mini.json'), 'utf-8')
);

// hex 字符串 -> latin1 string (每字节独立字符)
const hexToLatin1 = (hex: string): string => {
  const bytes = Buffer.from(hex, 'hex');
  return bytes.toString('latin1');
};

describe('csp: embedded fixture (no external binary needed)', () => {
  it('patch #1 on embedded pristine window matches expected patched output', () => {
    const pristine = hexToLatin1(fixture.pristine_window_hex);
    const expected = hexToLatin1(fixture.patched_window_hex);
    const output = writeCyberRiskInstruction(pristine);
    expect(output).not.toBeNull();
    expect(output!.length).toBe(pristine.length);
    // 完整字节相等
    expect(output).toBe(expected);
  });

  it('embedded fixture is well-formed', () => {
    expect(fixture.anchor).toBe(
      '"IMPORTANT: Assist with authorized security testing'
    );
    expect(fixture.tail).toBe('"');
    expect(fixture.window_length).toBeGreaterThan(0);
    expect(fixture.pristine_window_hex.length).toBe(fixture.window_length * 2);
  });
});
