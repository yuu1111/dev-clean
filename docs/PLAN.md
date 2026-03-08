# dev-clean 設計書

開発中の残留プロセスを検出・停止するCLIツール。
AIコーディングエージェントが `npx` 経由で使うことを主な想定とする。

## 概要

- パッケージ名: `dev-clean`
- 言語: TypeScript
- 配布: npm (`npx dev-clean` で即実行可能)
- 対応OS: Windows / macOS / Linux
- 依存: なし(Node.js標準APIのみ)

## 解決する課題

- 開発サーバー等のプロセスが残留し「port already in use」になる
- AIエージェントは残留プロセスの把握・対処が苦手
- プロジェクトごとに kill スクリプトをコピペするのが無駄

## CLI インターフェース

```
npx dev-clean [options]
```

### オプション

| フラグ | 短縮 | 説明 | デフォルト |
|---|---|---|---|
| `--cwd <path>` | | 対象プロジェクトのパス | `process.cwd()` |
| `--port <ports>` | `-p` | ポート指定 (例: `3000`, `3000-9000`, `3000,5173`) | なし |
| `--yes` | `-y` | 確認なしで即停止 | `false` |
| `--json` | | JSON形式で出力 | `false` |
| `--dry-run` | | 検出のみ、停止しない | `false` |
| `--version` | `-v` | バージョン表示 | |
| `--help` | `-h` | ヘルプ表示 | |

### 使用例

```bash
# カレントディレクトリの残留プロセスを対話的に停止
npx dev-clean

# AI向け: 確認なし + JSON出力
npx dev-clean --yes --json

# ポート3000を使っているプロセスを停止
npx dev-clean --port 3000 --yes

# 確認だけ
npx dev-clean --dry-run
```

## 検出対象

プロセス名で絞り込み、さらにプロジェクトパスまたはポートで特定する。

### 対象プロセス名

- `node` / `node.exe`
- `bun` / `bun.exe`
- `deno` / `deno.exe`
- `tsx`
- `ts-node`

### 検出方法

1. **プロジェクトパス検出** (デフォルト): プロセスのコマンドラインに `--cwd` のパスが含まれるか
2. **ポート検出** (`--port`指定時): 指定ポートをlistenしているプロセスを特定

## 出力

### デフォルト (人間向け)

```
Found 2 dev processes:

  PID 12345  node  next dev (port 3000)
  PID 12346  bun   vite (port 5173)

Kill all? (y/N)
Killed 2 process(es).
```

### JSON (`--json`)

```json
{
  "found": [
    { "pid": 12345, "name": "node", "command": "next dev", "port": 3000 },
    { "pid": 12346, "name": "bun", "command": "vite", "port": 5173 }
  ],
  "killed": [12345, 12346],
  "errors": []
}
```

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功 (プロセスを停止した、または対象なし) |
| 1 | エラー発生 |

## プロジェクト構成

```
dev-clean/
├── src/
│   ├── cli.ts          # CLIエントリポイント、引数パース
│   ├── detect.ts       # プロセス検出ロジック
│   ├── kill.ts         # プロセス停止ロジック
│   └── platform/
│       ├── windows.ts  # Windows固有のプロセス取得
│       └── unix.ts     # macOS/Linux固有のプロセス取得
├── package.json
├── tsconfig.json
└── DESIGN.md
```

## プラットフォーム別実装

### Windows

- `Get-CimInstance Win32_Process` (pwsh) または `wmic` でプロセス一覧+コマンドライン取得
- `netstat -ano` でポートとPIDの紐付け

### macOS / Linux

- `ps aux` でプロセス一覧+コマンドライン取得
- `lsof -iTCP -sTCP:LISTEN` または `ss -tlnp` でポートとPIDの紐付け

## ビルド・配布

- TypeScript → ESM にコンパイル
- `package.json` の `bin` フィールドでCLIコマンド登録
- `npm publish` で配布
- shebang: `#!/usr/bin/env node`
