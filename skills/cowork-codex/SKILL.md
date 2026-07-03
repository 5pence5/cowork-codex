---
name: cowork-codex
description: Use host Codex from Claude Cowork through the cowork-codex MCP bridge
---

# Cowork Codex Workflow

Use the bridge MCP tools when Cowork needs Codex as a second reviewer, rescue worker, or parallel implementation lane.

Rules:

- Preserve returned bridge job ids and Codex thread ids.
- Prefer Mac host paths for `cwd`; if Cowork has a `/sessions/<user>/mnt/...` path, pass it through and let the bridge map it.
- Never run write-capable Codex jobs while Cowork is mid-edit on the same workspace.
- Read-only review jobs are safe to run concurrently.
- Choose the permission profile explicitly per job: `read-only`, `workspace-write`, or `full-local-access`.
- Use `full-local-access` only when the user deliberately asks for it.
- Use separate Codex jobs for parallel lanes.
- Use `codex_job_status` with bounded `wait_seconds` rather than tight polling loops.
- Use `codex_job_result` for final output and return Codex output verbatim unless the user asks for a summary.
