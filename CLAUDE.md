# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

dev-clean は、開発サーバーの残留プロセス(node, bun, deno, tsx, ts-node)を検出・終了するCLIツール。
AIコーディングエージェントが `npx dev-clean` で使うことを想定。TypeScript (ESM)、本番依存ゼロ。

## Commands

```bash
bun test              # テスト実行 (Bun test)
bun test tests/cli.test.ts  # 単一テスト実行
npm run build         # esbuild で dist/cli.js にバンドル
npm run typecheck     # tsc --noEmit
npm run lint          # biome check
npm run format        # biome check --write --unsafe
```

## Architecture

```
src/
├── cli.ts          # エントリポイント: parseArgs → detect → confirm → kill → output
├── detect.ts       # プロセス検出 (CWDベース or ポートベース)
├── kill.ts         # プロセス終了 (SIGTERM → 待機 → SIGKILL/taskkill)
├── parse.ts        # ポート指定パーサー (範囲・カンマ区切り)
├── process.ts      # 共有ユーティリティ (ターゲット判定、祖先PID取得)
├── types.ts        # 型定義 (ProcessInfo, CliOptions, Platform interface)
└── platform/
    ├── windows.ts  # Windows実装: Get-CimInstance, netstat, C# P/Invoke
    ├── unix.ts     # Unix実装: ps, lsof/ss, /proc
    └── ProcCwd.cs  # Windows用 C# P/Invoke (プロセスCWD取得)
```

**処理フロー**: CLI引数パース → `detect()` で対象プロセス検出 → `--dry-run` なら表示のみ → `--yes` でなければ確認プロンプト → `killProcesses()` で終了 → 結果出力(テキスト or JSON)

**Platform抽象**: `Platform` interfaceが4メソッド(`listProcesses`, `listPortProcesses`, `getProcessCwds`, `getAncestorPids`)を定義。実行時にOS判定して動的import。

**安全策**: 自PIDと全祖先PIDを除外(npx経由の自己終了を防止)。

## Key Conventions

- 日本語コメント・TSDoc使用
- C# ソースは esbuild の `--loader:.cs=text` でテキストとしてバンドル
- Windows では `powershell.exe` を使用(プロジェクトコード内、pwsh ではない)
- 外部プロセス呼び出しにはすべてタイムアウト設定あり(5-15秒)
- パス比較はクロスプラットフォーム対応(バックスラッシュ正規化、Windows小文字化)
- CI: GitHub Actions (ubuntu, macos, windows) で lint → typecheck → test
