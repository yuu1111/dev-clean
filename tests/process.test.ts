import { describe, expect, it } from "bun:test";
import {
	addPpidFallback,
	isTargetProcess,
	parsePortFromAddr,
	walkAncestors,
} from "../src/process.js";

describe("addPpidFallback", () => {
	it("adds process.ppid when ancestors is empty", () => {
		const ancestors = new Set<number>();
		addPpidFallback(ancestors);
		if (process.ppid > 0) {
			expect(ancestors.has(process.ppid)).toBe(true);
		}
	});

	it("does nothing when ancestors is non-empty", () => {
		const ancestors = new Set([42]);
		addPpidFallback(ancestors);
		expect(ancestors.size).toBe(1);
		expect(ancestors.has(42)).toBe(true);
	});
});

describe("walkAncestors", () => {
	it("walks the ancestor chain", () => {
		const pidToParent = new Map([
			[10, 5],
			[5, 2],
			[2, 1],
		]);
		const ancestors = new Set<number>();
		walkAncestors(10, pidToParent, ancestors);
		expect(ancestors).toEqual(new Set([5, 2, 1]));
	});

	it("stops on cycle", () => {
		const pidToParent = new Map([
			[10, 5],
			[5, 10],
		]);
		const ancestors = new Set<number>();
		walkAncestors(10, pidToParent, ancestors);
		expect(ancestors).toEqual(new Set([5, 10]));
	});
});

describe("isTargetProcess", () => {
	it("matches target names", () => {
		expect(isTargetProcess("node")).toBe(true);
		expect(isTargetProcess("Node.exe")).toBe(true);
		expect(isTargetProcess("bun")).toBe(true);
		expect(isTargetProcess("python")).toBe(false);
	});
});

describe("parsePortFromAddr", () => {
	it("extracts port from address", () => {
		expect(parsePortFromAddr("0.0.0.0:3000")).toBe(3000);
		expect(parsePortFromAddr(":::8080")).toBe(8080);
		expect(parsePortFromAddr("noport")).toBeNull();
		expect(parsePortFromAddr("host:abc")).toBeNull();
	});
});
