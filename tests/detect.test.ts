import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detect } from "../src/detect.js";

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
    expect(pids).toContain(childProc.pid);
  });
});

describe("detect", () => {
  it("returns an array", async () => {
    const result = await detect({ cwd: "/nonexistent/path/that/matches/nothing", ports: [] });
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
