# Cowork Codex

Cowork Codex gives Fable in Claude Cowork a Codex research and implementation subagent: the Codex CLI already installed and authenticated on your Mac. Fable coordinates; Codex researches, implements, reviews, and reports back, only inside folders you allowlist.

Use it to delegate research and implementation work to Codex while keeping the main Cowork thread lighter and conserving context and tokens.

It is designed for the Cowork host/VM split: Codex runs on the Mac where it is already authenticated, while Cowork can start tasks, reviews, resumes, and cancellations through a bundled stdio MCP server.

## Release Scope

The 0.1.x line is compatibility-first. It intentionally keeps the user-facing workflow close to the OpenAI Codex Claude Code plugin where that maps cleanly to Cowork: setup, task handoff, review, resume, status, result retrieval, cancellation, and background jobs.

It is not a byte-for-byte port of the Claude Code plugin internals. The OpenAI plugin uses Claude Code agents, hooks, and internal skills such as `codex-cli-runtime`, `codex-result-handling`, and `gpt-5-4-prompting`. Cowork Codex uses a Cowork-native MCP bridge plus Cowork-specific skills because the core problem is the Cowork host/VM boundary.

Cowork Codex does include a `codex-prompting` skill. It adapts the OpenAI plugin's operator-style, block-structured prompting pattern for Cowork handoffs to current Codex models, including GPT-5.5.

Current deliberate differences:

- `/concurrency` is Cowork-specific.
- `/transfer`, review-gate hooks, and the Claude Code `codex:codex-rescue` agent are not included in this release. Review-gate hooks are not planned for 0.1.x because Cowork does not expose an equivalent stop-hook surface.
- `/critical-review` covers the challenge-review use case, but it is MCP-native rather than a direct copy of `/codex:adversarial-review`.

Future versions can move beyond compatibility with richer job grouping, named subagents, research workflows, conflict-aware write coordination, and higher-level task planning.

## Features

- Host-side Codex discovery, version, login, config, and active-job diagnostics through `codex_setup`.
- Background or foreground Codex research and implementation jobs through `codex_start_task` and `/delegate`.
- Standard and critical read-only review jobs through `codex_start_review`.
- Job polling, result retrieval, and cancellation through `codex_job_status`, `codex_job_result`, and `codex_cancel_job`.
- Multiple active Codex jobs, bounded by `maxConcurrentJobs` (`8` by default, clamped from `1` to `8`).
- Cowork-visible concurrency tuning through `codex_set_max_concurrent_jobs` and `/concurrency`.
- Cowork-native `codex-prompting` skill for compact, block-structured implementation, research, and diagnosis handoffs.
- Cowork `/sessions/<session>/mnt/...` path mapping to trusted Mac host folders.
- `workspace-write` default for implementation and delegation work, with broad local access available only as an explicit per-job profile.
- Local JSONL/stdout/stderr job logs under the user's state directory.

## Trust And Permissions

- Jobs run only inside folders listed in `cwdAllowlist`; paths are `realpath`-checked and ambiguous Cowork VM mappings are rejected.
- The default task profile is `workspace-write`; broad local access is never a default and must be requested per job.
- Review jobs are always read-only.
- Codex jobs run with a narrow child environment, and local job logs are private to your user (`0700` directories, `0600` files).

## Requirements

- macOS host.
- Node.js 18 or newer.
- Authenticated Codex CLI on the Mac host.
- Claude plugin environment that resolves `${CLAUDE_PLUGIN_ROOT}` in `.mcp.json`.

## Quick Install

Create the local config with at least one trusted Mac host workspace:

```bash
mkdir -p ~/.config/cowork-codex
cat > ~/.config/cowork-codex/cowork-codex.local.json <<'JSON'
{
  "defaultProfile": "workspace-write",
  "cwdAllowlist": [
    "/absolute/path/to/trusted/workspace"
  ],
  "codexBin": null,
  "maxConcurrentJobs": 8
}
JSON
```

Add this repo as a Claude plugin marketplace and install the plugin:

```bash
claude plugin marketplace add 5pence5/cowork-codex
claude plugin install cowork-codex@cowork-codex --scope user
```

For private forks or private review, use the SSH form instead:

```bash
claude plugin marketplace add git@github.com:5pence5/cowork-codex.git
```

The SSH form requires repo access, a loaded SSH key, and GitHub in `known_hosts`.

Run `/reload-plugins`, then verify the `cowork-codex` MCP server and tools are visible with `/mcp`.

You can install and run `codex_setup` before writing any config; task and review jobs stay disabled until `cwdAllowlist` contains at least one real folder.

See [docs/INSTALL.md](docs/INSTALL.md) for clone-based install, dry-run, multiple-workspace, custom Codex binary, config-only, and manual install options.

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
  "maxConcurrentJobs": 8
}
```

Set `COWORK_CODEX_LOCAL_CONFIG` only for direct development runs when you want to point at another config file.

Fields:

- `defaultProfile`: `read-only` or `workspace-write`. Unsupported values are ignored and the bridge uses `workspace-write`.
- `cwdAllowlist`: trusted Mac host folders where jobs may run. Placeholder entries beginning with `<` are ignored.
- `codexBin`: optional absolute Codex binary path. Leave `null` to auto-discover.
- `maxConcurrentJobs`: active Codex job cap. Defaults to 8 and is clamped from 1 to 8. Change it in the JSON config, with `npm run install:cowork -- --max-concurrent-jobs <n>`, or from Cowork with `/concurrency <n>`.

`cwdAllowlist` may point at an exact workspace or a trusted parent folder. For Cowork VM paths such as `/sessions/<session>/mnt/<workspace>`, the bridge first tries host-absolute mapping and then maps the VM workspace basename back onto matching allowlisted host folders. Ambiguous mappings are rejected; use a host-absolute Mac path or narrow the allowlist.

## Permission Profiles

- `read-only`: for inspection and review.
- `workspace-write`: default for implementation and delegation work.
- `full-local-access`: explicit per-job opt-in only.

Reviews force read-only behavior. `full-local-access` cannot be configured as the default.

## Usage

The plugin exposes these MCP tools:

- `codex_setup`
- `codex_set_max_concurrent_jobs`
- `codex_start_task`
- `codex_start_review`
- `codex_job_status`
- `codex_job_result`
- `codex_cancel_job`

The bundled slash commands in `commands/` are thin instructions around those tools.

For `/delegate` and direct `codex_start_task` use, Cowork should shape non-trivial prompts with the bundled `codex-prompting` skill before handing them to host Codex.

Typical flow:

1. Run `codex_setup`.
2. Start a task or review with a Cowork cwd or Mac host cwd.
3. Poll with `codex_job_status`.
4. Fetch final output with `codex_job_result`.
5. Cancel long-running jobs with `codex_cancel_job`.

Operating rule: do not run write-capable Codex jobs while Cowork is actively editing the same files. Read-only reviews are safe to run concurrently.

Multiple active jobs are supported today as separate Codex CLI processes with separate job ids, logs, and results. This gives Cowork parallel Codex implementation, research, or review subagents, bounded by `maxConcurrentJobs`. Avoid starting multiple write-capable jobs against the same files at the same time.

## Validation

Local checks:

```bash
npm run check
npm run selftest
claude plugin validate --strict "$PWD"
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
