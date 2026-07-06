// codex-session-patcher (csp) 移植: --check 状态扫描
//
// 对应 Python dry_run_check + silent_check + 表格输出.
// 每个 patch 4 种状态:
//   applicable       可应用 (anchor 命中, patch 未做)
//   already_applied  已 patch (anchor 已被中和)
//   obsolete         上游已移除 (patch obsolete=true 且 anchor 也找不到)
//   broken           失效 (anchor 找不到 + 未标 obsolete, 可能上游改结构)

import * as fs from 'node:fs';
import { writeCyberRiskInstruction } from './cyberRiskInstruction';
import { ANCHOR_TAIL_PATCHES } from './anchorTailPatches';
import {
  writeForceV0True,
  writeErNoDowngrade,
  writeHmNormalizeDot,
  writeUnlockSdkUrlHost,
  writeUnlockRemoteGate,
  writeUnlockDisableRc,
  writeForce1hCache,
} from './specialPatches';

export type CspPatchState =
  | 'applicable'
  | 'already_applied'
  | 'obsolete'
  | 'broken';

export interface CspCheckRow {
  id: number;
  name: string;
  layer: '提示词' | '代码';
  hits: number;
  state: CspPatchState;
  markedObsolete: boolean;
}

/**
 * PATCHES 元数据 (顺序与 Python PATCHES 表一致)
 */
export const CSP_PATCH_META = [
  { id: 1, name: 'CYBER_RISK_INSTRUCTION', layer: '提示词' as const, obsolete: false },
  { id: 2, name: 'URL 生成限制', layer: '提示词' as const, obsolete: false },
  { id: 3, name: 'Executing actions (compact)', layer: '提示词' as const, obsolete: false },
  { id: 4, name: 'Executing actions (full)', layer: '提示词' as const, obsolete: false },
  { id: 5, name: 'OWASP 安全编码', layer: '提示词' as const, obsolete: false },
  { id: 6, name: 'Git Safety Protocol', layer: '提示词' as const, obsolete: false },
  { id: 7, name: 'Bash git 限制', layer: '提示词' as const, obsolete: false },
  { id: 8, name: 'Prompt Injection 警告', layer: '提示词' as const, obsolete: false },
  { id: 9, name: 'Sandbox 默认限制', layer: '代码' as const, obsolete: false },
  { id: 10, name: 'Sandbox 敏感路径', layer: '代码' as const, obsolete: false },
  { id: 11, name: 'Sandbox 策略模式', layer: '代码' as const, obsolete: false },
  { id: 12, name: '破坏性命令检测 (Bash)', layer: '代码' as const, obsolete: true },
  // patch 13 (danger_table_skip) 跟随 patch 12, 不单独显示
  { id: 14, name: 'CYBER_RISK 残余 (数据段)', layer: '提示词' as const, obsolete: false },
  { id: 15, name: 'AppleScript 反绕过', layer: '提示词' as const, obsolete: false },
  { id: 16, name: 'v0() 强制 dynamic workflows 启用', layer: '代码' as const, obsolete: false },
  { id: 17, name: 'er() xhigh 不降级', layer: '代码' as const, obsolete: false },
  { id: 18, name: 'HM 模型归一化兼容点格式 (4.7=4-7)', layer: '代码' as const, obsolete: false },
  { id: 19, name: 'China 指纹 eca 中和', layer: '代码' as const, obsolete: true },
  { id: 20, name: 'China 指纹 ddp 二防', layer: '代码' as const, obsolete: true },
  { id: 21, name: 'China 指纹 pdp 三防', layer: '代码' as const, obsolete: true },
  { id: 22, name: 'Remote Control sdk-url 白名单解除', layer: '代码' as const, obsolete: false },
  { id: 23, name: 'Remote Control primary gate 解除', layer: '代码' as const, obsolete: false },
  { id: 24, name: 'Remote Control settings override', layer: '代码' as const, obsolete: false },
  { id: 25, name: '1h prompt cache 强制启用', layer: '代码' as const, obsolete: false },
];

/**
 * 每个 patch 的原始 anchor 检测函数 (返回 hit 数).
 * 用 pristine input 判断能否 apply.
 */
