import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessInfo } from "../types.js";
import { TARGET_NAMES } from "../types.js";

const execFileAsync = promisify(execFile);

/**
 * @description Windowsのプロセス一覧を取得する(pwsh優先、wmic fallback)
 * @returns 対象プロセスの一覧
 */
export async function listProcesses(): Promise<ProcessInfo[]> {
  try {
    return await listProcessesPwsh();
  } catch {
    return await listProcessesWmic();
  }
}

/**
 * @description pwshのGet-CimInstanceでプロセス一覧を取得
 * @returns 対象プロセスの一覧
 */
async function listProcessesPwsh(): Promise<ProcessInfo[]> {
  const script =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("pwsh", ["-NoProfile", "-Command", script], {
    timeout: 10000,
  });

  const raw = JSON.parse(stdout);
  const items: Array<{ ProcessId: number; Name: string; CommandLine: string | null }> =
    Array.isArray(raw) ? raw : [raw];

  const results: ProcessInfo[] = [];
  for (const item of items) {
    const name = item.Name?.toLowerCase() ?? "";
    const baseName = name.replace(/\.exe$/, "");
    if (!TARGET_NAMES.has(name) && !TARGET_NAMES.has(baseName)) continue;
    results.push({
      pid: item.ProcessId,
      name: item.Name,
      command: item.CommandLine ?? "",
    });
  }
  return results;
}

/**
 * @description wmicでプロセス一覧を取得(pwsh利用不可時のfallback)
 * @returns 対象プロセスの一覧
 */
async function listProcessesWmic(): Promise<ProcessInfo[]> {
  const { stdout } = await execFileAsync(
    "wmic",
    ["process", "get", "ProcessId,Name,CommandLine", "/format:csv"],
    { timeout: 10000 },
  );

  const results: ProcessInfo[] = [];
  const lines = stdout.split("\n").filter((l) => l.trim());
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const commandLine = parts.slice(1, -2).join(",");
    const name = parts[parts.length - 2]?.trim() ?? "";
    const pid = parseInt(parts[parts.length - 1]?.trim() ?? "", 10);
    if (Number.isNaN(pid)) continue;
    const lowerName = name.toLowerCase();
    const baseName = lowerName.replace(/\.exe$/, "");
    if (!TARGET_NAMES.has(lowerName) && !TARGET_NAMES.has(baseName)) continue;
    results.push({ pid, name, command: commandLine.trim() });
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
    const localAddr = parts[1];
    const pid = parseInt(parts[4], 10);
    if (Number.isNaN(pid)) continue;
    const colonIdx = localAddr.lastIndexOf(":");
    if (colonIdx === -1) continue;
    const port = parseInt(localAddr.slice(colonIdx + 1), 10);
    if (Number.isNaN(port)) continue;
    if (portSet.has(port)) {
      portToPid.set(port, pid);
    }
  }
  return portToPid;
}
