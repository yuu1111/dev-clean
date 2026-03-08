/**
 * @description 検出されたプロセスの情報
 * @property pid - プロセスID
 * @property name - プロセス名
 * @property command - コマンドライン全体
 * @property port - リッスン中のポート番号 @optional
 */
export interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
  port?: number;
}

/**
 * @description CLIオプション
 * @property cwd - 対象プロジェクトのパス @default process.cwd()
 * @property ports - 対象ポート番号のリスト
 * @property yes - 確認なしで即停止 @default false
 * @property json - JSON形式で出力 @default false
 * @property dryRun - 検出のみで停止しない @default false
 * @property version - バージョン表示
 * @property help - ヘルプ表示
 */
export interface CliOptions {
  cwd: string;
  ports: number[];
  yes: boolean;
  json: boolean;
  dryRun: boolean;
  version: boolean;
  help: boolean;
}

/**
 * @description プロセス停止の実行結果
 * @property found - 検出されたプロセス一覧
 * @property killed - 停止に成功したPIDリスト
 * @property errors - 停止に失敗したPIDとエラーメッセージ
 */
export interface Result {
  found: ProcessInfo[];
  killed: number[];
  errors: Array<{ pid: number; message: string }>;
}

/**
 * @description 検出対象のプロセス名一覧
 */
export const TARGET_NAMES = new Set([
  "node",
  "node.exe",
  "bun",
  "bun.exe",
  "deno",
  "deno.exe",
  "tsx",
  "ts-node",
]);

/**
 * @description プロセス名がTARGET_NAMESに含まれるか判定(大文字小文字・.exe無視)
 * @param name - プロセス名
 * @returns 対象プロセスならtrue
 */
export function isTargetProcess(name: string): boolean {
  const lower = name.toLowerCase();
  if (TARGET_NAMES.has(lower)) return true;
  return TARGET_NAMES.has(lower.replace(/\.exe$/, ""));
}

/**
 * @description "address:port" 形式の文字列からポート番号を抽出
 * @param addr - アドレス文字列
 * @returns ポート番号、パース不能ならnull
 */
export function parsePortFromAddr(addr: string): number | null {
  const colonIdx = addr.lastIndexOf(":");
  if (colonIdx === -1) return null;
  const port = parseInt(addr.slice(colonIdx + 1), 10);
  return Number.isNaN(port) ? null : port;
}
