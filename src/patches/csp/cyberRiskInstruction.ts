// codex-session-patcher (csp) 移植: CYBER_RISK_INSTRUCTION
//
// 移除拒绝安全测试的 prompt 段 (原 patch #1)
// anchor: `"IMPORTANT: Assist with authorized security testing`
// tail:   `"`
//
// 中和后, 该字符串常量变成 `" ... (all spaces) ... "`, JS 层是空字符串
// 效果: system prompt 里那段"拒绝 destructive/DoS/mass targeting..." 消失

import { applyAnchorTailNeutralize } from './anchorTail';
import { showDiff } from '../index';

const ANCHOR = '"IMPORTANT: Assist with authorized security testing';
const TAIL = '"';
const TAIL_SEARCH_MAX = 600;

export const writeCyberRiskInstruction = (file: string): string | null => {
  if (!file.includes(ANCHOR)) {
    // 上游已移除 或 已中和 (anchor 前半段找不到) — 视为无需操作
    return file;
  }
  const patched = applyAnchorTailNeutralize(file, {
    anchor: ANCHOR,
    tail: TAIL,
    tailSearchMax: TAIL_SEARCH_MAX,
    includeTail: false,
  });
  if (patched === null) {
    console.error('patch: cyberRiskInstruction: anchor found but tail unreachable');
    return null;
  }
  // Best-effort diff visualization (idx from first anchor site)
  const idx = file.indexOf(ANCHOR);
  if (idx !== -1) {
    const tailIdx = file.indexOf(TAIL, idx + ANCHOR.length);
    if (tailIdx !== -1 && tailIdx - idx - ANCHOR.length <= TAIL_SEARCH_MAX) {
      showDiff(file, patched, patched.slice(idx, tailIdx), idx, tailIdx);
    }
  }
  return patched;
};
