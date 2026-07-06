// codex-session-patcher (csp) 移植: 结构 anchor 类 patch
// 覆盖原 Python patcher 的 patch #13, 16, 17, 18, 22, 23, 24, 25
//
// 每个 patch 有独立 regex + build 函数, 通过共享 applyRegexReplace 执行

import { applyRegexReplace } from './regexReplace';

// ---------- patch #13: danger_table_skip (Bash+PowerShell 破坏性命令检测) ----------
// 匹配 dr(表, e){for(...pattern.test(e))return xxx;...return null|默认值}
// 简单起见, 我们不做 (Python 版此项也被标为 special=danger_table_skip 但实际没独立处理逻辑, 是跟随 patch #12 一起做)
// Patch 12 obsolete (2.1.157+ 上游重写), 所以 patch 13 也失效.
// 我们保留 no-op 实现, 未来可实现新版拦截逻辑

export const writeDangerTableSkip = (file: string): string => {
  // Patch 12/13 upstream removed as of 2.1.157+.
  // Retained as obsolete for now.
  return file;
};

// ---------- patch #16: force_v0_true ----------
// 强制 v0() 直接 return true, 绕过 disableWorkflows/feature flag/settings 判定链
// 原: function <fn>(){if(<fn>())return!1;if(!<fn>())return!1;let{available:X,defaultOn:Y}=<fn>();if(!X)return!1;return <fn>()??Y}
// 新: function <fn>(){return!0/*<pad>*/}
export const writeForceV0True = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{if\([\w$]{1,8}\(\)\)return!1;if\(![\w$]{1,8}\(\)\)return!1;let\{available:[\w$]+,defaultOn:[\w$]+\}=[\w$]+\(\);if\(![\w$]+\)return!1;return [\w$]+\(\)\?\?[\w$]+\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
};

// ---------- patch #17: er() xhigh 不降级 ----------
// 匹配 if(T==="xhigh"&&!fn(H))return"high"; 或 if(i==="xhigh"&&!fn(e))i="high";
// 替换为等长 /*xxx*/ 空操作
export const writeErNoDowngrade = (file: string): string | null => {
  const pattern =
    /if\([\w$]{1,8}==="xhigh"&&![\w$]{1,8}\([\w$]{1,8}\)\)(?:return"high";|[\w$]{1,8}="high";)/g;
  const rx = new RegExp(pattern.source, 'g');

  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(file)) !== null) {
    const orig = m[0];
    const len = orig.length;
    if (len < 4) continue;
    const replacement = '/*' + 'x'.repeat(len - 4) + '*/';
    if (replacement.length !== len) continue;
    edits.push({ start: m.index, end: m.index + len, replacement });
    if (rx.lastIndex === m.index) rx.lastIndex = m.index + 1;
  }
  if (edits.length === 0) return null;

  let out = file;
  for (const e of edits.reverse()) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
};

