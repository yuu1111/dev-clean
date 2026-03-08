import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import { promisify } from "node:util";
import type { ProcessInfo } from "../types";
import { isTargetProcess, parsePortFromAddr } from "../types";

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
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const pid = parseInt(parts[1], 10);
    if (Number.isNaN(pid)) continue;
    const port = parsePortFromAddr(parts[8]);
    if (port === null) continue;
    portToPid.set(port, pid);
  }
  return portToPid;
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
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const port = parsePortFromAddr(parts[3]);
    if (port === null) continue;
    if (!portSet.has(port)) continue;

    const pidMatch = line.match(/pid=(\d+)/);
    if (!pidMatch) continue;
    const pid = parseInt(pidMatch[1], 10);
    portToPid.set(port, pid);
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
