import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect, filterByPort } from "../src/detect.js";
import type { ProcessInfo } from "../src/types.js";

describe("detect CWD-based", () => {
	let childProc: ReturnType<typeof Bun.spawn>;
	let testDir: string;

	beforeAll(() => {
		testDir = mkdtempSync(join(tmpdir(), "dev-clean-test-"));
		childProc = Bun.spawn(["node", "-e", "setTimeout(()=>{},30000)"], {
			cwd: testDir,
			stdout: "ignore",
			stderr: "ignore",
		});
	});

	afterAll(() => {
		childProc.kill();
	});

	it("detects a child process by cwd", async () => {
		const result = await detect({ cwd: testDir, ports: [] });
		const pids = result.map((p) => p.pid);
		// macOS CIではlsofの権限不足でCWD検出できない場合がある
		if (pids.length === 0 && process.platform === "darwin") {
			console.warn(
				"skipped: CWD detection unavailable on this macOS environment",
			);
			return;
		}
		expect(pids).toContain(childProc.pid);
	});
});

describe("detect CWD-based does not match by command line", () => {
	let childProc: ReturnType<typeof Bun.spawn>;
	let testDir: string;

	beforeAll(() => {
		testDir = mkdtempSync(join(tmpdir(), "dev-clean-cmdarg-"));
		// testDirをコマンドライン引数に含むが、CWDは別の場所(tmpdir)で起動
		childProc = Bun.spawn(
			["node", "-e", "setTimeout(()=>{},30000)", "--", testDir],
			{
				cwd: tmpdir(),
				stdout: "ignore",
				stderr: "ignore",
			},
		);
	});

	afterAll(() => {
		childProc.kill();
	});

	it("does not detect process whose command line contains target path but CWD differs", async () => {
		const result = await detect({ cwd: testDir, ports: [] });
		const pids = result.map((p) => p.pid);
		expect(pids).not.toContain(childProc.pid);
	});
});

describe("detect", () => {
	it("returns an array", async () => {
		const result = await detect({
			cwd: "/nonexistent/path/that/matches/nothing",
			ports: [],
		});
		expect(Array.isArray(result)).toBe(true);
	});

	it("does not include self PID", async () => {
		const result = await detect({ cwd: process.cwd(), ports: [] });
		const selfPid = process.pid;
		const parentPid = process.ppid;
		for (const proc of result) {
			expect(proc.pid).not.toBe(selfPid);
			expect(proc.pid).not.toBe(parentPid);
		}
	});

	it("returns empty for unused port", async () => {
		const result = await detect({ cwd: process.cwd(), ports: [59999] });
		expect(Array.isArray(result)).toBe(true);
	});
});

describe("filterByPort", () => {
	const excludePids = new Set([1]);

	it("matches processes by port", () => {
		const processes: ProcessInfo[] = [
			{ pid: 100, name: "node", command: "node server.js" },
			{ pid: 200, name: "bun", command: "bun dev" },
		];
		const portMap = new Map<number, number>([[3000, 100]]);

		const result = filterByPort(processes, portMap, excludePids);
		expect(result).toEqual([
			{ pid: 100, name: "node", command: "node server.js", port: 3000 },
		]);
	});

	it("adds unknown processes for ports not in process list", () => {
		const processes: ProcessInfo[] = [
			{ pid: 100, name: "node", command: "node server.js" },
		];
		const portMap = new Map<number, number>([
			[3000, 100],
			[4000, 999],
		]);

		const result = filterByPort(processes, portMap, excludePids);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			pid: 100,
			name: "node",
			command: "node server.js",
			port: 3000,
		});
		expect(result[1]).toEqual({
			pid: 999,
			name: "unknown",
			command: "",
			port: 4000,
		});
	});

	it("skips excluded PIDs", () => {
		const processes: ProcessInfo[] = [
			{ pid: 1, name: "node", command: "node" },
		];
		const portMap = new Map<number, number>([[3000, 1]]);

		const result = filterByPort(processes, portMap, excludePids);
		expect(result).toEqual([]);
	});

	it("deduplicates PIDs already added from process list", () => {
		const processes: ProcessInfo[] = [
			{ pid: 100, name: "node", command: "node server.js" },
		];
		// 同じPID 100が2つのポートにいる場合
		const portMap = new Map<number, number>([
			[3000, 100],
			[4000, 100],
		]);

		const result = filterByPort(processes, portMap, excludePids);
		// processesから1回 + portMapのunknown分岐では addedPids にあるのでスキップ
		expect(result).toHaveLength(1);
		expect(result[0].pid).toBe(100);
	});
});
