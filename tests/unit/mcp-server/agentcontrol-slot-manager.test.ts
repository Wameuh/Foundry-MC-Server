import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AgentControlServerMessage } from "@foundry-mcp/protocol";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AgentControlSlotManager,
  normalizeDaemonEvent
} from "../../../apps/mcp-server/src/agentcontrol/slot-manager.js";

class MockDaemon extends EventEmitter {
  readonly calls: { req: string; fields: Record<string, unknown> }[] = [];
  private sessionCounter = 0;

  async request<T = unknown>(req: string, fields: Record<string, unknown> = {}): Promise<T> {
    this.calls.push({ req, fields });
    if (req === "list_agents") {
      return [{
        id: "devin",
        name: "Devin CLI",
        available: true,
        caps: {
          config_options: [
            { id: "model", category: "model", currentValue: "model-a", options: [{ value: "model-a", name: "Model A" }] },
            { id: "mode", category: "mode", currentValue: "bypass", options: [{ value: "bypass", name: "Bypass" }] },
            { id: "thought_level", category: "model_config", currentValue: "high", options: [{ value: "high", name: "High", description: "Deeper reasoning" }] }
          ]
        }
      }] as T;
    }
    if (req === "model_catalog") {
      return { models: [{ label: "Model A", value: "model-a" }] } as T;
    }
    if (req === "new_session") {
      this.sessionCounter += 1;
      return { session: `s-mock-${this.sessionCounter}` } as T;
    }
    if (req === "session_info") {
      return {
        alive: true,
        last_seq: 0,
        meta: {
          agent: "devin",
          model: "model-a",
          mode: "bypass",
          state: "idle",
          title: String(fields.title ?? "session"),
          context_used: 10,
          context_size: 100,
          config_options: [
            { id: "thought_level", category: "model_config", currentValue: "high", options: [{ value: "high", name: "High" }] }
          ]
        },
        pending: [],
        queue: [],
        steps: []
      } as T;
    }
    if (req === "subscribe") return { subscribed: fields.session, last_seq: 0 } as T;
    if (req === "events") return { events: [] } as T;
    return {} as T;
  }
}

