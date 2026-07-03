# Install

## Marketplace Install

Create the local config:

```bash
mkdir -p ~/.config/cowork-codex
cat > ~/.config/cowork-codex/cowork-codex.local.json <<'JSON'
{
  "defaultProfile": "workspace-write",
  "cwdAllowlist": [
    "/absolute/path/to/trusted/workspace"
  ],
  "codexBin": null,
  "maxConcurrentJobs": 2
}
JSON
```

Add this repo as a marketplace and install the plugin:

```bash
claude plugin marketplace add git@github.com:5pence5/cowork-codex.git
claude plugin install cowork-codex@cowork-codex --scope user
```

While this repo is private, the SSH marketplace command requires GitHub access to `5pence5/cowork-codex`, a loaded SSH key, and GitHub in `known_hosts`. After public release, a GitHub shorthand such as `claude plugin marketplace add 5pence5/cowork-codex` should also work.

Then run `/reload-plugins` in Cowork, run `/mcp`, and call `codex_setup`.

## Clone-Based Install

From a clone of this repository:

```bash
npm run install:cowork -- --allowlist /absolute/path/to/trusted/workspace
```

The installer:

1. Creates or updates `~/.config/cowork-codex/cowork-codex.local.json`.
2. Writes the supplied `--allowlist` path into `cwdAllowlist`.
3. Runs `claude plugin validate --strict`.
4. Adds this checkout as a Claude plugin marketplace.
5. Installs `cowork-codex@cowork-codex` for the current user.

The clone installer registers this checkout under marketplace name `cowork-codex`. If you already added the GitHub marketplace with the same name, the local checkout becomes the active source until you remove and re-add the GitHub marketplace.

Then run `/reload-plugins` in Cowork, run `/mcp`, and call `codex_setup`.

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
claude plugin validate --strict "$PWD"
claude plugin marketplace add "$PWD"
claude plugin install cowork-codex@cowork-codex --scope user
```

Edit `~/.config/cowork-codex/cowork-codex.local.json` before use and replace `<trusted-host-workspace>` with a real Mac host path.

## Replacing the Earlier Local Development Install

Early local test installs used a parent-folder marketplace named `cowork-codex-local`. To move that install to the repo marketplace identity:

```bash
claude plugin uninstall cowork-codex@cowork-codex-local --scope user --keep-data
claude plugin marketplace remove cowork-codex-local
claude plugin marketplace add git@github.com:5pence5/cowork-codex.git
claude plugin install cowork-codex@cowork-codex --scope user
```

The config file under `~/.config/cowork-codex/cowork-codex.local.json` is not plugin data and is preserved by those commands.

## Switching Back From a Local Clone to GitHub

If a clone-based install replaced the GitHub marketplace source, switch back with:

```bash
claude plugin uninstall cowork-codex@cowork-codex --scope user --keep-data
claude plugin marketplace remove cowork-codex
claude plugin marketplace add git@github.com:5pence5/cowork-codex.git
claude plugin install cowork-codex@cowork-codex --scope user
```
