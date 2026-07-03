---
description: Run a read-only Codex review
argument-hint: "[--wait <seconds>|--background] [--base <ref>] [--commit <sha>] [focus]"
---

Call `codex_start_review` with `mode: "standard"` and preserve any focus text. Use `wait_seconds` for foreground waits and omit it for background work. Reviews run with `read-only`. Preserve the job id, poll with `codex_job_status` when needed, and return `codex_job_result` verbatim when complete.
