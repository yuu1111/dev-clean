import { describe, expect, it } from "bun:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const isNotWindows = process.platform !== "win32";

describe.skipIf(isNotWindows)("windows platform", () => {
  it("listProcesses returns an array", async () => {
    const { listProcesses } = await import("../../src/platform/windows.js");
    const result = await listProcesses();
    expect(Array.isArray(result)).toBe(true);
    for (const proc of result) {
      expect(typeof proc.pid).toBe("number");
      expect(typeof proc.name).toBe("string");
      expect(typeof proc.command).toBe("string");
    }
  });

  it("listPortProcesses returns a Map", async () => {
    const { listPortProcesses } = await import("../../src/platform/windows.js");
    const result = await listPortProcesses([99999]);
    expect(result instanceof Map).toBe(true);
  });

  it("getProcessCwds returns a Map", async () => {
    const { getProcessCwds } = await import("../../src/platform/windows.js");
    const result = await getProcessCwds([process.pid]);
    expect(result instanceof Map).toBe(true);
  });

  it("PowerShell UTF-8 encoding handles non-ASCII process output", async () => {
    // 非ASCII引数のプロセスを起動し、UTF-8プレフィックス付きPowerShellで取得してJSON.parseが成功することを確認
    const marker = "テスト日本語";
    const child = Bun.spawn(["node", "-e", `/* ${marker} */ setTimeout(()=>{},30000)`], {
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      // キャッシュを経由せず直接PowerShellを実行して検証
      const script = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-CimInstance Win32_Process -Filter "ProcessId=${child.pid}" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
        timeout: 10000,
      });
      const parsed = JSON.parse(stdout);
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      expect(item.ProcessId).toBe(child.pid);
      expect(item.CommandLine).toContain(marker);
    } finally {
      child.kill();
    }
  });

  it("getProcessCwds returns cwd of self process", async () => {
    const { getProcessCwds } = await import("../../src/platform/windows.js");
    const result = await getProcessCwds([process.pid]);
    const selfCwd = result.get(process.pid);
    if (selfCwd) {
      const normalizedSelfCwd = selfCwd.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
      const normalizedExpected = process.cwd().replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
      expect(normalizedSelfCwd).toBe(normalizedExpected);
    }
  });
});
