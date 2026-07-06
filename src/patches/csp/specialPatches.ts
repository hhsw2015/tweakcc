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
    build: (m) => ({ body: `function ${m[1]}(){return!0`, tail: '}' }),
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

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const writeHmNormalizeDot = (file: string): string => {
  let out = file;
  let anyMatched = false;
  for (const [oldSeg, newSeg] of HM_MODEL_KEYS) {
    const pattern = new RegExp(
      `(\\w)\\.includes\\("claude-${escapeRegex(oldSeg)}"\\)`,
      'g'
    );
    const rx = new RegExp(pattern.source, 'g');
    const edits: Array<{ start: number; end: number; replacement: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(out)) !== null) {
      const orig = m[0];
      const varName = m[1];
      // new form: /claude-<newSeg>/.test(<var>)
      const core = `/claude-${newSeg}/.test(${varName})`;
      const pad = orig.length - core.length;
      if (pad < 0) continue;
      const replacement = core + ' '.repeat(pad);
      if (replacement.length !== orig.length) continue;
      edits.push({ start: m.index, end: m.index + orig.length, replacement });
      if (rx.lastIndex === m.index) rx.lastIndex = m.index + 1;
    }
    if (edits.length === 0) continue;
    anyMatched = true;
    for (const e of edits.reverse()) {
      out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    }
  }
  return anyMatched ? out : file;
};

// ---------- patch #22: unlock_sdk_url_host (b_c) ----------
export const writeUnlockSdkUrlHost = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(e\)\{let t;try\{t=new URL\(e\)\}catch\{return`could not parse \$\{[\w$]{1,8}\(e\)\} as a URL`\}if\([\w$]{1,8}\.has\(t\.hostname\)\)\{if\(t\.protocol!=="wss:"&&t\.protocol!=="https:"\)return`scheme \$\{[\w$]{1,8}\(t\.protocol\)\} is not permitted for host \$\{[\w$]{1,8}\(t\.hostname\)\}; only wss:\/\/ and https:\/\/ are accepted`;return null\}return`host \$\{[\w$]{1,8}\(t\.hostname\)\} is not an approved Anthropic endpoint`\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: (m) => ({ body: `function ${m[1]}(e){return null`, tail: '}' }),
  });
};

// ---------- patch #23: unlock_remote_gate (Yen) ----------
export const writeUnlockRemoteGate = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{if\(!([\w$]{1,8})\(\)\)return!1;return!![\w$.]{1,20}ANTHROPIC_UNIX_SOCKET\|\|[\w$]{1,8}\(\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: (m) => ({ body: `function ${m[1]}(){return ${m[2]}()`, tail: '}' }),
  });
};

// ---------- patch #24: unlock_disable_rc (Jen) ----------
export const writeUnlockDisableRc = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(\)\{return [\w$]{1,8}\(\)\?\.settings\.disableRemoteControl===!0\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: (m) => ({ body: `function ${m[1]}(){return!1`, tail: '}' }),
  });
};

// ---------- patch #25: force_1h_cache (gKe) ----------
export const writeForce1hCache = (file: string): string | null => {
  const pattern =
    /function ([\w$]{1,8})\(e\)\{if\(it\(process\.env\.FORCE_PROMPT_CACHING_5M\)\)return!1;if\(it\(process\.env\.ENABLE_PROMPT_CACHING_1H\)\|\|mr\(\)==="bedrock"&&it\(process\.env\.ENABLE_PROMPT_CACHING_1H_BEDROCK\)\)return!0;if\(![\w$]{1,8}\(\)\|\|[\w$]{1,8}\.isUsingOverage\)return!1;let t=[\w$]{1,8}\(\);if\(t===null\)t=[\w$]{1,4}\("tengu_prompt_cache_1h_config",\{allowlist:\[[^\]]{1,300}\]\}\)\.allowlist\?\?\[\],[\w$]{1,8}\(t\);return e!==void 0&&t\.some\(\([\w$]{1,3}\)=>[\w$]{1,3}\.endsWith\("\*"\)\?e\.startsWith\([\w$]{1,3}\.slice\(0,-1\)\):e===[\w$]{1,3}\)\}/g;
  return applyRegexReplace(file, {
    pattern,
    build: (m) => ({
      body: `function ${m[1]}(e){return!it(process.env.FORCE_PROMPT_CACHING_5M)`,
      tail: '}',
    }),
  });
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
  ]) {
    const r = fn(out);
    if (r !== null) out = r;
  }
  // hm_normalize_dot 有独立 fn (返回 file 不是 null)
  out = writeHmNormalizeDot(out);
  return out;
};
