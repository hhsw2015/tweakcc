import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { CSP_PATCH_META, cspCheck, summarize, formatTable } from './check';

describe('csp: check status semantics', () => {
  it('meta covers 26 non-obsolete + obsolete entries', () => {
    expect(CSP_PATCH_META).toHaveLength(26); // 27 minus patch 13 (danger_table_skip 跟随 12)
    const obsoleteIds = CSP_PATCH_META.filter(m => m.obsolete).map(m => m.id);
    expect(obsoleteIds.sort()).toEqual([12, 19, 20, 21]);
  });

  it('empty file → obsolete for marked, broken for others', () => {
    const rows = cspCheck('');
    expect(rows).toHaveLength(26);
    // Marked obsolete (12/19/20/21): state = 'obsolete'
    const obsolete = rows.filter(r => r.state === 'obsolete');
    expect(obsolete.map(r => r.id).sort((a, b) => a - b)).toEqual([
      12, 19, 20, 21,
    ]);
    // Special patches (16/17/18/22-25) 使用 PATCHED_SIGNATURES 判定,
    // 空文件既无 anchor 也无 patched signature → broken
    // 但 anchor+tail patches (1-11, 14, 15) 靠启发式判 anchor 不在 → already_applied
    // 具体分布见后续测试
    const applicable = rows.filter(r => r.state === 'applicable');
    expect(applicable).toHaveLength(0);
  });

  it('empty file: anchor+tail patches misdetected as already_applied (known heuristic limitation)', () => {
    const rows = cspCheck('');
    // patch 1-11, 14, 15 是 anchor+tail 类, 无 pristine 时 anchor 不在,
    // 启发式假设 patched (best-effort). 这是我们的 approximation.
    const aa = rows.filter(r => r.state === 'already_applied');
    // 12 个 anchor+tail patches 会被判 already_applied
    expect(aa.length).toBeGreaterThanOrEqual(12);
  });

  it('empty file: special patches (no signature) → broken', () => {
    const rows = cspCheck('');
    // patch 16/17/18/22-25 用 PATCHED_SIGNATURES 判, 空文件 → broken
    const broken = rows
      .filter(r => r.state === 'broken')
      .map(r => r.id)
      .sort((a, b) => a - b);
    expect(broken).toEqual([16, 17, 18, 22, 23, 24, 25, 26, 27]);
  });

  it('summarize returns counts', () => {
    const rows = cspCheck('');
    const s = summarize(rows);
    expect(s.total).toBe(26);
    expect(s.applicable + s.alreadyApplied + s.obsolete + s.broken).toBe(26);
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
const PRISTINE =
  process.env.CSP_PRISTINE_BIN ?? '/tmp/claude-original/package/claude';

describe.skipIf(!existsSync(PRISTINE))('csp: check on pristine binary', () => {
  it('active patches on pristine binary are applicable or already_applied (no broken)', () => {
    const data = readFileSync(PRISTINE, 'latin1');
    const rows = cspCheck(data);
    const s = summarize(rows);
    // Pristine binary: 22 active patches. Anchor+tail patches may show as
    // already_applied if upstream removed the anchor string outright — we
    // treat that as OK (patch was needed once, upstream has since inlined
    // the effect). Only 'broken' would be a red flag: anchor gone AND no
    // patched signature = binary structure drifted.
    expect(s.applicable + s.alreadyApplied).toBe(22);
    expect(s.obsolete).toBe(4);
    expect(s.broken).toBe(0);
  });
});
