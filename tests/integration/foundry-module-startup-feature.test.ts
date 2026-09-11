import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Foundry module startup feature", () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    for (const key of ["game", "Hooks", "window", "location"]) {
      delete (globalThis as Record<string, unknown>)[key];
    }
    vi.restoreAllMocks();
  });

  it("registers its init hook before game.modules is populated", async () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    const register = vi.fn();
    (globalThis as Record<string, unknown>).game = {
      settings: { register, get: () => undefined },
      modules: undefined,
    };
    (globalThis as Record<string, unknown>).Hooks = {
      once: vi.fn((hook: string, callback: (...args: unknown[]) => void) => {
        callbacks.set(hook, callback);
        return callbacks.size;
      }),
      on: vi.fn(),
      off: vi.fn(),
    };
    (globalThis as Record<string, unknown>).window = {
      addEventListener: vi.fn(),
      location: { protocol: "http:", hostname: "192.168.1.109" },
    };

    await expect(import("../../apps/foundry-module/src/main.js")).resolves.toBeDefined();
    expect(callbacks.has("init")).toBe(true);

    callbacks.get("init")?.();
    expect(register).toHaveBeenCalledTimes(4);
  });

  it("allows a LAN WebSocket only when Foundry itself uses HTTP", async () => {
    (globalThis as Record<string, unknown>).location = {
      protocol: "http:",
      hostname: "192.168.1.109",
    };
    const { isAllowedBridgeUrl } = await import("../../apps/foundry-module/src/bridge/bridge-client.js");
    expect(isAllowedBridgeUrl("ws://192.168.1.109:3210/foundry-mcp/bridge")).toBe(true);

    (globalThis as Record<string, unknown>).location = {
      protocol: "https:",
      hostname: "foundry.example.com",
    };
    expect(isAllowedBridgeUrl("ws://192.168.1.109:3210/foundry-mcp/bridge")).toBe(false);
    expect(isAllowedBridgeUrl("wss://mcp.example.com/foundry-mcp/bridge")).toBe(true);
  });
});
