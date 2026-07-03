# Install

## One-command Local Install

From a clone of this repository:

```bash
npm run install:cowork -- --allowlist /absolute/path/to/trusted/workspace
```

While this repo is private, cloning requires GitHub access to `5pence5/cowork-codex`.

The installer:

1. Creates or updates `~/.config/cowork-codex/cowork-codex.local.json`.
2. Writes the supplied `--allowlist` path into `cwdAllowlist`.
3. Runs `claude plugin validate`.
4. Adds this checkout as a local Claude plugin marketplace.
5. Installs `cowork-codex@cowork-codex-local` for the current user.

Then reload plugins in Cowork, run `/mcp`, and call `codex_setup`.

## Multiple Workspaces

Repeat `--allowlist`:

```bash
npm run install:cowork -- \
  --allowlist /Users/me/Projects/app-one \
  --allowlist /Users/me/Projects/app-two
```

## Custom Codex Binary

If `codex_setup` cannot discover Codex automatically:

```bash
npm run install:cowork -- \
  --allowlist /absolute/path/to/trusted/workspace \
  --codex-bin "$(command -v codex)"
```

## Preview Without Changes

```bash
npm run install:cowork -- --allowlist "$PWD" --dry-run
```

## Config-Only Setup

To create/update config and validate the plugin without installing it:

```bash
npm run install:cowork -- --allowlist "$PWD" --skip-plugin-install
```

## Manual Install

```bash
mkdir -p ~/.config/cowork-codex
cp .local/cowork-codex.local.json.example ~/.config/cowork-codex/cowork-codex.local.json
claude plugin validate "$PWD"
claude plugin marketplace add "$PWD"
claude plugin install cowork-codex@cowork-codex-local --scope user
```

Edit `~/.config/cowork-codex/cowork-codex.local.json` before use and replace `<trusted-host-workspace>` with a real Mac host path.
