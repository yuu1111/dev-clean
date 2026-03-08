# dev-clean

Detect and kill lingering dev server processes.

[日本語](README.ja.md)

## Install

Run directly with npx:

```bash
npx dev-clean
```

Or install globally:

```bash
npm i -g dev-clean
```

## Usage

```bash
# Scan current directory for dev processes and kill them
dev-clean

# Skip confirmation prompt
dev-clean --yes

# Scan a specific project directory
dev-clean --cwd ~/projects/my-app

# Find processes on specific ports
dev-clean --port 3000
```

## Options

| Option | Alias | Description |
| --- | --- | --- |
| `--cwd <path>` | | Target project path (default: current directory) |
| `--port <ports>` | `-p` | Port(s) to check (e.g. `3000`, `3000-3005`, `3000,5173`) |
| `--yes` | `-y` | Kill without confirmation |
| `--json` | | Output as JSON (to stdout) |
| `--dry-run` | | Detect only, don't kill |
| `--version` | `-v` | Show version |
| `--help` | `-h` | Show help |

## Examples

### Kill processes on a specific port

```bash
dev-clean --port 3000
```

### Kill processes on multiple ports

```bash
dev-clean --port 3000,5173
```

### Kill processes on a port range

```bash
dev-clean --port 3000-3005
```

### Scan a different directory

```bash
dev-clean --cwd ~/projects/my-app
```

### Dry run (detect without killing)

```bash
dev-clean --dry-run
```

### JSON output

```bash
dev-clean --json --yes
```

## Supported Platforms

- Windows
- macOS (unverified)
- Linux (unverified)

Requires Node.js >= 18.3.0.

## License

MIT
