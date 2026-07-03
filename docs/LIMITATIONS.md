# Limitations

## macOS First

The plugin is built for Claude Cowork on a Mac host. The launcher and path assumptions are macOS-oriented.

## Manual Sync Discipline

Do not run write-capable Codex jobs while Cowork is actively editing the same files. The bridge cannot coordinate editor state or mount sync timing.

## Log Retention

Job logs are append-only until deleted. There is no compaction or retention policy yet.

Clear logs manually:

```bash
rm -rf ~/.local/state/cowork-codex/logs
```

## Restarted Jobs

On normal MCP shutdown or plugin reload, the server cancels live active jobs through their process handles before exit. If the server later loads a stored active job without a live handle, the bridge marks it orphaned. It does not signal stored PIDs after restart because PID reuse can make that unsafe. A Codex process that survived an abnormal termination may continue independently.

The job store assumes one active Cowork Codex server per user state directory. Running two Cowork sessions against the same log directory at the same time can cause one server to mark the other's active jobs orphaned after reload.

## Plugin Distribution

The current release path is adding this GitHub repo as a Claude plugin marketplace or installing from a tracked-source zip. There is no npm distribution or Anthropic-hosted marketplace listing yet.

## Broad Local Access

`full-local-access` is available only as an explicit per-job profile. It cannot be configured as the default.
