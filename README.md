# Cowork Codex

Cowork Codex is a macOS Claude plugin that exposes the host Codex CLI to Claude Cowork through a bundled stdio MCP server.

It provides:

- `codex_setup`
- `codex_start_task`
- `codex_start_review`
- `codex_job_status`
- `codex_job_result`
- `codex_cancel_job`

## Architecture

```text
Claude Cowork
  -> plugin-bundled stdio MCP server
  -> host Node process
  -> resolved Codex CLI path
  -> codex exec --json / codex exec review --json / codex exec resume --json
  -> ~/.local/state/cowork-codex/logs/jobs.jsonl plus per-job output logs
```

The MCP server runs host-side when loaded as a Cowork plugin. Codex auth state stays on the Mac host. Cowork VM paths are mapped to trusted Mac host folders before any Codex process starts.

Requirements: macOS, Node.js 18 or newer, an authenticated Codex CLI on the host, and a Claude plugin environment that resolves `${CLAUDE_PLUGIN_ROOT}` in `.mcp.json`.

## Local Config

Copy the example config:

```bash
mkdir -p ~/.config/cowork-codex
cp .local/cowork-codex.local.json.example ~/.config/cowork-codex/cowork-codex.local.json
```

Edit `cwdAllowlist` to include trusted Mac host folders:

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

The installed plugin reads `~/.config/cowork-codex/cowork-codex.local.json` unless `COWORK_CODEX_LOCAL_CONFIG` is set. If the local config is missing, task and review jobs are denied until the allowlist is configured. Placeholder allowlist entries beginning with `<` are ignored, so the example file is safe to copy before editing.

`cwdAllowlist` may point at the exact workspace or a trusted parent folder. For Cowork VM paths such as `/sessions/<user>/mnt/<workspace>`, the bridge first tries a host-absolute mapping and then maps the VM workspace basename back onto matching allowlisted host folders. If a VM path could map to more than one allowlisted host folder, the bridge rejects it and asks for a host-absolute Mac path or a narrower allowlist. Prefer exact workspace allowlist entries when possible.

`defaultProfile` may be `read-only` or `workspace-write`; the shipped default is `workspace-write`. That matches the Codex Claude plugin's rescue behavior: write-capable by default for implementation work, but scoped to the workspace rather than broad local access. Full local access cannot be made the default and remains an explicit per-job option. `maxConcurrentJobs` is clamped to a positive integer from 1 to 8.

For an installed Claude plugin, the MCP launcher reads:

```text
~/.config/cowork-codex/cowork-codex.local.json
```

The repository `.local/` directory is gitignored and is only for direct development runs when `COWORK_CODEX_LOCAL_CONFIG` points at it.

## Install

For local Claude plugin development, validate first:

```bash
claude plugin validate /absolute/path/to/cowork-codex
```

Then install or expose the local plugin through the Claude plugin flow for your environment. After install, reload plugins and verify the MCP tools are visible with `/mcp`.

For this local checkout:

```bash
mkdir -p ~/.config/cowork-codex
cp .local/cowork-codex.local.json.example ~/.config/cowork-codex/cowork-codex.local.json
claude plugin marketplace add /absolute/path/to/cowork-codex
claude plugin install cowork-codex@cowork-codex-local --scope user
```

The plugin MCP config intentionally uses the literal `${CLAUDE_PLUGIN_ROOT}` placeholder so Claude's plugin loader resolves the installed plugin root. The local config path is outside the plugin cache so reinstalling the plugin does not delete machine-specific settings.

## Cowork Validation Checklist

Plugin visibility:

1. Enable the plugin in Cowork.
2. Use `/mcp` and confirm the `cowork-codex` server and six tools are visible.
3. Call `codex_setup`.
4. Confirm host proof reports Darwin/macOS, `homeConfigured: true`, and a resolved Codex CLI path.
5. Confirm `codex_setup` warns if `~/.config/cowork-codex/cowork-codex.local.json` is missing.

Workspace sync sentinel:

1. From the Mac host, write a small sentinel file in an allowlisted connected folder.
2. In Cowork, check whether the VM sees it and how quickly.
3. From Cowork, write a second sentinel file in the same folder.
4. On the Mac host, check whether it appears and how quickly.
5. Repeat with an edit to an existing sentinel file.

Operating rule: never run write-capable Codex jobs while Cowork is mid-edit on the same workspace. Read-only reviews are safe concurrently.

## Local Data And Permissions

This bridge runs Codex in the host-side plugin process. Because Cowork may work with documents from outside the current repo, the bridge constrains host-side Codex jobs with explicit permission profiles and a cwd allowlist.

Controls:

- Full local access is per-job opt-in only.
- Default profile is `workspace-write`, aligned with the Codex Claude plugin's write-capable rescue default.
- Every job cwd is realpath-checked against `cwdAllowlist`.
- JSONL events, stdout, stderr, status transitions, and final results are logged under `~/.local/state/cowork-codex/logs/`; command metadata redacts prompt text. The log directory is created as user-private (`0700`) and job files are created as user-private (`0600`).
- Job results include changed-output context through Codex output and log paths so Cowork can re-read files after write jobs.

Set `COWORK_CODEX_LOG_DIR` only for development or tests when you need logs somewhere else. Logs are append-only until you delete them; they may include Codex output and final messages, so treat the directory as local user data.

To clear local job history:

```bash
rm -rf ~/.local/state/cowork-codex/logs
```

## Troubleshooting

- If `codex_setup` cannot find Codex, set `codexBin` in `~/.config/cowork-codex/cowork-codex.local.json` to the absolute host path shown by `command -v codex`.
- If the MCP server does not start, confirm Claude resolves `${CLAUDE_PLUGIN_ROOT}` and that `node` is available on `PATH` or one of the common macOS install paths checked by `bin/cowork-codex-mcp`.
- If a Cowork `/sessions/.../mnt/...` cwd is rejected, add the exact Mac workspace path to `cwdAllowlist` and retry.

## Selftest

Run:

```bash
node scripts/selftest.mjs
```

The selftest starts the MCP server with a temporary local config and temporary allowlisted workspace, checks all tools, verifies config/env/path/lifecycle regressions, runs a tiny real Codex job, verifies result retrieval, checks cancellation, and verifies an outside-cwd rejection.
