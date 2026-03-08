# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

`dev-clean` — 開発中の残留プロセスを検出・停止するCLIツール。AIコーディングエージェントが `npx dev-clean` で使うことを主な想定とする。

- ランタイム: Bun / Node.js
- 言語: TypeScript (ESM)
- 外部依存: なし (Node.js標準APIのみ)
- 対応OS: Windows / macOS / Linux

## ビルド・実行

```bash
bun install
bun run build        # TypeScript → ESM コンパイル
bun run dist/cli.js  # ローカル実行
bun test             # テスト実行
bun run lint         # Biome lint
bun run format       # Biome format + lint (自動修正)
```

## アーキテクチャ

```
src/
├── cli.ts           # CLIエントリポイント、引数パース
├── types.ts         # 共有型定義
├── detect.ts        # プロセス検出ロジック
├── kill.ts          # プロセス停止ロジック
└── platform/
    ├── windows.ts   # Windows: pwsh/wmic + netstat
    └── unix.ts      # macOS/Linux: ps + lsof/ss
tests/               # bun:test によるテスト
```

- **cli.ts** がオプション解析 → **detect.ts** でプロセス検出 → **kill.ts** で停止、という一方向のフロー
- プラットフォーム固有のプロセス取得・ポート検出は `platform/` に分離
- Windows では `Get-CimInstance Win32_Process` (pwsh) または `wmic`、Unix では `ps aux` と `lsof`/`ss` を使用

## 設計上の制約

- 外部パッケージへの依存を追加しない
- `package.json` の `bin` フィールドで CLI コマンドを登録し、shebang `#!/usr/bin/env node` を付ける
- テストは `bun:test` を使用
- 終了コード: 0 = 成功 (停止した or 対象なし)、1 = エラー
