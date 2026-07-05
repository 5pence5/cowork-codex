# Architecture

Cowork Codex bridges Claude Cowork to the host Codex CLI.

```text
Claude Cowork
  -> plugin-bundled stdio MCP server
  -> host Node process
  -> resolved Codex CLI path
  -> codex exec --json / codex exec review --json / codex exec resume --json
  -> ~/.local/state/cowork-codex/logs/
```

## Host And Cowork Boundary

Codex auth stays on the host machine. The Cowork VM may present paths such as `/sessions/<session>/mnt/<workspace>`, so the bridge maps those paths back onto configured host folders before any Codex child process starts. This mapping is tested on macOS and experimental on Linux/Windows until validated in real Cowork sessions.

The MCP server is launched by `.mcp.json` through:

```text
node ${CLAUDE_PLUGIN_ROOT}/servers/cowork-codex-mcp.mjs
```

The plugin launches the bundled stdio MCP server with host `node`. Node.js 18.20 or newer must be visible to the Claude plugin environment.

## Config

Installed-plugin config:

```text
~/.config/cowork-codex/cowork-codex.local.json on Linux/macOS, or %APPDATA%\cowork-codex\cowork-codex.local.json on Windows
```

Development runs may override this with `COWORK_CODEX_LOCAL_CONFIG`.

The bridge returns a config error for task and review jobs when the config is missing or the allowlist is empty.

`cwdAllowlist` can be changed through the `codex_cwd_allowlist` MCP tool or `/allowlist` command. The tool preserves the rest of the local config, canonicalizes added and set paths with `realpath`, and can remove stale absolute entries.

`allowedProfiles` can narrow caller-selectable Codex profiles. When omitted, all supported profiles remain available. `allowlistEdits` can disable Cowork-side allowlist changes while still allowing `/allowlist` to report current folders.

`maxConcurrentJobs` defaults to 8 and is clamped from 1 to 8. Cowork can change this host-local value through the `codex_set_max_concurrent_jobs` MCP tool or `/concurrency` command.

## Compatibility Scope

Cowork Codex 0.1.x mirrors the OpenAI Codex Claude Code plugin at the workflow level, not at the internal implementation level.

| OpenAI Codex Claude Code plugin surface | Cowork Codex 0.1.x surface |
| --- | --- |
| Setup readiness check | `codex_setup`, `/setup` |
| Research or implementation delegation | `codex_delegate`, `/delegate` |
| Workspace-folder config | `codex_cwd_allowlist`, `/allowlist` |
| Review | `codex_start_review`, `/review` |
| Adversarial review | `/adversarial-review` |
| Status | `codex_job_status`, `/status` |
| Result retrieval | `codex_job_result`, `/result` |
| Log tails | `codex_job_logs`, `/logs` |
| Cancellation | `codex_cancel_job`, `/cancel` |
| Resume latest or explicit thread | `resume` on `codex_delegate`, routed by `/delegate` |
| Transfer current Claude Code session into Codex | Not included in 0.1.x |
| Review gate hooks | Not included in 0.1.x |
| Internal skills and Claude Code agent surfaces | Replaced by Cowork-specific `cowork-codex` and `codex-prompting` skills plus MCP tool schemas |

This keeps the first release focused on making host-side Codex reliable from Cowork before adding further Cowork-specific orchestration.

## Path Mapping

`src/path-map.mjs` normalizes allowlist roots with `realpath`, builds candidate host paths from Cowork VM paths, and accepts a cwd when it resolves inside exactly one allowlisted root.

Ambiguous VM paths return an error with the matching candidate folders.

## Job Lifecycle

`src/codex-runner.mjs` prepares a job, resolves Codex, creates a job record, starts the Codex child process, parses JSON events, and records final status.

`src/job-store.mjs` stores append-only JSONL job records plus stdout, stderr, and event logs. On normal MCP shutdown, the server cancels live active jobs through their process handles before exit. Restarted active jobs loaded without a live handle are marked orphaned without signalling stale stored PIDs.

Terminal job status is one-way: once a job is completed, failed, cancelled, or rejected, later process output can only attach exit metadata. This keeps late buffered output from changing a cancelled job into a completed job.

Each active task or review is a separate Codex CLI child process with its own job id, logs, and result. The bridge does not merge or coordinate simultaneous file edits across jobs.

## Profiles

- `read-only` maps to Codex read-only behavior.
- `workspace-write` maps to Codex workspace-write behavior and is the default.
- `full-local-access` maps to Codex `danger-full-access`.

Review jobs use read-only behavior.

## Child Environment

`src/child-env.mjs` passes a limited environment to Codex, preserving basic shell/user/locale values, platform path variables, `CODEX_HOME`, and standard proxy/CA variables. It augments `PATH` with platform-specific npm and tool locations so Codex jobs can find tools when launched from a minimal plugin environment. `codex_setup` probes Codex with the same child environment used by real jobs.
