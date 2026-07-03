---
description: Show a delegated Codex job result
argument-hint: "[job-id]"
---

Call `codex_job_result`. Pass `id` when the user supplied a job id; otherwise omit `id` to return the latest terminal Codex job. If the job completed, return the final agent message verbatim with the log paths and thread id. Do not summarize or paraphrase completed Codex output. If the job is still running or failed, report the status, phase, and error fields instead of inventing a final answer.
