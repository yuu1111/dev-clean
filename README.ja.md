# dev-clean

開発サーバーの残留プロセスを検出・停止するCLIツール。

[English](README.md)

## インストール

npxで直接実行:

```bash
npx dev-clean
```

グローバルインストール:

```bash
npm i -g dev-clean
```

## 使い方

```bash
# カレントディレクトリの開発プロセスを検出して停止
dev-clean

# 確認プロンプトをスキップ
dev-clean --yes

# 特定のプロジェクトディレクトリをスキャン
dev-clean --cwd ~/projects/my-app

# 特定のポートのプロセスを検出
dev-clean --port 3000
```

## オプション

| オプション | エイリアス | 説明 |
| --- | --- | --- |
| `--cwd <path>` | | 対象プロジェクトのパス (デフォルト: カレントディレクトリ) |
| `--port <ports>` | `-p` | チェックするポート (例: `3000`, `3000-3005`, `3000,5173`) |
| `--yes` | `-y` | 確認なしで停止 |
| `--json` | | JSON形式で出力 (stdout) |
| `--dry-run` | | 検出のみ、停止しない |
| `--version` | `-v` | バージョン表示 |
| `--help` | `-h` | ヘルプ表示 |

## 使用例

### 特定のポートのプロセスを停止

```bash
dev-clean --port 3000
```

### 複数ポートを指定

```bash
dev-clean --port 3000,5173
```

### ポート範囲を指定

```bash
dev-clean --port 3000-3005
```

### 別のディレクトリをスキャン

```bash
dev-clean --cwd ~/projects/my-app
```

### ドライラン (検出のみ)

```bash
dev-clean --dry-run
```

### JSON出力

```bash
dev-clean --json --yes
```

## 対応プラットフォーム

- Windows
- macOS
- Linux

Node.js >= 18.3.0 が必要です。

## ライセンス

MIT