describe("AgentControlSlotManager", () => {
  const worldId = "test-world";
  let directory: string;
  let workspace: string;
  let statePath: string;
  let daemon: MockDaemon;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "agentcontrol-slots-test-"));
    workspace = path.join(directory, "workspace");
    statePath = path.join(directory, "data", "agentcontrol-slots.json");
    daemon = new MockDaemon();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function manager(): AgentControlSlotManager {
    return new AgentControlSlotManager({
      daemon,
      targetWorldId: worldId,
      workspaceRoot: workspace,
      statePath,
      logger: pino({ level: "silent" })
    });
  }

  it("creates a slot in the scoped world workspace and persists it atomically with 0600 permissions", async () => {
    const instance = manager();

    const state = await instance.ensureSlot(worldId, "A", { agent: "devin", model: "model-a", mode: "bypass" });

    expect(state).toMatchObject({ slot: "A", sessionId: "s-mock-1", agent: "devin", alive: true });
    const creation = daemon.calls.find((call) => call.req === "new_session");
    expect(creation?.fields).toMatchObject({
      agent: "devin",
      cwd: path.join(workspace, worldId),
      title: `Foundry ${worldId} Agent A`,
      model: "model-a",
      mode: "bypass"
    });
    expect(creation?.fields).not.toHaveProperty("mcpServers");

    const stored = JSON.parse(await readFile(statePath, "utf8")) as {
      worlds: Record<string, { A?: { sessionId: string; agent: string; model?: string; mode?: string } }>
    };
    expect(stored.worlds[worldId]?.A).toMatchObject({ sessionId: "s-mock-1", agent: "devin", model: "model-a", mode: "bypass" });
    expect((await stat(statePath)).mode & 0o777).toBe(0o600);
  });

  it("reattaches a persisted slot instead of creating a duplicate session", async () => {
    const first = manager();
    await first.ensureSlot(worldId, "B", { agent: "devin" });
    const creationsBefore = daemon.calls.filter((call) => call.req === "new_session").length;

    const second = manager();
    const state = await second.ensureSlot(worldId, "B", {});

    expect(state.sessionId).toBe("s-mock-1");
    expect(daemon.calls.filter((call) => call.req === "new_session")).toHaveLength(creationsBefore);
    expect(daemon.calls.some((call) => call.req === "session_info" && call.fields.session === "s-mock-1")).toBe(true);
    expect(daemon.calls.some((call) => call.req === "subscribe" && call.fields.session === "s-mock-1")).toBe(true);
  });

  it("refuses control operations for unprovisioned slots and foreign worlds", async () => {
    const instance = manager();
    const sent: AgentControlServerMessage[] = [];
    const send = (message: AgentControlServerMessage) => sent.push(message);

    await instance.handleMessage(worldId, { type: "agentcontrol.prompt", slot: "A", text: "hello" }, send);
    await instance.handleMessage("other-world", { type: "agentcontrol.listSlots" }, send);

    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ type: "agentcontrol.error", slot: "A", op: "agentcontrol.prompt" });
    expect(sent[1]).toMatchObject({ type: "agentcontrol.error", op: "agentcontrol.listSlots" });
    expect(daemon.calls.some((call) => call.req === "send")).toBe(false);
  });

  it("rejects malformed messages that try to smuggle a session id", async () => {
    const instance = manager();
    const sent: AgentControlServerMessage[] = [];

    await instance.handleMessage(worldId, {
      type: "agentcontrol.prompt",
      slot: "A",
      sessionId: "s-unrelated",
      text: "hello"
    }, (message) => sent.push(message));

    expect(sent[0]).toMatchObject({ type: "agentcontrol.error", code: "INVALID_MESSAGE" });
    expect(daemon.calls).toHaveLength(0);
  });

  it("routes scoped control operations to the daemon with verified field names", async () => {
    const instance = manager();
    const sent: AgentControlServerMessage[] = [];
    const send = (message: AgentControlServerMessage) => sent.push(message);
    await instance.ensureSlot(worldId, "A", { agent: "devin" });

    await instance.handleMessage(worldId, { type: "agentcontrol.prompt", slot: "A", text: "hello" }, send);
    await instance.handleMessage(worldId, { type: "agentcontrol.steer", slot: "A", text: "steer" }, send);
    await instance.handleMessage(worldId, { type: "agentcontrol.compact", slot: "A" }, send);
    await instance.handleMessage(worldId, { type: "agentcontrol.respond", slot: "A", requestId: "req-1", optionId: "allow" }, send);
    await instance.handleMessage(worldId, { type: "agentcontrol.respond", slot: "A", requestId: "req-2", answer: { choice: "first" } }, send);
    await instance.handleMessage(worldId, { type: "agentcontrol.setConfig", slot: "A", configId: "thought_level", value: "high" }, send);
    await instance.handleMessage(worldId, { type: "agentcontrol.setConfigOption", slot: "A", configId: "speed", value: "ultrafast" }, send);

    expect(daemon.calls).toEqual(expect.arrayContaining([
      expect.objectContaining({ req: "send", fields: expect.objectContaining({ session: "s-mock-1", text: "hello" }) }),
      expect.objectContaining({ req: "send", fields: expect.objectContaining({ session: "s-mock-1", text: "steer", steer: true }) }),
      expect.objectContaining({ req: "send", fields: expect.objectContaining({ session: "s-mock-1", text: "/compact" }) }),
      expect.objectContaining({ req: "respond", fields: expect.objectContaining({ session: "s-mock-1", request_id: "req-1", option_id: "allow" }) }),
      expect.objectContaining({ req: "respond", fields: expect.objectContaining({ session: "s-mock-1", request_id: "req-2", answer: { choice: "first" } }) }),
      expect.objectContaining({ req: "set_config_option", fields: expect.objectContaining({ session: "s-mock-1", config_id: "thought_level", value: "high" }) }),
      expect.objectContaining({ req: "set_config_option", fields: expect.objectContaining({ session: "s-mock-1", config_id: "speed", value: "ultrafast" }) })
    ]));
    expect(sent.filter((message) => message.type === "agentcontrol.error")).toHaveLength(0);
  });

  it("broadcasts normalized events only for sessions present in the slot mapping", async () => {
    const instance = manager();
    await instance.ensureSlot(worldId, "A", { agent: "devin" });
    const sent: AgentControlServerMessage[] = [];
    instance.registerClient(worldId, (message) => sent.push(message));
    sent.length = 0;

    daemon.emit("push", {
      push: "event",
      session: "s-mock-1",
      event: { seq: 1, type: "agent_text", text: "hello", ts: "2026-01-01T00:00:00.000Z" }
    });
    daemon.emit("push", {
      push: "event",
      session: "s-unrelated",
      event: { seq: 1, type: "agent_text", text: "secret", ts: "2026-01-01T00:00:00.000Z" }
    });
    daemon.emit("push", {
      push: "event",
      session: "s-mock-1",
      event: { seq: 2, type: "usage_update", used: 42, size: 100, ts: "2026-01-01T00:00:01.000Z" }
    });
    daemon.emit("push", {
      push: "event",
      session: "s-mock-1",
      event: { seq: 3, type: "status_changed", state: "working", ts: "2026-01-01T00:00:02.000Z" }
    });

    const events = sent.filter((message) => message.type === "agentcontrol.event");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ slot: "A", event: { kind: "agent_message", text: "hello" } });
    expect(events[1]).toMatchObject({ slot: "A", event: { kind: "status", busy: true, alive: true } });
    expect(JSON.stringify(events)).not.toContain("secret");
    const slotsMessages = sent.filter((message) => message.type === "agentcontrol.slots");
    const last = slotsMessages.at(-1);
    expect(last).toMatchObject({
      slots: [expect.objectContaining({ slot: "A", busy: true, contextUsed: 42, contextSize: 100 }), expect.objectContaining({ slot: "B" })]
    });
  });

  it("sends current daemon health to new clients and broadcasts connectivity changes", () => {
    const instance = manager();
    const sent: AgentControlServerMessage[] = [];
    instance.registerClient(worldId, (message) => sent.push(message));

    expect(sent[0]).toMatchObject({ type: "agentcontrol.daemonHealth", state: "disconnected" });
    sent.length = 0;

    daemon.emit("connection-state", { state: "connected" });
    daemon.emit("connection-state", { state: "connected" });
    daemon.emit("connection-state", { state: "error", message: "socket failed" });

    const health = sent.filter((message) => message.type === "agentcontrol.daemonHealth");
    expect(health).toHaveLength(2);
    expect(health[0]).toMatchObject({ state: "connected" });
    expect(health[1]).toMatchObject({ state: "error", message: "socket failed" });
    expect(health.every((message) => typeof message.ts === "number")).toBe(true);
  });

  it("forwards initial and live config_options for the owning slot", async () => {
    const instance = manager();
    await instance.ensureSlot(worldId, "A", { agent: "devin" });
    const sent: AgentControlServerMessage[] = [];
    instance.registerClient(worldId, (message) => sent.push(message));

    expect(sent.some((message) =>
      message.type === "agentcontrol.configOptions" &&
      message.slot === "A" &&
      message.options.some((option) => option.id === "thought_level" && option.currentValue === "high")
    )).toBe(true);
    sent.length = 0;

    daemon.emit("push", {
      push: "event",
      session: "s-mock-1",
      event: {
        seq: 10,
        type: "config_options",
        options: [{ id: "thought_level", category: "model_config", currentValue: "max", options: [{ value: "max", name: "Max" }] }],
        ts: "2026-01-01T00:00:00.000Z"
      }
    });

    expect(sent).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "agentcontrol.configOptions",
        slot: "A",
        options: [expect.objectContaining({ id: "thought_level", currentValue: "max" })]
      })
    ]));
  });

  it("serializes ensureSlot before an immediately following prompt", async () => {
    const instance = manager();
    const sent: AgentControlServerMessage[] = [];
    const send = (message: AgentControlServerMessage) => sent.push(message);

    await Promise.all([
      instance.handleMessage(worldId, { type: "agentcontrol.ensureSlot", slot: "A", agent: "devin" }, send),
      instance.handleMessage(worldId, { type: "agentcontrol.prompt", slot: "A", text: "hello" }, send)
    ]);

    expect(daemon.calls.some((call) => call.req === "new_session")).toBe(true);
    expect(daemon.calls.some((call) => call.req === "send" && call.fields.session === "s-mock-1" && call.fields.text === "hello")).toBe(true);
    expect(sent.filter((message) => message.type === "agentcontrol.error")).toHaveLength(0);
  });

  it("normalizes live list_agents config_options into capabilities", async () => {
    const instance = manager();
    const sent: AgentControlServerMessage[] = [];

    await instance.handleMessage(worldId, { type: "agentcontrol.getCapabilities" }, (message) => sent.push(message));

    expect(sent[0]).toMatchObject({
      type: "agentcontrol.capabilities",
      suggestedAgent: "devin",
      suggestedModel: "model-a",
      suggestedMode: "bypass",
      agents: [expect.objectContaining({
        id: "devin",
        available: true,
        models: [{ value: "model-a", label: "Model A" }],
        modes: [{ value: "bypass", label: "Bypass" }],
        configOptions: expect.arrayContaining([
          expect.objectContaining({ id: "thought_level", currentValue: "high" })
        ])
      })]
    });
  });

  it("proxies provider agents and model catalogs through scoped control messages", async () => {
    const instance = manager();
    const sent: AgentControlServerMessage[] = [];
    const send = (message: AgentControlServerMessage) => sent.push(message);

    await instance.handleMessage(worldId, { type: "agentcontrol.listAgents" }, send);
    await instance.handleMessage(worldId, { type: "agentcontrol.modelCatalog", agent: "devin" }, send);

    expect(sent[0]).toMatchObject({
      type: "agentcontrol.agents",
      agents: [expect.objectContaining({ id: "devin", configOptions: expect.any(Array) })]
    });
    expect(sent[1]).toMatchObject({
      type: "agentcontrol.modelCatalog",
      agent: "devin",
      models: [{ value: "model-a", label: "Model A" }]
    });
    expect(daemon.calls.some((call) => call.req === "model_catalog" && call.fields.agent === "devin")).toBe(true);
  });

  it("uses reversible sleep on destroy, forgets the mapping, and never deletes the daemon session", async () => {
    const instance = manager();
    await instance.ensureSlot(worldId, "A", { agent: "devin" });

    await instance.destroySlot(worldId, "A");

    expect(daemon.calls.some((call) => call.req === "sleep_session" && call.fields.session === "s-mock-1")).toBe(true);
    expect(daemon.calls.some((call) => call.req === "delete_session")).toBe(false);
    expect(instance.listSlots(worldId)[0]).toMatchObject({ slot: "A", alive: false, busy: false });
    expect(instance.listSlots(worldId)[0]).not.toHaveProperty("sessionId");
  });

  it("does not send unsupported new_session MCP injection fields", async () => {
    const instance = manager();

    await instance.ensureSlot(worldId, "A", { agent: "devin" });

    const creation = daemon.calls.find((call) => call.req === "new_session");
    expect(creation?.fields).not.toHaveProperty("mcpServers");
    expect(creation?.fields).not.toHaveProperty("mcp_servers");
  });
});

