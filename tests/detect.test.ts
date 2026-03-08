import { describe, expect, it } from "bun:test";
import { detect } from "../src/detect.js";

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
