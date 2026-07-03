---
description: Delegate research or implementation work to host Codex
argument-hint: "[--wait <seconds>|--background] [--resume latest|<thread-id>|--fresh] [--profile read-only|workspace-write|full-local-access] [--model <model>] [--effort <effort>] <task>"
---

Call `codex_delegate` with the user's prompt and cwd. Use `wait_seconds` for foreground waits and omit it for background work. Preserve the returned job id and thread id. For `--resume latest`, pass `resume: "latest"`; for `--fresh`, omit resume. If the job continues in the background, tell the user to manage it with `/status <job-id>`, `/result <job-id>`, and `/cancel <job-id>`. If a foreground wait returns a completed job with only a preview, call `codex_job_result` before answering. Do not summarize final output unless the user asks for a summary.

For non-trivial research, diagnosis, or implementation tasks, compose the prompt using the `codex-prompting` skill before calling `codex_delegate`. Keep the final prompt compact, block-structured, and scoped to one Codex job. For `--resume`, send only the delta instruction unless the task direction changed materially.

Use `profile: "full-local-access"` only when the user explicitly asks for that job to have full local access. Otherwise prefer `workspace-write`, or `read-only` for inspection-only work.
