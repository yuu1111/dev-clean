/**
 * @description 祖先プロセス走査の最大深度(循環防止)
 */
export const MAX_ANCESTOR_DEPTH = 64;

/**
 * @description 検出対象のプロセス名一覧
 */
const TARGET_NAMES = new Set([
	"node",
	"node.exe",
	"bun",
	"bun.exe",
	"deno",
	"deno.exe",
	"tsx",
	"ts-node",
]);

/**
 * @description プロセス名がTARGET_NAMESに含まれるか判定(大文字小文字・.exe無視)
 * @param name - プロセス名
 */
export function isTargetProcess(name: string): boolean {
	const lower = name.toLowerCase();
	if (TARGET_NAMES.has(lower)) return true;
	return TARGET_NAMES.has(lower.replace(/\.exe$/, ""));
}

/**
 * @description "address:port" 形式の文字列からポート番号を抽出
 * @param addr - アドレス文字列
 * @returns ポート番号、パース不能ならnull
 */
export function parsePortFromAddr(addr: string): number | null {
	const colonIdx = addr.lastIndexOf(":");
	if (colonIdx === -1) return null;
	const port = parseInt(addr.slice(colonIdx + 1), 10);
	return Number.isNaN(port) ? null : port;
}

/**
 * @description pid→parentPidマップを使って祖先チェーンを走査
 * @param pid - 起点プロセスID
 * @param pidToParent - PID→親PIDのマッピング
 * @param ancestors - 結果を蓄積するSet(変更される)
 */
export function walkAncestors(
	pid: number,
	pidToParent: Map<number, number>,
	ancestors: Set<number>,
): void {
	let current = pidToParent.get(pid);
	for (
		let i = 0;
		i < MAX_ANCESTOR_DEPTH && current !== undefined && current > 0;
		i++
	) {
		if (ancestors.has(current)) break;
		ancestors.add(current);
		current = pidToParent.get(current);
	}
}

/**
 * @description 祖先走査で何も取得できなかった場合にprocess.ppidでフォールバック
 * @param ancestors - 祖先PIDのSet(変更される)
 */
export function addPpidFallback(ancestors: Set<number>): void {
	if (ancestors.size === 0) {
		const ppid = process.ppid;
		if (ppid > 0) ancestors.add(ppid);
	}
}
