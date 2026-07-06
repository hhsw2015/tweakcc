// codex-session-patcher (csp) 移植: Windows npm shim
//
// Windows 没有 shell alias, npm 全局装 claude 时会生成 claude.cmd + claude.ps1 shim.
// 我们改这两个 shim, 让它们:
//   - 若存在 %USERPROFILE%\.claude\override.md → 加 --append-system-prompt-file
//   - 否则原样透传
//
// Linux 上, npm 全局装的 claude 是软链到 cli.js, 有些用户也希望用 shim
// (~/.npm-global/bin/claude 等). 我们对 Linux 也支持 shim patch (macOS 用 alias
// 更优雅, 不走 shim 路径).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export const CMD_PATCHED_TEMPLATE = `\
@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0
IF EXIST "%USERPROFILE%\\.claude\\override.md" (
  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" --append-system-prompt-file "%USERPROFILE%\\.claude\\override.md" %*
) ELSE (
  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" %*
)
`;

export const PS1_PATCHED_TEMPLATE = `\
#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent

$exe=""
if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {
  $exe=".exe"
}

$claudeExe = "$basedir/node_modules/@anthropic-ai/claude-code/bin/claude$exe"
$override = "$env:USERPROFILE\\.claude\\override.md"

if (Test-Path $override) {
  $extraArgs = @("--append-system-prompt-file", $override)
} else {
  $extraArgs = @()
}

if ($MyInvocation.ExpectingInput) {
  $input | & $claudeExe @extraArgs $args
} else {
  & $claudeExe @extraArgs $args
}
exit $LASTEXITCODE
`;

/**
 * 找到 npm 全局 shim 目录. 语义对齐 Python find_npm_shim_dir.
 *   - Windows: %APPDATA%\npm
 *   - Linux:   ~/.npm-global/bin, /usr/local/bin, /usr/bin (含 claude 文件)
 *   - macOS:   null (用 alias 不用 shim)
 */
export const findNpmShimDir = (): string | null => {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'win32') {
    const appdata = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
    const npmDir = path.join(appdata, 'npm');
    if (fs.existsSync(npmDir) && fs.statSync(npmDir).isDirectory()) {
      return npmDir;
    }
    return null;
  }

  if (platform === 'darwin') {
    return null; // macOS 用 alias
  }

  // Linux
  const candidates = [
    path.join(home, '.npm-global', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
  ];
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'claude'))) return p;
  }
  return null;
};

export const shimIsPatched = (shimPath: string): boolean => {
  if (!fs.existsSync(shimPath)) return false;
  try {
    return fs.readFileSync(shimPath, 'utf-8').includes('override.md');
  } catch {
    return false;
  }
};

export interface ShimPatchResult {
  [filename: string]: 'patched' | 'already_patched' | 'missing' | 'error';
}

/**
 * Patch shim 目录里的 claude.cmd 和 claude.ps1.
 * 备份原文件到 <name>.orig (若无备份).
 */
export const patchShim = (shimDir: string): ShimPatchResult => {
  const result: ShimPatchResult = {};
  const entries: Array<[string, string]> = [
    ['claude.cmd', CMD_PATCHED_TEMPLATE],
    ['claude.ps1', PS1_PATCHED_TEMPLATE],
  ];
  for (const [fname, tmpl] of entries) {
    const p = path.join(shimDir, fname);
    if (!fs.existsSync(p)) {
      result[fname] = 'missing';
      continue;
    }
    const bak = p + '.orig';
    if (shimIsPatched(p)) {
      result[fname] = 'already_patched';
      continue;
    }
    try {
      if (!fs.existsSync(bak)) {
        fs.copyFileSync(p, bak);
      }
      // 保留 executable 位: Linux 上 shim 需要 +x 才能被 exec.
      // Windows 上 mode 位无效, 但 writeFileSync 仍会应用 (无副作用).
      let mode = 0o755;
      try {
        mode = fs.statSync(p).mode;
      } catch { /* keep default */ }
      fs.writeFileSync(p, tmpl, { mode });
      result[fname] = 'patched';
    } catch {
      result[fname] = 'error';
    }
  }
  return result;
};

/**
 * 从 <name>.orig 恢复.
 */
export const revertShim = (shimDir: string): ShimPatchResult => {
  const result: ShimPatchResult = {};
  for (const fname of ['claude.cmd', 'claude.ps1']) {
    const p = path.join(shimDir, fname);
    const bak = p + '.orig';
    if (fs.existsSync(bak)) {
      try {
        fs.copyFileSync(bak, p);
        fs.unlinkSync(bak);
        result[fname] = 'patched'; // reuse enum; actually 'reverted' but我们复用类型
      } catch {
        result[fname] = 'error';
      }
    } else {
      result[fname] = 'missing';
    }
  }
  return result;
};

export interface ShimStatus {
  applicable: boolean;
  shimDir: string | null;
  claudeCmd: 'patched' | 'unpatched' | 'missing';
  claudePs1: 'patched' | 'unpatched' | 'missing';
}

export const shimStatus = (): ShimStatus => {
  const platform = process.platform;
  const applicable = platform === 'win32' || platform === 'linux';
  if (!applicable) {
    return {
      applicable: false,
      shimDir: null,
      claudeCmd: 'missing',
      claudePs1: 'missing',
    };
  }
  const shimDir = findNpmShimDir();
  if (!shimDir) {
    return { applicable, shimDir: null, claudeCmd: 'missing', claudePs1: 'missing' };
  }
  const check = (fname: string): 'patched' | 'unpatched' | 'missing' => {
    const p = path.join(shimDir, fname);
    if (!fs.existsSync(p)) return 'missing';
    return shimIsPatched(p) ? 'patched' : 'unpatched';
  };
  return {
    applicable,
    shimDir,
    claudeCmd: check('claude.cmd'),
    claudePs1: check('claude.ps1'),
  };
};
