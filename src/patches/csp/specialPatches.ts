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
//
// 2.1.212+ 上游把 v0() 拆成两个函数:
//   KA()  — main entry (20+ callers), 逻辑同 legacy v0
//   RNr() — secondary gate (3 callers, 简化 && 链)
// 两个都要中和成 return!0 才能真正启用 workflows.
export const writeForceV0True = (file: string): string | null => {
  // Legacy tail: `return X()??Y}`. 2.1.212 tail: `return rL()?.settings.enableWorkflows??t}`.
  // 用 [^}]{0,80} 兜底两种.
  // 2.1.227+ 把 available/defaultOn 来源从函数调用 `X()` 换成方法调用
  // `Rhs.resolve()` (main) / `Rhs.resolve().available` (short chain), 故两处
  // 调用点加可选 `(?:\.[\w$]{1,12})?` 兜住方法调用, 同时兼容旧版裸函数调用.
  const patternLegacy =
    /function ([\w$]{1,8})\(\)\{if\([\w$]{1,8}\(\)\)return!1;if\(![\w$]{1,8}\(\)\)return!1;let\{available:[\w$]+,defaultOn:[\w$]+\}=[\w$]{1,8}(?:\.[\w$]{1,12})?\(\);if\(![\w$]+\)return!1;return [^}]{1,80}\}/g;
  const patternShortChain =
    /function ([\w$]{1,8})\(\)\{return [\w$]{1,8}\(\)&&![\w$]{1,8}\(process\.env\.CLAUDE_CODE_DISABLE_WORKFLOWS\)&&[\w$]{1,8}(?:\.[\w$]{1,12})?\(\)\.available\}/g;

  let out: string | null = file;
  const legacyResult = applyRegexReplace(out ?? file, {
    pattern: patternLegacy,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
  if (legacyResult !== null) out = legacyResult;

  const shortResult = applyRegexReplace(out ?? file, {
    pattern: patternShortChain,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
  if (shortResult !== null) out = shortResult;

  return out === file ? null : out;
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
// 2.1.209+ 改了 return shape: 从 `return "错误消息"` 变成
// `return {code:"...",reason:"错误消息"}`. 两种 shape 都覆盖.
export const writeUnlockSdkUrlHost = (file: string): string | null => {
  const patternLegacy =
    /function ([\w$]{1,8})\(e\)\{let t;try\{t=new URL\(e\)\}catch\{return`could not parse \$\{[\w$]{1,8}\(e\)\} as a URL`\}if\([\w$]{1,8}\.has\(t\.hostname\)\)\{if\(t\.protocol!=="wss:"&&t\.protocol!=="https:"\)return`scheme \$\{[\w$]{1,8}\(t\.protocol\)\} is not permitted for host \$\{[\w$]{1,8}\(t\.hostname\)\}; only wss:\/\/ and https:\/\/ are accepted`;return null\}return`host \$\{[\w$]{1,8}\(t\.hostname\)\} is not an approved Anthropic endpoint`\}/g;
  const legacy = applyRegexReplace(file, {
    pattern: patternLegacy,
    build: m => ({ body: `function ${m[1]}(e){return null`, tail: '}' }),
  });
  if (legacy !== null) return legacy;

  const patternObj =
    /function ([\w$]{1,8})\(e\)\{let t;try\{t=new URL\(e\)\}catch\{return\{code:"unparseable",reason:`could not parse \$\{[\w$]{1,8}\(e\)\} as a URL`\}\}if\([\w$]{1,8}\.has\(t\.hostname\)\)\{if\(t\.protocol!=="wss:"&&t\.protocol!=="https:"\)return\{code:"bad_scheme",reason:`scheme \$\{[\w$]{1,8}\(t\.protocol\)\} is not permitted for host \$\{[\w$]{1,8}\(t\.hostname\)\}; only wss:\/\/ and https:\/\/ are accepted`\};return null\}return\{code:"not_allowlisted",reason:`host \$\{[\w$]{1,8}\(t\.hostname\)\} is not an approved Anthropic endpoint`\}\}/g;
  return applyRegexReplace(file, {
    pattern: patternObj,
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
// 2.1.202 minifier 把 `it()` bool-coerce helper 重命名成 `ut()`, 所以
// 所有 `[\w$]{1,4}\(process\.env\.XXX\)` 位置都参数化. build 里 truthy 检查用
// 内嵌 `!!` 而不是依赖某个 minified helper 名, 保证跨版本稳定.
export const writeForce1hCache = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(e\)\{if\([\w$]{1,4}\(process\.env\.FORCE_PROMPT_CACHING_5M\)\)return!1;if\([\w$]{1,4}\(process\.env\.ENABLE_PROMPT_CACHING_1H\)\|\|[\w$]{1,4}\(\)==="bedrock"&&[\w$]{1,4}\(process\.env\.ENABLE_PROMPT_CACHING_1H_BEDROCK\)\)return!0;if\(![\w$]{1,8}\(\)\|\|[\w$]{1,8}(?:\(\))?\.isUsingOverage\)return!1;let t=[\w$]{1,8}\(\);if\(t===null\)t=[\w$]{1,4}\("tengu_prompt_cache_1h_config",\{allowlist:\[[^\]]{1,300}\]\}\)\.allowlist\?\?\[\],[\w$]{1,8}\(t\);return e!==void 0&&t\.some\(\([\w$]{1,3}\)=>[\w$]{1,3}\.endsWith\("\*"\)\?e\.startsWith\([\w$]{1,3}\.slice\(0,-1\)\):e===[\w$]{1,3}\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({
      body: `function ${m[1]}(e){return!process.env.FORCE_PROMPT_CACHING_5M`,
      tail: '}',
    }),
  });
};

// ---------- patch #26: scrub_metadata_user_id (pMe / dLe) ----------
// HitCC XLe(). 覆盖两种上游结构:
//   2.1.201: let r={...e,device_id:Hj(),account_uuid:it(Ie.CLAUDE_CODE_REMOTE)&&Ie.CLAUDE_CODE_ACCOUNT_UUID||Cc()?.accountUuid||"",session_id:Pt()};return{user_id:De(r)}
//   2.1.202: let r=PL(),o={...e,device_id:k8(),account_uuid:ut(ke.CLAUDE_CODE_REMOTE)&&ke.CLAUDE_CODE_ACCOUNT_UUID||bc()?.accountUuid||"",session_id:Pt(),...r&&{parent_session_id:r}};return{user_id:He(o)}
//
// 结构差异:
//   - 2.1.202 引入 parent_session 前缀 `let r=PL(),` (可选)
//   - object holder 变量名 (r / o) 不固定
//   - 尾部可能有 `,...r&&{parent_session_id:r}` (跟 parent 分支联动, 可选)
//
// 用两个不同 regex 覆盖两种; 保留 session_id + parent_session_id (subagent
// lineage 内部关联, 服务端已通过 API key 知道账号) + CLAUDE_CODE_EXTRA_METADATA
// escape hatch. 剥掉真的 fingerprint 面: device_id + account_uuid.
export const writeScrubMetadata = (file: string): string | null => {
  // 2.1.202+: let X=Y(),Z={...e,...device_id...session_id:...(),...X&&{parent_session_id:X}};return{user_id:F(Z)}
  const patternWithParent =
    /let ([\w$]{1,4})=[\w$]{1,4}\(\),([\w$]{1,4})=\{\.\.\.([\w$]{1,4}),device_id:[\w$]{1,4}\(\),account_uuid:[\w$]{1,4}\([\w$]{1,4}\.CLAUDE_CODE_REMOTE\)&&[\w$]{1,4}\.CLAUDE_CODE_ACCOUNT_UUID\|\|[\w$]{1,4}\(\)\?\.accountUuid\|\|"",session_id:([\w$]{1,4})\(\),\.\.\.\1&&\{parent_session_id:\1\}\};return\{user_id:([\w$]{1,4})\(\2\)\}/g;
  const withParent = applyRegexReplace(file, {
    pattern: patternWithParent,
    build: m => ({
      // m[1]=parent var, m[2]=obj var, m[3]=extra spread, m[4]=session_id fn, m[5]=stringify fn
      body: `let ${m[1]}=null,${m[2]}={...${m[3]},session_id:${m[4]}(),...${m[1]}&&{parent_session_id:${m[1]}}};return{user_id:${m[5]}(${m[2]})}`,
      tail: '',
    }),
  });
  if (withParent !== null) return withParent;

  // 2.1.201 legacy shape: let X={...e,...session_id:...()};return{user_id:F(X)}
  const patternLegacy =
    /let ([\w$]{1,4})=\{\.\.\.([\w$]{1,4}),device_id:[\w$]{1,4}\(\),account_uuid:[\w$]{1,4}\([\w$]{1,4}\.CLAUDE_CODE_REMOTE\)&&[\w$]{1,4}\.CLAUDE_CODE_ACCOUNT_UUID\|\|[\w$]{1,4}\(\)\?\.accountUuid\|\|"",session_id:([\w$]{1,4})\(\)\};return\{user_id:([\w$]{1,4})\(\1\)\}/g;
  const legacy = applyRegexReplace(file, {
    pattern: patternLegacy,
    build: m => ({
      body: `let ${m[1]}={...${m[2]},session_id:${m[3]}()};return{user_id:${m[4]}(${m[1]})}`,
      tail: '',
    }),
  });
  if (legacy !== null) return legacy;

  // 2.1.233+ 重构: metadata 对象嵌在逗号序列里, 不再是独立 `let X={...};return`
  // 语句, 且有更多字段:
  //   a={...o&&{ti:o},device_id:yhe(),account_uuid:Ln(V.CLAUDE_CODE_REMOTE)&&
  //     V.CLAUDE_CODE_ACCOUNT_UUID||gWt()?.accountUuid||iu()?.accountUuid||"",
  //     session_id:Gt(),...i&&{parent_session_id:i},...s&&{tk:s}}
  // account_uuid 的 accountUuid fallback 从 1 个增到 2 个 (gWt/iu), 用 `+` 兜住
  // 任意个. 只剥 device_id + account_uuid 子串 (换等长注释), 保 session_id 及
  // 其后的 parent_session_id / tk 分支不动.
  const patternV3 =
    /device_id:[\w$]{1,4}\(\),account_uuid:[\w$]{1,4}\([\w$]{1,4}\.CLAUDE_CODE_REMOTE\)&&[\w$]{1,4}\.CLAUDE_CODE_ACCOUNT_UUID(?:\|\|[\w$]{1,4}\(\)\?\.accountUuid)+\|\|"",session_id:/g;
  return applyRegexReplace(file, {
    pattern: patternV3,
    build: () => ({ body: '', tail: 'session_id:' }),
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
  // 全参数化: 函数名 + local var LHS 名 + 引用的 minified helpers 都用 [\w$]{1,4}.
  // backreference 保 local var 一致.
  // 2.1.202 local var reshuffle: `let n=pdn` → `let r=ipr`. pto 里
  // accountUuid/organizationUuid 也可能绑不同 var 名. 结构不变.
  // 2.1.209+: 队列 push 从 inline `n.eventQueue.push({...})` 抽成 helper
  // `X(n, {...})`. 两种 shape 都吃.
  // 2.1.238+: state 来源从裸 ident `let r=Z;` 换成方法链 `let r=j1o().state;`,
  // 故 RHS 加可选 `(?:\(\))?(?:\.[\w$]{1,8})?` 兜住 Z / Z() / Z().state.
  const gPattern =
    /function ([\w$]{1,4})\(e,t\)\{let ([\w$]{1,4})=[\w$]{1,4}(?:\(\))?(?:\.[\w$]{1,8})?;if\(\2\.sink===null\)\{(?:\2\.eventQueue\.push\(\{eventName:e,metadata:t,async:!1\}\)|[\w$]{1,4}\(\2,\{eventName:e,metadata:t,async:!1\}\));return\}\2\.sink\.logEvent\(e,t\)\}/g;
  const iPattern =
    /async function ([\w$]{1,4})\(e,t\)\{let ([\w$]{1,4})=[\w$]{1,4}(?:\(\))?(?:\.[\w$]{1,8})?;if\(\2\.sink===null\)\{(?:\2\.eventQueue\.push\(\{eventName:e,metadata:t,async:!0\}\)|[\w$]{1,4}\(\2,\{eventName:e,metadata:t,async:!0\}\));return\}await \2\.sink\.logEventAsync\(e,t\)\}/g;
  const ptoPattern =
    /function ([\w$]{1,4})\(e\)\{if\(![\w$]{1,4}\(\)\)return;if\(!([\w$]{1,4})\|\|[\w$]{1,4}\("firstParty"\)\)return;let ([\w$]{1,4})=[\w$]{1,4}\(\),\{accountUuid:([\w$]{1,4}),organizationUuid:([\w$]{1,4})\}=[\w$]{1,4}\(!0\),([\w$]{1,4})=\{event_type:"GrowthbookExperimentEvent",event_id:[\w$]{1,4}\.randomUUID\(\),experiment_id:e\.experimentId,variation_id:e\.variationId,\.\.\.\3&&\{device_id:\3\},\.\.\.\4&&\{account_uuid:\4\},\.\.\.\5&&\{organization_uuid:\5\},\.\.\.e\.userAttributes&&\{session_id:e\.userAttributes\.sessionId,user_attributes:[\w$]{1,4}\(\{appVersion:e\.userAttributes\.appVersion\}\)\},\.\.\.e\.experimentMetadata&&\{experiment_metadata:[\w$]{1,4}\(e\.experimentMetadata\)\},environment:[\w$]{1,4}\(\)\},([\w$]{1,4})=new Date;\2\.emit\(\{timestamp:\7,observedTimestamp:\7,body:"growthbook_experiment",attributes:\6\}\)\}/g;

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

  // pto (GrowthBook experiment event send) 2.1.212+ 上游整个 pto 函数已删,
  // GrowthBook event 只在 exporter 内部 transformLogsToEvents 出现 — G/I_ 断掉
  // 后没有代码路径调用它. pto 找不到时不当失败, 只是 no-op 视为可选.
  const ptoResult = applyRegexReplace(iResult, {
    pattern: ptoPattern,
    build: (m) => ({ body: `function ${m[1]}(){`, tail: '}' }),
  });
  return ptoResult ?? iResult;
};

// ---------- OBSOLETE patch #19-21 (China fingerprint), 保留元数据 ----------
// 上游 2.1.198+ 已自行移除相关代码, 无需应用

// ---------- 汇总 apply-all 入口 ----------
// ---------- patch #28: userType_ant (from clawgod) ----------
// 把 external user 标记翻成 Anthropic internal, 解锁隐藏 slash commands
// (/share, /teleport, /issue, /bughunter, /admin 等 24+ 条).
// 原: function X(){return"external"}
// 新: function X(){return"ant"}
export const writeUserTypeAnt = (file: string): string | null => {
  const pattern = /function ([\w$]{1,8})\(\)\{return"external"\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return"ant"`, tail: '}' }),
  });
};

// ---------- patch #29: bun_standalone_true (from clawgod) ----------
// Bun.isStandaloneExecutable 在 tweakcc 场景本身就是 true (咱 patch native
// binary), 但为将来支持 plain-Bun 运行 patched cli.js 场景兜底: 让 fn 恒返 true.
// 原: function X(){return Bun.isStandaloneExecutable===!0}
// 新: function X(){return!0}
export const writeBunStandaloneTrue = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{return Bun\.isStandaloneExecutable===!0\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
};

// ---------- patch #30: agent_teams_always_on (from clawgod) ----------
// 强开 Agent Teams (multi-agent swarm), 绕 env + GrowthBook 双 gate.
// 2.1.218+ shape (env 从 `it(process.env.X)` helper 变成 `Z.X` 直接访问):
//   function X(){if(!ENV.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS&&!Y())return!1;
//     if(!R("tengu_amber_flint",!0))return!1;return!0}
export const writeAgentTeamsAlwaysOn = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{if\(![\w$]{1,4}\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS&&![\w$]{1,4}\(\)\)return!1;if\(![\w$]{1,4}\("tengu_amber_flint",!0\)\)return!1;return!0\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
};

// ---------- patch #31: ultraplan_enable (from clawgod) ----------
// Ultraplan (multi-agent planning via Claude Code Remote) 默认 gate off. 强开.
// Shape: 命令定义里 `isEnabled:()=>!1` 或 `isEnabled:()=>helper()` 都改成 `isEnabled:()=>!0`.
// anchor 用 `name:"ultraplan"` + `argumentHint:"<prompt>"` 双向锚定.
export const writeUltraplanEnable = (file: string): string | null => {
  const pattern =
    /(name:"ultraplan",[\s\S]{1,500}?argumentHint:"<prompt>",isEnabled:\(\)=>)(?:!1|[\w$]{1,4}\(\))/g;
  // 特殊: 长度可能不同 (原 `!1` 2字符, 或 `X()` 3+字符, 新 `!0` 2字符).
  // 用 applyRegexReplace 需要等长, 手工做.
  const matches = [...file.matchAll(pattern)];
  if (matches.length === 0) return null;
  let out = file;
  let offset = 0;
  for (const m of matches) {
    if (m.index === undefined) continue;
    const orig = m[0];
    const prefix = m[1];
    const newStr = `${prefix}!0`;
    const start = m.index + offset;
    const end = start + orig.length;
    if (orig === newStr) continue; // idempotent
    out = out.slice(0, start) + newStr + out.slice(end);
    offset += newStr.length - orig.length;
  }
  return out === file ? null : out;
};

// ---------- patch #33: computer_use_subscription_bypass (from clawgod) ----------
// 原: function X(){let plan=fn();return plan==="max"||plan==="pro"}
// 新: 恒返 true (免 Max/Pro subscription)
export const writeComputerUseSubscription = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{let [\w$]{1,4}=[\w$]{1,4}\(\);return [\w$]{1,4}==="max"\|\|[\w$]{1,4}==="pro"\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
};

// ---------- patch #34: computer_use_default_enabled (from clawgod) ----------
// {enabled:!1,pixelValidation:...} → {enabled:!0,pixelValidation:...}.
// 单值替换, 手工 (非等长).
export const writeComputerUseDefaultEnabled = (
  file: string
): string | null => {
  const anchor = '{enabled:!1,pixelValidation';
  const replace = '{enabled:!0,pixelValidation';
  if (!file.includes(anchor)) return null;
  return file.replaceAll(anchor, replace);
};

// ---------- patch #35: ultrareview_enable_rqt (from clawgod) ----------
// 原: function X(){return Y()?.enabled===!0&&Z()&&!W()}
// 新: 恒返 true
export const writeUltrareviewEnable = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{return [\w$]{1,4}\(\)\?\.enabled===!0&&[\w$]{1,4}\(\)&&![\w$]{1,4}\(\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
};

// ---------- patch #36: auto_mode_3rd_party_helper (from clawgod) ----------
// 移除 `if(!helper(param))return!1;` provider gate (2.1.158+ 引入).
// 非等长 (删除整段) — 手工处理.
export const writeAutoModeHelperGate = (file: string): string | null => {
  const pattern =
    /if\(!([\w$]{1,4})\(([\w$]{1,4})\)\)return!1;(?=(?:(?!function\s).){0,300}!=="firstParty")/g;
  const matches = [...file.matchAll(pattern)];
  if (matches.length === 0) return null;
  let out = file;
  let offset = 0;
  for (const m of matches) {
    if (m.index === undefined) continue;
    const start = m.index + offset;
    const end = start + m[0].length;
    out = out.slice(0, start) + out.slice(end);
    offset -= m[0].length;
  }
  return out === file ? null : out;
};

// ---------- patch #37: auto_mode_3rd_party_inline (from clawgod) ----------
// 移除 `if(X!=="firstParty"&&(X!=="anthropicAws"|!fn(X)) && (...))return!1;`
// 非等长 — 手工.
export const writeAutoModeInlineGate = (file: string): string | null => {
  const pattern =
    /if\(([\w$]{1,4})!=="firstParty"&&(?:\1!=="anthropicAws"|![\w$]{1,4}\(\1\))[^;]*\)return!1;/g;
  const matches = [...file.matchAll(pattern)];
  if (matches.length === 0) return null;
  let out = file;
  let offset = 0;
  for (const m of matches) {
    if (m.index === undefined) continue;
    const start = m.index + offset;
    const end = start + m[0].length;
    out = out.slice(0, start) + out.slice(end);
    offset -= m[0].length;
  }
  return out === file ? null : out;
};

// ---------- patch #38: restore_glob_grep (from clawgod) ----------
// Bun compile 把 `EMBEDDED_SEARCH_TOOLS` env inline 成 "true" 字面量,
// 导致 bC()/YH() 恒返 true, 隐藏内置 Glob/Grep. 反 inline + 加 bfs/ugrep
// 可用性检测.
// 2.1.218+ shape: `Z.CLAUDE_CODE_ENTRYPOINT` (env registry 代理).
// Legacy shape: `process.env.CLAUDE_CODE_ENTRYPOINT`.
export const writeRestoreGlobGrep = (file: string): string | null => {
  // 2.1.218+ 用 Z.CLAUDE_CODE_ENTRYPOINT (env registry proxy)
  const pattern212 =
    /function ([\w$]{1,8})\(\)\{if\(!([\w$]{1,4})\("true"\)\)return!1;if\([\w$]{1,4}\(\)\)return!1;return ([\w$]{1,4})\.CLAUDE_CODE_ENTRYPOINT!=="local-agent"\}/g;
  const matches212 = [...file.matchAll(pattern212)];
  if (matches212.length > 0) {
    let out = file;
    let offset = 0;
    for (const m of matches212) {
      if (m.index === undefined) continue;
      const orig = m[0];
      const [, fn, envCheck, envProxy] = m;
      // Body 里 EMBEDDED_SEARCH_TOOLS 从 process.env 读, 让 helper 真读环境变量;
      // 再 attach bfs/ugrep 可用性预检.
      const newBody = `function ${fn}(){if(!${envCheck}(process.env.EMBEDDED_SEARCH_TOOLS))return!1;if(typeof globalThis.__dpBinOk>"u"){try{var _w=process.platform==="win32"?"where":"which";require("child_process").execFileSync(_w,["bfs"],{timeout:2e3});require("child_process").execFileSync(_w,["ugrep"],{timeout:2e3});globalThis.__dpBinOk=!0}catch{globalThis.__dpBinOk=!1}}if(!globalThis.__dpBinOk)return!1;return ${envProxy}.CLAUDE_CODE_ENTRYPOINT!=="local-agent"}`;
      const start = m.index + offset;
      const end = start + orig.length;
      out = out.slice(0, start) + newBody + out.slice(end);
      offset += newBody.length - orig.length;
    }
    return out;
  }
  return null;
};

// ---------- patch #32: voice_mode_enable (OBSOLETE - 上游 2.1.218+ 已删 flag) ----------
// 原目标: function X(){return!R("tengu_amber_quartz_disabled",!1)}
// 上游 2.1.218 已从 binary 移除 `tengu_amber_quartz_disabled` 字面量, patch
// 无 anchor 可锚. 标 obsolete, 若未来 flag 名换成别的可以复活.
export const writeVoiceModeEnable = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{return![\w$]{1,4}\("tengu_amber_quartz_disabled",!1\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: m => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
  });
};

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
    writeUserTypeAnt,
    writeBunStandaloneTrue,
    writeAgentTeamsAlwaysOn,
    writeUltraplanEnable,
    writeVoiceModeEnable, // obsolete on 2.1.218+ but keep for pre-2.1.218
    writeComputerUseSubscription,
    writeComputerUseDefaultEnabled,
    writeUltrareviewEnable,
    writeAutoModeHelperGate,
    writeAutoModeInlineGate,
    writeRestoreGlobGrep,
  ]) {
    const r = fn(out);
    if (r !== null) out = r;
  }
  // hm_normalize_dot 有独立 fn (返回 file 不是 null)
  out = writeHmNormalizeDot(out);
  return out;
};
