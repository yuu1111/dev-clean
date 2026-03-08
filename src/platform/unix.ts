import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessInfo } from "../types.js";
import { parsePortFromAddr, TARGET_NAMES } from "../types.js";

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
    if (!TARGET_NAMES.has(baseName)) continue;
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
    return await listPortsSs(ports);
  }
}

/**
 * @description lsofでLISTEN中のポートとPIDを取得
 * @param ports - 検索対象のポート番号
 * @returns port→PIDのマッピング
 */
async function listPortsLsof(ports: number[]): Promise<Map<number, number>> {
  const portArgs = ports.flatMap((p) => [`-iTCP:${p}`]);
  const { stdout } = await execFileAsync("lsof", [...portArgs, "-sTCP:LISTEN", "-nP"], {
    timeout: 10000,
  });

  const portSet = new Set(ports);
  const portToPid = new Map<number, number>();

  for (const line of stdout.split("\n").slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 9) continue;
    const pid = parseInt(parts[1], 10);
    if (Number.isNaN(pid)) continue;
    const port = parsePortFromAddr(parts[8]);
    if (port === null) continue;
    if (portSet.has(port)) {
      portToPid.set(port, pid);
    }
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
