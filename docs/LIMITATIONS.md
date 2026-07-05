# Limitations

## Platform Support

The 0.1.x plugin is tested on macOS hosts. The runtime includes platform-aware config, log, PATH, Codex binary discovery, and Windows command-shim handling. Linux and Windows still need real Cowork-session validation.

Cowork `/sessions/<session>/mnt/...` path mapping is tested on macOS and experimental elsewhere. Direct host-absolute `cwd` paths are the most direct option on Linux and Windows.

## Manual Sync Discipline

For same-file edits, use one write-capable Codex job at a time. The bridge does not coordinate editor state or mount sync timing.

## Log Retention

Job logs are append-only until deleted. There is no compaction or retention policy yet.

Cowork can inspect bounded log tails with `/logs`, but retention is still manual.

Clear logs manually on Linux/macOS:

```bash
rm -rf ~/.local/state/cowork-codex/logs
```

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\cowork-codex\logs"
```

## Restarted Jobs

On normal MCP shutdown or plugin reload, the server cancels live active jobs through their process handles before exit. If the server later loads a stored active job without a live handle, the bridge marks it orphaned. It does not signal stored PIDs after restart because PID reuse can point at an unrelated process. A Codex process that survived an abnormal termination may continue independently.

The job store assumes one active Cowork Codex server per user state directory. Running two Cowork sessions against the same log directory at the same time can cause one server to mark the other's active jobs orphaned after reload.

## Plugin Distribution

The current release path is adding this GitHub repo as a Claude plugin marketplace or installing from a tracked-source zip. There is no npm distribution or Anthropic-hosted marketplace listing yet.

## Profiles

`defaultProfile` accepts `read-only` or `workspace-write`. The `full-local-access` job profile maps to Codex `danger-full-access`.
