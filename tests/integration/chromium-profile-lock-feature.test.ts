import { describe, expect, it } from "vitest";

import {
  prepareChromiumProfile,
  type ChromiumProfileLockDeps
} from "../../apps/mcp-server/src/headless/chromium-profile-lock.js";

function createMutexLock() {
  let held = false;
  const waiters: Array<() => void> = [];
  return {
    async acquire(): Promise<() => Promise<void>> {
      if (held) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      held = true;
      return async () => {
        held = false;
        waiters.shift()?.();
      };
    },
    isHeld: () => held
  };
}

function createDeps(overrides: Partial<ChromiumProfileLockDeps> = {}): ChromiumProfileLockDeps & {
  removed: boolean;
  released: boolean;
} {
  const state = { removed: false, released: false };
  const mutex = createMutexLock();
  return {
    resolveProfilePath: (profilePath) => profilePath,
    readSingletonLock: async () => undefined,
    listChromiumPidsUsingProfile: async () => [],
    isProcessAlive: () => false,
    removeSingletonFiles: async () => {
      state.removed = true;
    },
    acquireInterprocessLock: async () => {
      const release = await mutex.acquire();
      return async () => {
        state.released = true;
        await release();
      };
    },
    hostname: () => "mcp-host",
    now: (() => {
      let t = 0;
      return () => {
        t += 50;
        return t;
      };
    })(),
    sleep: async () => undefined,
    ...overrides,
    get removed() {
      return state.removed;
    },
    get released() {
      return state.released;
    }
  };
}

describe("chromium profile lock cleanup feature", () => {
  it("clears leftover singleton files for a stale session with no living Chromium", async () => {
    const deps = createDeps({
      readSingletonLock: async () => ({ hostname: "old-container", pid: 21335 }),
      isProcessAlive: () => false
    });

    const preparation = await prepareChromiumProfile("/app/data/chromium-profile", deps);
    expect(deps.removed).toBe(true);
    await preparation.release();
    expect(deps.released).toBe(true);
  });

  it("refuses to clear locks while an active Chromium session still owns the profile", async () => {
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => [9001],
      readSingletonLock: async () => ({ hostname: "mcp-host", pid: 9001 }),
      isProcessAlive: () => true
    });

    await expect(prepareChromiumProfile("/app/data/chromium-profile", deps)).rejects.toThrow(/still in use/i);
    expect(deps.removed).toBe(false);
    expect(deps.released).toBe(true);
  });

  it("refuses cleanup when /proc cannot be inspected", async () => {
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => {
        throw new Error("Unable to inspect /proc for Chromium profile owners (EACCES); refusing profile cleanup");
      }
    });

    await expect(prepareChromiumProfile("/app/data/chromium-profile", deps)).rejects.toThrow(/inspect \/proc/i);
    expect(deps.removed).toBe(false);
    expect(deps.released).toBe(true);
  });

  it("refuses to continue when a Chromium appears between idle checks and lock removal", async () => {
    let listCalls = 0;
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => {
        listCalls += 1;
        // Two idle asserts see an empty profile; the post-removal check sees a new owner.
        if (listCalls <= 2) return [];
        return [5555];
      }
    });

    await expect(prepareChromiumProfile("/app/data/chromium-profile", deps)).rejects.toThrow(/became in use/i);
    expect(deps.removed).toBe(true);
    expect(listCalls).toBe(3);
    expect(deps.released).toBe(true);
  });

  it("serializes two concurrent profile preparations with an interprocess lock", async () => {
    const events: string[] = [];
    let listCalls = 0;
    const deps = createDeps({
      listChromiumPidsUsingProfile: async () => {
        listCalls += 1;
        return [];
      },
      removeSingletonFiles: async () => {
        events.push("clear-start");
        await new Promise<void>((resolve) => setTimeout(resolve, 30));
        events.push("clear-end");
      }
    });

    const first = prepareChromiumProfile("/app/data/chromium-profile", deps).then(async (preparation) => {
      events.push("first-ready");
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
      await preparation.release();
      events.push("first-released");
    });
    const second = prepareChromiumProfile("/app/data/chromium-profile", deps).then(async (preparation) => {
      events.push("second-ready");
      await preparation.release();
      events.push("second-released");
    });

    await Promise.all([first, second]);

    expect(events.indexOf("first-ready")).toBeLessThan(events.indexOf("second-ready"));
    expect(events.indexOf("clear-end")).toBeLessThan(events.indexOf("second-ready"));
    expect(events.indexOf("first-released")).toBeLessThan(events.indexOf("second-ready"));
    expect(listCalls).toBeGreaterThanOrEqual(4);
  });
});
