import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeCyberRiskInstruction } from './cyberRiskInstruction';

// golden fixtures generated from Python patcher on pristine 2.1.201 binary
const goldenPath = join(__dirname, '..', 'fixtures', '2.1.201', 'golden.json');
const golden = JSON.parse(readFileSync(goldenPath, 'utf-8'));
const p1 = golden['1'];

describe('csp: cyberRiskInstruction (patch #1)', () => {
  it('has golden fixture', () => {
    expect(p1).toBeDefined();
    expect(p1.name).toBe('CYBER_RISK_INSTRUCTION');
    expect(p1.length).toBe(460);
  });

  it('neutralizes anchor+tail block to equal-length spaces', () => {
    const input = p1.context_before_utf8 as string;
    const expected = p1.context_after_utf8 as string;
    const output = writeCyberRiskInstruction(input);
    expect(output).not.toBeNull();
    expect(output).toBe(expected);
  });

  it('preserves total length', () => {
    const input = p1.context_before_utf8 as string;
    const output = writeCyberRiskInstruction(input);
    expect(output!.length).toBe(input.length);
  });

  it('is idempotent', () => {
    const input = p1.context_before_utf8 as string;
    const once = writeCyberRiskInstruction(input);
    const twice = writeCyberRiskInstruction(once!);
    // 第二次运行时 anchor 已消失(被空格覆盖),返回未修改的 input
    expect(twice).toBe(once);
  });

  it('returns input unchanged when anchor absent (upstream removed)', () => {
    const input = 'random content without the anchor';
    expect(writeCyberRiskInstruction(input)).toBe(input);
  });

  it('opening and closing quotes preserved', () => {
    const input = p1.context_before_utf8 as string;
    const output = writeCyberRiskInstruction(input)!;
    // anchor 起点必须仍是 "IMPORTANT: 的引号
    const anchorStart = '"IMPORTANT: Assist with authorized security testing';
    const idx = input.indexOf(anchorStart);
    expect(output[idx]).toBe('"');
    // 结尾引号 (tail=") 也应保留
    const tailIdx = input.indexOf('"', idx + anchorStart.length);
    expect(output[tailIdx]).toBe('"');
  });
});
