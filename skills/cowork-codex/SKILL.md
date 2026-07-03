---
name: cowork-codex
description: Use host Codex from Claude Cowork through the cowork-codex MCP bridge
---

# Cowork Codex Workflow

Use the bridge MCP tools when Fable needs Codex as a research worker, implementation worker, second reviewer, or parallel delegation lane.

Rules:

- Preserve returned bridge job ids and Codex thread ids.
- Prefer host paths for `cwd`; if Cowork has a `/sessions/<user>/mnt/...` path, pass it through and let the bridge map it.
- Never run write-capable Codex jobs while Cowork is mid-edit on the same workspace.
- Read-only review jobs are safe to run concurrently.
- Use the configured default profile unless the work is inspection-only.
- Pass an explicitly supplied `--profile` through to the MCP tool.
- Use `codex-prompting` before `codex_delegate` when the user request is broad, multi-step, write-capable, research-heavy, or likely to need verification.
- Use separate Codex jobs for parallel lanes.
- Manage delegated jobs with `/status`, `/result`, and `/cancel` when using slash commands.
- Use `codex_job_status` with bounded `wait_seconds` rather than tight polling loops.
- Use `codex_job_result` for final output and return Codex output verbatim unless the user asks for a summary.
