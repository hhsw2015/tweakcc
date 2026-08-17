// codex-session-patcher (csp) 移植: --check 状态扫描
//
// 对应 Python dry_run_check + silent_check + 表格输出.
// 每个 patch 4 种状态:
//   applicable       可应用 (anchor 命中, patch 未做)
//   already_applied  已 patch (anchor 已被中和, patched signature 存在)
//   obsolete         上游已移除 (patch obsolete=true 且 anchor 也找不到)
//   broken           失效 (anchor 找不到 + patched signature 也不在, 上游改结构)

import * as fs from 'node:fs';
import { ANCHOR_TAIL_PATCHES } from './anchorTailPatches';

export type CspPatchState =
  'applicable' | 'already_applied' | 'obsolete' | 'broken';

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
  {
    id: 1,
    name: 'CYBER_RISK_INSTRUCTION',
    layer: '提示词' as const,
    obsolete: false,
  },
  { id: 2, name: 'URL 生成限制', layer: '提示词' as const, obsolete: false },
  {
    id: 3,
    name: 'Executing actions (compact)',
    layer: '提示词' as const,
    obsolete: false,
  },
  {
    id: 4,
    name: 'Executing actions (full)',
    layer: '提示词' as const,
    obsolete: false,
  },
  { id: 5, name: 'OWASP 安全编码', layer: '提示词' as const, obsolete: false },
  {
    id: 6,
    name: 'Git Safety Protocol',
    layer: '提示词' as const,
    obsolete: false,
  },
  { id: 7, name: 'Bash git 限制', layer: '提示词' as const, obsolete: false },
  {
    id: 8,
    name: 'Prompt Injection 警告',
    layer: '提示词' as const,
    obsolete: false,
  },
  { id: 9, name: 'Sandbox 默认限制', layer: '代码' as const, obsolete: false },
  { id: 10, name: 'Sandbox 敏感路径', layer: '代码' as const, obsolete: false },
  { id: 11, name: 'Sandbox 策略模式', layer: '代码' as const, obsolete: false },
  {
    id: 12,
    name: '破坏性命令检测 (Bash)',
    layer: '代码' as const,
    obsolete: true,
  },
  // patch 13 (danger_table_skip) 跟随 patch 12, 不单独显示
  {
    id: 14,
    name: 'CYBER_RISK 残余 (数据段)',
    layer: '提示词' as const,
    obsolete: false,
  },
  {
    id: 15,
    name: 'AppleScript 反绕过',
    layer: '提示词' as const,
    obsolete: false,
  },
  {
    id: 16,
    name: 'v0() 强制 dynamic workflows 启用',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 17,
    name: 'er() xhigh 不降级',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 18,
    name: 'HM 模型归一化兼容点格式 (4.7=4-7)',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 19,
    name: 'China 指纹 eca 中和',
    layer: '代码' as const,
    obsolete: true,
  },
  {
    id: 20,
    name: 'China 指纹 ddp 二防',
    layer: '代码' as const,
    obsolete: true,
  },
  {
    id: 21,
    name: 'China 指纹 pdp 三防',
    layer: '代码' as const,
    obsolete: true,
  },
  {
    id: 22,
    name: 'Remote Control sdk-url 白名单解除',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 23,
    name: 'Remote Control primary gate 解除',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 24,
    name: 'Remote Control settings override',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 25,
    name: '1h prompt cache 强制启用',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 26,
    name: 'metadata.user_id 剥指纹 (device_id/account_uuid)',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 27,
    name: '禁用 telemetry 上报 (G/I_/pto)',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 28,
    name: 'USER_TYPE → ant (解锁隐藏命令)',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 29,
    name: 'Bun.isStandaloneExecutable → true',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 30,
    name: 'Agent Teams 常开',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 31,
    name: 'Ultraplan enable',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 32,
    name: 'Voice Mode enable',
    layer: '代码' as const,
    obsolete: true, // 2.1.218+ 上游删了 tengu_amber_quartz_disabled
  },
  {
    id: 33,
    name: 'Computer Use 免订阅',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 34,
    name: 'Computer Use 默认启用',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 35,
    name: 'Ultrareview enable',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 36,
    name: 'Auto-mode 3rd party helper gate',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 37,
    name: 'Auto-mode 3rd party inline gate',
    layer: '代码' as const,
    obsolete: false,
  },
  {
    id: 38,
    name: '恢复 Glob/Grep 工具',
    layer: '代码' as const,
    obsolete: false,
  },
];

