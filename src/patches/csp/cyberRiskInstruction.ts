// codex-session-patcher (csp) 移植: CYBER_RISK_INSTRUCTION
//
// 移除拒绝安全测试的 prompt 段 (原 patch #1)
// anchor: `"IMPORTANT: Assist with authorized security testing`
// tail:   `"`
//
// 中和后, 该字符串常量变成 `" ... (all spaces) ... "`, JS 层是空字符串
// 效果: system prompt 里那段"拒绝 destructive/DoS/mass targeting..." 消失

import { applyAnchorTailNeutralize } from './anchorTail';

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
    // anchor 在但 tail 找不到 (可能 CC 版本改结构) — 与 Python 语义一致, 视为 no-op
    // 由 --check 报告 pending, 不 log 错误噪音
    return file;
  }
  return patched;
};
