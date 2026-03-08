import { normalize, resolve } from "node:path";
import type { ProcessInfo } from "./types.js";

/**
 * @description 検出オプション
 * @property cwd - 対象ディレクトリ
 * @property ports - 対象ポート番号
 */
interface DetectOptions {
  cwd: string;
  ports: number[];
}

/**
 * @description ポートまたはcwdベースで残留プロセスを検出
 * @param options - 検出オプション
 * @returns 検出されたプロセス一覧
 */
export async function detect(options: DetectOptions): Promise<ProcessInfo[]> {
  const platform = await loadPlatform();
  const selfPid = process.pid;
  const parentPid = process.ppid;

  if (options.ports.length > 0) {
    return await detectByPort(platform, options.ports, selfPid, parentPid);
  }
  return await detectByCwd(platform, options.cwd, selfPid, parentPid);
}

/**
 * @description 指定ポートをLISTENしているプロセスを検出
 * @param platform - プラットフォームアダプタ
 * @param ports - 対象ポート番号
 * @param selfPid - 自プロセスのPID(除外用)
 * @param parentPid - 親プロセスのPID(除外用)
 * @returns 検出されたプロセス一覧
 */
async function detectByPort(
  platform: Platform,
  ports: number[],
  selfPid: number,
  parentPid: number,
): Promise<ProcessInfo[]> {
  const [processes, portMap] = await Promise.all([
    platform.listProcesses(),
    platform.listPortProcesses(ports),
  ]);

  const pidToPort = new Map<number, number>();
  for (const [port, pid] of portMap) {
    pidToPort.set(pid, port);
  }

  const results: ProcessInfo[] = [];

  for (const proc of processes) {
    if (proc.pid === selfPid || proc.pid === parentPid) continue;
    if (!pidToPort.has(proc.pid)) continue;
    results.push({ ...proc, port: pidToPort.get(proc.pid) });
  }

  // ポートを使っているがTARGET_NAMESに含まれないプロセスも含める
  for (const [port, pid] of portMap) {
    if (pid === selfPid || pid === parentPid) continue;
    if (results.some((r) => r.pid === pid)) continue;
    results.push({ pid, name: "unknown", command: "", port });
  }

  return results;
}

/**
 * @description コマンドラインにcwdパスを含むプロセスを検出
 * @param platform - プラットフォームアダプタ
 * @param cwd - 対象ディレクトリパス
 * @param selfPid - 自プロセスのPID(除外用)
 * @param parentPid - 親プロセスのPID(除外用)
 * @returns 検出されたプロセス一覧
 */
async function detectByCwd(
  platform: Platform,
  cwd: string,
  selfPid: number,
  parentPid: number,
): Promise<ProcessInfo[]> {
  const processes = await platform.listProcesses();
  const isWin = process.platform === "win32";
  const normalizedCwd = normalizePath(resolve(cwd));
  const target = isWin ? normalizedCwd.toLowerCase() : normalizedCwd;

  return processes.filter((proc) => {
    if (proc.pid === selfPid || proc.pid === parentPid) return false;
    const cmd = isWin ? normalizePath(proc.command).toLowerCase() : proc.command;
    return cmd.includes(target);
  });
}

/**
 * @description パス区切りをスラッシュに正規化
 * @param p - パス文字列
 * @returns 正規化されたパス
 */
function normalizePath(p: string): string {
  return normalize(p).replace(/\\/g, "/");
}

/**
 * @description プラットフォーム固有のプロセス/ポート取得インターフェース
 */
interface Platform {
  listProcesses(): Promise<ProcessInfo[]>;
  listPortProcesses(ports: number[]): Promise<Map<number, number>>;
}

/**
 * @description 実行プラットフォームに応じたアダプタを動的にロード
 * @returns プラットフォームアダプタ
 */
async function loadPlatform(): Promise<Platform> {
  if (process.platform === "win32") {
    return await import("./platform/windows.js");
  }
  return await import("./platform/unix.js");
}
