import { execFile } from "node:child_process";
import { readFile, readlink } from "node:fs/promises";
import { promisify } from "node:util";
import {
  addPpidFallback,
  isTargetProcess,
  MAX_ANCESTOR_DEPTH,
  parsePortFromAddr,
  walkAncestors,
} from "../process";
import type { Platform, ProcessInfo } from "../types";

const execFileAsync = promisify(execFile);

/**
 * @description Unixのps -eoでプロセス一覧を取得
 * @returns 対象プロセスの一覧
 */
export async function listProcesses(): Promise<ProcessInfo[]> {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid,comm,args"], {
    timeout: 10000,
  });

  const results: ProcessInfo[] = [];
  const lines = stdout.split("\n").slice(1);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^\s*(\d+)\s+(\S+)\s+(.*)/);
    if (!match) continue;
    const pid = parseInt(match[1], 10);
    const comm = match[2];
    const args = match[3];

    const baseName = comm.split("/").pop() ?? comm;
    if (!isTargetProcess(baseName)) continue;
    results.push({ pid, name: baseName, command: args });
  }
  return results;
}

/**
 * @description 指定ポートをLISTENしているPIDを取得(lsof優先、ss fallback)
 * @param ports - 検索対象のポート番号
 * @returns port→PIDのマッピング
 */
export async function listPortProcesses(ports: number[]): Promise<Map<number, number>> {
  try {
    return await listPortsLsof(ports);
  } catch {
    // ssはLinux専用、macOSには存在しない
    if (process.platform === "linux") {
      return await listPortsSs(ports);
    }
    return new Map();
  }
}

/**
 * @description lsof出力の1行からport, pidを抽出
 * @param line - lsof出力の1行
 * @returns {port, pid} またはパース失敗時null
 */
function parseLsofLine(line: string): { port: number; pid: number } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 9) return null;
  const pid = parseInt(parts[1], 10);
  if (Number.isNaN(pid)) return null;
  const port = parsePortFromAddr(parts[8]);
  if (port === null) return null;
  return { port, pid };
}

/**
 * @description lsofでLISTEN中のポートとPIDを取得
 * @param ports - 検索対象のポート番号
 * @returns port→PIDのマッピング
 */
async function listPortsLsof(ports: number[]): Promise<Map<number, number>> {
  const portArgs = ports.map((p) => `-iTCP:${p}`);
  const { stdout } = await execFileAsync("lsof", [...portArgs, "-sTCP:LISTEN", "-nP"], {
    timeout: 10000,
  });

  const portToPid = new Map<number, number>();

  for (const line of stdout.split("\n").slice(1)) {
    const entry = parseLsofLine(line);
    if (entry) portToPid.set(entry.port, entry.pid);
  }
  return portToPid;
}

/**
 * @description ss出力の1行からport, pidを抽出
 * @param line - ss出力の1行
 * @returns {port, pid} またはパース失敗時null
 */
function parseSsLine(line: string): { port: number; pid: number } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 6) return null;
  const port = parsePortFromAddr(parts[3]);
  if (port === null) return null;
  const pidMatch = line.match(/pid=(\d+)/);
  if (!pidMatch) return null;
  const pid = parseInt(pidMatch[1], 10);
  return { port, pid };
}

/**
 * @description ssコマンドでLISTEN中のポートとPIDを取得(lsof利用不可時のfallback)
 * @param ports - 検索対象のポート番号
 * @returns port→PIDのマッピング
 */
async function listPortsSs(ports: number[]): Promise<Map<number, number>> {
  const { stdout } = await execFileAsync("ss", ["-tlnp"], { timeout: 10000 });

  const portSet = new Set(ports);
  const portToPid = new Map<number, number>();

  for (const line of stdout.split("\n").slice(1)) {
    const entry = parseSsLine(line);
    if (entry && portSet.has(entry.port)) {
      portToPid.set(entry.port, entry.pid);
    }
  }
  return portToPid;
}

