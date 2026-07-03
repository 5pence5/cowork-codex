# Cowork Validation Checklist

Use this checklist after installing or updating the plugin in Claude Cowork.

## Plugin Visibility

1. Run `/reload-plugins`.
2. Run `/mcp`.
3. Confirm the `cowork-codex` server is visible.
4. Confirm these tools are visible:
   - `codex_setup`
   - `codex_set_max_concurrent_jobs`
   - `codex_delegate`
   - `codex_start_task`
   - `codex_start_review`
   - `codex_job_status`
   - `codex_job_result`
   - `codex_cancel_job`

## Setup

1. Run `codex_setup`.
2. Confirm `hostExecutionProof.platform` is `darwin`.
3. Confirm Codex resolves to the expected host binary.
4. Confirm Codex reports the expected version.
5. Confirm Codex is logged in.
6. Confirm `localConfig.path` points at `~/.config/cowork-codex/cowork-codex.local.json`.
7. Confirm `localConfig.maxConcurrentJobs` is the expected active-job cap.
8. Confirm `childProcess.path` includes the tool locations needed by your projects.
9. Confirm `childProcess.envPolicy` says setup probes use the same child environment as Codex jobs.

## Concurrency Config

1. Run `/concurrency 8`.
2. Confirm the response reports `effectiveMaxConcurrentJobs: 8`.
3. Run `codex_setup`.
4. Confirm `localConfig.maxConcurrentJobs` is `8`.

## Path Mapping

1. From Cowork, capture the current cwd.
2. If it is a `/sessions/<session>/mnt/...` path, start a read-only Codex task using that cwd.
3. Confirm the returned job summary maps to the intended Mac host folder.
4. Try the same operation with the explicit Mac host path and confirm it maps to the same folder.

## Workspace Sync Sentinel

1. From the Mac host, write a small sentinel file in an allowlisted connected folder.
2. In Cowork, confirm the VM sees it.
3. From Cowork, write a second sentinel file in the same folder.
4. On the Mac host, confirm it appears.
5. Repeat with an edit to an existing sentinel file.

## Workspace-Write Task

Run a small `workspace-write` task in an allowlisted disposable repo:

```text
Run `node --version && npm --version`, then create cowork-codex-smoke.txt containing "ok".
```

Confirm the file appears on the Mac host and Cowork sees it.

## Review Jobs

1. Make a small intentional working-tree change in a test repo.
2. Run a standard review with focus text.
3. Run a critical review with focus text.
4. Confirm both complete and return findings.

## Cancellation

1. Start a long-running harmless job.
2. Cancel it with `codex_cancel_job`.
3. Confirm final status is `cancelled`.
4. Confirm no child process continues doing work in the target repo.
