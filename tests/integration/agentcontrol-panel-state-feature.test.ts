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
  it("requests capabilities and per-slot state when opened and whenever the bridge reconnects", () => {
    const { store, sent } = createStore();
    store.start();
    store.setConnected(true);

    // The first batch is queued before registration and flushed by the bridge;
    // no duplicate live batch is needed for that initial connection.
    expect(sent).toEqual([
      { type: "agentcontrol.getCapabilities" },
      { type: "agentcontrol.getState", slot: "A" },
      { type: "agentcontrol.getState", slot: "B" },
    ]);
    expect(store.snapshot.connected).toBe(true);

    store.setConnected(false);
    store.setConnected(true);
    expect(sent).toEqual([
      { type: "agentcontrol.getCapabilities" },
      { type: "agentcontrol.getState", slot: "A" },
      { type: "agentcontrol.getState", slot: "B" },
      { type: "agentcontrol.getCapabilities" },
      { type: "agentcontrol.getState", slot: "A" },
      { type: "agentcontrol.getState", slot: "B" },
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

  it("deduplicates replayed getState events without dropping new events", () => {
    const { store } = createStore();
    const message = {
      type: "agentcontrol.event" as const,
      slot: "A" as const,
      event: { kind: "agent_message" as const, text: "restored answer", ts: 1_100 },
    };

    store.handleServerMessage(message);
    store.handleServerMessage(message);
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "agent_message", text: "restored answer", ts: 1_101 },
    });

    expect(store.snapshot.entries.A).toHaveLength(2);
    expect(store.snapshot.entries.A.map((entry) => entry.ts)).toEqual([1_100, 1_101]);
  });

  it("keeps mismatched activity streams separate from the final agent answer", () => {
    const { store } = createStore();
    for (const text of ["Checking the world state", " and preparing a summary"]) {
      store.handleServerMessage({
        type: "agentcontrol.event",
        slot: "A",
        event: { kind: "agent_chunk", text, ts: 1_100 },
      });
    }
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "agent_message", text: "The world is ready.", ts: 1_200 },
    });

    expect(store.snapshot.entries.A).toHaveLength(2);
    expect(store.snapshot.entries.A[0]).toMatchObject({
      kind: "agent",
      text: "Checking the world state and preparing a summary",
      streaming: false,
      activity: true,
    });
    expect(store.snapshot.entries.A[1]).toMatchObject({ kind: "agent", text: "The world is ready." });
    expect(store.snapshot.entries.A[1]).not.toHaveProperty("activity");
  });

  it("folds generic daemon tool updates into the active tool line", () => {
    const { store } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "tool_call", name: "Ran npm test", status: "started", detail: "npm test", ts: 1_100 },
    });
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "tool_call", name: "tool", status: "started", detail: "tests running", ts: 1_101 },
    });
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "tool_call", name: "tool", status: "finished", detail: "42 tests passed", ts: 1_102 },
    });

    expect(store.snapshot.entries.A).toHaveLength(1);
    expect(store.snapshot.entries.A[0]).toMatchObject({
      kind: "tool",
      name: "Ran npm test",
      status: "finished",
      detail: "42 tests passed",
      ts: 1_102,
    });
  });

  it("destroys then re-ensures a live slot when the provider changes", () => {
    const { store, sent } = createStore();
    store.handleServerMessage({ type: "agentcontrol.capabilities", agents: capabilities });
    store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "claude", alive: true, busy: false }],
    });
    sent.length = 0;

    store.recreateSlotWithAgent("A", "devin");

    expect(sent.map((message) => message.type)).toEqual(["agentcontrol.destroySlot", "agentcontrol.ensureSlot"]);
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

  it("stores forwarded config options, sends setConfigOption, and clears pending when applied", () => {
    const { store, sent } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", alive: true, busy: false }],
    });
    store.handleServerMessage({
      type: "agentcontrol.configOptions",
      slot: "A",
      options: [
        { id: "thought_level", category: "thought_level", currentValue: "medium", options: [{ value: "medium", label: "Medium" }, { value: "high", label: "High" }] },
        { id: "speed", category: "model_config", currentValue: "standard", options: [{ value: "standard", label: "Standard" }, { value: "ultrafast", label: "Ultrafast" }] },
      ],
    });
    sent.length = 0;

    store.selectConfigOption("A", "thought_level", "high");

    expect(sent).toEqual([{ type: "agentcontrol.setConfigOption", slot: "A", configId: "thought_level", value: "high" }]);
    expect(store.snapshot.pendingConfig.A).toEqual({ thought_level: "high" });

    store.handleServerMessage({
      type: "agentcontrol.configOptions",
      slot: "A",
      options: [
        { id: "thought_level", category: "thought_level", currentValue: "high", options: [{ value: "medium", label: "Medium" }, { value: "high", label: "High" }] },
        { id: "speed", category: "model_config", currentValue: "standard", options: [{ value: "standard", label: "Standard" }, { value: "ultrafast", label: "Ultrafast" }] },
      ],
    });
    expect(store.snapshot.pendingConfig.A).toEqual({});
  });

  it("uses setConfigOption for dynamic model and mode controls instead of legacy controls", () => {
    const { store, sent } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", alive: true, busy: false }],
    });
    store.handleServerMessage({
      type: "agentcontrol.configOptions",
      slot: "A",
      options: [
        { id: "model", category: "model", currentValue: "swe-a", options: [{ value: "swe-a", label: "SWE A" }, { value: "swe-b", label: "SWE B" }] },
        { id: "mode", category: "mode", currentValue: "ask", options: [{ value: "ask", label: "Ask" }, { value: "plan", label: "Plan" }] },
      ],
    });
    sent.length = 0;

    store.selectModel("A", "swe-b");
    store.selectMode("A", "plan");

    expect(sent).toEqual([
      { type: "agentcontrol.setConfigOption", slot: "A", configId: "model", value: "swe-b" },
      { type: "agentcontrol.setConfigOption", slot: "A", configId: "mode", value: "plan" },
    ]);
  });

  it("uses the daemon-provided config id even when model and mode are categories", () => {
    const { store, sent, persisted } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", alive: true, busy: false }],
    });
    store.handleServerMessage({
      type: "agentcontrol.configOptions",
      slot: "A",
      options: [
        { id: "agent_model", category: "model", currentValue: "swe-a", options: [{ value: "swe-a", label: "SWE A" }, { value: "swe-b", label: "SWE B" }] },
        { id: "permission_mode", category: "mode", currentValue: "ask", options: [{ value: "ask", label: "Ask" }, { value: "plan", label: "Plan" }] },
      ],
    });
    sent.length = 0;

    store.selectModel("A", "swe-b");
    store.selectMode("A", "plan");

    expect(sent).toEqual([
      { type: "agentcontrol.setConfigOption", slot: "A", configId: "agent_model", value: "swe-b" },
      { type: "agentcontrol.setConfigOption", slot: "A", configId: "permission_mode", value: "plan" },
    ]);
    expect(persisted()).toEqual({ A: { model: "swe-b", mode: "plan" } });
  });

  it("clears a pending config value and surfaces the daemon error when rejected", () => {
    const { store } = createStore();
    store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", alive: true, busy: false }],
    });
    store.handleServerMessage({
      type: "agentcontrol.configOptions",
      slot: "A",
      options: [{ id: "thought_level", category: "thought_level", currentValue: "medium", options: [{ value: "medium", label: "Medium" }, { value: "high", label: "High" }] }],
    });

    store.selectConfigOption("A", "thought_level", "high");
    store.handleServerMessage({
      type: "agentcontrol.error",
      slot: "A",
      code: "OPERATION_FAILED",
      op: "agentcontrol.setConfigOption",
      message: "set_config_option thought_level unknown « high » — values: medium, max",
    });

    expect(store.snapshot.pendingConfig.A).toEqual({});
    expect(store.snapshot.entries.A.at(-1)).toMatchObject({ kind: "error", text: "set_config_option thought_level unknown « high » — values: medium, max" });
  });

  it("keeps question schemas in transcript entries and records explicit daemon health", () => {
    const { store } = createStore();
    const schema = { type: "object", properties: { choice: { type: "string", oneOf: [{ const: "a" }] } } };
    store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: { kind: "question", requestId: "question-1", question: "Choose", schema, ts: 1_100 },
    });
    store.handleServerMessage({ type: "agentcontrol.daemonHealth", state: "error", message: "daemon unavailable", ts: 1_200 });

    expect(store.snapshot.entries.A[0]).toMatchObject({ kind: "question", schema });
    expect(store.snapshot.daemonHealth).toEqual({ state: "error", message: "daemon unavailable", ts: 1_200 });
  });

  it("normalizes malformed persisted preferences defensively", () => {
    expect(normalizePreferences({
      A: { agent: "devin", model: 3, mode: "code" },
      B: "invalid",
    })).toEqual({ A: { agent: "devin", mode: "code" } });
  });
});
