import { normalize, resolve } from "node:path";
import type { Platform, ProcessInfo } from "./types";

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

  if (options.ports.length > 0) {
    // getAncestorPids, listProcesses, listPortProcesses を全て並列実行
    const [excludePids, processes, portMap] = await Promise.all([
      platform.getAncestorPids(process.pid),
      platform.listProcesses(),
      platform.listPortProcesses(options.ports),
    ]);
    excludePids.add(process.pid);
    return filterByPort(processes, portMap, excludePids);
  }

  // getAncestorPids と listProcesses を並列実行
  const [excludePids, processes] = await Promise.all([
    platform.getAncestorPids(process.pid),
    platform.listProcesses(),
  ]);
  excludePids.add(process.pid);
  return await filterByCwd(platform, processes, options.cwd, excludePids);
}

/**
 * @description ポートマッチで対象プロセスをフィルタリング
 * @param processes - プロセス一覧
 * @param portMap - port→PIDのマッピング
 * @param excludePids - 除外するPIDのSet(自プロセスと祖先)
 * @returns 検出されたプロセス一覧
 */
function filterByPort(
  processes: ProcessInfo[],
  portMap: Map<number, number>,
  excludePids: Set<number>,
): ProcessInfo[] {
  const pidToPort = new Map<number, number>();
  for (const [port, pid] of portMap) {
    pidToPort.set(pid, port);
  }

  const results: ProcessInfo[] = [];
  const addedPids = new Set<number>();

  for (const proc of processes) {
    if (excludePids.has(proc.pid)) continue;
    const port = pidToPort.get(proc.pid);
    if (port === undefined) continue;
    results.push({ ...proc, port });
    addedPids.add(proc.pid);
  }

  // ポートを使っているがTARGET_NAMESに含まれないプロセスも含める
  for (const [port, pid] of portMap) {
    if (excludePids.has(pid)) continue;
    if (addedPids.has(pid)) continue;
    results.push({ pid, name: "unknown", command: "", port });
  }

  return results;
}

/**
 * @description コマンドラインとCWDマッチで対象プロセスをフィルタリング
 * @param platform - プラットフォームアダプタ(getProcessCwds用)
 * @param processes - プロセス一覧
 * @param cwd - 対象ディレクトリパス
 * @param excludePids - 除外するPIDのSet(自プロセスと祖先)
 * @returns 検出されたプロセス一覧
 */
async function filterByCwd(
  platform: Platform,
  processes: ProcessInfo[],
  cwd: string,
  excludePids: Set<number>,
): Promise<ProcessInfo[]> {
  const isWin = process.platform === "win32";
  const normalizedCwd = normalizePath(resolve(cwd));
  const target = isWin ? normalizedCwd.toLowerCase() : normalizedCwd;

  const candidates = processes.filter((proc) => !excludePids.has(proc.pid));

  // コマンドラインマッチで検出
  const cmdMatched = new Set<number>();
  for (const proc of candidates) {
    const cmd = isWin ? normalizePath(proc.command).toLowerCase() : proc.command;
    if (cmd.includes(target)) {
      cmdMatched.add(proc.pid);
    }
  }

  // CWDプレフィックスマッチで追加検出
  const cwdMatched = new Set<number>();
  try {
    const pids = candidates.filter((p) => !cmdMatched.has(p.pid)).map((p) => p.pid);
    if (pids.length > 0) {
      const cwdMap = await platform.getProcessCwds(pids);
      for (const [pid, procCwd] of cwdMap) {
        const normalizedProcCwd = isWin
          ? normalizePath(procCwd).toLowerCase()
          : normalizePath(procCwd);
        // target自体に一致、またはtarget配下のサブディレクトリ
        if (normalizedProcCwd === target || normalizedProcCwd.startsWith(`${target}/`)) {
          cwdMatched.add(pid);
        }
      }
    }
  } catch {
    // getProcessCwds失敗時はコマンドラインマッチのみにフォールバック
  }

  return candidates.filter((proc) => cmdMatched.has(proc.pid) || cwdMatched.has(proc.pid));
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
 * @description 実行プラットフォームに応じたアダプタを動的にロード
 * @returns プラットフォームアダプタ
 */
async function loadPlatform(): Promise<Platform> {
  if (process.platform === "win32") {
    return (await import("./platform/windows")).default;
  }
  return (await import("./platform/unix")).default;
}