describe("normalizeDaemonEvent", () => {
  const ts = "2026-01-01T00:00:00.000Z";

  it("normalizes permission and question requests", () => {
    expect(normalizeDaemonEvent({
      type: "permission_request",
      request_id: "req-1",
      title: "Run command",
      detail: "rm example",
      options: [{ option_id: "allow", name: "Allow once", kind: "allow_once" }],
      ts
    })).toMatchObject({
      kind: "permission_request",
      requestId: "req-1",
      tool: "Run command",
      options: [{ id: "allow", label: "Allow once" }]
    });

    expect(normalizeDaemonEvent({
      type: "question_request",
      request_id: "req-2",
      message: "Which option?",
      schema: { type: "object", properties: { choice: { type: "string", oneOf: [{ const: "first", title: "First choice" }] } } },
      options: [
        { option_id: "first", name: "First choice" },
        { id: "second", label: "Second choice" }
      ],
      ts
    })).toMatchObject({
      kind: "question",
      requestId: "req-2",
      question: "Which option?",
      schema: { type: "object", properties: { choice: { type: "string" } } },
      options: [
        { id: "first", label: "First choice" },
        { id: "second", label: "Second choice" }
      ]
    });

    expect(normalizeDaemonEvent({
      type: "question_request",
      request_id: "req-3",
      message: "Freeform answer?",
      ts
    })).toMatchObject({ kind: "question", requestId: "req-3", question: "Freeform answer?" });
    expect(normalizeDaemonEvent({
      type: "question_request",
      request_id: "req-3",
      message: "Freeform answer?",
      ts
    })).not.toHaveProperty("options");
  });

  it("normalizes tool lifecycle and lifecycle status", () => {
    expect(normalizeDaemonEvent({
      type: "tool_call",
      title: "Run ls",
      input: "ls",
      status: "pending",
      ts
    })).toMatchObject({ kind: "tool_call", name: "Run ls", status: "started" });
    expect(normalizeDaemonEvent({
      type: "tool_call_update",
      title: "Run ls",
      excerpt: "done",
      status: "completed",
      ts
    })).toMatchObject({ kind: "tool_call", status: "finished" });
    expect(normalizeDaemonEvent({ type: "session_cleared", ts })).toMatchObject({ kind: "cleared" });
    expect(normalizeDaemonEvent({ type: "system", text: "context compacted", ts })).toMatchObject({ kind: "compacted" });
  });
});
