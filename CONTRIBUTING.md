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
claude plugin validate --strict "$PWD"
```

## Pull Requests

- Keep plugin behavior and docs in sync.
- Update `CHANGELOG.md` for user-facing changes.
- Bump `package.json`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` together when command/tool behavior changes. `npm run check` verifies version sync, and the MCP server reads `package.json` at startup.
- Do not commit machine-local config files or job logs.
