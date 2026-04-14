import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { killProcesses } from "../src/kill.js";

describe("killProcesses", () => {
	it("returns result with empty input", async () => {
		const result = await killProcesses([]);
		expect(result.found).toEqual([]);
		expect(result.killed).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it("handles already-dead PID gracefully (ESRCH)", async () => {
		const result = await killProcesses([
			{ pid: 999999, name: "node", command: "fake" },
		]);
		expect(result.killed).toContain(999999);
		expect(result.errors).toEqual([]);
	});

	describe("kills a real process", () => {
		let childProc: ReturnType<typeof Bun.spawn>;

		beforeAll(() => {
			childProc = Bun.spawn(["node", "-e", "setTimeout(()=>{},60000)"], {
				stdout: "ignore",
				stderr: "ignore",
			});
		});

		afterAll(() => {
			try {
				childProc.kill();
			} catch {
				// already dead
			}
		});

		it("kills a running process and returns it in killed list", async () => {
			const pid = childProc.pid;
			const result = await killProcesses([
				{ pid, name: "node", command: "node -e setTimeout" },
			]);
			expect(result.killed).toContain(pid);
			expect(result.errors).toEqual([]);
		});
	});

	it("reports Permission denied for EPERM", async () => {
		const spy = spyOn(process, "kill");
		spy.mockImplementation((_pid: number, signal?: string | number) => {
			if (signal === "SIGTERM") {
				const err = new Error("EPERM") as NodeJS.ErrnoException;
				err.code = "EPERM";
				throw err;
			}
			return true;
		});

		try {
			const result = await killProcesses([
				{ pid: 12345, name: "node", command: "fake" },
			]);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0].message).toBe("Permission denied");
			expect(result.killed).toEqual([]);
		} finally {
			spy.mockRestore();
		}
	});

	it("handles unknown error from process.kill", async () => {
		const spy = spyOn(process, "kill");
		spy.mockImplementation((_pid: number, signal?: string | number) => {
			if (signal === "SIGTERM") {
				const err = new Error("Unknown kill error");
				(err as NodeJS.ErrnoException).code = "EUNKNOWN";
				throw err;
			}
			return true;
		});

		try {
			const result = await killProcesses([
				{ pid: 12345, name: "node", command: "fake" },
			]);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0].message).toBe("Unknown kill error");
		} finally {
			spy.mockRestore();
		}
	});

	it("handles non-Error throw", async () => {
		const spy = spyOn(process, "kill");
		spy.mockImplementation((_pid: number, signal?: string | number) => {
			if (signal === "SIGTERM") {
				throw "string error";
			}
			return true;
		});

		try {
			const result = await killProcesses([
				{ pid: 12345, name: "node", command: "fake" },
			]);
			expect(result.errors.length).toBe(1);
			expect(result.errors[0].message).toBe("string error");
		} finally {
			spy.mockRestore();
		}
	});

	it("falls back to taskkill on Windows when process survives SIGTERM", async () => {
		let killCallCount = 0;
		const spy = spyOn(process, "kill");
		spy.mockImplementation((_pid: number, signal?: string | number) => {
			killCallCount++;
			if (signal === "SIGTERM") return true;
			if (signal === 0) {
				if (killCallCount <= 3) return true;
				const err = new Error("ESRCH") as NodeJS.ErrnoException;
				err.code = "ESRCH";
				throw err;
			}
			return true;
		});

		try {
			const result = await killProcesses([
				{ pid: 12345, name: "node", command: "fake" },
			]);
			expect(result.killed).toContain(12345);
		} finally {
			spy.mockRestore();
		}
	});

	it("falls back to SIGKILL on Unix when process survives SIGTERM", async () => {
		const originalPlatform = process.platform;
		Object.defineProperty(process, "platform", { value: "linux" });

		let killCallCount = 0;
		const spy = spyOn(process, "kill");
		spy.mockImplementation((_pid: number, signal?: string | number) => {
			killCallCount++;
			if (signal === "SIGTERM") return true;
			if (signal === 0) {
				if (killCallCount <= 3) return true;
				const err = new Error("ESRCH") as NodeJS.ErrnoException;
				err.code = "ESRCH";
				throw err;
			}
			if (signal === "SIGKILL") return true;
			return true;
		});

		try {
			const result = await killProcesses([
				{ pid: 12345, name: "node", command: "fake" },
			]);
			expect(result.killed).toContain(12345);
		} finally {
			spy.mockRestore();
			Object.defineProperty(process, "platform", {
				value: originalPlatform,
			});
		}
	});
});
