// codex-session-patcher (csp) 移植: 一键升级 + patch + 汇报
//
// 对应 Python patcher wrapper 的 install/update 分支.
// 流程:
//   1. 检测当前 CC 版本
//   2. 调用 real claude install (透传 args)
//   3. 检测版本是否变化
//   4. 变化 → 自动 tweakcc --apply → csp-check 显示表
//   5. 未变化 → no-op

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { findCurrentClaudeExe } from './cleanup';
import { cspCheck, formatTable, summarize } from './check';

/**
 * 读当前 CC 版本. 通过 binary path 里的目录名 (~/.local/share/claude/versions/X.Y.Z).
 */
export const readCurrentVersion = (): string | null => {
  const exe = findCurrentClaudeExe();
  if (!exe) return null;
  return path.basename(exe);
};

/**
 * 找 real claude binary (不是 wrapper). 优先 .local/share/claude/versions.
 */
export const findRealClaudeBinary = (): string | null => {
  const exe = findCurrentClaudeExe();
  if (exe && fs.existsSync(exe)) return exe;
  return null;
};

export interface UpgradeResult {
  versionBefore: string | null;
  versionAfter: string | null;
  upgraded: boolean;
  applyRan: boolean;
  applyError: string | null;
  installExitCode: number;
}

/**
 * 主流程. args = 透传给 real claude 的参数, 通常 ['install'] 或 ['update'].
 */
export const runUpgradeAndPatch = (args: string[]): UpgradeResult => {
  const result: UpgradeResult = {
    versionBefore: readCurrentVersion(),
    versionAfter: null,
    upgraded: false,
    applyRan: false,
    applyError: null,
    installExitCode: -1,
  };

  const realClaude = findRealClaudeBinary();
  if (!realClaude) {
    result.applyError = 'no claude binary found';
    return result;
  }

  console.log(`[csp-upgrade] current version: ${result.versionBefore}`);
  console.log(`[csp-upgrade] running: ${realClaude} ${args.join(' ')}`);

  const r = spawnSync(realClaude, args, {
    stdio: 'inherit',
    env: process.env,
  });
  result.installExitCode = r.status ?? -1;

  result.versionAfter = readCurrentVersion();

  if (result.installExitCode !== 0) {
    console.log(`[csp-upgrade] install exited ${result.installExitCode}, skip patch`);
    return result;
  }

  if (result.versionBefore === result.versionAfter) {
    console.log(`[csp-upgrade] version unchanged (${result.versionAfter}), no patch needed`);
    return result;
  }

  result.upgraded = true;
  console.log(
    `\n[csp-upgrade] version changed: ${result.versionBefore} → ${result.versionAfter}`
  );
  console.log(`[csp-upgrade] auto-applying patches...\n`);

  // 调 tweakcc --apply (会输出 tweakcc 自己的 patch 状态汇报)
  const tweakccCmd = process.env.TWEAKCC_BIN ?? 'tweakcc';
  const applyR = spawnSync(tweakccCmd, ['--apply'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      TWEAKCC_CC_INSTALLATION_PATH: findCurrentClaudeExe() ?? '',
    },
  });
  if (applyR.status !== 0) {
    result.applyError = `tweakcc --apply exited ${applyR.status}`;
  } else {
    result.applyRan = true;
  }
  // tweakcc --apply 内部已打印每 patch 状态 (applied/failed/skipped/pending)
  // 若用户想更详细分类, 见其 stdout 上面部分

  // 显示 csp-check 状态表
  const exe = findCurrentClaudeExe();
  if (exe && fs.existsSync(exe)) {
    console.log('\n[csp-upgrade] csp-check status:\n');
    const data = fs.readFileSync(exe, 'latin1');
    const rows = cspCheck(data);
    console.log(formatTable(rows));
    const s = summarize(rows);
    console.log(
      `\n汇总: 可应用 ${s.applicable}, 已 patch ${s.alreadyApplied}, 失效 ${s.broken}, 上游已移除 ${s.obsolete}`
    );
    if (s.broken > 0) {
      console.log(
        `\n\x1b[33m⚠ ${s.broken} patch 失效 (可能上游改结构, 需更新 tweakcc)\x1b[0m`
      );
    }
    if (s.applicable > 0) {
      console.log(
        `\n\x1b[33m⚠ ${s.applicable} patch 未应用. 检查 tweakcc --apply 输出\x1b[0m`
      );
    }
  }

  return result;
};
