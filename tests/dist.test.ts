import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const distCli = resolve(import.meta.dir, "../dist/cli.js");

describe("dist/cli.js (bundled)", () => {
	it("--help exits 0 with usage text", async () => {
		const proc = Bun.spawn(["node", distCli, "--help"], {
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();
		expect(exitCode).toBe(0);
		expect(stderr).toContain("Usage: dev-clean");
	});

	it("--version exits 0 with version string", async () => {
		const proc = Bun.spawn(["node", distCli, "--version"], {
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();
		expect(exitCode).toBe(0);
		expect(stderr).toMatch(/^\d+\.\d+\.\d+/);
	});

	it("--dry-run --json exits 0 with valid JSON", async () => {
		const proc = Bun.spawn(["node", distCli, "--dry-run", "--json"], {
			stdout: "pipe",
		});
		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed).toHaveProperty("found");
		expect(parsed).toHaveProperty("killed");
		expect(parsed).toHaveProperty("errors");
	});

	it("--port abc exits 1 with error", async () => {
		const proc = Bun.spawn(["node", distCli, "--port", "abc"], {
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		const stderr = await new Response(proc.stderr).text();
		expect(exitCode).toBe(1);
		expect(stderr).toContain("Invalid port");
	});

	it("--port abc --json outputs JSON error", async () => {
		const proc = Bun.spawn(["node", distCli, "--port", "abc", "--json"], {
			stdout: "pipe",
		});
		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		expect(exitCode).toBe(1);
		const parsed = JSON.parse(stdout);
		expect(parsed.error).toContain("Invalid port");
	});
});
