# Changelog

All notable changes to **tweakcc-fixed** (skrabe's fork of
[Piebald-AI/tweakcc](https://github.com/Piebald-AI/tweakcc)) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/);
this fork uses its own `2.x` line (npm package `tweakcc-fixed`) and is a strict
superset of upstream. Pre-fork upstream history lives in Piebald's releases.

## [Unreleased]

- **CC 2.1.251 支持: merge skrabe (2.1.246 code-split) + 修 context-limit & 3 个 CSP**
  升级 2.1.238 → 2.1.251. 根因: CC 2.1.246 引入 Bun code-split bundles, 我方旧
  extractor 只抓到 20KB 碎片导致所有 patch 失配. 解法: merge skrabe/main (173
  commits, 含 `native: support Bun code-split bundles` + 为 2.1.246/247 re-anchor
  的 base patches + reminders). 冲突解决: base patch/nativeInstallation 取 skrabe
  (权威+含 code-split), installationBackup/startup 保我方 (versioned-pristine 架构),
  defaultSettings union (保我方激进默认 + skrabe 新 key). 抽取修复后仅剩 2.1.248-251
  增量漂移, 自行适配: (1) **context-limit** — 共享常量组解散成每模型
  `context:{window:200000}`, 新增 Method 0 override 全部 8 个 window; (2) **csp #22
  sdk-url** 参数/URL 变量名互换 `(e){let t`→`(t){let e`, 参数化; (3) **csp #25 1h
  cache** 重写成 `{ttl:"5m"|"1h"}` decider, 强制决策尾恒返 1h; (4) **csp #27
  telemetry** 参数 `(e,t)`→`(t,e)` 互换, 按位参数化. check.ts 同步 3 处签名. 另用
  skrabe extractor 生成 `prompts-2.1.251.json` (6130 sites).
- **CC 2.1.238: 修复 8 个 systemReminderOverrides anchor** — 2.1.238 重写了这些
  reminder 的文案/结构 (wrapper `ih/Vr`→`Zy/kn`, 文案改词, output_style 加
  type/length guards + `pze(e.style)`, edited_text_file 变 `{let t=...}`+snippet
  双分支, mcp-router loop 多了 `c.set(f.name,f.instructions)`). 5 个简单的改成
  内容无关 regex (抗未来文案变动), 3 个复杂的按新结构匹配并保留新增语句; 顺带
  更新 defaultBody 到 2.1.238 文案 + 删除 8 个未定制的旧 .md 让其重种 (避免旧
  文案降级 2.1.238). 全部对 pristine 验证命中, 31/31 reminder 测试过.
- **CC 2.1.238 支持: 修复 4 个失配 patch + 生成 prompts** — 升级 2.1.233 → 2.1.238
  (大重构). 修 3 个 fatal base patch + 1 个 CSP 隐私 patch: (1) **thinking-visibility**
  — 可见性逻辑搬进 React-Compiler memoized 组件, gate 从 caller 侧 `if(!X&&!Y)return null`
  变成派生 `let G=isTranscriptMode||verbose`, 改成 `let G=!0` 强制展开; (2)
  **hide-startup-clawd** — Clawd ASCII 艺术从内联字符串搬进 module-level pose-map
  (`ntg={default:{r1L,r1E,...}}`), 新增 `findClawdViaPoseMap` 定位读 pose-map +
  含 `"Apple_Terminal"` 的 wrapper; (3) **auto-mode-classifier-model** — resolver
  重构 (config 读取 `R("tengu_auto_mode_config")` → `WM()`, 降级门 `STATE` →
  `$hr().externalSonnet5Probe`), 新增 pattern238 锚 `modelByMainModel`+`vet:`;
  (4) **csp #27 disableTelemetry** — G/I_ 的 state 来源从裸 ident `let n=pdn` 变成
  方法链 `let r=j1o().state`, RHS 加可选 `(?:\(\))?(?:\.[\w$]{1,8})?`. 另用 skrabe
  extractor 生成 `prompts-2.1.238.json` (3987 sites). 注: 8 个 systemReminderOverrides
  anchor 在 2.1.238 也漂移了 (wrapper `ih/Vr`→`Zy/kn` + 内容变), 但非 fatal 且该功能
  未配置 (CC 原文保留), 暂缓.
- **CC 2.1.233 支持: 修复 2 个失配 patch + 生成 prompts** — 升级 2.1.227 → 2.1.233
  时发现两处 anchor 失效: (1) **increase-file-read-limit** — 上游把 25000 上限从
  `tengu_amber_wren` 附近挪到 `defaultFileReadingLimits` (且 JS 区多了 memory/loop
  两个 25000 干扰靶), 新增 `defaultFileReadingLimits` anchor 精确命中文件读取的那个;
  (2) **csp #26 scrubMetadata** — 组装函数 `pMe` → `COt({agentContext})` 重构,
  metadata 对象嵌入逗号序列 (不再 `let X={...};return`), account_uuid 增到 2 个
  accountUuid fallback, 新增 patternV3 只剥 `device_id`+`account_uuid` 子串换等长
  注释, 保 session_id/parent_session_id/tk; check.ts 同步更新 anchor + patched
  签名. 另用 skrabe extractor 生成 `prompts-2.1.233.json` (3805 sites).
- **native: 识别 CC 2.1.229+ 无扩展名 `cli` 入口模块** — cherry-pick upstream
  b781bb9. 2.1.229+ 把 bun 入口模块从 `src/entrypoints/cli.js` 改成无扩展名
  `cli` (`/$bunfs/root/cli`), `isClaudeModule` 加 `endsWith('/cli')` 兼容,
  否则升到 2.1.229+ 后 native JS 抽取会失败.
- **prompts: CC 2.1.227** — 用 skrabe extractor (`tools/promptExtractor.js`)
  对 2.1.227 pristine 重新生成全量 prompt 文件 (3593 sites, 对比 upstream
  Piebald 文件仅 644). system-prompt sync 冲突从 7+ 降到 2 (个别 prompt 词表
  漂移, 安全 skip). 注: 原始抽取输出, 未跑 skrabe 的 LLM 分类/gate 阶段
  (那步只喂 detection-coverage, 不改 prompts 文件结构).
- **CC 2.1.227 支持: 修复 3 个失配 patch** — 上游重构导致三处 anchor 失效,
  全部适配: (1) **slashCommands** — 命令从内联大数组搬进懒加载模块闭包,
  注册表变成 `builtinCommandTable??=NAME()` 记忆化 builder (裸变量 + spread),
  改用该 anchor 定位数组尾部, 保留旧 `=>[]` 内联启发式做 fallback (影响
  clear-screen / conversation-title / toolsets); (2) **agents-md** — reader
  新增预算结果快路径 (第 4 参 `switch(s.kind)`), 加 `writeAgentsMdAsyncSwitch`
  handler, reroute 递归时清空第 4 参走 else 分支重读 alt 路径; (3) **csp #16
  v0() 强制 workflows** — available/defaultOn 来源从函数调用 `X()` 改为方法
  调用 `Rhs.resolve()`, 两个 gate pattern 加可选 `(?:\.[\w$]+)?` 兼容.
- **csp #26 metadata.user_id 剥指纹** — 新增 CSP 隐私 patch. `pMe()`
  组装的 `metadata.user_id` JSON 里剥掉 `device_id` 和 `account_uuid`,
  保留 `session_id` (caching / rate-limit 依赖) 和 `CLAUDE_CODE_EXTRA_METADATA`
  用户自定义字段 (escape hatch). 服务端仍通过 API key 识别账号, 但
  少一个跨机器 fingerprint 面. 证据: HitCC `abuse-control-and-telemetry.md`
  `XLe()` 章节.
- **csp #27 禁用 telemetry 上报** — 新增 CSP 隐私 patch. 三个上报入口
  一次性中和成 no-op: `G(e,t)` (sync Statsig sink, 覆盖 `tengu_*` 全套 +
  `api_refusal` + `ClaudeCodeInternalEvent`), `I_(e,t)` (async 版), `pto(e)`
  (GrowthBook experiment event, 含 device_id + account_uuid + session_id).
  只断"上传"方向, 保留 GrowthBook feature-flag fetch (下发), 不影响功能
  分支. 不用再设 `CLAUDE_CODE_ENABLE_TELEMETRY / OTEL_* / DO_NOT_TRACK`
  等一堆环境变量; managed settings 也覆盖不掉.

## [2.3.2] - 2026-06-25

Transparency for the patches that change how the model behaves.

- **`--apply` announces model-facing patches** (#23): after the patch-results
  listing, a flagged notice lists only the patches that actually applied _and_
  change model-facing behavior (what reaches the model / how it reasons), not
  cosmetic output styling — so default-on behavioral patches like
  `claudemd-context-once-per-conversation` are never activated silently. Each
  carries a `modelFacing` flag on its definition; the notice is informational
  only (no prompt), because `--apply` runs non-interactively on CI and the npx
  VPS mirrors where a confirm would hang. Marked model-facing:
  `fix-summarize-from-here`, `fix-rewind-summary-header`, `max-effort-default`,
  `autonomous-operation-all-models`, `auto-mode-classifier-model`,
  `complexity-router`, `dream-mode`, `lean-memory-types`,
  `suppress-deferred-tools`, `claudemd-context-once-per-conversation`.
- **README patch list tags default state** (#22, thanks @voidfreud): every patch
  in the "Every patch the fork adds" list now carries `[default on]` /
  `[always]` / `[opt-in]` with a legend, so the patches that activate without
  opt-in are visible at a glance.

## [2.3.1] - 2026-06-25

- Complexity router (experimental): document the prompt-cache cost. Effort level
  is part of the cache key — measured on CC 2.1.191 (statusline `current_usage`):
  a turn that changes the routed level reads the whole conversation uncached
  (`cache_read=0` + full `cache_creation`), then hits cache again while the level
  holds; each level keeps its own cache, so returning to a prior level reuses
  most of its earlier work. pin-on (monotonic) minimizes the churn; pin-off pays
  it on every up/down flip. Corrected the stale "no prompt-cache churn" claim in
  the TUI and patch comment. No behavior change.

## [2.3.0] - 2026-06-25

Complexity effort router — memory, true rewind, and full customizability.

- **Classifier memory**: the Haiku router now gets a `<context>` block each turn
  — the model in use (and whether it switched mid-session) plus the level it
  assigned last turn — so a continuing thread holds effort instead of being
  re-judged cold. Kills the "tunnel-vision" mis-routes on terse follow-ups.
- **Rewind-aware (true cut)**: a per-turn snapshot keyed by timestamp; `/rewind` →
  "Restore conversation" captures the rewound-to message's timestamp (splice 5 on
  `onRestoreMessage`) and the next turn cuts the rolling summary + level back to
  that point, dropping the rewound-away work (or cold-resets if the target
  predates the log). The log is persisted in the sidecar (bounded, async write),
  so resume→rewind cuts precisely too. "Summarize from here/up to here" rewinds
  reseed via the existing compaction path. No uuid-matching (the fork mints new
  uuids); the message timestamp is the stable cross-fork link.
- **Full customizability in the TUI**: edit the classifier system prompt in your
  `$EDITOR` (`{LEVELS}`/`{MAX}` stay dynamic), and each tier's label/help inline
  — all with sane defaults and reset-to-default.

## [2.2.2] - 2026-06-25

- Deep-review fixes on the router rework: shared `escapeNonAscii` helper,
  `getRequireFuncName` so sidecar persistence works on NPM/esbuild installs (not
  just Bun native), and corrected `assistantCap` docs.

## [2.2.1] - 2026-06-25

- CC 2.1.191 prompt sync; fix version stamp for new/cache-named prompts (a
  missing `version` crashed the sync and aborted all stubs).

## [2.2.0] - 2026-06-24

- Complexity effort router reworked to Haiku-only with a rolling TL;DR session
  summary fed to the classifier each turn, reseeded from CC's compaction summary
  on compaction; unified middle-truncation caps (TUI-editable); reshaped rubric
  (top tier reserved for genuinely frontier work).

## [2.1.1] - 2026-06-24

- CC 2.1.190 prompt sync.

## [2.1.0] - 2026-06-24

- fff-first Bash search (`swapRipgrepForFff`, default off) + the first cut of the
  complexity effort router.

## [2.0.16] - 2026-06-24

- CC 2.1.187 support.

## [2.0.15] - 2026-06-23

- Banner-layout fix (Clawd logo next to the header, not in the patch list).

## [2.0.14] - 2026-06-23

- CC 2.1.186 support — `createElement` → `jsx()` runtime migration fixes (4 UI
  patches) + prompt sync.

## [2.0.13] - 2026-06-22

- Escape injected non-ASCII at every injection surface (mojibake fix on
  Bun-compiled CC, which stores `cli.js` as Latin-1).

## [2.0.12] - 2026-06-21

- Fable/Mythos prompt set (all models) toggle.

## [2.0.11] - 2026-06-21

- CC 2.1.185 support.

## [2.0.10] - 2026-06-19

- CC 2.1.183 support.

## [2.0.9] - 2026-06-18

- CC 2.1.181 support.

## [2.0.8] - 2026-06-17

- Atomic native write (fixes the macOS code-signature SIGKILL via a fresh inode)
  - network-first prompts fetch for npm + workflow-script harness gate.

## [2.0.7] - 2026-06-17

- Generalize member-access keys (Linux member-access prompt apply).

## [2.0.6] - 2026-06-17

- npm-install identifier-union fallback (#15, dividedby) — hardens the
  unresolved-placeholder guard.

## [2.0.5] - 2026-06-17

- Code-review slot-bind + inline-blob nested-`${}` remap.

## [2.0.4] - 2026-06-16

- CC 2.1.179 deep support + apply round-trip safety (ground-truth harness).

## [2.0.3] - 2026-06-13

- CC 2.1.177 support.

## [2.0.2] - 2026-06-12

- CC 2.1.175 prompts (395 named, + Projects tool).

## [2.0.1] - 2026-06-11

- Fix: version stamp reads `package.json`.

## [2.0.0] - 2026-06-11

- First release of the `tweakcc-fixed` npm package from this fork (re-forked
  directly off Piebald-AI/tweakcc; trusted publish-to-npm via GitHub release).
