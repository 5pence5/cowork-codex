---
description: Run a read-only adversarial Codex review
argument-hint: "[--wait <seconds>|--background] [--base <ref>] [--commit <sha>] [focus]"
---

Call `codex_start_review` with `mode: "adversarial"` and preserve any focus text. Use `wait_seconds` for foreground waits and omit it for background work. The review should challenge the implementation approach, design choices, tradeoffs, and assumptions. The bridge forces read-only sandboxing. Preserve the job id, poll with `codex_job_status` when needed, and return final Codex output verbatim through `codex_job_result`.
