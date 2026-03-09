import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { addPpidFallback, isTargetProcess, parsePortFromAddr, walkAncestors } from "../process";
import type { Platform, ProcessInfo } from "../types";
import rawProcCwdCsharp from "./ProcCwd.cs";

/**
 * @description Get-CimInstanceの生プロセスデータ
 * @property ProcessId - プロセスID
 * @property ParentProcessId - 親プロセスID
 * @property Name - プロセス名
 * @property CommandLine - コマンドライン全体
 */
interface RawProcess {
  ProcessId: number;
  ParentProcessId: number;
  Name: string;
  CommandLine: string | null;
}

const execFileAsync = promisify(execFile);

/**
 * @description PowerShell出力をUTF-8に設定するプレフィックス
 */
const PS_UTF8_PREFIX = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8";

/**
 * @description 全プロセスデータのキャッシュ
 */
let cachedProcesses: Promise<RawProcess[]> | null = null;

/**
 * @description ProcCwd.csのC#ソースコードを取得
 * @returns C#ソースコード文字列
 */
function getProcCwdCsharp(): string {
  if (rawProcCwdCsharp.endsWith(".cs")) {
    return readFileSync(rawProcCwdCsharp, "utf-8");
  }
  return rawProcCwdCsharp;
}

/**
 * @description Windowsパスとして妥当な形式かチェック(ゴミデータ除外用)
 * @param p - パス文字列
 * @returns ドライブレター付きパスならtrue
 */
function isValidWindowsPath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p);
}

/**
 * @description Get-CimInstanceで全プロセスデータを1回だけ取得しキャッシュ
 * @returns 全プロセスの生データ
 */
function fetchAllProcesses(): Promise<RawProcess[]> {
  if (!cachedProcesses) {
    cachedProcesses = (async () => {
      const script = `${PS_UTF8_PREFIX}; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
        timeout: 10000,
      });
      const raw = JSON.parse(stdout);
      return Array.isArray(raw) ? raw : [raw];
    })();
  }
  return cachedProcesses;
}

/**
 * @description Windowsのプロセス一覧から対象プロセスを検出
 * @returns 対象プロセスの一覧
 */
export async function listProcesses(): Promise<ProcessInfo[]> {
  const items = await fetchAllProcesses();
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
 * @description netstat出力の1行からport, pidを抽出
 * @param line - netstat出力の1行
 * @returns {port, pid} またはパース失敗時null
 */
function parseNetstatLine(line: string): { port: number; pid: number } | null {
  if (!line.includes("LISTENING")) return null;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const pid = parseInt(parts[4], 10);
  if (Number.isNaN(pid)) return null;
  const port = parsePortFromAddr(parts[1]);
  if (port === null) return null;
  return { port, pid };
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
    const entry = parseNetstatLine(line);
    if (entry && portSet.has(entry.port)) {
      portToPid.set(entry.port, entry.pid);
    }
  }
  return portToPid;
}

/**
 * @description 指定PIDの祖先プロセスPIDを全て取得
 * @param pid - 起点プロセスID
 * @returns 祖先PIDのSet(自身は含まない)
 */
async function getAncestorPids(pid: number): Promise<Set<number>> {
  const ancestors = new Set<number>();
  const allProcs = await fetchAllProcesses().catch(() => []);

  const pidToParent = new Map<number, number>();
  for (const item of allProcs) {
    pidToParent.set(item.ProcessId, item.ParentProcessId);
  }

  walkAncestors(pid, pidToParent, ancestors);
  addPpidFallback(ancestors);
  return ancestors;
}

/**
 * @description C#コードをAdd-Typeで読み込みCWDを取得するPowerShellスクリプトを構築
 * @param pids - 対象プロセスIDの配列
 * @returns PowerShellスクリプト文字列
 */
function buildCwdScript(pids: number[]): string {
  const pidLiteral = pids.join(",");
  return [
    PS_UTF8_PREFIX,
    "Add-Type -TypeDefinition @'",
    getProcCwdCsharp(),
    "'@ -ErrorAction Stop",
    "",
    `$map = [ProcCwd]::GetCwds(@(${pidLiteral}))`,
    "$map.GetEnumerator() | ForEach-Object {",
    "    [PSCustomObject]@{ Pid = $_.Key; Cwd = $_.Value }",
    "} | ConvertTo-Json -Compress",
  ].join("\n");
}

/**
 * @description Windowsプロセスの実際の作業ディレクトリをPEB経由で取得
 * @param pids - 対象プロセスIDの配列
 * @returns PID→CWDパスのマッピング(権限不足等で取得失敗したPIDは含まれない)
 */
export async function getProcessCwds(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pids.length === 0) return result;

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", buildCwdScript(pids)],
      { timeout: 15000 },
    );
    const trimmed = stdout.trim();
    if (!trimmed) return result;

    const raw = JSON.parse(trimmed);
    const items: Array<{ Pid: number; Cwd: string }> = Array.isArray(raw) ? raw : [raw];

    for (const item of items) {
      if (item.Cwd && isValidWindowsPath(item.Cwd)) {
        result.set(item.Pid, item.Cwd);
      }
    }
  } catch {
    // PowerShell/P/Invoke失敗時は空Mapを返す
  }
  return result;
}

export default {
  listProcesses,
  listPortProcesses,
  getProcessCwds,
  getAncestorPids,
} satisfies Platform;
