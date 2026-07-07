import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { applyAllCspPatches } from './index';
import { cspCheck, summarize } from './check';

// 跨版本 regression test.
// 每个 fixture 目录代表一个上游 CC 版本, 包含 pristine.bin (symlink 到实际
// npm 抽出的 native binary). 目的: 上游改结构时至少一个版本上 fail, 提前警告.
//
// - applyAllCspPatches 必须能在 pristine 上跑不抛异常
// - 主要 privacy patches (26/27) 必须在 pristine 命中 (state='applicable')
// - 无 broken 状态 (broken = 上游改到我们完全识别不了)

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const VERSIONS = ['2.1.201', '2.1.202'];

for (const version of VERSIONS) {
  const pristinePath = join(FIXTURES_DIR, version, 'pristine.bin');
  const hasFixture = existsSync(pristinePath);

  describe.skipIf(!hasFixture)(`csp: cross-version ${version}`, () => {
    it('applyAllCspPatches runs without throwing', { timeout: 15000 }, () => {
      const data = readFileSync(pristinePath, 'latin1');
      const { output, applied, failed } = applyAllCspPatches(data);
      expect(output.length).toBe(data.length); // 所有 patch 都必须等长
      // 至少要有一些 patch 命中 (完全不命中说明整个 patch 集失效)
      expect(applied.length).toBeGreaterThan(10);
      console.log(
        `  ${version}: applied=${applied.length}, failed=${failed.length}` +
          (failed.length ? ` — failed IDs: ${failed.join(',')}` : '')
      );
    });

    it('privacy patches 26/27 applicable on pristine', () => {
      const data = readFileSync(pristinePath, 'latin1');
      const rows = cspCheck(data);
      const p26 = rows.find((r) => r.id === 26);
      const p27 = rows.find((r) => r.id === 27);
      expect(p26?.state).toBe('applicable');
      expect(p27?.state).toBe('applicable');
    });

    it('no broken patches on pristine', () => {
      const data = readFileSync(pristinePath, 'latin1');
      const rows = cspCheck(data);
      const s = summarize(rows);
      const broken = rows.filter((r) => r.state === 'broken');
      expect(broken.map((r) => r.id).sort()).toEqual([]);
      expect(s.broken).toBe(0);
    });
  });
}