/**
 * @description プロセスの実際の作業ディレクトリを取得
 * @param pids - 対象プロセスIDの配列
 * @returns PID→CWDパスのマッピング(取得失敗したPIDは含まれない)
 */
export async function getProcessCwds(pids: number[]): Promise<Map<number, string>> {
  if (process.platform === "linux") {
    return getProcessCwdsLinux(pids);
  }
  return getProcessCwdsMacOS(pids);
}

/**
 * @description Linuxで/proc/{pid}/cwdのsymlinkからCWDを取得
 * @param pids - 対象プロセスIDの配列
 * @returns PID→CWDパスのマッピング
 */
async function getProcessCwdsLinux(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const settled = await Promise.allSettled(
    pids.map(async (pid) => {
      const cwd = await readlink(`/proc/${pid}/cwd`);
      return { pid, cwd };
    }),
  );
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      result.set(entry.value.pid, entry.value.cwd);
    }
  }
  return result;
}

/**
 * @description macOSでlsofを使いプロセスのCWDを一括取得
 * @param pids - 対象プロセスIDの配列
 * @returns PID→CWDパスのマッピング
 */
async function getProcessCwdsMacOS(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pids.length === 0) return result;

  const pidArg = pids.join(",");
  try {
    const { stdout } = await execFileAsync("lsof", ["-a", "-d", "cwd", "-p", pidArg, "-Fn"], {
      timeout: 10000,
    });
    let currentPid: number | null = null;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) {
        currentPid = parseInt(line.slice(1), 10);
      } else if (line.startsWith("n") && currentPid !== null) {
        result.set(currentPid, line.slice(1));
      }
    }
  } catch {
    // lsof失敗時は空Mapを返す
  }
  return result;
}

/**
 * @description 指定PIDの祖先プロセスPIDを全て取得
 * @param pid - 起点プロセスID
 * @returns 祖先PIDのSet(自身は含まない)
 */
export async function getAncestorPids(pid: number): Promise<Set<number>> {
  const ancestors = new Set<number>();
  if (process.platform === "linux") {
    await getAncestorsLinux(pid, ancestors);
  } else {
    await getAncestorsMacOS(pid, ancestors);
  }
  addPpidFallback(ancestors);
  return ancestors;
}

/**
 * @description Linuxで/proc/<pid>/statからPPIDを読み取り祖先を走査
 * @param pid - 起点プロセスID
 * @param ancestors - 結果を蓄積するSet(変更される)
 */
async function getAncestorsLinux(pid: number, ancestors: Set<number>): Promise<void> {
  let current = pid;
  for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
    try {
      const stat = await readFile(`/proc/${current}/stat`, "utf-8");
      // /proc/<pid>/stat の4番目のフィールドがPPID
      const match = stat.match(/^\d+\s+\(.*?\)\s+\S+\s+(\d+)/);
      if (!match) break;
      const ppid = parseInt(match[1], 10);
      if (ppid <= 1) break;
      if (ancestors.has(ppid)) break;
      ancestors.add(ppid);
      current = ppid;
    } catch {
      break;
    }
  }
}

/**
 * @description macOSでps -eo pid=,ppid=から全プロセスのpid→ppidマップを構築し祖先を走査
 * @param pid - 起点プロセスID
 * @param ancestors - 結果を蓄積するSet(変更される)
 */
async function getAncestorsMacOS(pid: number, ancestors: Set<number>): Promise<void> {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid="], { timeout: 5000 });
    const pidToParent = new Map<number, number>();
    for (const line of stdout.split("\n")) {
      const match = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (!match) continue;
      pidToParent.set(parseInt(match[1], 10), parseInt(match[2], 10));
    }

    walkAncestors(pid, pidToParent, ancestors);
  } catch {
    // ps失敗時は空のまま返す(呼び出し元でppidフォールバック)
  }
}

const _: Platform = { listProcesses, listPortProcesses, getProcessCwds, getAncestorPids };
