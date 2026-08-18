import { normalize, resolve } from "node:path";
import { isTargetProcess } from "./process";
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
	const processesPromise = platform.listProcesses();
	const excludePidsPromise = getExcludePids(platform);

	if (options.ports.length > 0) {
		const [processes, excludePids, portMap] = await Promise.all([
			processesPromise,
			excludePidsPromise,
			platform.listPortProcesses(options.ports),
		]);
		return filterByPort(processes, portMap, excludePids);
	}

	const [processes, excludePids] = await Promise.all([
		processesPromise,
		excludePidsPromise,
	]);
	return filterByCwd(platform, processes, options.cwd, excludePids);
}

/**
 * @description ポートマッチで対象プロセスをフィルタリング
 * @param processes - プロセス一覧
 * @param portMap - port→PIDのマッピング
 * @param excludePids - 除外するPIDのSet(自プロセスと祖先)
 * @returns 検出されたプロセス一覧
 */
export function filterByPort(
	processes: ProcessInfo[],
	portMap: Map<number, number>,
	excludePids: Set<number>,
): ProcessInfo[] {
	const pidToPort = toPidPortMap(portMap);

	return processes.flatMap((proc) => {
		if (!isCandidate(proc, excludePids)) return [];
		const port = pidToPort.get(proc.pid);
		return port === undefined ? [] : [{ ...proc, port }];
	});
}

/**
 * @description 実CWDマッチで対象プロセスをフィルタリング
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
	const target = normalizeForComparison(resolve(cwd));
	const candidates = processes.filter((proc) => isCandidate(proc, excludePids));

	let cwdMap = new Map<number, string>();
	try {
		const pids = candidates.map((p) => p.pid);
		if (pids.length > 0) {
			cwdMap = await platform.getProcessCwds(pids);
		}
	} catch {
		// getProcessCwds失敗時はCWD検証不能のため空結果を返す
	}

	return candidates.filter((proc) => {
		const procCwd = cwdMap.get(proc.pid);
		return procCwd !== undefined && isPathInside(procCwd, target);
	});
}

/**
 * @description 自プロセスと祖先プロセスを除外対象として取得
 * @param platform - プラットフォームアダプタ
 * @returns 除外するPIDのSet
 */
async function getExcludePids(platform: Platform): Promise<Set<number>> {
	const excludePids = await platform.getAncestorPids(process.pid);
	excludePids.add(process.pid);
	return excludePids;
}

/**
 * @description 停止対象になり得るプロセスか判定
 * @param proc - プロセス情報
 * @param excludePids - 除外するPID
 * @returns 停止対象候補ならtrue
 */
function isCandidate(proc: ProcessInfo, excludePids: Set<number>): boolean {
	// ポートを使っているだけの任意プロセスは停止対象にしない。
	return !excludePids.has(proc.pid) && isTargetProcess(proc.name);
}

/**
 * @description port→PIDマップをPID→portマップへ変換
 * @param portMap - port→PIDのマッピング
 * @returns PID→portのマッピング
 */
function toPidPortMap(portMap: Map<number, number>): Map<number, number> {
	return new Map([...portMap].map(([port, pid]) => [pid, port]));
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
 * @description パス比較用に正規化
 * @param p - パス文字列
 * @returns 正規化された比較用パス
 */
function normalizeForComparison(p: string): string {
	const normalized = normalizePath(p);
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * @description パスが対象パス自身または配下か判定
 * @param candidate - 判定対象パス
 * @param target - 正規化済み対象パス
 * @returns 対象パス内ならtrue
 */
function isPathInside(candidate: string, target: string): boolean {
	const normalized = normalizeForComparison(candidate);
	return normalized === target || normalized.startsWith(`${target}/`);
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
