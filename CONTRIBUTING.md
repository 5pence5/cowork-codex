# Contributing

This project is intentionally small. Keep changes scoped, dependency-free where possible, and covered by the local validation commands.

## Development

Run syntax checks:

```bash
npm run check
```

Run the full local selftest:

```bash
npm run selftest
```

The selftest uses the local Codex CLI and includes live Codex task/review calls. If Codex is not authenticated on the host, fix that before treating selftest failures as code regressions.

Validate the Claude plugin manifest:

```bash
claude plugin validate "$PWD"
```

## Pull Requests

- Keep plugin behavior and docs in sync.
- Update `CHANGELOG.md` for user-facing changes.
- Bump `package.json`, `.claude-plugin/plugin.json`, and `SERVER_INFO.version` together when command/tool behavior changes.
- Do not commit machine-local config files or job logs.

