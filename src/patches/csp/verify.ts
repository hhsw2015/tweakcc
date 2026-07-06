// codex-session-patcher (csp) 移植: --verify 通过 ccglass 动态验证 API 层 prompt 已中和
//
// 对应 Python _ccglass_live_verify. 需要外部工具 ccglass (npm install -g ccglass).
// 启动一次性 claude session, 抓 ccglass 记录的真实出站 request, 扫 system prompt
// 中是否还有 CYBER_RISK / refusal 关键词.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

export const CYBER_VERIFY_KEYWORDS = [
  'Refuse requests',
  'destructive techniques',
  'malicious purposes',
  'supply chain compromise',
  'DoS attacks',
  'C2 frameworks',
  'detection evasion',
  'IMPORTANT: Assist with authorized',
];

export interface VerifyResult {
  status: 'ok' | 'residue' | 'no_capture' | 'ccglass_missing' | 'timeout' | 'no_blob';
  message: string;
  foundKeywords?: string[];
  systemPromptChars?: number;
}

/**
 * 递归扫 ccglass sessions 目录, 收集所有 .json (数字开头) session 文件绝对路径.
 */
const scanSessions = (base: string): Set<string> => {
  const found = new Set<string>();
  if (!fs.existsSync(base)) return found;
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.json') && /^\d/.test(e.name)) {
        found.add(p);
      }
    }
  };
  walk(base);
  return found;
};

/**
 * 主入口: 跑 ccglass 抓一个 claude session, 分析 API 层实际 prompt.
 */
export const ccglassLiveVerify = (): VerifyResult => {
  const ccglassBase = path.join(os.homedir(), '.ccglass', 'sessions');

  // 探测 ccglass 是否可用 (Windows 用 where, POSIX 用 which)
  const finderCmd = process.platform === 'win32' ? 'where' : 'which';
  const which = spawnSync(finderCmd, ['ccglass'], { encoding: 'utf-8' });
  if (which.status !== 0 || !which.stdout.trim()) {
    return {
      status: 'ccglass_missing',
      message: 'ccglass CLI not found (install: npm i -g ccglass)',
    };
  }

  const beforeSessions = scanSessions(ccglassBase);

  // 触发一次性 claude session
  const r = spawnSync(
    'ccglass',
    [
      'claude',
      '--no-open',
      '--no-mcp',
      '--',
      '--no-session-persistence',
      '-p',
      'Say OK',
    ],
    { encoding: 'utf-8', timeout: 60_000 }
  );
  if (r.error || r.signal === 'SIGTERM') {
    return { status: 'timeout', message: 'ccglass invocation timed out' };
  }

  // 找新增 session
  const afterSessions = scanSessions(ccglassBase);
  const newCaptures = [...afterSessions].filter((p) => !beforeSessions.has(p));
  if (newCaptures.length === 0) {
    return { status: 'no_capture', message: 'no new ccglass session captured' };
  }

  // 从最新 capture (按文件名逆序) 中找 system prompt blob
  newCaptures.sort().reverse();
  for (const cap of newCaptures) {
    let d: unknown;
    try {
      d = JSON.parse(fs.readFileSync(cap, 'utf-8'));
    } catch {
      continue;
    }
    if (!d || typeof d !== 'object') continue;
    const req = (d as { request?: { system?: unknown } }).request;
    const sysRef = req?.system;
    if (typeof sysRef !== 'string' || !sysRef.startsWith('sha256:')) continue;
    const sha = sysRef.split(':')[1];

    // blob 在 session 集合根目录的 blobs/ 下, 向上最多 3 级找
    let searchDir = path.dirname(cap);
    let blobPath: string | null = null;
    for (let i = 0; i < 3; i++) {
      const candidate = path.join(searchDir, 'blobs', sha.slice(0, 2), sha + '.json');
      if (fs.existsSync(candidate)) {
        blobPath = candidate;
        break;
      }
      const parent = path.dirname(searchDir);
      if (parent === searchDir) break;
      searchDir = parent;
    }
    if (!blobPath) continue;

    let blocks: unknown;
    try {
      blocks = JSON.parse(fs.readFileSync(blobPath, 'utf-8'));
    } catch {
      continue;
    }
    if (!Array.isArray(blocks)) continue;

    const full = blocks
      .map((b) =>
        b && typeof b === 'object' && 'text' in b
          ? String((b as { text: unknown }).text ?? '')
          : ''
      )
      .join(' ');

    const found = CYBER_VERIFY_KEYWORDS.filter((kw) => full.includes(kw));
    if (found.length > 0) {
      return {
        status: 'residue',
        message: `API prompt still contains ${found.length} refusal marker(s)`,
        foundKeywords: found,
        systemPromptChars: full.length,
      };
    }
    return {
      status: 'ok',
      message: `verified: API system prompt (${full.length} chars) has no refusal marker`,
      systemPromptChars: full.length,
    };
  }
  return { status: 'no_blob', message: 'no system prompt blob found in capture' };
};
