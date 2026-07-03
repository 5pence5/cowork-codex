# Install

## Marketplace Install

Create the local config.

Linux/macOS:

```bash
mkdir -p ~/.config/cowork-codex
cat > ~/.config/cowork-codex/cowork-codex.local.json <<'JSON'
{
  "defaultProfile": "workspace-write",
  "cwdAllowlist": [
    "/absolute/path/to/trusted/workspace"
  ],
  "codexBin": null,
  "maxConcurrentJobs": 8
}
JSON
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\cowork-codex" | Out-Null
@'
{
  "defaultProfile": "workspace-write",
  "cwdAllowlist": [
    "C:\\absolute\\path\\to\\trusted\\workspace"
  ],
  "codexBin": null,
  "maxConcurrentJobs": 8
}
'@ | Set-Content "$env:APPDATA\cowork-codex\cowork-codex.local.json"
```

Add this repo as a marketplace and install the plugin:

```bash
claude plugin marketplace add 5pence5/cowork-codex
claude plugin install cowork-codex@cowork-codex --scope user
```

For private forks or private review, use the SSH form instead:

```bash
claude plugin marketplace add git@github.com:5pence5/cowork-codex.git
```

The SSH form requires repo access, a loaded SSH key, and GitHub in `known_hosts`.

Then run `/reload-plugins` in Cowork, run `/mcp`, and call `codex_setup`.

You can install and run `codex_setup` before writing local config. Task and review jobs stay disabled until `cwdAllowlist` contains at least one real folder.

## Clone-Based Install

From a clone of this repository:

```bash
npm run install:cowork -- --allowlist /absolute/path/to/trusted/workspace
```

If no `--allowlist` is supplied and no config exists yet, the installer uses the repo checkout as the initial allowlist entry. When `--allowlist` is supplied, it replaces the existing `cwdAllowlist` rather than merging with it; repeat `--allowlist` for every folder you want to keep.

The installer:

1. Creates or updates the per-platform local config file.
2. Writes the supplied `--allowlist` path into `cwdAllowlist`.
3. Runs `claude plugin validate --strict`.
4. Adds this checkout as a Claude plugin marketplace.
5. Installs `cowork-codex@cowork-codex` for the current user.

The clone installer registers this checkout under marketplace name `cowork-codex`. If you already added the GitHub marketplace with the same name, the local checkout becomes the active source until you remove and re-add the GitHub marketplace.

Then run `/reload-plugins` in Cowork, run `/mcp`, and call `codex_setup`.

## Concurrency

The default active-job cap is 8. To set it during clone-based setup:

```bash
npm run install:cowork -- \
  --allowlist /absolute/path/to/trusted/workspace \
  --max-concurrent-jobs 8
```

To change it later from Cowork, run `/concurrency <1-8>`. You can also edit `maxConcurrentJobs` in the local config file.

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

Windows PowerShell:

```powershell
npm run install:cowork -- `
  --allowlist C:\absolute\path\to\trusted\workspace `
  --codex-bin (where.exe codex | Select-Object -First 1)
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

Linux/macOS:

```bash
mkdir -p ~/.config/cowork-codex
cp .local/cowork-codex.local.json.example ~/.config/cowork-codex/cowork-codex.local.json
claude plugin validate --strict "$PWD"
claude plugin marketplace add "$PWD"
claude plugin install cowork-codex@cowork-codex --scope user
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\cowork-codex" | Out-Null
Copy-Item .local\cowork-codex.local.json.example "$env:APPDATA\cowork-codex\cowork-codex.local.json"
claude plugin validate --strict (Get-Location).Path
claude plugin marketplace add (Get-Location).Path
claude plugin install cowork-codex@cowork-codex --scope user
```

Edit the local config file before use and replace `<trusted-host-workspace>` with a real host path.

## Switching Back From a Local Clone to GitHub

If a clone-based install replaced the GitHub marketplace source, switch back with:

```bash
claude plugin uninstall cowork-codex@cowork-codex --scope user --keep-data
claude plugin marketplace remove cowork-codex
claude plugin marketplace add 5pence5/cowork-codex
claude plugin install cowork-codex@cowork-codex --scope user
```

The local config file is not plugin data and is preserved by those commands.

## Migrating From A Pre-Release Install

Early local test installs used a parent-folder marketplace named `cowork-codex-local`. To move that install to the repo marketplace identity:

```bash
claude plugin uninstall cowork-codex@cowork-codex-local --scope user --keep-data
claude plugin marketplace remove cowork-codex-local
claude plugin marketplace add 5pence5/cowork-codex
claude plugin install cowork-codex@cowork-codex --scope user
```
