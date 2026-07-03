---
name: cowork-codex
description: Use host Codex from Claude Cowork through the cowork-codex MCP bridge
---

# Cowork Codex Workflow

Use the bridge MCP tools when Fable needs Codex as a research worker, implementation worker, second reviewer, or parallel delegation lane.

Rules:

- Preserve returned bridge job ids and Codex thread ids.
- Prefer Mac host paths for `cwd`; if Cowork has a `/sessions/<user>/mnt/...` path, pass it through and let the bridge map it.
- Never run write-capable Codex jobs while Cowork is mid-edit on the same workspace.
- Read-only review jobs are safe to run concurrently.
- Use the default `workspace-write` profile unless the work is inspection-only or the user explicitly requests another profile.
- Use `full-local-access` only when the user deliberately asks for it.
- Use `codex-prompting` before `codex_start_task` when the user request is broad, multi-step, write-capable, research-heavy, or likely to need verification.
- Use separate Codex jobs for parallel lanes.
- Use `codex_job_status` with bounded `wait_seconds` rather than tight polling loops.
- Use `codex_job_result` for final output and return Codex output verbatim unless the user asks for a summary.
