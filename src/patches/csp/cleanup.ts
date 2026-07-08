// codex-session-patcher (csp) 移植: 老版本 .bak / 旧 binary / lock 残留清理
//
// 对应 Python cleanup_old_baks — 每次 apply 后调用, 释放磁盘 (每个 CC binary 200MB+)
//
// 规则:
//   保留:  当前 binary + 当前 .pristine (tweakcc 备份, 唯一真 pristine 源)
//   删除:  非当前版本的一切 (binary / .pristine / .bak / .locked-)
//          + 当前版本的 .bak (CC 官方备份, 是"上次 patched 版", 不是 pristine, 我们不用)

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export interface DeletedFile {
  path: string;
  size: number;
}

/**
 * 清理旧版本 binary / .bak / .pristine / lock 残留.
 * 保留: currentExe + currentExe.pristine (tweakcc 备份).
 * 返回删除文件清单.
 */
export const cleanupOldVersions = (currentExe: string): DeletedFile[] => {
  const versionsDir = path.dirname(currentExe);
  const currentBasename = path.basename(currentExe);
  const currentPristine = currentBasename + '.pristine';
  const deleted: DeletedFile[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(versionsDir);
  } catch {
    return deleted;
  }

  for (const name of entries) {
    // 保留列表: 当前 binary + 当前 pristine (tweakcc 唯一 backup)
    if (name === currentBasename || name === currentPristine) continue;

    // 其他一切 — .bak (CC 官方旧备份, 非 pristine, 我们不用),
    // 其他版本的 binary/.pristine/.bak, lock 残留 — 都清
    const fullPath = path.join(versionsDir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      const size = stat.size;
      fs.unlinkSync(fullPath);
      deleted.push({ path: fullPath, size });
    } catch {
      // 权限或 IO 错误 — 静默跳过, 不阻塞主流程
    }
  }

  return deleted;
};

/**
 * 找到当前活跃 claude binary 路径 (最新版本号排序).
 * 返回 null 表示没找到.
 */
export const findCurrentClaudeExe = (): string | null => {
  // 跨平台 home: Windows 用 USERPROFILE, POSIX 用 HOME
  const home = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
  if (!home) return null;
  const versionsDir = path.join(home, '.local', 'share', 'claude', 'versions');
  if (!fs.existsSync(versionsDir)) return null;

  let entries: string[];
  try {
    entries = fs.readdirSync(versionsDir);
  } catch {
    return null;
  }

  // 过滤: 不是 .bak / .pristine / .locked, 是文件
  const candidates = entries
    .filter(
      (n) =>
        !n.endsWith('.bak') &&
        !n.endsWith('.pristine') &&
        !n.includes('.locked-')
    )
    .filter((n) => {
      try {
        return fs.statSync(path.join(versionsDir, n)).isFile();
      } catch {
        return false;
      }
    });

  if (candidates.length === 0) return null;

  // 按语义版本号排序取最大
  const parseVer = (v: string): number[] =>
    v.split('.').map((x) => (/^\d+$/.test(x) ? parseInt(x, 10) : 0));

  candidates.sort((a, b) => {
    const va = parseVer(a);
    const vb = parseVer(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const d = (va[i] ?? 0) - (vb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });

  return path.join(versionsDir, candidates[candidates.length - 1]);
};

/**
 * 格式化字节数为可读串
 */
export const formatBytes = (n: number): string => {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
};