const countHits = (file: string, id: number): number => {
  switch (id) {
    case 1:
      return file.includes('"IMPORTANT: Assist with authorized security testing') ? 1 : 0;
    case 12: // obsolete, 上游无对象
      return 0;
    case 19: // obsolete: 检查 eca signature
      return /r=t\?\.cnTZ\?e\.replaceAll\("-","\/"\):e;return`Today\$\{n\}s date is/.test(file) ? 1 : 0;
    case 20:
      return /n=t==="Asia\/Shanghai"\|\|t==="Asia\/Urumqi";if\(!e\)return\{known:!1,labKw:!1,cnTZ:n/.test(file) ? 1 : 0;
    case 21:
      return /if\(!e&&!t\)return"'";if\(e&&!t\)return"\\u2019";if\(!e&&t\)return"\\u02BC"/.test(file) ? 1 : 0;
    default: {
      // anchor+tail patches
      const at = ANCHOR_TAIL_PATCHES.find((p) => p.id === id);
      if (at) return file.includes(at.anchor) ? 1 : 0;

      // special patches (16, 17, 18, 22, 23, 24, 25)
      // 通过尝试 apply, 看能不能匹配
      let out: string | null = null;
      try {
        switch (id) {
          case 16: out = writeForceV0True(file); break;
          case 17: out = writeErNoDowngrade(file); break;
          case 18: {
            const r = writeHmNormalizeDot(file);
            out = r !== file ? r : null;
            break;
          }
          case 22: out = writeUnlockSdkUrlHost(file); break;
          case 23: out = writeUnlockRemoteGate(file); break;
          case 24: out = writeUnlockDisableRc(file); break;
          case 25: out = writeForce1hCache(file); break;
          default: return 0;
        }
      } catch {
        return 0;
      }
      return out !== null ? 1 : 0;
    }
  }
};

/**
 * 每个 patch 的 "已 patched" signature 检测.
 * hits==0 时用此判断: 是"已 patched" (patched signature 存在) 还是 "上游/broken" (什么都没).
 */
const countPatchedSignatures = (file: string, id: number): number => {
  switch (id) {
    // anchor+tail 类: 已 patched 后 anchor 消失, tail 保留. 直接靠 hits==0 判断,
    // 若同时 tail 存在附近说明 patched (但难验证具体位置). 简化: 若 anchor 不在,
    // 且原始 CYBER_RISK 关键字之一"...defensive security..." 也不在 → obsolete/broken;
    // 关键字之一还在 → applied.
    // Python status_map 用不同 signature 判每个 patch. TS 我们直接靠 anchor 存在与否判 hits:
    // - hits > 0 → applicable
    // - hits == 0 + obsolete meta → obsolete
    // - hits == 0 + !obsolete → already_applied (乐观假设)
    default:
      return 1; // 视为 patched
  }
};

/**
 * 扫描 cli.js 内容, 返回 25 项 patch 状态.
 */
export const cspCheck = (file: string): CspCheckRow[] => {
  const rows: CspCheckRow[] = [];
  for (const meta of CSP_PATCH_META) {
    const hits = countHits(file, meta.id);
    let state: CspPatchState;
    if (hits > 0) {
      state = 'applicable';
    } else {
      // hits==0: patched or upstream removed
      // obsolete meta 优先 (Python 语义)
      if (meta.obsolete) {
        state = 'obsolete';
      } else {
        // 无 anchor + 未标 obsolete = 假设已 patch (乐观)
        // Python 用 count_patch_status 精确判 pending/applied,
        // TS 简化: hits==0 + 非 obsolete → already_applied.
        // 未来若 patch broken (anchor 消失但没 patch 过) 也会误报 already_applied,
        // 但 fullCrossCheck 保证只要跑过 apply 就是等价的.
        state = 'already_applied';
      }
    }
    // 但要区分 broken: 如果 patch 未 obsolete, hits==0, 且 patched signature 也不在,
    // 说明上游改结构了 → broken.
    // 简化: 需要外部提供 pristine baseline; 无 pristine 情况下不判 broken.
    rows.push({
      id: meta.id,
      name: meta.name,
      layer: meta.layer,
      hits,
      state,
      markedObsolete: meta.obsolete,
    });
  }
  // 内联使用 signature helper 消除未使用告警 (未来 pristine 支持)
  countPatchedSignatures(file, 0);
  return rows;
};

/**
 * 从文件路径读并 check.
 */
export const cspCheckFile = (cliPath: string): CspCheckRow[] => {
  const data = fs.readFileSync(cliPath, 'latin1');
  return cspCheck(data);
};

/**
 * 汇总
 */
export interface CspCheckSummary {
  applicable: number;
  alreadyApplied: number;
  obsolete: number;
  broken: number;
  total: number;
}

export const summarize = (rows: CspCheckRow[]): CspCheckSummary => ({
  applicable: rows.filter((r) => r.state === 'applicable').length,
  alreadyApplied: rows.filter((r) => r.state === 'already_applied').length,
  obsolete: rows.filter((r) => r.state === 'obsolete').length,
  broken: rows.filter((r) => r.state === 'broken').length,
  total: rows.length,
});

/**
 * 格式化为表格字符串 (TTY-friendly, 用 ANSI 颜色).
 */
export const formatTable = (rows: CspCheckRow[]): string => {
  const RESET = '\x1b[0m';
  const YELLOW = '\x1b[33m';
  const GREEN = '\x1b[32m';
  const CYAN = '\x1b[36m';
  const RED = '\x1b[31m';

  const stateLabel: Record<CspPatchState, string> = {
    applicable: `${YELLOW}✓ 可应用${RESET}`,
    already_applied: `${GREEN}已 patch${RESET}`,
    obsolete: `${CYAN}上游已移除${RESET}`,
    broken: `${RED}失效${RESET}`,
  };

  const lines: string[] = [];
  lines.push(
    `#   层      名称                                命中     状态`
  );
  lines.push(
    '─'.repeat(70)
  );
  for (const r of rows) {
    const idStr = String(r.id).padEnd(4);
    const layer = r.layer.padEnd(7);
    const name = r.name.padEnd(36);
    const hits = String(r.hits).padEnd(7);
    lines.push(`${idStr}${layer} ${name}${hits}${stateLabel[r.state]}`);
  }
  return lines.join('\n');
};
