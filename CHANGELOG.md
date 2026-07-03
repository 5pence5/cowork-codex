# Changelog

## 0.1.9 - 2026-07-03

- Added bare `/result` support by letting `codex_job_result` return the latest terminal Codex job when no id is supplied.
- Added selftest coverage for bare result lookup and the optional `codex_job_result.id` schema.
- Made Cowork validation config-path wording platform-aware without ignoring config overrides.
- Narrowed parallel-edit guidance to overlapping same-file edits.
- Replaced remaining user-facing setup wording with `limited child environment`.

## 0.1.8 - 2026-07-03

- Reshaped README usage docs to match the OpenAI Codex Claude Code plugin tone and structure.
- Added `AGENTS.md` and a soft public-copy wording guide for future edits.
- Clarified review-tool descriptions for focused standard reviews and adversarial reviews.
- Clarified POSIX and Windows log-location wording.
- Verified the example local config is tracked and present in the release archive.

## 0.1.7 - 2026-07-03

- Replaced the Unix shell MCP launch path with direct host `node` execution.
- Added platform-aware config, log, PATH, Codex binary discovery, Windows command-shim wrapping, and Windows process cancellation helpers.
- Removed the clone installer's macOS-only guard.
- Reframed platform support as macOS tested, with Linux/Windows implemented for direct host paths and pending real Cowork validation.
- Renamed the challenge-review command to `/adversarial-review` to match the OpenAI Codex Claude Code plugin surface.
- Kept `/transfer` out of 0.1.x after review because it requires the Codex app-server external-agent import path and Cowork transcript discovery.
- Aligned plugin, marketplace, and package descriptions with the concise upstream style.

## 0.1.6 - 2026-07-03

- Added a concise unofficial-community-plugin disclaimer for public release.
- Made the then-current platform scope more prominent in public-facing copy.
- Removed the remaining public reference to model-specific internal prompting skill names.
- Aligned plugin and marketplace descriptions with the Fable delegation and Cowork context-conservation use case.
- Clarified `/review`, `/adversarial-review`, and `/delegate` command handoff instructions.

## 0.1.5 - 2026-07-03

- Polished public release wording to foreground Cowork context conservation through Fable delegation.
- Removed brittle model-specific wording from the prompting skill and README.
- Replaced legacy Claude Code internal-agent references with neutral compatibility-scope wording.

## 0.1.4 - 2026-07-03

- Added `codex_delegate` as the preferred MCP tool for Fable research and implementation delegation.
- Kept `codex_start_task` as a compatibility alias for older workflows.
- Clarified that the Claude plugin install bundles the MCP server, slash commands, and skills together.

## 0.1.3 - 2026-07-03

- Added a Cowork-native `codex-prompting` skill for compact, block-structured Codex task handoffs through `/delegate` and `codex_start_task`.
- Added `/delegate` as the task handoff command for the primary Fable use case: delegating research and implementation while conserving Cowork context and tokens.
- Clarified that `/status`, `/result`, and `/cancel` manage delegated Codex jobs after `/delegate` starts them.
- Clarified that Cowork task prompts should preserve bridge profile handling, resume semantics, and non-overlapping write scopes instead of copying Claude Code plugin internals wholesale.

## 0.1.2 - 2026-07-03

- Changed the default active Codex job cap to 8, matching the hard cap.
- Added `codex_set_max_concurrent_jobs` and `/concurrency` so Cowork can change the host-local active-job cap.
- Added `npm run install:cowork -- --max-concurrent-jobs <n>` for clone-based setup.
- Clarified that multiple active jobs act as parallel Codex implementation, research, or review subagents with separate job ids, logs, and results.

## 0.1.1 - 2026-07-03

- Added host-side Cowork Codex MCP bridge with setup, task, review, status, result, and cancel tools.
- Added Cowork VM path mapping to configured host folders with ambiguity rejection.
- Set `workspace-write` as the default implementation profile and added `full-local-access` profile mapping to Codex `danger-full-access`.
- Added private local job logs and prompt-redacted command metadata.
- Added Codex CLI discovery, login status parsing, child PATH augmentation, and setup diagnostics.
- Added live selftest coverage for task, resume, standard review, adversarial review, cancellation, path mapping, config validation, lifecycle races, and profile mapping.
- Added Claude marketplace metadata and public marketplace install instructions.
- Cancel live active jobs on MCP shutdown or plugin reload; restarted active jobs without a live handle are marked orphaned.
- Run `codex_setup` probes with the same child environment used by real Codex jobs.
- Include `phase` in `codex_job_result` for non-completed job reporting.
- Switched installer and docs to strict Claude plugin validation.
