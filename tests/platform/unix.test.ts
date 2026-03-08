import { describe, expect, it } from "bun:test";

const isWindows = process.platform === "win32";

describe.skipIf(isWindows)("unix platform", () => {
  it("listProcesses returns an array", async () => {
    const { listProcesses } = await import("../../src/platform/unix.js");
    const result = await listProcesses();
    expect(Array.isArray(result)).toBe(true);
    for (const proc of result) {
      expect(typeof proc.pid).toBe("number");
      expect(typeof proc.name).toBe("string");
      expect(typeof proc.command).toBe("string");
    }
  });

  it("listPortProcesses returns a Map", async () => {
    const { listPortProcesses } = await import("../../src/platform/unix.js");
    const result = await listPortProcesses([99999]);
    expect(result instanceof Map).toBe(true);
  });
});
