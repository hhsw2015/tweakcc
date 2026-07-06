// codex-session-patcher (csp) 移植: anchor+tail 中和 helper
//
// 原 Python 逻辑: 找 anchor 起点, 从 anchor 后 tail_search_max 范围内找 tail,
// 把 [anchor_start, tail_start) 或 [anchor_start, tail_end) 之间的字节
// 替换为等长空格 (保留起止的引号字符, 避免 JS 语法崩坏)
//
// 用于 refusal/policy/sandbox 类 prompt 字符串中和

export interface AnchorTailOptions {
  anchor: string;
  tail: string;
  tailSearchMax?: number; // default 1000
  includeTail?: boolean; // 默认 false, 只中和到 tail 之前
}

/**
 * 生成中和后的字节: 保留首末引号字符 (若原文以 " ' ` 开头/结尾), 中间全空格
 */
const buildNeutralized = (old: string): string => {
  if (!old) return old;
  const quotes = new Set(['"', "'", '`']);
  const chars = Array.from({ length: old.length }, () => ' ');
  if (quotes.has(old[0])) chars[0] = old[0];
  if (old.length > 1 && quotes.has(old[old.length - 1]))
    chars[chars.length - 1] = old[old.length - 1];
  return chars.join('');
};

/**
 * 定位并中和文件中所有 (anchor, tail) 命中的字节区间.
 * 返回新文件内容, 或 null (未找到).
 */
export const applyAnchorTailNeutralize = (
  file: string,
  { anchor, tail, tailSearchMax = 1000, includeTail = false }: AnchorTailOptions
): string | null => {
  let result = file;
  let searchFrom = 0;
  let replacements = 0;

  while (true) {
    const pos = result.indexOf(anchor, searchFrom);
    if (pos === -1) break;

    const anchorEnd = pos + anchor.length;
    const tailPos = result.indexOf(tail, anchorEnd);
    // Python 语义: data.find(tail, start, start + tail_search_max) — tail 必须
    // 完整落在 [anchorEnd, anchorEnd + tailSearchMax) 内, tail 起点+长度都要在窗内
    if (
      tailPos === -1 ||
      tailPos + tail.length > anchorEnd + tailSearchMax
    ) {
      // 该处 anchor 后找不到 tail (在窗内), 跳过继续
      searchFrom = anchorEnd;
      continue;
    }
    const end = includeTail ? tailPos + tail.length : tailPos;
    const old = result.slice(pos, end);
    const neu = buildNeutralized(old);
    if (neu.length !== old.length) {
      searchFrom = anchorEnd;
      continue;
    }
    result = result.slice(0, pos) + neu + result.slice(end);
    replacements++;
    searchFrom = pos + neu.length;
  }

  return replacements > 0 ? result : null;
};

export const isNeutralized = (
  file: string,
  anchor: string,
  tail: string
): boolean => {
  const pos = file.indexOf(anchor);
  if (pos === -1) return true; // 无 anchor = 上游已移除或已中和消失, 视为已应用
  // 检查 anchor 后 tail 前的区域是否全空格
  const tailPos = file.indexOf(tail, pos + anchor.length);
  if (tailPos === -1) return false;
  const mid = file.slice(pos + anchor.length, tailPos);
  // 已中和时 mid 应几乎全空格 (patch 会保留引号)
  return mid.trim() === '' || /^[\s"'`]*$/.test(mid);
};
