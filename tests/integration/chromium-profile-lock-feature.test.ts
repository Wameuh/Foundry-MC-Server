import { describe, expect, it } from "vitest";

import {
  prepareChromiumProfile,
  type ChromiumProfileLockDeps
} from "../../apps/mcp-server/src/headless/chromium-profile-lock.js";

function createDeps(overrides: Partial<ChromiumProfileLockDeps> & Pick<
  ChromiumProfileLockDeps,
  "listChromiumPidsUsingProfile" | "readSingletonLock" | "isProcessAlive"
>): ChromiumProfileLockDeps & { signals: Array<{ pid: number; signal: NodeJS.Signals }>; removed: boolean } {
  const state = { signals: [] as Array<{ pid: number; signal: NodeJS.Signals }>, removed: false };
  return {
    resolveProfilePath: (profilePath) => profilePath,
    removeSingletonFiles: async () => {
      state.removed = true;
    },
    hostname: () => "mcp-host",
    now: (() => {
      let t = 0;
      return () => {
        t += 200;
        return t;
      };
    })(),
    sleep: async () => undefined,
    signalProcess(pid, signal) {
      state.signals.push({ pid, signal });
    },
    ...overrides,
    get signals() {
      return state.signals;
    },
    get removed() {
      return state.removed;
    }
  };
}

describe("chromium profile lock cleanup feature", () => {
  it("clears leftover singleton files for a stale session with no living Chromium", async () => {
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => [],
      readSingletonLock: async () => ({ hostname: "old-container", pid: 21335 }),
      isProcessAlive: () => false
    });

    await prepareChromiumProfile("/app/data/chromium-profile", deps);

    expect(deps.signals).toEqual([]);
    expect(deps.removed).toBe(true);
  });

  it("terminates only the Chromium PID that still uses this MCP profile, then clears locks", async () => {
    const alive = new Set([4242]);
    const signals: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => (alive.has(4242) ? [4242] : []),
      readSingletonLock: async () => (alive.has(4242) ? { hostname: "mcp-host", pid: 4242 } : undefined),
      isProcessAlive: (pid) => alive.has(pid),
      signalProcess(pid, signal) {
        signals.push({ pid, signal });
        if (signal === "SIGTERM") alive.delete(pid);
      }
    });

    await prepareChromiumProfile("/app/data/chromium-profile", deps);

    expect(signals).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
    expect(deps.removed).toBe(true);
  });

  it("refuses to clear locks while an active Chromium session still owns the profile", async () => {
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => [9001],
      readSingletonLock: async () => ({ hostname: "mcp-host", pid: 9001 }),
      isProcessAlive: () => true
    });

    await expect(prepareChromiumProfile("/app/data/chromium-profile", deps)).rejects.toThrow(/still in use/i);
    expect(deps.signals.some((entry) => entry.pid === 9001)).toBe(true);
    expect(deps.removed).toBe(false);
  });

  it("does not signal unrelated Chromium processes that use another profile", async () => {
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => [],
      readSingletonLock: async () => undefined,
      isProcessAlive: () => false
    });

    await prepareChromiumProfile("/app/data/chromium-profile", deps);

    expect(deps.signals).toEqual([]);
    expect(deps.removed).toBe(true);
  });
});
