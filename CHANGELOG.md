# Changelog

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