// ---------- patch #18: HM 模型归一化 (4.7=4-7) ----------
// 把 X.includes("claude-...-4-Y") 改成 /claude-...-4[.-]Y/.test(X)
// 覆盖 8 个 model key
const HM_MODEL_KEYS: Array<[string, string]> = [
  ['opus-4-8', 'opus-4[.-]8'],
  ['opus-4-7', 'opus-4[.-]7'],
  ['opus-4-6', 'opus-4[.-]6'],
  ['opus-4-5', 'opus-4[.-]5'],
  ['opus-4-1', 'opus-4[.-]1'],
  ['sonnet-4-6', 'sonnet-4[.-]6'],
  ['sonnet-4-5', 'sonnet-4[.-]5'],
  ['haiku-4-5', 'haiku-4[.-]5'],
];

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const writeHmNormalizeDot = (file: string): string => {
  // Python 语义: 对 8 个 model key 各自在 pristine file 上做 regex 扫描 (不用
  // 已经改过的中间态), 收集所有 edit 后统一应用. TS 版本用同样的 discovery-first
  // apply-last 语义避免 key 重叠时 double-patch.
  type Edit = { start: number; end: number; replacement: string };
  const allEdits: Edit[] = [];
  for (const [oldSeg, newSeg] of HM_MODEL_KEYS) {
    const rx = new RegExp(
      `(\\w)\\.includes\\("claude-${escapeRegex(oldSeg)}"\\)`,
      'g'
    );
    let m: RegExpExecArray | null;
    while ((m = rx.exec(file)) !== null) {
      const orig = m[0];
      const varName = m[1];
      const core = `/claude-${newSeg}/.test(${varName})`;
      const pad = orig.length - core.length;
      if (pad < 0) continue;
      const replacement = core + ' '.repeat(pad);
      if (replacement.length !== orig.length) continue;
      allEdits.push({
        start: m.index,
        end: m.index + orig.length,
        replacement,
      });
      if (rx.lastIndex === m.index) rx.lastIndex = m.index + 1;
    }
  }
  if (allEdits.length === 0) return file;
  // 按 offset 降序, 反向应用 (避免偏移干扰)
  allEdits.sort((a, b) => b.start - a.start);
  let out = file;
  for (const e of allEdits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
};

// ---------- patch #22: unlock_sdk_url_host (b_c) ----------
export const writeUnlockSdkUrlHost = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(e\)\{let t;try\{t=new URL\(e\)\}catch\{return`could not parse \$\{[\w$]{1,8}\(e\)\} as a URL`\}if\([\w$]{1,8}\.has\(t\.hostname\)\)\{if\(t\.protocol!=="wss:"&&t\.protocol!=="https:"\)return`scheme \$\{[\w$]{1,8}\(t\.protocol\)\} is not permitted for host \$\{[\w$]{1,8}\(t\.hostname\)\}; only wss:\/\/ and https:\/\/ are accepted`;return null\}return`host \$\{[\w$]{1,8}\(t\.hostname\)\} is not an approved Anthropic endpoint`\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(e){return null`, tail: '}' }),
  });
};

// ---------- patch #23: unlock_remote_gate (Yen) ----------
export const writeUnlockRemoteGate = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{if\(!([\w$]{1,8})\(\)\)return!1;return!![\w$.]{1,20}ANTHROPIC_UNIX_SOCKET\|\|[\w$]{1,8}\(\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return ${m[2]}()`, tail: '}' }),
  });
};

