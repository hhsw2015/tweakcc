// codex-session-patcher (csp) 移植入口: 25 个原始 patch 定义 + 应用
//
// PATCH_METADATA 保留全部 25 项(含 obsolete)以便状态列表显示
// applyAll(file) 应用所有 active patch, 返回修改后的 file 内容
// checkStatus(file) 返回每个 patch 的 { id, name, status }

import { writeCyberRiskInstruction } from './cyberRiskInstruction';
import { ANCHOR_TAIL_PATCHES, applyAnchorTailPatch } from './anchorTailPatches';
import {
  writeDangerTableSkip,
  writeForceV0True,
  writeErNoDowngrade,
  writeHmNormalizeDot,
  writeUnlockSdkUrlHost,
  writeUnlockRemoteGate,
  writeUnlockDisableRc,
  writeForce1hCache,
  writeScrubMetadata,
  writeDisableTelemetry,
  writeUserTypeAnt,
  writeBunStandaloneTrue,
  writeAgentTeamsAlwaysOn,
  writeUltraplanEnable,
  writeVoiceModeEnable,
  writeComputerUseSubscription,
  writeComputerUseDefaultEnabled,
  writeUltrareviewEnable,
  writeAutoModeHelperGate,
  writeAutoModeInlineGate,
  writeRestoreGlobGrep,
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
  {
    id: 1,
    name: 'CYBER_RISK_INSTRUCTION',
    layer: '提示词',
    desc: '安全测试拒绝指令 (渗透/C2/漏洞利用)',
  },
  {
    id: 2,
    name: 'URL 生成限制',
    layer: '提示词',
    desc: '禁止模型自行生成或猜测 URL',
  },
  {
    id: 3,
    name: 'Executing actions (compact)',
    layer: '提示词',
    desc: 'compact 模式 # Executing actions with care',
  },
  {
    id: 4,
    name: 'Executing actions (full)',
    layer: '提示词',
    desc: 'full 模式 # Executing actions with care',
  },
  {
    id: 5,
    name: 'OWASP 安全编码',
    layer: '提示词',
    desc: '强制安全编码检查 (XSS/SQLi/注入)',
  },
  {
    id: 6,
    name: 'Git Safety Protocol',
    layer: '提示词',
    desc: 'NEVER update/push/skip/commit 全套',
  },
  {
    id: 7,
    name: 'Bash git 限制',
    layer: '提示词',
    desc: '工具描述中的 git 安全提示',
  },
  {
    id: 8,
    name: 'Prompt Injection 警告',
    layer: '提示词',
    desc: '要求模型标记可疑 prompt injection',
  },
  { id: 9, name: 'Sandbox 默认限制', layer: '代码', desc: '强制沙箱运行指令' },
  {
    id: 10,
    name: 'Sandbox 敏感路径',
    layer: '代码',
    desc: '禁止将 ~/.ssh 等加入白名单',
  },
  { id: 11, name: 'Sandbox 策略模式', layer: '代码', desc: '沙箱策略强制模式' },
  {
    id: 12,
    name: '破坏性命令检测 (Bash)',
    layer: '代码',
    desc: 'PZA 表危险命令拦截器 (v2.1.157+ 上游已重写)',
    obsolete: true,
  },
  {
    id: 13,
    name: '破坏性命令检测 (PowerShell)',
    layer: '代码',
    desc: 'UGA 表危险命令拦截器 (跟随 #12)',
    obsolete: true,
  },
  {
    id: 14,
    name: 'CYBER_RISK 残余 (数据段)',
    layer: '提示词',
    desc: '原 patch 1 漏掉的非引号副本',
  },
  {
    id: 15,
    name: 'AppleScript 反绕过',
    layer: '提示词',
    desc: '禁止用 AppleScript/System Events/shell 模拟点击',
  },
  {
    id: 16,
    name: 'v0() 强制 dynamic workflows 启用',
    layer: '代码',
    desc: 'v0() 直接返回 true',
  },
  {
    id: 17,
    name: 'er() xhigh 不降级',
    layer: '代码',
    desc: '去掉 er() 中 xhigh→high 降级逻辑',
  },
  {
    id: 18,
    name: 'HM 模型归一化兼容点格式 (4.7=4-7)',
    layer: '代码',
    desc: 'HM() includes 子串匹配改正则',
  },
  {
    id: 19,
    name: 'China 指纹 eca 中和',
    layer: '代码',
    desc: "eca(e) 恒返回 Today's date... 断掉指纹注入",
    obsolete: true,
  },
  {
    id: 20,
    name: 'China 指纹 ddp 二防',
    layer: '代码',
    desc: 'ddp() → return null 上游断链兜底',
    obsolete: true,
  },
  {
    id: 21,
    name: 'China 指纹 pdp 三防',
    layer: '代码',
    desc: 'pdp(e,t) → return "\'" 撇号恒 ASCII',
    obsolete: true,
  },
  {
    id: 22,
    name: 'Remote Control sdk-url 白名单解除',
    layer: '代码',
    desc: 'b_c(e) → return null',
  },
  {
    id: 23,
    name: 'Remote Control primary gate 解除',
    layer: '代码',
    desc: 'Yen() → return kc() 保留登录检查',
  },
  {
    id: 24,
    name: 'Remote Control settings override',
    layer: '代码',
    desc: 'Jen() → return!1 忽略 disableRemoteControl',
  },
  {
    id: 25,
    name: '1h prompt cache 强制启用',
    layer: '代码',
    desc: 'gKe(e) 恒返 true (保留 FORCE_PROMPT_CACHING_5M 逃生阀)',
  },
  {
    id: 26,
    name: 'metadata.user_id 剥指纹',
    layer: '代码',
    desc: 'pMe() 剥 device_id + account_uuid, 保 session_id + CLAUDE_CODE_EXTRA_METADATA',
  },
  {
    id: 27,
    name: '禁用 telemetry 上报',
    layer: '代码',
    desc: 'G/I_/pto 中和 — 关掉 tengu_* + api_refusal + ClaudeCodeInternalEvent + GrowthbookExperimentEvent 全部上报, 保留 feature-flag fetch',
  },
  {
    id: 28,
    name: 'USER_TYPE → ant (解锁隐藏命令)',
    layer: '代码',
    desc: 'function X(){return"external"} → return"ant". 解锁 /share /teleport /issue /bughunter 等 24+ 隐藏 slash commands (源: clawgod)',
  },
  {
    id: 29,
    name: 'Bun.isStandaloneExecutable → true',
    layer: '代码',
    desc: '让 fv() 类 gate 恒返 true, 兼容 plain-Bun 运行 patched cli.js 场景 (源: clawgod)',
  },
  {
    id: 30,
    name: 'Agent Teams 常开',
    layer: '代码',
    desc: '强开 multi-agent swarm, 绕 env + tengu_amber_flint GrowthBook 双 gate (源: clawgod)',
  },
  {
    id: 31,
    name: 'Ultraplan enable',
    layer: '代码',
    desc: '强开 /ultraplan (multi-agent planning via Claude Code Remote), isEnabled:()=>!0 (源: clawgod)',
  },
  {
    id: 32,
    name: 'Voice Mode enable (obsolete 2.1.218+)',
    layer: '代码',
    desc: '强开 voice mode, 绕 tengu_amber_quartz_disabled kill. 2.1.218+ 上游删了该 flag, patch 变 no-op (源: clawgod)',
  },
  {
    id: 33,
    name: 'Computer Use 免订阅',
    layer: '代码',
    desc: 'plan="max"||"pro" gate 恒返 true, macOS 屏控免 Max/Pro 订阅 (源: clawgod)',
  },
  {
    id: 34,
    name: 'Computer Use 默认启用',
    layer: '代码',
    desc: '{enabled:!1,pixelValidation:...} → {enabled:!0,...} (源: clawgod)',
  },
  {
    id: 35,
    name: 'Ultrareview enable',
    layer: '代码',
    desc: '强开 /ultrareview (自动 bug 挖掘), tengu_review_bughunter_config gate 中和 (源: clawgod)',
  },
  {
    id: 36,
    name: 'Auto-mode 3rd party helper gate',
    layer: '代码',
    desc: '移除 provider helper gate, 允许第三方 API 走 auto-mode (源: clawgod)',
  },
  {
    id: 37,
    name: 'Auto-mode 3rd party inline gate',
    layer: '代码',
    desc: '移除 inline firstParty/anthropicAws 检查, 第三方 API 全放行 (源: clawgod)',
  },
  {
    id: 38,
    name: '恢复 Glob/Grep 工具',
    layer: '代码',
    desc: 'Bun compile inline EMBEDDED_SEARCH_TOOLS="true" 导致内置 Glob/Grep 隐藏. 反 inline + bfs/ugrep 检测 (源: clawgod)',
  },
];

