---
description: Delegate a task to host Codex through the bridge
argument-hint: "[--wait <seconds>|--background] [--resume latest|<thread-id>|--fresh] [--profile read-only|workspace-write|full-local-access] [--model <model>] [--effort <effort>] <task>"
---

Call `codex_start_task` with the user's prompt and cwd. Use `wait_seconds` for foreground waits and omit it for background work. Preserve the returned job id and thread id. For `--resume latest`, pass `resume: "latest"`; for `--fresh`, omit resume. If a foreground wait returns a completed job with only a preview, call `codex_job_result` before answering. Do not summarize final output unless the user asks for a summary.

Use `profile: "full-local-access"` only when the user explicitly asks for that job to have full local access. Otherwise prefer `workspace-write`, or `read-only` for inspection-only work.
