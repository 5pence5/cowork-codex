---
description: Show a bounded Codex job log tail
argument-hint: "<job-id> [out|err|events] [--tail-bytes <bytes>]"
---

Call `codex_job_logs` for the job id. Use `stream` when the user supplied `out`, `err`, or `events`; otherwise default to `err`.

Pass `tail_bytes` only when the user supplied `--tail-bytes`.

Report the stream, byte count, whether the output was truncated, and the returned log text.