/**
 * 应用全部 csp active patch. 每个 patch 独立处理, 失败也不影响其他.
 */
export const applyAllCspPatches = (
  file: string
): { output: string; applied: number[]; failed: number[] } => {
  let out = file;
  const applied: number[] = [];
  const failed: number[] = [];

  // patch 1
  {
    const r = writeCyberRiskInstruction(out);
    if (r !== null && r !== out) {
      applied.push(1);
      out = r;
    } else if (r === out) {
      /* no-op, considered applied (upstream removed or already patched) */ applied.push(
        1
      );
    } else failed.push(1);
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
  {
    const r = writeForceV0True(out);
    if (r !== null) {
      out = r;
      applied.push(16);
    } else failed.push(16);
  }
  // patch 17
  {
    const r = writeErNoDowngrade(out);
    if (r !== null) {
      out = r;
      applied.push(17);
    } else failed.push(17);
  }
  // patch 18
  {
    const r = writeHmNormalizeDot(out);
    if (r !== out) {
      out = r;
      applied.push(18);
    } else failed.push(18);
  }
  // patch 22
  {
    const r = writeUnlockSdkUrlHost(out);
    if (r !== null) {
      out = r;
      applied.push(22);
    } else failed.push(22);
  }
  // patch 23
  {
    const r = writeUnlockRemoteGate(out);
    if (r !== null) {
      out = r;
      applied.push(23);
    } else failed.push(23);
  }
  // patch 24
  {
    const r = writeUnlockDisableRc(out);
    if (r !== null) {
      out = r;
      applied.push(24);
    } else failed.push(24);
  }
  // patch 25
  {
    const r = writeForce1hCache(out);
    if (r !== null) {
      out = r;
      applied.push(25);
    } else failed.push(25);
  }
  // patch 26
  {
    const r = writeScrubMetadata(out);
    if (r !== null) {
      out = r;
      applied.push(26);
    } else failed.push(26);
  }
  // patch 27
  {
    const r = writeDisableTelemetry(out);
    if (r !== null) {
      out = r;
      applied.push(27);
    } else failed.push(27);
  }
  // patch 28
  {
    const r = writeUserTypeAnt(out);
    if (r !== null) {
      out = r;
      applied.push(28);
    } else failed.push(28);
  }
  // patch 29
  {
    const r = writeBunStandaloneTrue(out);
    if (r !== null) {
      out = r;
      applied.push(29);
    } else failed.push(29);
  }
  // patch 30
  {
    const r = writeAgentTeamsAlwaysOn(out);
    if (r !== null) {
      out = r;
      applied.push(30);
    } else failed.push(30);
  }
  // patch 31
  {
    const r = writeUltraplanEnable(out);
    if (r !== null) {
      out = r;
      applied.push(31);
    } else failed.push(31);
  }
  // patch 32 (may be no-op on 2.1.218+ where flag was removed)
  {
    const r = writeVoiceModeEnable(out);
    if (r !== null) {
      out = r;
      applied.push(32);
    }
    // No failure count — this patch is best-effort; upstream removed the anchor.
  }
  // patch 33
  {
    const r = writeComputerUseSubscription(out);
    if (r !== null) {
      out = r;
      applied.push(33);
    } else failed.push(33);
  }
  // patch 34
  {
    const r = writeComputerUseDefaultEnabled(out);
    if (r !== null) {
      out = r;
      applied.push(34);
    } else failed.push(34);
  }
  // patch 35
  {
    const r = writeUltrareviewEnable(out);
    if (r !== null) {
      out = r;
      applied.push(35);
    } else failed.push(35);
  }
  // patch 36
  {
    const r = writeAutoModeHelperGate(out);
    if (r !== null) {
      out = r;
      applied.push(36);
    } else failed.push(36);
  }
  // patch 37
  {
    const r = writeAutoModeInlineGate(out);
    if (r !== null) {
      out = r;
      applied.push(37);
    } else failed.push(37);
  }
  // patch 38
  {
    const r = writeRestoreGlobGrep(out);
    if (r !== null) {
      out = r;
      applied.push(38);
    } else failed.push(38);
  }

  // patch 19/20/21 obsolete (2.1.198+ Anthropic 自行移除 China 指纹, upstream 已修)
  applied.push(19);
  applied.push(20);
  applied.push(21);

  return { output: out, applied, failed };
};
