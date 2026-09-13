import { readFile, readdir, readlink, rm } from "node:fs/promises";
import { hostname as osHostname } from "node:os";
import path from "node:path";

const PROFILE_SINGLETON_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket"] as const;
const TERMINATE_WAIT_MS = 5_000;
const POLL_MS = 100;

export type ChromiumProfileLockDeps = {
  resolveProfilePath(profilePath: string): string;
  readSingletonLock(profilePath: string): Promise<{ hostname: string; pid: number } | undefined>;
  listChromiumPidsUsingProfile(profilePath: string): Promise<number[]>;
  isProcessAlive(pid: number): boolean;
  signalProcess(pid: number, signal: NodeJS.Signals): void;
  removeSingletonFiles(profilePath: string): Promise<void>;
  hostname(): string;
  now(): number;
  sleep(ms: number): Promise<void>;
};

/**
 * Prepares a Chromium user-data profile before launch.
 *
 * Only Chromium processes whose cmdline references this profile's user-data-dir
 * are signalled (never a broad `pkill chromium`). After they exit, leftover
 * singleton lock files are removed. If a process still owns the profile, lock
 * files are left untouched.
 */
export async function prepareChromiumProfile(
  profilePath: string,
  deps: ChromiumProfileLockDeps = defaultChromiumProfileLockDeps
): Promise<void> {
  const resolved = deps.resolveProfilePath(profilePath);
  const owners = await deps.listChromiumPidsUsingProfile(resolved);

  for (const pid of owners) {
    await terminatePid(pid, deps);
  }

  const remaining = await deps.listChromiumPidsUsingProfile(resolved);
  if (remaining.length > 0) {
    throw new Error(
      `Chromium profile is still in use by process(es) ${remaining.join(", ")}; refusing to clear lock files`
    );
  }

  const lock = await deps.readSingletonLock(resolved);
  if (lock && lock.hostname === deps.hostname() && deps.isProcessAlive(lock.pid)) {
    throw new Error(
      `Chromium singleton lock is held by active process ${lock.pid}; refusing to clear lock files`
    );
  }

  await deps.removeSingletonFiles(resolved);
}

async function terminatePid(pid: number, deps: ChromiumProfileLockDeps): Promise<void> {
  if (!deps.isProcessAlive(pid)) return;
  try {
    deps.signalProcess(pid, "SIGTERM");
  } catch {
    return;
  }
  if (await waitUntilDead(pid, deps, TERMINATE_WAIT_MS)) return;
  try {
    deps.signalProcess(pid, "SIGKILL");
  } catch {
    return;
  }
  await waitUntilDead(pid, deps, TERMINATE_WAIT_MS);
}

async function waitUntilDead(pid: number, deps: ChromiumProfileLockDeps, timeoutMs: number): Promise<boolean> {
  const deadline = deps.now() + timeoutMs;
  while (deps.now() < deadline) {
    if (!deps.isProcessAlive(pid)) return true;
    await deps.sleep(POLL_MS);
  }
  return !deps.isProcessAlive(pid);
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
    const procEntries = await readdir("/proc", { withFileTypes: true }).catch(() => []);
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
  isProcessAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  signalProcess(pid, signal) {
    process.kill(pid, signal);
  },
  async removeSingletonFiles(profilePath) {
    await Promise.all(
      PROFILE_SINGLETON_FILES.map((file) => rm(path.join(profilePath, file), { force: true }))
    );
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
  } catch {
    return undefined;
  }
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
