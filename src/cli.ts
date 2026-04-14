import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

declare const __VERSION__: string;

import { detect } from "./detect";
import { killProcesses } from "./kill";
import { parsePorts } from "./parse";
import type { CliOptions, ProcessInfo, Result } from "./types";

/**
 * @description CLIエントリポイント
 */
async function main(): Promise<void> {
	let options: CliOptions;
	try {
		options = parseCliArgs();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (process.argv.includes("--json")) {
			write({ error: msg });
		} else {
			error(msg);
		}
		process.exit(1);
	}

	if (options.help) {
		printHelp();
		return;
	}

	if (options.version) {
		printVersion();
		return;
	}

	const found = await detect({ cwd: options.cwd, ports: options.ports });

	if (found.length === 0) {
		if (options.json) {
			write({ found: [], killed: [], errors: [] });
		} else {
			info("No dev processes found.");
		}
		return;
	}

	if (options.dryRun) {
		if (options.json) {
			write({ found, killed: [], errors: [] });
		} else {
			printFound(found);
			info("(dry-run) No processes were killed.");
		}
		return;
	}

	if (!options.yes) {
		printFound(found);
		const confirmed = await confirm("Kill all?");
		if (!confirmed) {
			info("Aborted.");
			return;
		}
	}

	const result = await killProcesses(found);
	if (options.json) {
		write(result);
	} else {
		printResult(result);
	}

	if (result.errors.length > 0) {
		process.exit(1);
	}
}

/**
 * @description process.argvからCLIオプションをパース
 * @returns パース済みオプション
 */
function parseCliArgs(): CliOptions {
	const { values } = parseArgs({
		strict: true,
		options: {
			cwd: { type: "string" },
			port: { type: "string", short: "p", multiple: true },
			yes: { type: "boolean", short: "y", default: false },
			json: { type: "boolean", default: false },
			"dry-run": { type: "boolean", default: false },
			version: { type: "boolean", short: "v", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});

	const ports = values.port ? values.port.flatMap(parsePorts) : [];

	const cwd = resolve(values.cwd ?? process.cwd());
	if (!existsSync(cwd)) {
		throw new Error(`--cwd path does not exist: ${values.cwd}`);
	}
	if (!statSync(cwd).isDirectory()) {
		throw new Error(`--cwd path is not a directory: ${values.cwd}`);
	}

	return {
		cwd,
		ports,
		yes: values.yes ?? false,
		json: values.json ?? false,
		dryRun: values["dry-run"] ?? false,
		version: values.version ?? false,
		help: values.help ?? false,
	};
}

/**
 * @description 検出されたプロセスを人間向けに表示
 * @param found - 検出プロセス一覧
 */
function printFound(found: ProcessInfo[]): void {
	info(`Found ${found.length} dev process(es):\n`);
	for (const p of found) {
		const portStr = p.port ? ` (port ${p.port})` : "";
		info(`  PID ${p.pid}  ${p.name}  ${p.command}${portStr}`);
	}
	info("");
}

/**
 * @description 停止結果を人間向けに表示
 * @param result - 停止結果
 */
function printResult(result: Result): void {
	if (result.errors.length === 0) {
		info(`Killed ${result.killed.length} process(es).`);
		return;
	}

	for (const e of result.errors) {
		error(`PID ${e.pid}: ${e.message}`);
	}

	if (result.killed.length > 0) {
		info(
			`Done: ${result.killed.length} killed, ${result.errors.length} failed.`,
		);
	} else {
		info(`Failed to kill ${result.errors.length} process(es).`);
	}
}

/**
 * @description ユーザーにy/N確認を求める
 * @param question - 質問文
 * @returns yが入力されればtrue
 */
async function confirm(question: string): Promise<boolean> {
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	return new Promise((resolve) => {
		rl.question(`${question} (y/N) `, (answer) => {
			rl.close();
			resolve(answer.trim().toLowerCase() === "y");
		});
	});
}

/**
 * @description ヘルプメッセージを表示
 */
function printHelp(): void {
	info(
		[
			"Usage: dev-clean [options]",
			"",
			"Detect and kill lingering dev server processes.",
			"Without --port, scans the target directory for running dev processes.",
			"",
			"Options:",
			"  --cwd <path>        Target project path (default: current directory)",
			"  -p, --port <ports>  Port(s) to check (e.g. 3000, 3000-3005, 3000,5173)",
			"  -y, --yes           Kill without confirmation",
			"  --json              Output as JSON (to stdout)",
			"  --dry-run           Detect only, don't kill",
			"  -v, --version       Show version",
			"  -h, --help          Show this help",
			"",
			"Examples:",
			"  dev-clean                        Scan current directory for dev processes",
			"  dev-clean --cwd ~/projects/app   Scan a specific project directory",
			"  dev-clean -p 3000,5173 -y        Kill processes on specific ports",
		].join("\n"),
	);
}

/**
 * @description バージョンを表示(ビルド時に埋め込み)
 */
function printVersion(): void {
	info(__VERSION__);
}

/**
 * @description stderrに情報メッセージを出力
 * @param msg - メッセージ
 */
function info(msg: string): void {
	process.stderr.write(`${msg}\n`);
}

/**
 * @description stderrにエラーメッセージを出力
 * @param msg - メッセージ
 */
function error(msg: string): void {
	process.stderr.write(`Error: ${msg}\n`);
}

/**
 * @description stdoutにJSON形式でデータを出力
 * @param data - 出力するデータ
 */
function write(data: unknown): void {
	process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

main().catch((err) => {
	const msg = err instanceof Error ? err.message : String(err);
	if (process.argv.includes("--json")) {
		write({ error: msg });
	} else {
		error(msg);
	}
	process.exit(1);
});
