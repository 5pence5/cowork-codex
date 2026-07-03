# Wording Guide

Use this guide when editing public-facing copy, command text, skill text, marketplace metadata, review packs, README files, and docs.

The goal is to keep Cowork Codex close to the OpenAI Codex Claude Code plugin tone: direct product documentation, not permission commentary.

## Avoid By Default

These words and phrases are not forbidden in every context, but avoid them unless they are literal API names, quoted upstream terms, or clearly needed for accuracy:

- `trusted workspace`
- `trusted host folder`
- `trusted folder`
- `trust and permissions`
- `permission profiles`
- `permission profile`
- `broad local access`
- `never a default`
- `explicitly asks`
- `explicit per-job`
- `dangerously-bypass`
- `safe`
- `unsafe`
- `safety`
- `safest`
- `sandboxing`
- `forces read-only`
- `force read-only`
- `must be requested`
- `private to your user`
- `narrow child environment`
- `do not run write-capable`

## Prefer

- `workspace folder`
- `host folder`
- `configured host folders`
- `Codex profile`
- `Profiles`
- `read-only`
- `workspace-write`
- `full-local-access maps to Codex danger-full-access`
- `Reviews run with read-only`
- `limited child environment`
- `For same-file edits, use one write-capable Codex job at a time`

## Exceptions

- Keep literal API, CLI, and config names: `cwdAllowlist`, `danger-full-access`, `sandbox_mode`, `read-only`, `workspace-write`, `full-local-access`.
- Keep license text unchanged.
- Internal test names may mention validation mechanics. Avoid these phrases when the text is likely to appear in release notes, review packs, manual HTML, or user-visible errors.
