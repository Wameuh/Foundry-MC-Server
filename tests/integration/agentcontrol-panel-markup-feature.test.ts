import { afterEach, describe, expect, it } from "vitest";

import {
  AgentControlApp,
  arrayInputValues,
  parseFreeformAnswer,
  primitiveInputValue,
  questionFields,
} from "../../apps/foundry-module/src/agentcontrol/agent-control-app.js";
import type { AgentControlPanelStore } from "../../apps/foundry-module/src/agentcontrol/session-state.js";

type AppInternals = {
  store: AgentControlPanelStore;
  template(): string;
  handleAgentSelection(slot: "A" | "B", agent: string): Promise<void>;
  collectSchemaAnswer(requestId: string): unknown;
  element?: unknown;
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

  it("renders dynamic config option selectors with current values and pending state", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", alive: true, busy: false }],
    });
    app.store.handleServerMessage({
      type: "agentcontrol.configOptions",
      slot: "A",
      options: [
        { id: "model", category: "model", currentValue: "swe-a", options: [{ value: "swe-a", label: "SWE A" }, { value: "swe-b", label: "SWE B" }] },
        { id: "mode", category: "mode", currentValue: "ask", options: [{ value: "ask", label: "Ask" }, { value: "plan", label: "Plan" }] },
        { id: "thought_level", name: "Thinking", category: "thought_level", currentValue: "medium", options: [{ value: "medium", label: "Medium" }, { value: "high", label: "High" }] },
        { id: "speed", name: "Speed", category: "model_config", currentValue: "standard", options: [{ value: "standard", label: "Standard" }, { value: "ultrafast", label: "Ultrafast" }] },
      ],
    });

    const html = app.template();

    expect(html).toContain('data-control="thought_level"');
    expect(html).toContain('data-control="speed"');
    expect(html).toContain('<option value="high"');
    expect(html).toContain('<option value="medium" selected');
    expect(html).toContain('<option value="ultrafast"');

    app.store.selectConfigOption("A", "thought_level", "high");
    expect(app.template()).toContain("Thinking · applying…");
  });

  it("uses daemon-provided ids for categorized model and mode selectors", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.slots",
      slots: [{ slot: "A", sessionId: "session-a", agent: "devin", alive: true, busy: false }],
    });
    app.store.handleServerMessage({
      type: "agentcontrol.configOptions",
      slot: "A",
      options: [
        { id: "agent_model", category: "model", currentValue: "swe-a", options: [{ value: "swe-a", label: "SWE A" }] },
        { id: "permission_mode", category: "mode", currentValue: "ask", options: [{ value: "ask", label: "Ask" }] },
      ],
    });

    const html = app.template();

    expect(html).toContain('data-control="agent_model"');
    expect(html).toContain('data-control="permission_mode"');
    expect(html).not.toContain('data-control="model"');
    expect(html).not.toContain('data-control="mode"');
  });

  it("renders a schema-driven question form with choice, scalar, array, and textarea controls", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: {
        kind: "question",
        requestId: "question-1",
        question: "Configure the import",
        schema: {
          type: "object",
          required: ["choice"],
          properties: {
            choice: { type: "string", title: "Import mode", oneOf: [{ const: "light", title: "Light" }, { const: "full", title: "Full" }] },
            count: { type: "integer", title: "Count", placeholder: "3" },
            tags: { type: "array", title: "Tags", items: { type: "string", anyOf: [{ const: "npc" }, { const: "scene" }] } },
            notes: { type: "string", title: "Notes", format: "textarea" },
          },
        },
        ts: 1_100,
      },
    });

    const html = app.template();

    expect(html).toContain('data-action="respond-schema"');
    expect(html).toContain('data-field-key="choice"');
    expect(html).toContain('value="light"');
    expect(html).toContain('type="number"');
    expect(html).toContain('<select multiple');
    expect(html).toContain('<textarea rows="3"');
    expect(html).not.toContain('class="ac-question-answer"');
  });

  it("builds schema answers as objects keyed by schema properties", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({
      type: "agentcontrol.event",
      slot: "A",
      event: {
        kind: "question",
        requestId: "question-1",
        question: "Configure the import",
        schema: {
          type: "object",
          properties: {
            choice: { type: "string", oneOf: [{ const: "light" }, { const: "full" }] },
            count: { type: "integer" },
            tags: { type: "array", items: { type: "string", anyOf: [{ const: "npc" }, { const: "scene" }] } },
            notes: { type: "string", format: "textarea" },
          },
        },
        ts: 1_100,
      },
    });
    const controls: Record<string, unknown> = {
      choice: { value: "full" },
      count: { value: "3" },
      tags: { multiple: true, selectedOptions: [{ value: "npc" }, { value: "scene" }], value: "" },
      notes: { value: "Keep existing ids" },
    };
    const form = {
      querySelector: (selector: string) => {
        const key = /data-field-key="([^"]+)"/.exec(selector)?.[1];
        return key ? controls[key] ?? null : null;
      },
    };
    app.element = {
      querySelector: (selector: string) => selector.includes("data-question-form") ? form : null,
    };

    expect(app.collectSchemaAnswer("question-1")).toEqual({
      choice: "full",
      count: 3,
      tags: ["npc", "scene"],
      notes: "Keep existing ids",
    });
  });

  it("distinguishes allow-always permission buttons visually", () => {
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
        options: [{ id: "allow_once", label: "Allow" }, { id: "allow_always", label: "Always allow" }],
        ts: 1_100,
      },
    });

    const html = app.template();
    expect(html).toContain('data-option-id="allow_always"');
    expect(html).toContain('ac-permission-always');
  });

  it("uses explicit daemon health instead of capability inference when available", () => {
    (globalThis as Record<string, unknown>).game = {
      settings: { get: () => ({}), set: () => Promise.resolve() },
    };
    const { app } = createApp();
    app.store.setConnected(true);
    app.store.handleServerMessage({ type: "agentcontrol.daemonHealth", state: "error", message: "connection refused", ts: 1_000 });

    const html = app.template();
    expect(html).toContain("AgentControl daemon error — connection refused");
    expect(html).not.toContain("no agent is currently reported as available");
  });

  it("parses schema scalar/array values and freeform JSON answers", () => {
    const schema = {
      type: "object",
      properties: {
        count: { type: "integer" },
        enabled: { type: "boolean" },
        tags: { type: "array", items: { type: "number" } },
      },
    };
    const fields = questionFields(schema);
    expect(fields?.map((field) => field.key)).toEqual(["count", "enabled", "tags"]);
    const count = fields?.find((field) => field.key === "count")?.schema;
    const enabled = fields?.find((field) => field.key === "enabled")?.schema;
    const tags = fields?.find((field) => field.key === "tags")?.schema;
    expect(primitiveInputValue(count, "4")).toBe(4);
    expect(primitiveInputValue(enabled, "false")).toBe(false);
    expect(arrayInputValues(tags, "1, 2\n3")).toEqual([1, 2, 3]);
    expect(parseFreeformAnswer('{"answer":"yes","extra":2}')).toEqual({ answer: "yes", extra: 2 });
    expect(parseFreeformAnswer("plain text")).toEqual({ answer: "plain text" });
  });
});
