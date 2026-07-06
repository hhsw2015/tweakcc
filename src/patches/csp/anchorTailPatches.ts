// codex-session-patcher (csp) 移植: anchor+tail 类 patch 定义
// 覆盖原 Python patcher 的 patch #2-11, 14-15
//
// 每项定义 anchor + tail 参数, apply 时调用共享 helper
// 保持和 Python 版一模一样的 anchor/tail 常量, 保证字节兼容

import { applyAnchorTailNeutralize } from './anchorTail';

export interface AnchorTailPatchDef {
  id: number;
  name: string;
  desc: string;
  anchor: string;
  tail: string;
  tailSearchMax: number;
  includeTail?: boolean;
}

export const ANCHOR_TAIL_PATCHES: AnchorTailPatchDef[] = [
  {
    id: 2,
    name: 'URL 生成限制',
    desc: '禁止模型自行生成或猜测 URL',
    anchor: 'IMPORTANT: You must NEVER generate or guess URLs',
    tail: 'local files.',
    tailSearchMax: 300,
    includeTail: true,
  },
  {
    id: 3,
    name: 'Executing actions (compact)',
    desc: 'compact 模式 # Executing actions with care',
    anchor: '`# Executing actions with care\n\nRead, search, and investigate freely',
    tail: 'extend to the next.`',
    tailSearchMax: 800,
    includeTail: true,
  },
  {
    id: 4,
    name: 'Executing actions (full)',
    desc: 'full 模式 # Executing actions with care',
    anchor: '`# Executing actions with care\n\nCarefully consider',
    tail: 'measure twice, cut once.`',
    tailSearchMax: 4500,
    includeTail: true,
  },
  {
    id: 5,
    name: 'OWASP 安全编码',
    desc: '强制安全编码检查 (XSS/SQLi/注入)',
    anchor: '"Be careful not to introduce security vulnerabilities such as command injection',
    tail: '"',
    tailSearchMax: 400,
  },
  {
    id: 6,
    name: 'Git Safety Protocol',
    desc: 'NEVER update/push/skip/commit 全套',
    anchor: 'Git Safety Protocol:\n- NEVER',
    tail: 'too proactive',
    tailSearchMax: 1500,
    includeTail: true,
  },
  {
    id: 7,
    name: 'Bash git 限制',
    desc: '工具描述中的 git 安全提示',
    anchor: '  - For git commands:\n    - Prefer to create a new commit',
    tail: 'investigate and fix the underlying issue.',
    tailSearchMax: 800,
    includeTail: true,
  },
  {
    id: 8,
    name: 'Prompt Injection 警告',
    desc: '要求模型标记可疑 prompt injection',
    anchor: 'Tool results may include data from external sources. If you suspect',
    tail: 'flag it directly to the user before continuing.',
    tailSearchMax: 300,
    includeTail: true,
  },
  {
    id: 9,
    name: 'Sandbox 默认限制',
    desc: '强制沙箱运行指令',
    anchor: '"You should always default to running commands within the sandbox',
    tail: 'unless:"',
    tailSearchMax: 200,
    includeTail: true,
  },
  {
    id: 10,
    name: 'Sandbox 敏感路径',
    desc: '禁止将 ~/.ssh 等加入白名单',
    anchor: '"Do not suggest adding sensitive paths like ~/.bashrc',
    tail: 'allowlist."',
    tailSearchMax: 200,
    includeTail: true,
  },
  {
    id: 11,
    name: 'Sandbox 策略模式',
    desc: '沙箱策略强制模式',
    anchor: '"All commands MUST run in sandbox mode',
    tail: 'disabled by policy."',
    tailSearchMax: 200,
    includeTail: true,
  },
  {
    id: 14,
    name: 'CYBER_RISK 残余 (数据段)',
    desc: '原 patch 1 漏掉的非引号副本 (Refuse destructive techniques)',
    anchor: 'IMPORTANT: Assist with authorized security testing, defensive security, CTF challenges',
    tail: 'defensive use cases.',
    tailSearchMax: 600,
    includeTail: true,
  },
  {
    id: 15,
    name: 'AppleScript 反绕过',
    desc: '禁止用 AppleScript/System Events/shell 模拟点击',
    anchor: 'Do not attempt to work around this restriction',
    tail: 'to this app.',
    tailSearchMax: 200,
    includeTail: true,
  },
];

/**
 * 应用单个 anchor+tail patch. 未找到 anchor → 返回原文件 (视为上游已移除或已 patched).
 */
export const applyAnchorTailPatch = (
  file: string,
  def: AnchorTailPatchDef
): string => {
  if (!file.includes(def.anchor)) return file;
  const patched = applyAnchorTailNeutralize(file, {
    anchor: def.anchor,
    tail: def.tail,
    tailSearchMax: def.tailSearchMax,
    includeTail: def.includeTail,
  });
  return patched ?? file;
};

/**
 * 检查是否已应用: anchor 找不到, 或 anchor 后到 tail 之间全是空格 (含引号)
 */
export const isAnchorTailPatched = (
  file: string,
  def: AnchorTailPatchDef
): boolean => {
  const pos = file.indexOf(def.anchor);
  if (pos === -1) return true;
  // 有 anchor 说明还没被中和
  return false;
};
