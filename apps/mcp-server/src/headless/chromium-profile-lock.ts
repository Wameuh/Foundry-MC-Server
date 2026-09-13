import { closeSync, constants, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile, readdir, readlink, rm } from "node:fs/promises";
import { hostname as osHostname } from "node:os";
import path from "node:path";

const PROFILE_SINGLETON_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket"] as const;
const MCP_PROFILE_LOCK_NAME = ".foundry-mcp-profile.lock";
const INTERPROCESS_LOCK_TIMEOUT_MS = 30_000;
const INTERPROCESS_LOCK_POLL_MS = 50;

export type ProfilePreparation = {
  release(): Promise<void>;
};

export type ChromiumProfileLockDeps = {
  resolveProfilePath(profilePath: string): string;
  readSingletonLock(profilePath: string): Promise<{ hostname: string; pid: number } | undefined>;
  /** Throws when the process table cannot be inspected (fail closed). */
  listChromiumPidsUsingProfile(profilePath: string): Promise<number[]>;
  isProcessAlive(pid: number): boolean;
  removeSingletonFiles(profilePath: string): Promise<void>;
  /** Exclusive interprocess lock held across cleanup and Chromium launch. */
  acquireInterprocessLock(profilePath: string): Promise<() => Promise<void>>;
  hostname(): string;
  now(): number;
  sleep(ms: number): Promise<void>;
};

/**
 * Prepares a Chromium user-data profile before launch.
 *
 * Acquires an interprocess lock, inspects whether any Chromium already uses this
 * profile (never terminates foreign browsers), clears only clearly stale
 * singleton files, and keeps the lock until the caller releases it after launch.
 */
export async function prepareChromiumProfile(
  profilePath: string,
  deps: ChromiumProfileLockDeps = defaultChromiumProfileLockDeps
): Promise<ProfilePreparation> {
  const resolved = deps.resolveProfilePath(profilePath);
  const releaseLock = await deps.acquireInterprocessLock(resolved);

  try {
    await assertProfileIdle(resolved, deps);
    // Re-check immediately before mutating lock files (TOCTOU).
    await assertProfileIdle(resolved, deps);
    await deps.removeSingletonFiles(resolved);
    // Fail if a Chromium appeared in the gap between the last idle check and removal.
    const ownersAfter = await deps.listChromiumPidsUsingProfile(resolved);
    if (ownersAfter.length > 0) {
      throw new Error(
        `Chromium profile became in use by process(es) ${ownersAfter.join(", ")} during cleanup; refusing to continue`
      );
    }

    return {
      async release() {
        await releaseLock();
      }
    };
  } catch (error) {
    await releaseLock().catch(() => undefined);
    throw error;
  }
}

async function assertProfileIdle(resolved: string, deps: ChromiumProfileLockDeps): Promise<void> {
  const owners = await deps.listChromiumPidsUsingProfile(resolved);
  if (owners.length > 0) {
    throw new Error(
      `Chromium profile is still in use by process(es) ${owners.join(", ")}; refusing to clear lock files`
    );
  }

  const lock = await deps.readSingletonLock(resolved);
  if (lock && lock.hostname === deps.hostname() && deps.isProcessAlive(lock.pid)) {
    throw new Error(
      `Chromium singleton lock is held by active process ${lock.pid}; refusing to clear lock files`
    );
  }
}

export async function acquireExclusiveFileLock(
  lockPath: string,
  options: {
    isProcessAlive(pid: number): boolean;
    now(): number;
    sleep(ms: number): Promise<void>;
    timeoutMs?: number;
  }
): Promise<() => Promise<void>> {
  const timeoutMs = options.timeoutMs ?? INTERPROCESS_LOCK_TIMEOUT_MS;
  const deadline = options.now() + timeoutMs;
  mkdirSync(path.dirname(lockPath), { recursive: true });

  while (options.now() < deadline) {
    try {
      const fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      try {
        writeFileSync(fd, `${process.pid}\n`, "utf8");
      } catch {
        closeSync(fd);
        throw new Error(`Failed to write interprocess lock at ${lockPath}`);
      }
      return () => {
        try {
          closeSync(fd);
        } catch {
          // already closed
        }
        try {
          unlinkSync(lockPath);
        } catch {
          // already removed
        }
        return Promise.resolve();
      };
    } catch (error) {
      if (!isExclusiveCreateConflict(error)) throw error;
      if (reclaimStaleLock(lockPath, (pid) => options.isProcessAlive(pid))) continue;
      await options.sleep(INTERPROCESS_LOCK_POLL_MS);
    }
  }

  throw new Error(`Timed out acquiring Chromium profile interprocess lock at ${lockPath}`);
}

