import { describe, expect, it } from "bun:test";
import { parsePorts } from "../src/cli.js";

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
    expect(() => parsePorts("0")).toThrow(/Port out of range/);
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

  it("handles boundary ports", () => {
    expect(parsePorts("1")).toEqual([1]);
    expect(parsePorts("65535")).toEqual([65535]);
  });
});
