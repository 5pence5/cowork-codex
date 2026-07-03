---
description: Run a read-only critical Codex review
argument-hint: "[--wait <seconds>|--background] [--base <ref>] [--commit <sha>] [focus]"
---

Call `codex_start_review` with `mode: "critical"` and preserve any focus text. The review should check implementation and design assumptions. The bridge forces read-only sandboxing. Return final Codex output verbatim through `codex_job_result`.
