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
