// codex-session-patcher (csp) 移植: 通用等长 regex 替换 helper
//
// 对应 Python find_all_patch_locations 里的 special handler 通用模式:
//   1. 用 regex 匹配一段函数定义(等结构 anchor)
//   2. 从 match 里提取 minified 名 (fname / kc_name 等)
//   3. 用模板生成 new_body
//   4. 剩余长度用 /* ... */ 空格 pad
//   5. 组装等长替换字符串, 应用到文件

export interface RegexReplaceOptions {
  pattern: RegExp;
  /**
   * 用 match 结果 (含 groups) 生成新函数体主干.
   * 返回值必须小于等于 orig.length - tail.length.
   */
  build: (match: RegExpExecArray) => { body: string; tail: string } | null;
  /**
   * 是否允许 pad < 4 (不用注释包裹, 直接空格). 默认 false (要求 >=4).
   */
  allowShortPad?: boolean;
}

// Default to `true` so behavior mirrors Python (Python always fills pad with
// spaces regardless of length; only fails when pad_len < 0).
export const applyRegexReplace = (
  file: string,
  { pattern, build, allowShortPad = true }: RegexReplaceOptions
): string | null => {
  // 需要 global flag 才能 finditer
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const rx = new RegExp(pattern.source, flags);

  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(file)) !== null) {
    const orig = m[0];
    const start = m.index;
    const end = start + orig.length;

    const built = build(m);
    if (!built) continue;
    const { body, tail } = built;
    const padLen = orig.length - body.length - tail.length;
    if (padLen < 0) continue;

    let pad: string;
    if (padLen >= 4) {
      pad = '/*' + ' '.repeat(padLen - 4) + '*/';
    } else if (allowShortPad) {
      pad = ' '.repeat(padLen);
    } else {
      continue;
    }
    const neu = body + pad + tail;
    if (neu.length !== orig.length) continue;
    edits.push({ start, end, replacement: neu });

    // 防止 rx.lastIndex 卡死
    if (rx.lastIndex === start) rx.lastIndex = start + 1;
  }

  if (edits.length === 0) return null;

  // 反向应用避免偏移
  let out = file;
  for (const e of edits.reverse()) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
};
