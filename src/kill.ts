import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessInfo, Result } from "./types";

const execFileAsync = promisify(execFile);

/**
 * @description SIGTERM送信後にプロセス終了を待機する猶予時間(ミリ秒)
 */
const SIGTERM_GRACE_MS = 500;

/**
 * @description Windows taskkillコマンドのタイムアウト(ミリ秒)
 */
const TASKKILL_TIMEOUT_MS = 5000;

interface KillOutcome {
	pid: number;
	error?: string;
}

/**
 * @description プロセスリストを並列停止し結果を返す
 * @param processes - 停止対象のプロセス一覧
 * @returns 停止結果(成功PID・エラー一覧)
 */
export async function killProcesses(processes: ProcessInfo[]): Promise<Result> {
	const outcomes = await Promise.all(
		processes.map((proc) => killProcess(proc.pid)),
	);

	return {
		found: processes,
		killed: outcomes
			.filter((outcome) => outcome.error === undefined)
			.map((outcome) => outcome.pid),
		errors: outcomes
			.filter(
				(outcome): outcome is KillOutcome & { error: string } =>
					outcome.error !== undefined,
			)
			.map(({ pid, error }) => ({ pid, message: error })),
	};
}

/**
 * @description 単一プロセスの停止結果を例外なしで返す
 * @param pid - 停止対象のプロセスID
 * @returns 停止結果
 */
async function killProcess(pid: number): Promise<KillOutcome> {
	try {
		await killOne(pid);
		return { pid };
	} catch (err) {
		return { pid, error: err instanceof Error ? err.message : String(err) };
	}
}

/**
 * @description 単一プロセスをSIGTERM→待機→SIGKILL/taskkillで停止
 * @param pid - 停止対象のプロセスID
 */
async function killOne(pid: number): Promise<void> {
	try {
		process.kill(pid, "SIGTERM");
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ESRCH") return;
		if (code === "EPERM") throw new Error("Permission denied");
		throw err;
	}

	await sleep(SIGTERM_GRACE_MS);

	if (!isAlive(pid)) return;
	if (process.platform === "win32") {
		try {
			await execFileAsync("taskkill", ["/F", "/PID", String(pid)], {
				timeout: TASKKILL_TIMEOUT_MS,
			});
		} catch {
			// プロセスが既に終了している可能性
		}
	} else {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// プロセスが既に終了している可能性
		}
	}
}

/**
 * @description プロセスが生存しているか確認(signal 0で検査)
 * @param pid - 確認対象のプロセスID
 * @returns 生存していればtrue
 */
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * @description 指定ミリ秒待機
 * @param ms - 待機時間(ミリ秒)
 */
function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
