# Architecture

Cowork Codex bridges Claude Cowork to the Mac host Codex CLI.

```text
Claude Cowork
  -> plugin-bundled stdio MCP server
  -> host Node process
  -> resolved Codex CLI path
  -> codex exec --json / codex exec review --json / codex exec resume --json
  -> ~/.local/state/cowork-codex/logs/
```

## Host And Cowork Boundary

Codex auth stays on the Mac host. The Cowork VM may present paths such as `/sessions/<session>/mnt/<workspace>`, so the bridge maps those paths back onto trusted host folders before any Codex child process starts.

The MCP server is launched by `.mcp.json` through:

```text
${CLAUDE_PLUGIN_ROOT}/bin/cowork-codex-mcp
```

The launcher resolves Node from `PATH` and common macOS locations.

## Config

Installed-plugin config:

```text
~/.config/cowork-codex/cowork-codex.local.json
```

Development runs may override this with `COWORK_CODEX_LOCAL_CONFIG`.

The bridge denies task and review jobs when the config is missing or the allowlist is empty.

## Path Mapping

`src/path-map.mjs` normalizes allowlist roots with `realpath`, builds candidate host paths from Cowork VM paths, and accepts a cwd only if it resolves inside exactly one allowlisted root.

Ambiguous VM paths are rejected with an actionable error. This avoids silently choosing the wrong workspace when multiple allowlisted roots have the same basename.

## Job Lifecycle

`src/codex-runner.mjs` prepares a job, resolves Codex, creates a job record, starts the Codex child process, parses JSON events, and records final status.

`src/job-store.mjs` stores append-only JSONL job records plus stdout, stderr, and event logs. On normal MCP shutdown, the server cancels live active jobs through their process handles before exit. Restarted active jobs loaded without a live handle are marked orphaned without signalling stale stored PIDs.

## Profiles

- `read-only` maps to Codex read-only behavior.
- `workspace-write` maps to Codex workspace-write behavior and is the default.
- `full-local-access` maps to `danger-full-access` and is explicit per job only.

Review jobs force read-only behavior.

## Child Environment

`src/child-env.mjs` passes a narrow environment to Codex, preserving only basic shell/user/locale values and `CODEX_HOME`. It augments `PATH` with common macOS and user npm locations so Codex jobs can find tools when launched from a minimal plugin environment. `codex_setup` probes Codex with the same child environment used by real jobs.
