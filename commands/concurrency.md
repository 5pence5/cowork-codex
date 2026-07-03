---
description: Set the Codex bridge active-job cap
argument-hint: "<1-8>"
---

If the user supplied a number, call `codex_set_max_concurrent_jobs` with `maxConcurrentJobs` set to that number. Report the effective value and any warnings.

If the user did not supply a number, call `codex_setup` and report the current `localConfig.maxConcurrentJobs` value plus the config path.