/**
 * 每个 patch 的 anchor (pristine signature). 匹配到说明 pristine, 可 patch.
 * 用纯 regex/substring 检测, 不 apply, 保持 O(n) 性能.
 */
const ANCHOR_SIGNATURES: Record<number, (file: string) => number> = {
  // patch 1: CYBER_RISK 起始引号 + 主 marker
  1: f =>
    f.includes('"IMPORTANT: Assist with authorized security testing') ? 1 : 0,

  // patch 12: danger_table, 上游 2.1.157+ 已重写, 无 pristine 对象
  12: () => 0,

  // patch 19-21: China fingerprint, 上游 2.1.198+ 已移除
  19: f =>
    /r=t\?\.cnTZ\?e\.replaceAll\("-","\/"\):e;return`Today\$\{[\w$]+\}s date is/.test(
      f
    )
      ? 1
      : 0,
  20: f =>
    /n=t==="Asia\/Shanghai"\|\|t==="Asia\/Urumqi";if\(!e\)return\{known:!1,labKw:!1,cnTZ:n/.test(
      f
    )
      ? 1
      : 0,
  21: f =>
    /if\(!e&&!t\)return"'";if\(e&&!t\)return"\\u2019";if\(!e&&t\)return"\\u02BC"/.test(
      f
    )
      ? 1
      : 0,

  // patch 16: force_v0_true - 匹配 v0() 函数完整签名.
  // 2.1.212+ 上游重构: `function X(){return F()&&!G(env.CLAUDE_CODE_DISABLE_WORKFLOWS)&&H().available}`
  16: f =>
    (/function [\w$]{1,8}\(\)\{if\([\w$]{1,8}\(\)\)return!1;if\(![\w$]{1,8}\(\)\)return!1;let\{available:[\w$]+,defaultOn:[\w$]+\}/.test(
      f
    ) ||
      /function [\w$]{1,8}\(\)\{return [\w$]{1,8}\(\)&&![\w$]{1,8}\(process\.env\.CLAUDE_CODE_DISABLE_WORKFLOWS\)&&[\w$]{1,8}\(\)\.available\}/.test(
        f
      ))
      ? 1
      : 0,

  // patch 17: er_no_downgrade - xhigh→high 降级判定
  17: f =>
    /if\([\w$]{1,8}==="xhigh"&&![\w$]{1,8}\([\w$]{1,8}\)\)(?:return"high";|[\w$]{1,8}="high";)/.test(
      f
    )
      ? 1
      : 0,

  // patch 18: hm_normalize - 任一 model key 的 includes 形式
  18: f =>
    /\w\.includes\("claude-(?:opus-4-[15678]|sonnet-4-[56]|haiku-4-5)"\)/.test(
      f
    )
      ? 1
      : 0,

  // patch 22: unlock_sdk_url_host - b_c 函数完整.
  // 2.1.209+ 改 return shape 从 `return "..."` 到 `return {code:...,reason:"..."}`.
  22: f =>
    /function [\w$]{1,8}\(e\)\{let t;try\{t=new URL\(e\)\}catch\{return(?:`could not parse|\{code:"unparseable",reason:`could not parse)/.test(
      f
    )
      ? 1
      : 0,

  // patch 23: unlock_remote_gate - Yen 函数
  23: f =>
    /function [\w$]{1,8}\(\)\{if\(![\w$]{1,8}\(\)\)return!1;return!![\w$.]{1,20}ANTHROPIC_UNIX_SOCKET/.test(
      f
    )
      ? 1
      : 0,

  // patch 24: unlock_disable_rc - Jen 函数
  24: f =>
    /function [\w$]{1,8}\(\)\{return [\w$]{1,8}\(\)\?\.settings\.disableRemoteControl===!0\}/.test(
      f
    )
      ? 1
      : 0,

  // patch 25: force_1h_cache - gKe 函数完整 (bool-coerce helper 2.1.202 由 `it` 改 `ut`)
  25: f =>
    /function [\w$]{1,8}\(e\)\{if\([\w$]{1,4}\(process\.env\.FORCE_PROMPT_CACHING_5M\)\)return!1;if\([\w$]{1,4}\(process\.env\.ENABLE_PROMPT_CACHING_1H\)/.test(
      f
    )
      ? 1
      : 0,

  // patch 26: scrub_metadata - pMe/dLe/COt. 2.1.201: 无 parent_session_id;
  // 2.1.202+: 结构里插了 parent_session_id; 2.1.233+: account_uuid 有 2 个
  // accountUuid fallback (gWt/iu). `(?:...)+` 兜任意个 fallback.
  26: f =>
    /device_id:[\w$]{1,4}\(\),account_uuid:[\w$]{1,4}\([\w$]{1,4}\.CLAUDE_CODE_REMOTE\)&&[\w$]{1,4}\.CLAUDE_CODE_ACCOUNT_UUID(?:\|\|[\w$]{1,4}\(\)\?\.accountUuid)+\|\|"",session_id:[\w$]{1,4}\(\)/.test(
      f
    )
      ? 1
      : 0,

  // patch 27: disable_telemetry - G/I_/pto pristine 结构.
  // 2.1.202 local var reshuffle (n→r, pdn→ipr, I_→My, pto→kzn). 三个结构任一
  // pristine → applicable. 全参数化 local var LHS.
  // 2.1.209+: eventQueue.push 抽成 helper `X(sink,...)`, 两种 shape 都识.
  27: f =>
    /function [\w$]{1,4}\(e,t\)\{let [\w$]{1,4}=[\w$]{1,4};if\([\w$]{1,4}\.sink===null\)\{(?:[\w$]{1,4}\.eventQueue\.push|[\w$]{1,4}\([\w$]{1,4},)\{eventName:e,metadata:t,async:!1\}/.test(
      f
    ) ||
    /async function [\w$]{1,4}\(e,t\)\{let [\w$]{1,4}=[\w$]{1,4};if\([\w$]{1,4}\.sink===null\)\{(?:[\w$]{1,4}\.eventQueue\.push|[\w$]{1,4}\([\w$]{1,4},)\{eventName:e,metadata:t,async:!0\}/.test(
      f
    ) ||
    /function [\w$]{1,4}\(e\)\{if\(![\w$]{1,4}\(\)\)return;if\(![\w$]{1,4}\|\|[\w$]{1,4}\("firstParty"\)\)return;let [\w$]{1,4}=[\w$]{1,4}\(\),\{accountUuid:[\w$]{1,4},organizationUuid:[\w$]{1,4}\}=[\w$]{1,4}\(!0\),[\w$]{1,4}=\{event_type:"GrowthbookExperimentEvent"/.test(
      f
    )
      ? 1
      : 0,

  // patch 28: userType ant — pristine `function X(){return"external"}`.
  28: f => (/function [\w$]{1,8}\(\)\{return"external"\}/.test(f) ? 1 : 0),

  // patch 29: Bun.isStandaloneExecutable — pristine `return Bun.isStandaloneExecutable===!0`.
  29: f =>
    /function [\w$]{1,8}\(\)\{return Bun\.isStandaloneExecutable===!0\}/.test(f)
      ? 1
      : 0,

  // patch 30: Agent Teams — pristine gate check on env + tengu_amber_flint.
  // 2.1.218+ shape: env 直接对象访问 `ENV.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.
  30: f =>
    /function [\w$]{1,8}\(\)\{if\(![\w$]{1,4}\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS&&![\w$]{1,4}\(\)\)return!1;if\(![\w$]{1,4}\("tengu_amber_flint",!0\)\)return!1;return!0\}/.test(
      f
    )
      ? 1
      : 0,

  // patch 31: Ultraplan — pristine command def with `isEnabled:()=>!1` or `isEnabled:()=>fn()`.
  31: f =>
    /name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>(?:!1|[\w$]{1,4}\(\))/.test(
      f
    )
      ? 1
      : 0,

  // patch 32: Voice Mode — pristine anchor on tengu_amber_quartz_disabled.
  // 2.1.218+ 上游删了 flag, anchor 消失, obsolete 元数据会兜底判定.
  32: f =>
    /function [\w$]{1,8}\(\)\{return![\w$]{1,4}\("tengu_amber_quartz_disabled",!1\)\}/.test(
      f
    )
      ? 1
      : 0,

  // patch 33: Computer Use subscription — pristine plan="max"||"pro" gate
  33: f =>
    /function [\w$]{1,8}\(\)\{let [\w$]{1,4}=[\w$]{1,4}\(\);return [\w$]{1,4}==="max"\|\|[\w$]{1,4}==="pro"\}/.test(
      f
    )
      ? 1
      : 0,

  // patch 34: Computer Use default — pristine {enabled:!1,pixelValidation
  34: f => (f.includes('{enabled:!1,pixelValidation') ? 1 : 0),

  // patch 35: Ultrareview — pristine `return X()?.enabled===!0&&Y()&&!Z()`
  35: f =>
    /function [\w$]{1,8}\(\)\{return [\w$]{1,4}\(\)\?\.enabled===!0&&[\w$]{1,4}\(\)&&![\w$]{1,4}\(\)\}/.test(
      f
    )
      ? 1
      : 0,

  // patch 36: Auto-mode helper gate — pristine `if(!fn(x))return!1;` before firstParty check
  36: f =>
    /if\(![\w$]{1,4}\([\w$]{1,4}\)\)return!1;(?=(?:(?!function\s).){0,300}!=="firstParty")/.test(
      f
    )
      ? 1
      : 0,

  // patch 37: Auto-mode inline gate — pristine `if(x!=="firstParty"&&...) return!1`
  37: f =>
    /if\([\w$]{1,4}!=="firstParty"&&(?:[\w$]{1,4}!=="anthropicAws"|![\w$]{1,4}\([\w$]{1,4}\))[^;]*\)return!1;/.test(
      f
    )
      ? 1
      : 0,

  // patch 38: Glob/Grep — pristine bC/YH function
  38: f =>
    /function [\w$]{1,8}\(\)\{if\(![\w$]{1,4}\("true"\)\)return!1;if\([\w$]{1,4}\(\)\)return!1;return [\w$]{1,4}\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/.test(
      f
    ) ||
    /function [\w$]{1,8}\(\)\{if\(![\w$]{1,4}\("true"\)\)return!1;if\([\w$]{1,4}\(\)\)return!1;return process\.env\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/.test(
      f
    )
      ? 1
      : 0,
};

/**
 * 每个 patch 的 patched signature. 已 patched 后应该匹配.
 * 用于区分 already_applied (patched signature 存在) vs broken (都不在).
 */
const PATCHED_SIGNATURES: Record<number, (file: string) => number> = {
  // patch 1-11, 14, 15: anchor+tail 类, patched 后 anchor 消失 + 起止引号被空格包围.
  // 精确判定复杂, 靠 status heuristic: 若整段 CYBER 相关都不在文件里, 有可能是 patched.

  // patch 16: patched signature: return!0/* ... */
  16: f =>
    /function [\w$]{1,8}\(\)\{return!0\/\*[\s\S]{0,300}?\*\/\}/.test(f) ? 1 : 0,

  // patch 17: /*xxx*/ 替换 xhigh→high 判定
  17: f => (/\/\*x+\*\//.test(f) ? 1 : 0),

  // patch 18: /claude-...[.-]N/.test(...) 新形式
  18: f => (/\/claude-[a-z]+-4\[\.-\][15678]\/\.test\(/.test(f) ? 1 : 0),

  // patch 22: b_c 中和 return null. 2.1.209 obj-return shape 更长, 放宽 pad 上限.
  22: f =>
    /function [\w$]{1,8}\(e\)\{return null\/\*[\s\S]{0,800}?\*\/\}/.test(f)
      ? 1
      : 0,

  // patch 23: Yen 中和 return kc()
  23: f =>
    /function [\w$]{1,8}\(\)\{return [\w$]{1,8}\(\)\/\*[\s\S]{0,80}?\*\/\}/.test(
      f
    )
      ? 1
      : 0,

  // patch 24: Jen 中和 return!1
  24: f =>
    /function [\w$]{1,8}\(\)\{return!1\/\*[\s\S]{0,80}?\*\/\}/.test(f) ? 1 : 0,

  // patch 25: gKe 中和 - 直接返 !process.env.FORCE_PROMPT_CACHING_5M
  25: f =>
    /function [\w$]{1,8}\(e\)\{return!process\.env\.FORCE_PROMPT_CACHING_5M/.test(
      f
    )
      ? 1
      : 0,

  // patch 26: pMe/dLe/COt 中和 - session_id 后立即闭合 (无 device_id/account_uuid).
  // 三种变体:
  //   2.1.201 legacy: let X={...Y,session_id:F()};return{user_id:G(X)}/*
  //   2.1.202+ parent: let P=null,X={...Y,session_id:F(),...P&&{parent_session_id:P}};return{user_id:G(X)}/*
  //   2.1.233+ COt: 对象内 device_id/account_uuid 子串换等长注释, 留下
  //     `,/* ... */session_id:F()` 的注释-紧邻-session_id 标记
  26: f =>
    /let [\w$]{1,4}=(?:null,[\w$]{1,4}=)?\{\.\.\.[\w$]{1,4},session_id:[\w$]{1,4}\(\)(?:,\.\.\.[\w$]{1,4}&&\{parent_session_id:[\w$]{1,4}\})?\};return\{user_id:[\w$]{1,4}\([\w$]{1,4}\)\}\/\*/.test(
      f
    ) || /,\/\* *\*\/session_id:[\w$]{1,4}\(\)/.test(f)
      ? 1
      : 0,

  // patch 27: G/I_/pto 中和 signature.
  // 注: applier writeDisableTelemetry 已改成 all-or-nothing, 三个必须全 apply
  // 否则整体返回 null. 所以正常路径下, 到这里检查时状态只有两种:
  //   - 三个都 pristine (applier 未跑或跑失败) — anchor OR 会命中 → applicable
  //   - 三个都 patched — 下面 OR 命中任一 → already_applied
  // 参数化 minified names (G/I_/pto 会 rebundle 变名).
  27: f =>
    /async function [\w$]{1,4}\(\)\{\/\*[\s\S]{0,200}?\*\/\}/.test(f) ||
    /function [\w$]{1,4}\(\)\{\/\*[\s\S]{0,700}?\*\/\}/.test(f)
      ? 1
      : 0,

  // patch 28: userType 中和 → return"ant"/* pad */
  28: f =>
    /function [\w$]{1,8}\(\)\{return"ant"\/\*[\s\S]{0,20}?\*\/\}/.test(f)
      ? 1
      : 0,

  // patch 29: bun standalone 中和 → return!0/* pad */
  29: f =>
    /function [\w$]{1,8}\(\)\{return!0\/\*[\s\S]{0,80}?\*\/\}/.test(f) ? 1 : 0,

  // patch 30: Agent Teams 中和 → return!0/* pad */
  30: f =>
    /function [\w$]{1,8}\(\)\{return!0\/\*[\s\S]{0,200}?\*\/\}/.test(f) ? 1 : 0,

  // patch 31: Ultraplan patched → `isEnabled:()=>!0` (在 name:"ultraplan" 附近)
  31: f =>
    /name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>!0/.test(
      f
    )
      ? 1
      : 0,

  // patch 32: Voice Mode 中和 → return!0/* pad */
  32: f =>
    /function [\w$]{1,8}\(\)\{return!0\/\*[\s\S]{0,60}?\*\/\}/.test(f) ? 1 : 0,

  // patch 33-37: 全走 `function X(){return!0/* pad */}` 或整段删除 —
  // 精确 signature 会跟其他 return!0 patch 撞车. 用弱判定: pristine 已消失 = patched.
  // 因为 anchor pattern 用于 hits, patched pattern 只要 anchor 不再匹配就算 applied.
  // 这里返回 1 (总视为 patched) 让状态由 anchor hits 决定 (hits=0 → already_applied,
  // hits>0 → applicable).
  33: () => 1,
  34: () => 1,
  35: () => 1,
  36: () => 1,
  37: () => 1,

  // patch 38: Glob/Grep 中和后不再匹配 pristine, 只留 patched 特征 `EMBEDDED_SEARCH_TOOLS`
  // 从 env 读 (原本是 "true" 字面量)
  38: f =>
    f.includes('process.env.EMBEDDED_SEARCH_TOOLS')
      ? 1
      : 0,
};

const countHits = (file: string, id: number): number => {
  // anchor+tail 类 patch (2-11, 14-15) 用 anchor 常量直接匹配
  const at = ANCHOR_TAIL_PATCHES.find(p => p.id === id);
  if (at) return file.includes(at.anchor) ? 1 : 0;

  const fn = ANCHOR_SIGNATURES[id];
  return fn ? fn(file) : 0;
};

const countPatchedSignature = (file: string, id: number): number => {
  // patch 1 anchor+tail: 已 patched 时 anchor 完全消失 (被空格覆盖).
  // 无法直接检测 patched signature, 用启发式: 若原关键字 "authorized security testing"
  // 完全不在, 视为 patched. 但要排除 CC 版本重构导致 anchor 也消失的情况.
  const at = ANCHOR_TAIL_PATCHES.find(p => p.id === id);
  if (at || id === 1) {
    // For anchor+tail patches: if anchor is absent, we assume patched (best-effort).
    // Broken 判定需要额外结构 signature — 保守起见: anchor 不在 → 视为 patched.
    return 1;
  }

  const fn = PATCHED_SIGNATURES[id];
  return fn ? fn(file) : 0;
};

/**
 * 扫描 cli.js 内容, 返回 25 项 patch 状态.
 */
export const cspCheck = (file: string): CspCheckRow[] => {
  const rows: CspCheckRow[] = [];
  for (const meta of CSP_PATCH_META) {
    const hits = countHits(file, meta.id);
    const patchedHits = countPatchedSignature(file, meta.id);
    let state: CspPatchState;

    if (hits > 0) {
      // anchor 命中 = 可 apply
      state = 'applicable';
    } else if (meta.obsolete) {
      // 显式标记的 obsolete patch (patch 12/19/20/21)
      state = 'obsolete';
    } else if (patchedHits > 0) {
      // anchor 不在 + patched signature 在 = 已 patch
      state = 'already_applied';
    } else {
      // anchor 不在 + patched signature 也不在 = 上游改结构, 失效
      state = 'broken';
    }
    rows.push({
      id: meta.id,
      name: meta.name,
      layer: meta.layer,
      hits,
      state,
      markedObsolete: meta.obsolete,
    });
  }
  return rows;
};

/**
 * 从文件路径读并 check.
 * 若是 native binary, 优先抽 JS 段扫; 抽不出来才退回读整 binary.
 * (整 binary 的数据段 / Bun snapshot 常量表可能保留 anchor 字面量副本,
 *  直接扫会误报 "命中 = 可应用". 只有 JS runtime 段的判定才准.)
 */
export const cspCheckFile = (cliPath: string): CspCheckRow[] => {
  // Lazy require 避 esm/cjs 循环 (nativeInstallation 依赖 LIEF)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { extractClaudeJsFromNativeInstallation } = require('../../nativeInstallation') as {
      extractClaudeJsFromNativeInstallation: (
        p: string
      ) => { data: Buffer | null };
    };
    const ext = extractClaudeJsFromNativeInstallation(cliPath);
    if (ext.data) return cspCheck(ext.data.toString('utf8'));
  } catch {
    // fallthrough
  }
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
  applicable: rows.filter(r => r.state === 'applicable').length,
  alreadyApplied: rows.filter(r => r.state === 'already_applied').length,
  obsolete: rows.filter(r => r.state === 'obsolete').length,
  broken: rows.filter(r => r.state === 'broken').length,
  total: rows.length,
});

/**
 * 计算字符串在终端的显示宽度 (CJK 字符=2, 其他=1).
 * 用于表格对齐 — .length 不能正确处理中文.
 */
const displayWidth = (s: string): number => {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    // CJK ranges (合并 hiragana/katakana/hangul/CJK unified/full-width punct)
    const isWide =
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0x9fff) || // CJK Radicals, Kangxi, CJK Unified
      (code >= 0xa000 && code <= 0xa4cf) || // Yi
      (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compat Ideographs
      (code >= 0xfe30 && code <= 0xfe4f) || // CJK Compat Forms
      (code >= 0xff00 && code <= 0xff60) || // Full-width forms
      (code >= 0xffe0 && code <= 0xffe6) || // Full-width signs
      (code >= 0x20000 && code <= 0x2fffd); // CJK Extension B+
    w += isWide ? 2 : 1;
  }
  return w;
};

const padToWidth = (s: string, targetWidth: number): string => {
  const w = displayWidth(s);
  if (w >= targetWidth) return s;
  return s + ' '.repeat(targetWidth - w);
};

/**
 * 格式化为表格字符串 (TTY-friendly, ANSI 颜色, CJK 宽度感知).
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
  const header =
    padToWidth('#', 4) +
    padToWidth('层', 8) +
    padToWidth('名称', 40) +
    padToWidth('命中', 7) +
    '状态';
  lines.push(header);
  lines.push('─'.repeat(70));
  for (const r of rows) {
    lines.push(
      padToWidth(String(r.id), 4) +
        padToWidth(r.layer, 8) +
        padToWidth(r.name, 40) +
        padToWidth(String(r.hits), 7) +
        stateLabel[r.state]
    );
  }
  return lines.join('\n');
};
