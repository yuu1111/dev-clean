import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessInfo } from "../types";
import { isTargetProcess, MAX_ANCESTOR_DEPTH, parsePortFromAddr } from "../types";

const execFileAsync = promisify(execFile);

/**
 * @description Get-CimInstanceでWindowsのプロセス一覧を取得
 * @returns 対象プロセスの一覧
 */
export async function listProcesses(): Promise<ProcessInfo[]> {
  const script =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    timeout: 10000,
  });

  const raw = JSON.parse(stdout);
  const items: Array<{ ProcessId: number; Name: string; CommandLine: string | null }> =
    Array.isArray(raw) ? raw : [raw];

  const results: ProcessInfo[] = [];
  for (const item of items) {
    if (!isTargetProcess(item.Name ?? "")) continue;
    results.push({
      pid: item.ProcessId,
      name: item.Name,
      command: item.CommandLine ?? "",
    });
  }
  return results;
}

/**
 * @description netstat -anoで指定ポートをLISTENしているPIDを取得
 * @param ports - 検索対象のポート番号
 * @returns port→PIDのマッピング
 */
export async function listPortProcesses(ports: number[]): Promise<Map<number, number>> {
  const { stdout } = await execFileAsync("netstat", ["-ano"], { timeout: 10000 });
  const portSet = new Set(ports);
  const portToPid = new Map<number, number>();

  for (const line of stdout.split("\n")) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const pid = parseInt(parts[4], 10);
    if (Number.isNaN(pid)) continue;
    const port = parsePortFromAddr(parts[1]);
    if (port === null) continue;
    if (portSet.has(port)) {
      portToPid.set(port, pid);
    }
  }
  return portToPid;
}

/**
 * @description 指定PIDの祖先プロセスPIDを全て取得
 * @param pid - 起点プロセスID
 * @returns 祖先PIDのSet(自身は含まない)
 */
export async function getAncestorPids(pid: number): Promise<Set<number>> {
  const ancestors = new Set<number>();
  try {
    const script =
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress";
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 10000,
    });

    const raw = JSON.parse(stdout);
    const items: Array<{ ProcessId: number; ParentProcessId: number }> = Array.isArray(raw)
      ? raw
      : [raw];

    const pidToParent = new Map<number, number>();
    for (const item of items) {
      pidToParent.set(item.ProcessId, item.ParentProcessId);
    }

    let current = pidToParent.get(pid);
    for (let i = 0; i < MAX_ANCESTOR_DEPTH && current !== undefined && current > 0; i++) {
      if (ancestors.has(current)) break;
      ancestors.add(current);
      current = pidToParent.get(current);
    }
  } catch {
    // 取得失敗時はprocess.ppidだけフォールバック
    const ppid = process.ppid;
    if (ppid > 0) ancestors.add(ppid);
  }
  return ancestors;
}

/**
 * @description P/InvokeでWindowsプロセスのCWDをPEBから読み取るC#コード
 */
const GET_CWD_SCRIPT = `
$pids = @(PLACEHOLDER_PIDS)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class ProcCwd {
    [DllImport("ntdll.dll")]
    static extern int NtQueryInformationProcess(
        IntPtr hProcess, int pic, ref PROCESS_BASIC_INFORMATION pbi,
        int cb, out int returnLength);

    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);

    [DllImport("kernel32.dll")]
    static extern bool ReadProcessMemory(
        IntPtr hProcess, IntPtr baseAddr, byte[] buffer,
        int size, out int bytesRead);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr h);

    [StructLayout(LayoutKind.Sequential)]
    struct PROCESS_BASIC_INFORMATION {
        public IntPtr Reserved1;
        public IntPtr PebBaseAddress;
        public IntPtr Reserved2_0;
        public IntPtr Reserved2_1;
        public IntPtr UniqueProcessId;
        public IntPtr Reserved3;
    }

    const uint PROCESS_QUERY_INFORMATION = 0x0400;
    const uint PROCESS_VM_READ = 0x0010;

    public static Dictionary<int, string> GetCwds(int[] pids) {
        var result = new Dictionary<int, string>();
        foreach (var pid in pids) {
            try {
                string cwd = GetCwd(pid);
                if (cwd != null) result[pid] = cwd;
            } catch {}
        }
        return result;
    }

    static string GetCwd(int pid) {
        IntPtr hProc = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid);
        if (hProc == IntPtr.Zero) return null;
        try {
            var pbi = new PROCESS_BASIC_INFORMATION();
            int retLen;
            if (NtQueryInformationProcess(hProc, 0, ref pbi, Marshal.SizeOf(pbi), out retLen) != 0)
                return null;

            byte[] buf8 = new byte[8];
            int read;
            IntPtr paramsPtr = IntPtr.Add(pbi.PebBaseAddress, 0x20);
            if (!ReadProcessMemory(hProc, paramsPtr, buf8, 8, out read)) return null;
            IntPtr processParams = (IntPtr)BitConverter.ToInt64(buf8, 0);

            byte[] uniStr = new byte[16];
            IntPtr cdOffset = IntPtr.Add(processParams, 0x38);
            if (!ReadProcessMemory(hProc, cdOffset, uniStr, 16, out read)) return null;
            ushort len = BitConverter.ToUInt16(uniStr, 0);
            IntPtr bufPtr = (IntPtr)BitConverter.ToInt64(uniStr, 8);

            byte[] pathBuf = new byte[len];
            if (!ReadProcessMemory(hProc, bufPtr, pathBuf, len, out read)) return null;
            string path = Encoding.Unicode.GetString(pathBuf, 0, read);
            if (path.Length > 3 && path.EndsWith("\\\\"))
                path = path.TrimEnd('\\\\');
            return path;
        } finally {
            CloseHandle(hProc);
        }
    }
}
'@ -ErrorAction Stop

$map = [ProcCwd]::GetCwds($pids)
$entries = @()
foreach ($kv in $map.GetEnumerator()) {
    $entries += [PSCustomObject]@{ Pid = $kv.Key; Cwd = $kv.Value }
}
$entries | ConvertTo-Json -Compress
`;

/**
 * @description Windowsプロセスの実際の作業ディレクトリをPEB経由で取得
 * @param pids - 対象プロセスIDの配列
 * @returns PID→CWDパスのマッピング(権限不足等で取得失敗したPIDは含まれない)
 */
export async function getProcessCwds(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pids.length === 0) return result;

  const pidList = pids.join(",");
  const script = GET_CWD_SCRIPT.replace("PLACEHOLDER_PIDS", pidList);

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 15000,
    });
    const trimmed = stdout.trim();
    if (!trimmed) return result;

    const raw = JSON.parse(trimmed);
    const items: Array<{ Pid: number; Cwd: string }> = Array.isArray(raw) ? raw : [raw];

    for (const item of items) {
      if (item.Cwd) {
        result.set(item.Pid, item.Cwd);
      }
    }
  } catch {
    // PowerShell/P/Invoke失敗時は空Mapを返す
  }
  return result;
}
