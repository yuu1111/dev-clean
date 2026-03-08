import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessInfo } from "../types.js";
import { isTargetProcess, parsePortFromAddr } from "../types.js";

const execFileAsync = promisify(execFile);

/**
 * @description Get-CimInstanceでWindowsのプロセス一覧を取得
 * @returns 対象プロセスの一覧
 */
export async function listProcesses(): Promise<ProcessInfo[]> {
  const script =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-Command", script],
    { timeout: 10000 },
  );

  const raw = JSON.parse(stdout);
  const items: Array<{ ProcessId: number; Name: string; CommandLine: string | null }> =
    Array.isArray(raw) ? raw : [raw];

  const results: ProcessInfo[] = [];
  for (const item of items) {
    if (!isTargetProcess(item.Name ?? "")) continue;
    results.push({
      pid: item.ProcessId,
      name: item.Name,
      command: item.CommandLine ?? "",
    });
  }
  return results;
}

/**
 * @description netstat -anoで指定ポートをLISTENしているPIDを取得
 * @param ports - 検索対象のポート番号
 * @returns port→PIDのマッピング
 */
export async function listPortProcesses(ports: number[]): Promise<Map<number, number>> {
  const { stdout } = await execFileAsync("netstat", ["-ano"], { timeout: 10000 });
  const portSet = new Set(ports);
  const portToPid = new Map<number, number>();

  for (const line of stdout.split("\n")) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const pid = parseInt(parts[4], 10);
    if (Number.isNaN(pid)) continue;
    const port = parsePortFromAddr(parts[1]);
    if (port === null) continue;
    if (portSet.has(port)) {
      portToPid.set(port, pid);
    }
  }
  return portToPid;
}
