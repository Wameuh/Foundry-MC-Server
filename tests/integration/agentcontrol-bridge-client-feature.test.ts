import { afterEach, describe, expect, it, vi } from "vitest";
import { BridgeClient } from "../../apps/foundry-module/src/bridge/bridge-client.js";

type Listener = (event?: unknown) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  readonly url: string;
  readonly sent: unknown[] = [];
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
    this.emit("close", { code: 1000, reason: "test close" });
  }

  send(payload: string): void {
    this.sent.push(JSON.parse(payload));
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  receive(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  emit(type: string, event?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const sockets: FakeWebSocket[] = [];

function installFoundry(): void {
  (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
  (globalThis as Record<string, unknown>).location = { protocol: "http:" };
  (globalThis as Record<string, unknown>).game = {
    user: { id: "gm-user", name: "GM", isGM: true },
    world: { id: "world-one", title: "World One" },
    version: "14.367",
    system: { id: "dnd5e", version: "6.1.1" },
    settings: {
      get: (_module: string, key: string) => {
        if (key === "bridgeUrl") return "ws://127.0.0.1:3210/foundry-mcp/bridge";
        if (key === "bridgeSecret") return "test-secret";
        return false;
      },
    },
    modules: new Map(),
  };
  (globalThis as Record<string, unknown>).ui = { notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } };
}

async function completeRegistration(socket: FakeWebSocket): Promise<void> {
  socket.open();
  socket.receive({ type: "auth.challenge", nonce: "0123456789abcdef", issuedAt: Date.now() });
  await Promise.resolve();
  socket.receive({ type: "auth.accepted" });
  await Promise.resolve();
  socket.receive({ type: "registered" });
  await Promise.resolve();
}

describe("AgentControl bridge client feature", () => {
  afterEach(() => {
    sockets.length = 0;
    for (const key of ["WebSocket", "location", "game", "ui"]) delete (globalThis as Record<string, unknown>)[key];
    vi.restoreAllMocks();
  });

  it("queues control messages before registration and flushes them in order", async () => {
    installFoundry();
    const client = new BridgeClient();

    client.sendControl({ type: "agentcontrol.getCapabilities" });
    client.sendControl({ type: "agentcontrol.listSlots" });
    client.start();

    expect(sockets).toHaveLength(1);
    expect(sockets[0].sent).toHaveLength(0);
    await completeRegistration(sockets[0]);

    const types = sockets[0].sent.map((message) => (message as { type?: string }).type);
    expect(types).toEqual([
      "auth.proof",
      "register",
      "agentcontrol.getCapabilities",
      "agentcontrol.listSlots",
    ]);
    client.stop();
  });

  it("keeps service-account provisioning backwards compatible through the generic control queue", async () => {
    installFoundry();
    const client = new BridgeClient();
    client.start();
    await completeRegistration(sockets[0]);

    client.sendServiceAccountProvision({ userId: "service-user", username: "MCP Bridge GM", password: "secret" });

    const provision = sockets[0].sent.find((message) => (message as { type?: string }).type === "control.provision") as {
      serviceAccount?: { userId?: string; username?: string };
    };
    expect(provision.serviceAccount).toEqual({ userId: "service-user", username: "MCP Bridge GM", password: "secret" });
    client.stop();
  });

  it("dispatches only validated agentcontrol server messages to subscribers", async () => {
    installFoundry();
    const client = new BridgeClient();
    const received: unknown[] = [];
    client.onServerMessage((message) => received.push(message));
    client.start();
    await completeRegistration(sockets[0]);

    sockets[0].receive({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", alive: true, busy: false, sessionId: "session-a" }],
    });
    sockets[0].receive({ type: "agentcontrol.event", slot: "A", event: { kind: "agent_chunk", text: "bad" } });
    sockets[0].receive({ type: "ping", timestamp: Date.now() });

    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("agentcontrol.slots");
    client.stop();
  });

  it("notifies connection-state subscribers on registration and close", async () => {
    installFoundry();
    const client = new BridgeClient();
    const states: boolean[] = [];
    client.onConnectionStateChange((registered) => states.push(registered));
    client.start();
    await completeRegistration(sockets[0]);

    expect(client.isRegistered()).toBe(true);
    sockets[0].readyState = 3;
    sockets[0].emit("close", { code: 1006, reason: "lost" });

    expect(states).toEqual([true, false]);
    expect(client.isRegistered()).toBe(false);
    client.stop();
  });
});
