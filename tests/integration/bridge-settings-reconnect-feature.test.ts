import { afterEach, describe, expect, it, vi } from "vitest";

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  readonly url: string;
  readyState = 0;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = 3;
    for (const listener of this.listeners.get("close") ?? []) listener();
  }

  send(): void {
    // The reconnect feature does not need to exchange messages.
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

const sockets: FakeWebSocket[] = [];

describe("bridge settings reconnect feature", () => {
  afterEach(() => {
    sockets.length = 0;
    delete (globalThis as Record<string, unknown>).WebSocket;
    delete (globalThis as Record<string, unknown>).game;
    delete (globalThis as Record<string, unknown>).location;
    vi.restoreAllMocks();
  });

  it("restarts the socket immediately and ignores the replaced socket close", async () => {
    (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
    (globalThis as Record<string, unknown>).location = { protocol: "http:" };
    (globalThis as Record<string, unknown>).game = {
      user: { id: "gm", name: "GM", isGM: true },
      world: { id: "world", title: "World" },
      version: "14.367",
      system: { id: "dnd5e", version: "5.3.3" },
      settings: {
        get: (_module: string, key: string) =>
          key === "bridgeUrl" ? "ws://127.0.0.1:3210/foundry-mcp/bridge" : key === "bridgeSecret" ? "secret" : false,
      },
      modules: new Map(),
    };

    const { BridgeClient } = await import("../../apps/foundry-module/src/bridge/bridge-client.js");
    const client = new BridgeClient();
    client.start();
    expect(sockets).toHaveLength(1);

    client.restart();
    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toContain("foundry-mcp/bridge");

    // A delayed close from the old socket must not schedule another retry.
    sockets[0].emit("close");
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(sockets).toHaveLength(2);
    client.stop();
  });
});