function reclaimStaleLock(
  lockPath: string,
  isProcessAlive: (pid: number) => boolean
): boolean {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    const pid = Number(raw.split(/\s+/)[0]);
    if (!Number.isInteger(pid) || pid <= 0) {
      unlinkSync(lockPath);
      return true;
    }
    if (!isProcessAlive(pid)) {
      unlinkSync(lockPath);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isExclusiveCreateConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

export const defaultChromiumProfileLockDeps: ChromiumProfileLockDeps = {
  resolveProfilePath(profilePath) {
    return path.resolve(profilePath);
  },
  async readSingletonLock(profilePath) {
    try {
      const target = await readlink(path.join(profilePath, "SingletonLock"));
      const separator = target.lastIndexOf("-");
      if (separator <= 0) return undefined;
      const host = target.slice(0, separator);
      const pid = Number(target.slice(separator + 1));
      if (!host || !Number.isInteger(pid) || pid <= 0) return undefined;
      return { hostname: host, pid };
    } catch {
      return undefined;
    }
  },
  async listChromiumPidsUsingProfile(profilePath) {
    const resolved = path.resolve(profilePath);
    let procEntries;
    try {
      procEntries = await readdir("/proc", { withFileTypes: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to inspect /proc for Chromium profile owners (${detail}); refusing profile cleanup`);
    }
    const pids: number[] = [];
    for (const entry of procEntries) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const pid = Number(entry.name);
      const cmdline = await readProcCmdline(pid);
      if (!cmdline) continue;
      if (!isChromiumCommand(cmdline)) continue;
      if (!cmdlineUsesUserDataDir(cmdline, resolved)) continue;
      pids.push(pid);
    }
    return pids;
  },
  isProcessAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  async removeSingletonFiles(profilePath) {
    await Promise.all(
      PROFILE_SINGLETON_FILES.map((file) => rm(path.join(profilePath, file), { force: true }))
    );
  },
  async acquireInterprocessLock(profilePath) {
    return acquireExclusiveFileLock(path.join(profilePath, MCP_PROFILE_LOCK_NAME), {
      isProcessAlive: (pid) => defaultChromiumProfileLockDeps.isProcessAlive(pid),
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    });
  },
  hostname: () => osHostname(),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
};

async function readProcCmdline(pid: number): Promise<string[] | undefined> {
  try {
    const raw = await readFile(`/proc/${pid}/cmdline`);
    if (raw.length === 0) return undefined;
    return raw.toString("utf8").split("\0").filter(Boolean);
  } catch (error) {
    // Only a vanished PID between readdir and read is ignorable. Permission
    // errors must fail closed so an active Chromium cannot become invisible.
    if (isTransientProcGoneError(error)) return undefined;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read /proc/${pid}/cmdline (${detail}); refusing profile cleanup`);
  }
}

/** ENOENT/ESRCH: PID disappeared mid-scan. EACCES/EPERM and other errors are fatal. */
export function isTransientProcGoneError(error: unknown): boolean {
  return isNodeErrno(error, "ENOENT") || isNodeErrno(error, "ESRCH");
}

function isNodeErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isChromiumCommand(cmdline: string[]): boolean {
  const executable = cmdline[0] ?? "";
  return /chromium|chrome/i.test(executable);
}

function cmdlineUsesUserDataDir(cmdline: string[], profilePath: string): boolean {
  for (let index = 0; index < cmdline.length; index += 1) {
    const arg = cmdline[index] ?? "";
    if (arg === "--user-data-dir") {
      const value = cmdline[index + 1];
      if (value && path.resolve(value) === profilePath) return true;
      continue;
    }
    if (arg.startsWith("--user-data-dir=")) {
      const value = arg.slice("--user-data-dir=".length);
      if (value && path.resolve(value) === profilePath) return true;
    }
  }
  return false;
}
