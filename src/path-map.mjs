import { access, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { basename, isAbsolute, join, resolve, sep } from "node:path";

function inside(child, parent) {
  const normalizedParent = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(normalizedParent);
}

async function existsDir(path) {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function realpathIfExists(path) {
  await access(path, constants.F_OK);
  return realpath(path);
}

export async function normalizeAllowlist(allowlist = []) {
  const roots = [];
  for (const entry of allowlist) {
    if (!entry || typeof entry !== "string" || entry.startsWith("<")) continue;
    try {
      const rp = await realpathIfExists(entry);
      if (await existsDir(rp)) roots.push(rp);
    } catch {
      // Ignore stale allowlist entries; validation errors name the config file.
    }
  }
  return roots;
}

export async function mapAndValidateCwd(inputCwd, localConfig) {
  if (!inputCwd || typeof inputCwd !== "string") {
    throw new Error("cwd is required. Provide a host path or a Cowork /sessions/<user>/mnt/<workspace> path.");
  }

  const configPath = localConfig?.path || "COWORK_CODEX_LOCAL_CONFIG";
  const allowlistRoots = await normalizeAllowlist(localConfig?.cwdAllowlist || []);
  if (!localConfig?.exists || !Array.isArray(localConfig?.cwdAllowlist) || localConfig.cwdAllowlist.length === 0) {
    throw new Error(`No cwd allowlist is configured. Copy .local/cowork-codex.local.json.example to ${configPath}, set cwdAllowlist to host folders, and retry.`);
  }
  if (allowlistRoots.length === 0) {
    throw new Error(`No configured cwdAllowlist entries currently resolve to existing host folders. Update ${configPath} with an existing host folder and retry.`);
  }

  const candidates = [];
  const seenCandidates = new Set();
  const addCandidate = (candidate) => {
    if (!candidate || seenCandidates.has(candidate)) return;
    seenCandidates.add(candidate);
    candidates.push(candidate);
  };
  const vmMatch = inputCwd.match(/^\/sessions\/[^/]+\/mnt\/(.+)$/);
  if (vmMatch) {
    const remainder = vmMatch[1];
    const parts = remainder.split("/").filter(Boolean);
    const firstPart = parts[0];
    const restParts = parts.slice(1);
    addCandidate(resolve("/", remainder));
    for (const root of allowlistRoots) {
      addCandidate(join(root, remainder));
      if (firstPart && basename(root) === firstPart) {
        addCandidate(restParts.length ? join(root, ...restParts) : root);
      }
    }
  } else if (isAbsolute(inputCwd)) {
    addCandidate(inputCwd);
  } else {
    addCandidate(resolve(inputCwd));
  }

  let lastError = null;
  const matches = [];
  const seenMatches = new Set();
  for (const candidate of candidates) {
    try {
      const rp = await realpathIfExists(candidate);
      if (!(await existsDir(rp))) continue;
      const matchedRoot = allowlistRoots.find((root) => inside(rp, root));
      if (matchedRoot) {
        const key = `${rp}\0${matchedRoot}`;
        if (!seenMatches.has(key)) {
          seenMatches.add(key);
          matches.push({ cwd: rp, matchedRoot });
        }
      }
    } catch (error) {
      lastError = error;
    }
  }

  const distinctCwds = [...new Map(matches.map((match) => [match.cwd, match])).values()];
  if (distinctCwds.length === 1) {
    return {
      inputCwd,
      cwd: distinctCwds[0].cwd,
      matchedRoot: distinctCwds[0].matchedRoot,
      mappedFromVmPath: Boolean(vmMatch)
    };
  }

  if (distinctCwds.length > 1) {
    const choices = distinctCwds.map((match) => match.cwd).join(", ");
    throw new Error(`cwd maps to multiple allowlisted host folders: ${inputCwd}. Matched: ${choices}. Pass a host-absolute path or narrow ${configPath} cwdAllowlist.`);
  }

  throw new Error(`cwd is outside the configured allowlist or does not exist: ${inputCwd}. Update ${configPath} cwdAllowlist with the host folder. ${lastError?.message || ""}`.trim());
}
