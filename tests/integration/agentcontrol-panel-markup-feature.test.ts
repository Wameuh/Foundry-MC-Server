import { afterEach, describe, expect, it } from "vitest";

import { AgentControlApp } from "../../apps/foundry-module/src/agentcontrol/agent-control-app.js";
import type { AgentControlPanelStore } from "../../apps/foundry-module/src/agentcontrol/session-state.js";

type AppInternals = {
  store: AgentControlPanelStore;
  template(): string;
  handleAgentSelection(slot: "A" | "B", agent: string): Promise<void>;
};

function createApp() {
  const sent: unknown[] = [];
  const bridgeClient = {
    isRegistered: () => false,
    sendControl: (message: unknown) => sent.push(message),
    onServerMessage: () => () => {},
    onConnectionStateChange: () => () => {},
  };
  const app = new AgentControlApp({ bridgeClient: bridgeClient as never });
  return { app: app as unknown as AppInternals, sent };
}

describe("AgentControl panel markup feature", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).game;
    delete (globalThis as Record<string, unknown>).foundry;
  });

  it("renders disconnected and empty-slot states with disabled controls", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app, sent } = createApp();

    const html = app.template();

    expect(sent).toEqual([
      { type: "agentcontrol.getCapabilities" },
      { type: "agentcontrol.getState", slot: "A" },
      { type: "agentcontrol.getState", slot: "B" },
    ]);
    expect(html).toContain("Disconnected — waiting for bridge registration");
    expect(html).toContain("No AgentControl session exists for this slot yet");
    expect(html).toContain("recent events are restored after reconnect");
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toContain("Agent A");
    expect(html).toContain("Agent B");
  });

  it("renders status, context usage, transcript entries, and an inactive-tab badge", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", title: "Foundry World Agent A", alive: true, busy: true, contextUsed: 50, contextSize: 100 }],
    });
    app.store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "agent_message", text: "World inspection complete", ts: 1_000 },
    });
    app.store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "B",
      event: {
        kind: "permission_request",
        requestId: "permission-1",
        tool: "shell",
        options: [{ id: "allow", label: "Allow" }],
        ts: 1_100,
      },
    });

    const html = app.template();

    expect(html).toContain("Working");
    expect(html).toContain("50% context");
    expect(html).toContain("World inspection complete");
    expect(html).toContain("ac-tab-badge");
    expect(html).not.toContain("Permission requested");
  });

  it("requires confirmation and recreates a live slot when switching providers", async () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    (globalThis as Record<string, unknown>).foundry = {
      applications: { api: { DialogV2: { confirm: () => Promise.resolve(true) } } },
    };
    const { app, sent } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.capabilities",
      agents: [{ id: "devin", name: "Devin", available: true, models: [{ value: "model", label: "Model" }], modes: [{ value: "code", label: "Code" }] }],
    });
    app.store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "claude", alive: true, busy: false }],
    });
    sent.length = 0;

    await app.handleAgentSelection("A", "devin");

    expect(sent.map((message) => (message as { type?: string }).type)).toEqual(["agentcontrol.destroySlot", "agentcontrol.ensureSlot"]);
  });

  it("surfaces a degraded AgentControl daemon state inferred from capabilities", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.capabilities",
      agents: [{ id: "devin", name: "Devin", available: false, models: [], modes: [] }],
    });

    expect(app.template()).toContain("AgentControl daemon appears unavailable");
  });

  it("renders unmatched chunk streams as collapsed agent activity", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "agent_chunk", text: "Inspecting scene state", ts: 1_000 },
    });
    app.store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "agent_message", text: "Inspection complete", ts: 1_100 },
    });

    const html = app.template();
    expect(html).toContain("Agent activity");
    expect(html).toContain("ac-activity-details");
    expect(html).toContain("Inspection complete");
  });

  it("renders permission cards inline when their slot is active", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: {
        kind: "permission_request",
        requestId: "permission-1",
        tool: "shell",
        detail: "Run npm test",
        options: [{ id: "allow", label: "Allow" }, { id: "deny", label: "Deny" }],
        ts: 1_100,
      },
    });

    const html = app.template();

    expect(html).toContain("Permission requested");
    expect(html).toContain("Run npm test");
    expect(html).toContain('data-option-id="allow"');
    expect(html).toContain('data-option-id="deny"');
  });
});
