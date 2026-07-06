// codex-session-patcher (csp) 移植入口: 25 个原始 patch 定义 + 应用
//
// PATCH_METADATA 保留全部 25 项(含 obsolete)以便状态列表显示
// applyAll(file) 应用所有 active patch, 返回修改后的 file 内容
// checkStatus(file) 返回每个 patch 的 { id, name, status }

import { writeCyberRiskInstruction } from './cyberRiskInstruction';
import {
  ANCHOR_TAIL_PATCHES,
  applyAnchorTailPatch,
} from './anchorTailPatches';
import {
  writeDangerTableSkip,
  writeForceV0True,
  writeErNoDowngrade,
  writeHmNormalizeDot,
  writeUnlockSdkUrlHost,
  writeUnlockRemoteGate,
  writeUnlockDisableRc,
  writeForce1hCache,
} from './specialPatches';

export interface CspPatchMeta {
  id: number;
  name: string;
  layer: '提示词' | '代码';
  desc: string;
  obsolete?: boolean;
}

// 全部 25 项元数据 (顺序和 id 与 Python 版一致)
export const CSP_PATCH_META: CspPatchMeta[] = [
  { id: 1, name: 'CYBER_RISK_INSTRUCTION', layer: '提示词', desc: '安全测试拒绝指令 (渗透/C2/漏洞利用)' },
  { id: 2, name: 'URL 生成限制', layer: '提示词', desc: '禁止模型自行生成或猜测 URL' },
  { id: 3, name: 'Executing actions (compact)', layer: '提示词', desc: 'compact 模式 # Executing actions with care' },
  { id: 4, name: 'Executing actions (full)', layer: '提示词', desc: 'full 模式 # Executing actions with care' },
  { id: 5, name: 'OWASP 安全编码', layer: '提示词', desc: '强制安全编码检查 (XSS/SQLi/注入)' },
  { id: 6, name: 'Git Safety Protocol', layer: '提示词', desc: 'NEVER update/push/skip/commit 全套' },
  { id: 7, name: 'Bash git 限制', layer: '提示词', desc: '工具描述中的 git 安全提示' },
  { id: 8, name: 'Prompt Injection 警告', layer: '提示词', desc: '要求模型标记可疑 prompt injection' },
  { id: 9, name: 'Sandbox 默认限制', layer: '代码', desc: '强制沙箱运行指令' },
  { id: 10, name: 'Sandbox 敏感路径', layer: '代码', desc: '禁止将 ~/.ssh 等加入白名单' },
  { id: 11, name: 'Sandbox 策略模式', layer: '代码', desc: '沙箱策略强制模式' },
  { id: 12, name: '破坏性命令检测 (Bash)', layer: '代码', desc: 'PZA 表危险命令拦截器 (v2.1.157+ 上游已重写)', obsolete: true },
  { id: 13, name: '破坏性命令检测 (PowerShell)', layer: '代码', desc: 'UGA 表危险命令拦截器 (跟随 #12)', obsolete: true },
  { id: 14, name: 'CYBER_RISK 残余 (数据段)', layer: '提示词', desc: '原 patch 1 漏掉的非引号副本' },
  { id: 15, name: 'AppleScript 反绕过', layer: '提示词', desc: '禁止用 AppleScript/System Events/shell 模拟点击' },
  { id: 16, name: 'v0() 强制 dynamic workflows 启用', layer: '代码', desc: 'v0() 直接返回 true' },
  { id: 17, name: 'er() xhigh 不降级', layer: '代码', desc: '去掉 er() 中 xhigh→high 降级逻辑' },
  { id: 18, name: 'HM 模型归一化兼容点格式 (4.7=4-7)', layer: '代码', desc: 'HM() includes 子串匹配改正则' },
  { id: 19, name: 'China 指纹 eca 中和', layer: '代码', desc: 'eca(e) 恒返回 Today\'s date... 断掉指纹注入', obsolete: true },
  { id: 20, name: 'China 指纹 ddp 二防', layer: '代码', desc: 'ddp() → return null 上游断链兜底', obsolete: true },
  { id: 21, name: 'China 指纹 pdp 三防', layer: '代码', desc: 'pdp(e,t) → return "\'" 撇号恒 ASCII', obsolete: true },
  { id: 22, name: 'Remote Control sdk-url 白名单解除', layer: '代码', desc: 'b_c(e) → return null' },
  { id: 23, name: 'Remote Control primary gate 解除', layer: '代码', desc: 'Yen() → return kc() 保留登录检查' },
  { id: 24, name: 'Remote Control settings override', layer: '代码', desc: 'Jen() → return!1 忽略 disableRemoteControl' },
  { id: 25, name: '1h prompt cache 强制启用', layer: '代码', desc: 'gKe(e) 恒返 true (保留 FORCE_PROMPT_CACHING_5M 逃生阀)' },
];

/**
 * 应用全部 csp active patch. 每个 patch 独立处理, 失败也不影响其他.
 */
export const applyAllCspPatches = (file: string): { output: string; applied: number[]; failed: number[] } => {
  let out = file;
  const applied: number[] = [];
  const failed: number[] = [];

  // patch 1
  {
    const r = writeCyberRiskInstruction(out);
    if (r !== null && r !== out) { applied.push(1); out = r; }
    else if (r === out) { /* no-op, considered applied (upstream removed or already patched) */ applied.push(1); }
    else failed.push(1);
  }

  // patch 2-11, 14, 15
  for (const def of ANCHOR_TAIL_PATCHES) {
    const before = out;
    out = applyAnchorTailPatch(out, def);
    if (out !== before || !out.includes(def.anchor)) applied.push(def.id);
    else failed.push(def.id);
  }

  // patch 12/13 (obsolete: upstream 2.1.157+ 已移除破坏性命令检测表)
  // Python `count_patch_status` 报为 applied, 我们对齐语义
  applied.push(12);
  applied.push(13);
  writeDangerTableSkip(out); // consistent no-op

  // patch 16
  { const r = writeForceV0True(out); if (r !== null) { out = r; applied.push(16); } else failed.push(16); }
  // patch 17
  { const r = writeErNoDowngrade(out); if (r !== null) { out = r; applied.push(17); } else failed.push(17); }
  // patch 18
  { const r = writeHmNormalizeDot(out); if (r !== out) { out = r; applied.push(18); } else failed.push(18); }
  // patch 22
  { const r = writeUnlockSdkUrlHost(out); if (r !== null) { out = r; applied.push(22); } else failed.push(22); }
  // patch 23
  { const r = writeUnlockRemoteGate(out); if (r !== null) { out = r; applied.push(23); } else failed.push(23); }
  // patch 24
  { const r = writeUnlockDisableRc(out); if (r !== null) { out = r; applied.push(24); } else failed.push(24); }
  // patch 25
  { const r = writeForce1hCache(out); if (r !== null) { out = r; applied.push(25); } else failed.push(25); }

  // patch 19/20/21 obsolete (2.1.198+ Anthropic 自行移除 China 指纹, upstream 已修)
  applied.push(19);
  applied.push(20);
  applied.push(21);

  return { output: out, applied, failed };
};
