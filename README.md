# Cowork Codex

Cowork Codex is a macOS Claude Cowork plugin that delegates work to the host Codex CLI through a bundled stdio MCP server. It is designed for the Cowork host/VM split: Codex runs on the Mac where it is already authenticated, while Cowork can start tasks, reviews, resumes, and cancellations through MCP tools.

## Features

- Host-side Codex discovery, version, login, config, and active-job diagnostics through `codex_setup`.
- Background or foreground Codex task jobs through `codex_start_task`.
- Standard and critical read-only review jobs through `codex_start_review`.
- Job polling, result retrieval, and cancellation through `codex_job_status`, `codex_job_result`, and `codex_cancel_job`.
- Cowork `/sessions/<user>/mnt/...` path mapping to trusted Mac host folders.
- `workspace-write` default for implementation/rescue work, with broad local access available only as an explicit per-job profile.
- Local JSONL/stdout/stderr job logs under the user's state directory.

## Requirements

- macOS host.
- Node.js 18 or newer.
- Authenticated Codex CLI on the Mac host.
- Claude plugin environment that resolves `${CLAUDE_PLUGIN_ROOT}` in `.mcp.json`.

## Quick Install

Clone the repo:

```bash
git clone git@github.com:5pence5/cowork-codex.git
cd cowork-codex
```

Run the installer with at least one trusted Mac host workspace:

```bash
npm run install:cowork -- --allowlist /absolute/path/to/trusted/workspace
```

The installer creates or updates `~/.config/cowork-codex/cowork-codex.local.json`, validates the plugin, adds this checkout as a local Claude plugin marketplace, and installs `cowork-codex@cowork-codex-local` for the current user.

Reload plugins, then verify the `cowork-codex` MCP server and six tools are visible with `/mcp`.

See [docs/INSTALL.md](docs/INSTALL.md) for dry-run, multiple-workspace, custom Codex binary, config-only, and manual install options.

## Configuration

The installed plugin reads:

```text
~/.config/cowork-codex/cowork-codex.local.json
```

Example config:

```json
{
  "defaultProfile": "workspace-write",
  "cwdAllowlist": [
    "/absolute/path/to/trusted/workspace"
  ],
  "codexBin": null,
  "maxConcurrentJobs": 2
}
```

Set `COWORK_CODEX_LOCAL_CONFIG` only for direct development runs when you want to point at another config file.

Fields:

- `defaultProfile`: `read-only` or `workspace-write`. Unsupported values are ignored and the bridge uses `workspace-write`.
- `cwdAllowlist`: trusted Mac host folders where jobs may run. Placeholder entries beginning with `<` are ignored.
- `codexBin`: optional absolute Codex binary path. Leave `null` to auto-discover.
- `maxConcurrentJobs`: clamped from 1 to 8.

`cwdAllowlist` may point at an exact workspace or a trusted parent folder. For Cowork VM paths such as `/sessions/<user>/mnt/<workspace>`, the bridge first tries host-absolute mapping and then maps the VM workspace basename back onto matching allowlisted host folders. Ambiguous mappings are rejected; use a host-absolute Mac path or narrow the allowlist.

## Permission Profiles

- `read-only`: for inspection and review.
- `workspace-write`: default for implementation/rescue work.
- `full-local-access`: explicit per-job opt-in only.

Reviews force read-only behavior. `full-local-access` cannot be configured as the default.

## Usage

The plugin exposes these MCP tools:

- `codex_setup`
- `codex_start_task`
- `codex_start_review`
- `codex_job_status`
- `codex_job_result`
- `codex_cancel_job`

The bundled slash commands in `commands/` are thin instructions around those tools.

Typical flow:

1. Run `codex_setup`.
2. Start a task or review with a Cowork cwd or Mac host cwd.
3. Poll with `codex_job_status`.
4. Fetch final output with `codex_job_result`.
5. Cancel long-running jobs with `codex_cancel_job`.

Operating rule: do not run write-capable Codex jobs while Cowork is actively editing the same files. Read-only reviews are safe to run concurrently.

## Validation

Local checks:

```bash
npm run check
npm run selftest
claude plugin validate "$PWD"
```

The selftest starts the MCP server with a temporary local config and allowlisted workspace, checks all tools, verifies config/env/path/lifecycle regressions, runs live Codex task/resume/review jobs, verifies result retrieval, checks cancellation, and verifies outside-cwd rejection.

Manual Cowork checks live in [docs/COWORK_VALIDATION.md](docs/COWORK_VALIDATION.md).

## Local Data

Job metadata and logs are stored under:

```text
~/.local/state/cowork-codex/logs/
```

The log directory is created as `0700`; job files are created as `0600`. Logs are append-only until deleted and may include Codex output and final messages.

Clear local job history:

```bash
rm -rf ~/.local/state/cowork-codex/logs
```

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Install](docs/INSTALL.md)
- [Cowork validation checklist](docs/COWORK_VALIDATION.md)
- [Limitations](docs/LIMITATIONS.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## Troubleshooting

- If `codex_setup` cannot find Codex, set `codexBin` in `~/.config/cowork-codex/cowork-codex.local.json` to the absolute host path from `command -v codex`.
- If the MCP server does not start, confirm Claude resolves `${CLAUDE_PLUGIN_ROOT}` and that Node is available on `PATH` or one of the fallback locations checked by `bin/cowork-codex-mcp`.
- If a Cowork `/sessions/.../mnt/...` cwd is rejected, add the exact Mac workspace path to `cwdAllowlist` and retry.
- If child tools such as `npm` are missing during Codex jobs, inspect `codex_setup.childProcess.path`.

## Release Packaging

Build a tracked-source plugin archive:

```bash
npm run package:plugin
```

The archive is written under `dist/`.