// ---------- patch #24: unlock_disable_rc (Jen) ----------
export const writeUnlockDisableRc = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{return [\w$]{1,8}\(\)\?\.settings\.disableRemoteControl===!0\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return!1`, tail: '}' }),
  });
};

// ---------- patch #25: force_1h_cache (gKe) ----------
export const writeForce1hCache = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(e\)\{if\(it\(process\.env\.FORCE_PROMPT_CACHING_5M\)\)return!1;if\(it\(process\.env\.ENABLE_PROMPT_CACHING_1H\)\|\|mr\(\)==="bedrock"&&it\(process\.env\.ENABLE_PROMPT_CACHING_1H_BEDROCK\)\)return!0;if\(![\w$]{1,8}\(\)\|\|[\w$]{1,8}\.isUsingOverage\)return!1;let t=[\w$]{1,8}\(\);if\(t===null\)t=[\w$]{1,4}\("tengu_prompt_cache_1h_config",\{allowlist:\[[^\]]{1,300}\]\}\)\.allowlist\?\?\[\],[\w$]{1,8}\(t\);return e!==void 0&&t\.some\(\([\w$]{1,3}\)=>[\w$]{1,3}\.endsWith\("\*"\)\?e\.startsWith\([\w$]{1,3}\.slice\(0,-1\)\):e===[\w$]{1,3}\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({
      body: `function ${m[1]}(e){return!it(process.env.FORCE_PROMPT_CACHING_5M)`,
      tail: '}',
    }),
  });
};

// ---------- patch #26: scrub_metadata_user_id (pMe) ----------
// HitCC XLe() = 本项目 pMe():
// 原: let r={...e,device_id:Hj(),account_uuid:it(Ie.CLAUDE_CODE_REMOTE)&&Ie.CLAUDE_CODE_ACCOUNT_UUID||Cc()?.accountUuid||"",session_id:Pt()};return{user_id:De(r)}
// 新: 剥 device_id + account_uuid, 保 session_id (caching/rate-limit 依赖) 和 CLAUDE_CODE_EXTRA_METADATA (用户 escape hatch)
// minified names (`it`, `Ie`) 都用 [\w$]{1,4} 兼容 rebundle.
export const writeScrubMetadata = (file: string): string | null => {
  const pattern =
    /let ([\w$]{1,4})=\{\.\.\.([\w$]{1,4}),device_id:([\w$]{1,4})\(\),account_uuid:[\w$]{1,4}\([\w$]{1,4}\.CLAUDE_CODE_REMOTE\)&&[\w$]{1,4}\.CLAUDE_CODE_ACCOUNT_UUID\|\|([\w$]{1,4})\(\)\?\.accountUuid\|\|"",session_id:([\w$]{1,4})\(\)\};return\{user_id:([\w$]{1,4})\(\1\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({
      body: `let ${m[1]}={...${m[2]},session_id:${m[5]}()};return{user_id:${m[6]}(${m[1]})}`,
      tail: '',
    }),
  });
};

// ---------- patch #27: disable_telemetry (G, I_, pto) ----------
// 断三个 telemetry 入口:
//   - G(e,t): sync Statsig sink (所有 tengu_*, api_refusal, ClaudeCodeInternalEvent)
//   - I_(e,t): async 版
//   - pto(e): GrowthBook experiment event (含 device_id + account_uuid + session_id)
// 保留 GrowthBook fetch (feature-flag 分发), 只断"上传"方向.
//
// **All-or-nothing**: 三个子 patch 必须全部中和, 否则返回 null.
// 部分应用 = 剩下的 sink 仍在漏 telemetry, 违反 patch 意图, 应视为失败.
export const writeDisableTelemetry = (file: string): string | null => {
  const gPattern =
    /function ([\w$]{1,4})\(e,t\)\{let n=([\w$]{1,4});if\(n\.sink===null\)\{n\.eventQueue\.push\(\{eventName:e,metadata:t,async:!1\}\);return\}n\.sink\.logEvent\(e,t\)\}/g;
  const iPattern =
    /async function ([\w$]{1,4})\(e,t\)\{let n=([\w$]{1,4});if\(n\.sink===null\)\{n\.eventQueue\.push\(\{eventName:e,metadata:t,async:!0\}\);return\}await n\.sink\.logEventAsync\(e,t\)\}/g;
  const ptoPattern =
    /function ([\w$]{1,4})\(e\)\{if\(!([\w$]{1,4})\(\)\)return;if\(!([\w$]{1,4})\|\|([\w$]{1,4})\("firstParty"\)\)return;let t=([\w$]{1,4})\(\),\{accountUuid:n,organizationUuid:r\}=([\w$]{1,4})\(!0\),o=\{event_type:"GrowthbookExperimentEvent",event_id:([\w$]{1,4})\.randomUUID\(\),experiment_id:e\.experimentId,variation_id:e\.variationId,\.\.\.t&&\{device_id:t\},\.\.\.n&&\{account_uuid:n\},\.\.\.r&&\{organization_uuid:r\},\.\.\.e\.userAttributes&&\{session_id:e\.userAttributes\.sessionId,user_attributes:([\w$]{1,4})\(\{appVersion:e\.userAttributes\.appVersion\}\)\},\.\.\.e\.experimentMetadata&&\{experiment_metadata:\8\(e\.experimentMetadata\)\},environment:([\w$]{1,4})\(\)\},s=new Date;\3\.emit\(\{timestamp:s,observedTimestamp:s,body:"growthbook_experiment",attributes:o\}\)\}/g;

  const gResult = applyRegexReplace(file, {
    pattern: gPattern,
    build: (m) => ({ body: `function ${m[1]}(){`, tail: '}' }),
  });
  if (gResult === null) return null;

  const iResult = applyRegexReplace(gResult, {
    pattern: iPattern,
    build: (m) => ({ body: `async function ${m[1]}(){`, tail: '}' }),
  });
  if (iResult === null) return null;

  const ptoResult = applyRegexReplace(iResult, {
    pattern: ptoPattern,
    build: (m) => ({ body: `function ${m[1]}(){`, tail: '}' }),
  });
  if (ptoResult === null) return null;

  return ptoResult;
};

// ---------- OBSOLETE patch #19-21 (China fingerprint), 保留元数据 ----------
// 上游 2.1.198+ 已自行移除相关代码, 无需应用

// ---------- 汇总 apply-all 入口 ----------
export const applyAllSpecialPatches = (file: string): string => {
  let out = file;
  for (const fn of [
    // patch 13 no-op
    writeForceV0True,
    writeErNoDowngrade,
    writeUnlockSdkUrlHost,
    writeUnlockRemoteGate,
    writeUnlockDisableRc,
    writeForce1hCache,
    writeScrubMetadata,
    writeDisableTelemetry,
  ]) {
    const r = fn(out);
    if (r !== null) out = r;
  }
  // hm_normalize_dot 有独立 fn (返回 file 不是 null)
  out = writeHmNormalizeDot(out);
  return out;
};
