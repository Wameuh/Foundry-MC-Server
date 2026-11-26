import { describe, expect, it } from "vitest";

import {
  AgentControlPanelStore,
  normalizePreferences,
  type AgentControlPreferences,
} from "../../apps/foundry-module/src/agentcontrol/session-state.js";

const capabilities = [{
  id: "devin",
  name: "Devin",
  available: true,
  models: [{ value: "swe-2.1", label: "SWE 2.1" }],
  modes: [{ value: "code", label: "Code" }, { value: "plan", label: "Plan" }],
}];

function createStore(saved: AgentControlPreferences = {}) {
  const sent: Array<Record<string, unknown>> = [];
  let persisted = saved;
  const store = new AgentControlPanelStore({
    sendControl: (message) => sent.push(message as Record<string, unknown>),
    loadPreferences: () => saved,
    savePreferences: (preferences) => { persisted = structuredClone(preferences); },
    now: () => 1_000,
  });
  return { store, sent, persisted: () => persisted };
}

describe("AgentControl panel state feature", () => {
  it("requests capabilities and slots when opened and whenever the bridge reconnects", () => {
    const { store, sent } = createStore();
    store.start();
    store.setConnected(true);

    // The first pair is queued before registration and flushed by the bridge;
    // no duplicate live pair is needed for that initial connection.
    expect(sent).toEqual([
      { type: "agentcontrol.getCapabilities" },
      { type: "agentcontrol.listSlots" },
    ]);
    expect(store.snapshot.connected).toBe(true);

    store.setConnected(false);
    store.setConnected(true);
    expect(sent).toEqual([
      { type: "agentcontrol.getCapabilities" },
      { type: "agentcontrol.listSlots" },
      { type: "agentcontrol.getCapabilities" },
      { type: "agentcontrol.listSlots" },
    ]);
  });

  it("uses capabilities for selections, persists them, and ensures the slot on first interaction", () => {
    const { store, sent, persisted } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.capabilities",
      agents: capabilities,
      suggestedAgent: "devin",
      suggestedModel: "swe-2.1",
      suggestedMode: "code",
    });
    sent.length = 0;

    store.selectAgent("A", "devin");

    expect(sent).toEqual([{ type: "agentcontrol.ensureSlot", slot: "A", agent: "devin", model: "swe-2.1", mode: "code" }]);
    expect(persisted()).toEqual({ A: { agent: "devin", model: "swe-2.1", mode: "code" } });
  });

  it("sends setModel and setMode without recreating an existing slot", () => {
    const { store, sent } = createStore({ A: { agent: "devin", model: "swe-2.1", mode: "code" } });
    store.handleServerMessage({ type: "agentcontrol.capabilities", agents: capabilities });
    store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", model: "swe-2.1", mode: "code", alive: true, busy: false }],
    });
    sent.length = 0;

    store.selectModel("A", "swe-2.1");
    store.selectMode("A", "plan");

    expect(sent).toEqual([
      { type: "agentcontrol.setModel", slot: "A", model: "swe-2.1" },
      { type: "agentcontrol.setMode", slot: "A", mode: "plan" },
    ]);
  });

  it("ensures a missing slot before the first prompt and deduplicates the live user echo", () => {
    const { store, sent } = createStore();

    expect(store.sendPrompt("A", " inspect the world ")).toBe(true);

    expect(sent.map((message) => message.type)).toEqual(["agentcontrol.ensureSlot", "agentcontrol.prompt"]);
    expect(store.snapshot.entries.A).toHaveLength(1);
    expect(store.snapshot.entries.A[0]).toMatchObject({ kind: "user", text: "inspect the world", local: true });

    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "user_message", text: "inspect the world", ts: 1_500 },
    });
    expect(store.snapshot.entries.A).toHaveLength(1);
    expect(store.snapshot.entries.A[0]).not.toHaveProperty("local");
  });

  it("coalesces streaming chunks into a single agent entry", () => {
    const { store } = createStore();
    for (const text of ["Hello", ", ", "world"]) {
      store.handleServerMessage({
        type: "agentcontrol.event",
        slot: "A",
        event: { kind: "agent_chunk", text, ts: 1_100 },
      });
    }
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "agent_message", text: "Hello, world", ts: 1_200 },
    });

    expect(store.snapshot.entries.A).toHaveLength(1);
    expect(store.snapshot.entries.A[0]).toMatchObject({ kind: "agent", text: "Hello, world", streaming: false });
  });

  it("tracks inactive-slot activity and resolves inline permission requests", () => {
    const { store } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "B",
      event: {
        kind: "permission_request",
        requestId: "request-1",
        tool: "shell",
        detail: "Run npm test",
        options: [{ id: "allow", label: "Allow" }, { id: "deny", label: "Deny" }],
        ts: 1_100,
      },
    });

    expect(store.snapshot.unread.B).toBe(1);
    const request = store.snapshot.entries.B[0];
    expect(request).toMatchObject({ kind: "permission", requestId: "request-1", resolved: false });

    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "B",
      event: { kind: "permission_resolved", requestId: "request-1", ts: 1_200 },
    });
    expect(store.snapshot.entries.B[0]).toMatchObject({ resolved: true });

    store.setActiveSlot("B");
    expect(store.snapshot.unread.B).toBe(0);
  });

  it("sends permission option responses using the wire contract", () => {
    const { store, sent } = createStore();
    store.respond("A", "request-1", { optionId: "allow" });
    store.respond("A", "request-2", { answer: "freeform answer" });

    expect(sent).toEqual([
      { type: "agentcontrol.respond", slot: "A", requestId: "request-1", optionId: "allow" },
      { type: "agentcontrol.respond", slot: "A", requestId: "request-2", answer: "freeform answer" },
    ]);
  });

  it("treats the slots message as a complete inventory so destroyed slots disappear", () => {
    const { store } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", alive: true, busy: false }],
    });
    expect(store.snapshot.slots.A.alive).toBe(true);

    store.handleServerMessage({ type: "agentcontrol.slots", slots: [] });

    expect(store.snapshot.slots.A).toMatchObject({ slot: "A", alive: false, busy: false });
    expect(store.snapshot.slots.A).not.toHaveProperty("sessionId");
  });

  it("normalizes malformed persisted preferences defensively", () => {
    expect(normalizePreferences({
      A: { agent: "devin", model: 3, mode: "code" },
      B: "invalid",
    })).toEqual({ A: { agent: "devin", mode: "code" } });
  });
});
