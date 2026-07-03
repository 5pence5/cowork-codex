# Changelog

## 0.1.2 - 2026-07-03

- Changed the default active Codex job cap to 8, matching the hard cap.
- Added `codex_set_max_concurrent_jobs` and `/concurrency` so Cowork can change the host-local active-job cap.
- Added `npm run install:cowork -- --max-concurrent-jobs <n>` for clone-based setup.
- Clarified that multiple active jobs act as parallel Codex implementation, research, or review subagents with separate job ids, logs, and results.

## 0.1.1 - 2026-07-03

- Added host-side Cowork Codex MCP bridge with setup, task, review, status, result, and cancel tools.
- Added Cowork VM path mapping to trusted Mac host folders with ambiguity rejection.
- Set `workspace-write` as the default implementation profile and kept broad local access explicit per job.
- Added private local job logs and prompt-redacted command metadata.
- Added Codex CLI discovery, login status parsing, child PATH augmentation, and setup diagnostics.
- Added live selftest coverage for task, resume, standard review, critical review, cancellation, path mapping, config validation, lifecycle races, and profile mapping.
- Added Claude marketplace metadata and public marketplace install instructions.
- Cancel live active jobs on MCP shutdown or plugin reload; restarted active jobs without a live handle are marked orphaned.
- Run `codex_setup` probes with the same child environment used by real Codex jobs.
- Include `phase` in `codex_job_result` for non-completed job reporting.
- Switched installer and docs to strict Claude plugin validation.
