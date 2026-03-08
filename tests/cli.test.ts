import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { parsePorts } from "../src/parse.js";

describe("parsePorts with multiple values", () => {
  it("flatMaps multiple string values", () => {
    const result = ["3000", "3001"].flatMap(parsePorts);
    expect(result).toEqual([3000, 3001]);
  });

  it("flatMaps range and single values", () => {
    const result = ["3000-3002", "5173"].flatMap(parsePorts);
    expect(result).toEqual([3000, 3001, 3002, 5173]);
  });
});

describe("parsePorts", () => {
  it("parses a single port", () => {
    expect(parsePorts("3000")).toEqual([3000]);
  });

  it("parses comma-separated ports", () => {
    expect(parsePorts("3000,5173")).toEqual([3000, 5173]);
  });

  it("parses a port range", () => {
    expect(parsePorts("3000-3003")).toEqual([3000, 3001, 3002, 3003]);
  });

  it("parses mixed ports and ranges", () => {
    expect(parsePorts("3000,5000-5002")).toEqual([3000, 5000, 5001, 5002]);
  });

  it("rejects invalid port string", () => {
    expect(() => parsePorts("abc")).toThrow(/Invalid port/);
  });

  it("rejects port out of range", () => {
    expect(() => parsePorts("0")).toThrow(/Invalid port/);
    expect(() => parsePorts("70000")).toThrow(/Port out of range/);
  });

  it("rejects reversed range", () => {
    expect(() => parsePorts("5000-3000")).toThrow(/Invalid port range/);
  });

  it("rejects range too large", () => {
    expect(() => parsePorts("1-2000")).toThrow(/Port range too large/);
  });

  it("handles whitespace in segments", () => {
    expect(parsePorts(" 3000 , 5173 ")).toEqual([3000, 5173]);
  });

  it("handles whitespace around range dash", () => {
    expect(parsePorts("3000 - 3005")).toEqual([3000, 3001, 3002, 3003, 3004, 3005]);
  });

  it("handles mixed whitespace in ranges and singles", () => {
    expect(parsePorts(" 3000 , 3001 - 3003 , 5173 ")).toEqual([3000, 3001, 3002, 3003, 5173]);
  });

  it("handles boundary ports", () => {
    expect(parsePorts("1")).toEqual([1]);
    expect(parsePorts("65535")).toEqual([65535]);
  });

  it("rejects scientific notation", () => {
    expect(() => parsePorts("3e3")).toThrow(/Invalid port/);
  });

  it("rejects plus prefix", () => {
    expect(() => parsePorts("+3000")).toThrow(/Invalid port/);
  });

  it("rejects decimal notation", () => {
    expect(() => parsePorts("3000.0")).toThrow(/Invalid port/);
  });

  it("rejects leading zeros", () => {
    expect(() => parsePorts("03000")).toThrow(/Invalid port/);
  });

  it("rejects triple-dash range", () => {
    expect(() => parsePorts("3000-3001-3002")).toThrow(/Invalid port/);
  });
});

describe("--cwd validation", () => {
  const cliPath = resolve(import.meta.dir, "../src/cli.ts");

  it("exits with error for nonexistent path", async () => {
    const proc = Bun.spawn(["bun", "run", cliPath, "--cwd", "/nonexistent/path/xyz"], {
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("does not exist");
  });

  it("exits with error for file path", async () => {
    const filePath = resolve(import.meta.dir, "../package.json");
    const proc = Bun.spawn(["bun", "run", cliPath, "--cwd", filePath], {
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not a directory");
  });
});

describe("--json error output", () => {
  const cliPath = resolve(import.meta.dir, "../src/cli.ts");

  it("outputs JSON error for invalid port with --json", async () => {
    const proc = Bun.spawn(["bun", "run", cliPath, "--port", "abc", "--json"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain("Invalid port");
  });
});
