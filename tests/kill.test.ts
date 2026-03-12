import { describe, expect, it } from "bun:test";
import { killProcesses } from "../src/kill.js";

describe("killProcesses", () => {
	it("returns result with empty input", async () => {
		const result = await killProcesses([]);
		expect(result.found).toEqual([]);
		expect(result.killed).toEqual([]);
		expect(result.errors).toEqual([]);
	});

	it("handles already-dead PID gracefully", async () => {
		const result = await killProcesses([
			{ pid: 999999, name: "node", command: "fake" },
		]);
		expect(result.killed.length + result.errors.length).toBe(1);
	});
});
