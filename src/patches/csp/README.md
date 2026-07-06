# codex-session-patcher (csp) 整合

原 Python patcher (`claude-patch_v2.py`) 全部功能移植进 tweakcc.

## 移植清单

25 项 patch (含 5 obsolete):

| # | Name | Type | Status |
|---|------|------|--------|
| 1 | CYBER_RISK_INSTRUCTION | anchor+tail | active |
| 2 | URL 生成限制 | anchor+tail | active |
| 3 | Executing actions (compact) | anchor+tail | active |
| 4 | Executing actions (full) | anchor+tail | active |
| 5 | OWASP 安全编码 | anchor+tail | active |
| 6 | Git Safety Protocol | anchor+tail | active |
| 7 | Bash git 限制 | anchor+tail | active |
| 8 | Prompt Injection 警告 | anchor+tail | active |
| 9 | Sandbox 默认限制 | anchor+tail | active |
| 10 | Sandbox 敏感路径 | anchor+tail | active |
| 11 | Sandbox 策略模式 | anchor+tail | active |
| 12 | 破坏性命令检测 Bash | special | obsolete (2.1.157+) |
| 13 | 破坏性命令检测 PowerShell | special | obsolete |
| 14 | CYBER_RISK 残余 (数据段) | anchor+tail | active |
| 15 | AppleScript 反绕过 | anchor+tail | active |
| 16 | v0() 强制 dynamic workflows | struct anchor | active |
| 17 | er() xhigh 不降级 | struct anchor | active |
| 18 | HM 模型归一化 (4.7=4-7) | struct anchor + 8 model keys | active |
| 19 | China 指纹 eca | struct anchor | obsolete (2.1.198+) |
| 20 | China 指纹 ddp | struct anchor | obsolete |
| 21 | China 指纹 pdp | struct anchor | obsolete |
| 22 | Remote Control sdk-url | struct anchor | active |
| 23 | Remote Control primary gate | struct anchor | active |
| 24 | Remote Control settings override | struct anchor | active |
| 25 | 1h prompt cache 强制启用 | struct anchor | active |

## 验证

`fullCrossCheck.test.ts` 从原厂 pristine binary (`/tmp/claude-original/package/claude`) 应用全部 20 active patches, 与 Python patcher 输出 (`/tmp/python-full-patched.bin`) 做字节级 sha256 比对, **相等**.

## 用户命令

```bash
# 一次性完成:
tweakcc csp-setup              # 生成 ~/bin/claude-with-override + zsh alias + override.md
tweakcc --apply                # 应用全部 patch (含 20 csp active)

# 状态查询:
tweakcc csp-status
tweakcc --list-patches         # 分组显示, "codex-session-patcher" 组含 20 项

# 撤销:
tweakcc --restore              # 二进制回原厂
tweakcc csp-unsetup            # 删 wrapper + alias (保留 override.md)
tweakcc csp-unsetup --remove-override  # 完全清除

# 日常:
claude                          # 走 wrapper (自动 --append-system-prompt-file override.md + 4 env vars)
```

## Wrapper 环境变量

```bash
export CLAUDE_CODE_WORKFLOWS=1
export DISABLE_GROWTHBOOK=1
export ENABLE_PROMPT_CACHING_1H=true
export CLAUDE_CODE_ATTRIBUTION_HEADER=false
```

## 目录结构

```
src/patches/csp/
├── README.md                    (此文件)
├── anchorTail.ts                共享 anchor+tail 中和 helper
├── anchorTailPatches.ts         patch 2-11, 14-15 (12 anchor+tail patches)
├── cyberRiskInstruction.ts      patch 1 (样本 / 独立文件)
├── cyberRiskInstruction.test.ts
├── crossCheck.test.ts           patch 1 单点交叉验证
├── fullCrossCheck.test.ts       全 20 patch 字节等价验证
├── index.ts                     PATCH_META 元数据 + applyAllCspPatches
├── regexReplace.ts              通用等长 regex 替换 helper
├── setup.ts                     wrapper/alias/override.md 生态
├── setup.test.ts
├── specialPatches.ts            patch 13, 16-18, 22-25 (struct anchor 类)
└── fixtures/2.1.201/
    ├── golden.json              20 项 patch 的 before/after byte snippets
    └── pristine.bin             软链 -> /tmp/claude-original/package/claude
```
