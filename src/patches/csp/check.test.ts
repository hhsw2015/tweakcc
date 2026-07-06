import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { CSP_PATCH_META, cspCheck, summarize, formatTable } from './check';

describe('csp: check status semantics', () => {
  it('meta covers 24 non-obsolete + obsolete entries', () => {
    expect(CSP_PATCH_META).toHaveLength(24); // 25 minus patch 13 (danger_table_skip 跟随 12)
    const obsoleteIds = CSP_PATCH_META.filter((m) => m.obsolete).map((m) => m.id);
    expect(obsoleteIds.sort()).toEqual([12, 19, 20, 21]);
  });

  it('empty file → all obsolete or already_applied', () => {
    const rows = cspCheck('');
    expect(rows).toHaveLength(24);
    // 空文件里 anchor 都找不到 (hits=0), meta obsolete 显示 obsolete, 其余显示 already_applied
    const obsolete = rows.filter((r) => r.state === 'obsolete');
    expect(obsolete.map((r) => r.id).sort()).toEqual([12, 19, 20, 21]);
  });

  it('summarize returns counts', () => {
    const rows = cspCheck('');
    const s = summarize(rows);
    expect(s.total).toBe(24);
    expect(s.applicable + s.alreadyApplied + s.obsolete + s.broken).toBe(24);
  });

  it('formatTable produces multi-line output with header', () => {
    const rows = cspCheck('');
    const out = formatTable(rows);
    expect(out).toContain('#');
    expect(out).toContain('层');
    expect(out).toContain('名称');
    expect(out.split('\n').length).toBeGreaterThan(20);
  });
});

// 只在 pristine binary 存在时跑
const PRISTINE = process.env.CSP_PRISTINE_BIN ?? '/tmp/claude-original/package/claude';

describe.skipIf(!existsSync(PRISTINE))('csp: check on pristine binary', () => {
  it('all 20 active patches show as applicable on pristine binary', () => {
    const data = readFileSync(PRISTINE, 'latin1');
    const rows = cspCheck(data);
    const s = summarize(rows);
    // Pristine binary: 20 active patches applicable + 4 obsolete
    expect(s.applicable).toBe(20);
    expect(s.obsolete).toBe(4);
    expect(s.alreadyApplied + s.broken).toBe(0);
  });
});
