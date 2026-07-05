---
description: Show or update Codex workspace folders
argument-hint: "[list|add <path...>|remove <path...>|set <path...>|--dry-run]"
---

Call `codex_cwd_allowlist`.

If the user supplied no arguments or used `list`, pass `action: "list"`.

For `add`, `remove`, and `set`, pass the exact host paths as `path` for one folder or `paths` for multiple folders. Pass `dry_run: true` when the user includes `--dry-run`.

Only call `set` with an empty `paths: []` when the user asks to clear the list.

Report the config path, `cwdAllowlist`, `activeRoots`, `added`, `removed`, `changed`, and any warnings.
