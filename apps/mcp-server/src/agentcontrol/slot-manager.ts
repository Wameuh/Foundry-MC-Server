import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AgentControlClientMessageSchema,
  AgentEventSchema,
  type AgentCapabilities,
  type AgentConfigOption,
  type AgentControlClientMessage,
  type AgentControlServerMessage,
  type AgentEvent,
  type AgentSlot,
  type AgentSlotState
} from "@foundry-mcp/protocol";
import type { EventEmitter } from "node:events";
import type { Logger } from "pino";

import type { DaemonConnectionState, DaemonPush } from "./daemon-client.js";

export type DaemonClientLike = Pick<EventEmitter, "on"> & {
  request<T = unknown>(req: string, fields?: Record<string, unknown>): Promise<T>;
  isConnected?: () => boolean;
};

type StoredSlot = {
  sessionId: string;
  agent: string;
  model?: string;
  mode?: string;
};

type SlotMapping = Partial<Record<AgentSlot, StoredSlot>>;
type SlotStore = {
  version: 1;
  worlds: Record<string, SlotMapping>;
};

type RuntimeSlot = {
  worldId: string;
  slot: AgentSlot;
  sessionId?: string;
  agent?: string;
  model?: string;
  mode?: string;
  title?: string;
  alive: boolean;
  busy: boolean;
  contextUsed?: number;
  contextSize?: number;
  configOptions?: AgentConfigOption[];
  lastSeq: number;
};

type BridgeClient = {
  worldId: string;
  send: (message: AgentControlServerMessage) => void;
};

export type AgentControlSlotManagerOptions = {
  daemon: DaemonClientLike;
  targetWorldId: string;
  workspaceRoot: string;
  statePath?: string;
  logger: Logger;
};

const SLOTS: AgentSlot[] = ["A", "B"];
const DEFAULT_STATE_PATH = "./data/agentcontrol-slots.json";

const FALLBACK_CAPABILITIES: AgentCapabilities[] = [
  {
    id: "devin",
    name: "Devin CLI",
    available: false,
    models: [
      { value: "adaptive", label: "Adaptive" },
      { value: "swe-2-1-medium", label: "SWE-2.1" },
      { value: "swe-2-flash-medium", label: "SWE-2 Flash" }
    ],
    modes: [
      { value: "accept-edits", label: "Code" },
      { value: "smart", label: "Smart" },
      { value: "ask", label: "Ask" },
      { value: "plan", label: "Plan" },
      { value: "bypass", label: "Bypass Permissions" }
    ]
  },
  {
    id: "claude",
    name: "Claude",
    available: false,
    models: [
      { value: "default", label: "Default" },
      { value: "sonnet", label: "Sonnet" },
      { value: "haiku", label: "Haiku" },
      { value: "opus", label: "Opus" }
    ],
    modes: [
      { value: "default", label: "Default" },
      { value: "acceptEdits", label: "Accept Edits" },
      { value: "plan", label: "Plan" }
    ]
  }
];

type LooseRecord = Record<string, unknown> & {
  ts?: unknown;
  seq?: unknown;
  type?: unknown;
  sessionId?: unknown;
  agent?: unknown;
  model?: unknown;
  mode?: unknown;
  worlds?: unknown;
  id?: unknown;
  name?: unknown;
  caps?: unknown;
  models?: unknown;
  extra_models?: unknown;
  modes?: unknown;
  value?: unknown;
  label?: unknown;
  available?: unknown;
  option_id?: unknown;
  text?: unknown;
  excerpt?: unknown;
  input?: unknown;
  diff?: unknown;
  title?: unknown;
  kind?: unknown;
  status?: unknown;
  detail?: unknown;
  request_id?: unknown;
  options?: unknown;
  message?: unknown;
  question?: unknown;
  state?: unknown;
  used?: unknown;
  size?: unknown;
  currentValue?: unknown;
  category?: unknown;
  alive?: unknown;
  meta?: unknown;
  context_used?: unknown;
  context_size?: unknown;
  session?: unknown;
  events?: unknown;
};

function isRecord(value: unknown): value is LooseRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function eventTimestamp(event: LooseRecord): number {
  const parsed = typeof event.ts === "string" ? Date.parse(event.ts) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function sanitizePathComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isUnknownSession(error: unknown): boolean {
  return /unknown session/i.test(errorMessage(error));
}

function validStoredSlot(value: unknown): StoredSlot | undefined {
  if (!isRecord(value)) return undefined;
  const sessionId = asString(value.sessionId);
  const agent = asString(value.agent);
  if (!sessionId || !agent) return undefined;
  return {
    sessionId,
    agent,
    ...(asString(value.model) ? { model: asString(value.model) as string } : {}),
    ...(asString(value.mode) ? { mode: asString(value.mode) as string } : {})
  };
}

function normalizeStore(value: unknown): SlotStore {
  const store: SlotStore = { version: 1, worlds: {} };
  if (!isRecord(value) || !isRecord(value.worlds)) return store;
  for (const [worldId, slots] of Object.entries(value.worlds)) {
    if (!isRecord(slots)) continue;
    const mapping: SlotMapping = {};
    for (const slot of SLOTS) {
      const stored = validStoredSlot(slots[slot]);
      if (stored) mapping[slot] = stored;
    }
    store.worlds[worldId] = mapping;
  }
  return store;
}

function normalizeNamedOptions(value: unknown): { value: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (typeof option === "string" && option.length > 0) return [{ value: option, label: option }];
    if (!isRecord(option)) return [];
    const optionValue = asString(option.value);
    if (!optionValue) return [];
    return [{ value: optionValue, label: asString(option.name) ?? asString(option.label) ?? optionValue }];
  });
}

function normalizeConfigOptions(value: unknown): AgentConfigOption[] {
  const items = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.options) ? value.options : [];
  return items.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = asString(item.id);
    if (!id) return [];
    const options = Array.isArray(item.options) ? item.options.flatMap((option) => {
      if (!isRecord(option)) return [];
      const optionValue = asString(option.value);
      if (!optionValue) return [];
      return [{
        value: optionValue,
        label: asString(option.name) ?? asString(option.label) ?? optionValue,
        ...(asString(option["description"]) ? { description: asString(option["description"]) as string } : {})
      }];
    }) : [];
    return [{
      id,
      ...(asString(item.name) ? { name: asString(item.name) as string } : {}),
      ...(asString(item.category) ? { category: asString(item.category) as string } : {}),
      ...(asString(item.currentValue) ? { currentValue: asString(item.currentValue) as string } : {}),
      options
    }];
  });
}

function normalizeCapabilities(value: unknown): AgentCapabilities[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const agents: AgentCapabilities[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const name = asString(item.name) ?? id;
    if (!id || !name) continue;
    const caps = isRecord(item.caps) ? item.caps : undefined;
    const rawConfigOptions = Array.isArray(caps?.["config_options"]) ? caps["config_options"] : [];
    const modelConfig = rawConfigOptions.find((option): option is LooseRecord =>
      isRecord(option) && (option.category === "model" || option.id === "model"));
    const modeConfig = rawConfigOptions.find((option): option is LooseRecord =>
      isRecord(option) && (option.category === "mode" || option.id === "mode"));
    const models = normalizeNamedOptions(caps?.models).length
      ? normalizeNamedOptions(caps?.models)
      : normalizeNamedOptions(isRecord(modelConfig) ? modelConfig.options : undefined).length
        ? normalizeNamedOptions(isRecord(modelConfig) ? modelConfig.options : undefined)
        : normalizeNamedOptions(item.extra_models);
    const modes = normalizeNamedOptions(caps?.modes).length
      ? normalizeNamedOptions(caps?.modes)
      : normalizeNamedOptions(isRecord(modeConfig) ? modeConfig.options : undefined);
    const configOptions = normalizeConfigOptions(caps?.["config_options"]);
    agents.push({
      id,
      name,
      available: item.available === true,
      models,
      modes,
      ...(configOptions.length ? { configOptions } : {})
    });
  }
  return agents.length ? agents : undefined;
}

function normalizeToolStatus(value: unknown): "started" | "finished" | "failed" {
  const status = asString(value)?.toLowerCase() ?? "";
  if (["completed", "complete", "finished", "success", "succeeded", "done"].includes(status)) return "finished";
  if (["failed", "failure", "error", "cancelled", "canceled"].includes(status)) return "failed";
  return "started";
}

function normalizePermissionOptions(value: unknown): { id: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    if (typeof option === "string" && option.length > 0) return [{ id: option, label: option }];
    if (!isRecord(option)) return [];
    const id = asString(option.option_id) ?? asString(option.id) ?? asString(option.value);
    if (!id) return [];
    return [{ id, label: asString(option.label) ?? asString(option.name) ?? id }];
  });
}

export function normalizeDaemonEvent(value: unknown): AgentEvent | undefined {
  if (!isRecord(value)) return undefined;
  const type = asString(value.type);
  const ts = eventTimestamp(value);
  if (!type) return undefined;

  let candidate: unknown;
  switch (type) {
    case "user_message":
      if (!asString(value.text)) return undefined;
      candidate = { kind: "user_message", text: value.text, ts };
      break;
    case "agent_text":
      if (!asString(value.text)) return undefined;
      candidate = { kind: "agent_message", text: value.text, ts };
      break;
    case "agent_message_chunk":
    case "agent_text_chunk":
    case "agent_chunk":
      if (!asString(value.text)) return undefined;
      candidate = { kind: "agent_chunk", text: value.text, ts };
      break;
    case "agent_thought":
      // The control-plane contract has no separate thought event. Thoughts are
      // exposed as chunks so the browser can render them collapsibly without
      // confusing them for final agent messages.
      if (!asString(value.text)) return undefined;
      candidate = { kind: "agent_chunk", text: value.text, ts };
      break;
    case "tool_call":
    case "tool_call_update": {
      const detail = asString(value.excerpt) ?? asString(value.input) ?? asString(value.diff);
      candidate = {
        kind: "tool_call",
        name: asString(value.title) ?? asString(value.kind) ?? asString(value.name) ?? "tool",
        status: normalizeToolStatus(value.status),
        ...(detail ? { detail: detail.slice(0, 4_000) } : {}),
        ts
      };
      break;
    }
    case "permission_request": {
      const detail = asString(value.detail);
      candidate = {
        kind: "permission_request",
        requestId: asString(value.request_id) ?? "",
        tool: asString(value.title) ?? asString(value.kind) ?? "permission",
        ...(detail ? { detail: detail.slice(0, 4_000) } : {}),
        options: normalizePermissionOptions(value.options),
        ts
      };
      break;
    }
    case "question_request": {
      const options = normalizePermissionOptions(value.options);
      candidate = {
        kind: "question",
        requestId: asString(value.request_id) ?? "",
        question: asString(value.message) ?? asString(value.question) ?? asString(value.detail) ?? "Agent question",
        ...(options.length ? { options } : {}),
        ...(value["schema"] !== undefined ? { schema: value["schema"] } : {}),
        ts
      };
      break;
    }
    case "permission_resolved":
    case "question_resolved":
      if (!asString(value.request_id)) return undefined;
      candidate = { kind: "permission_resolved", requestId: value.request_id, ts };
      break;
    case "status_changed": {
      const state = asString(value.state) ?? "";
      candidate = {
        kind: "status",
        busy: state === "working" || state === "compacting",
        alive: !["dead", "asleep", "interrupted"].includes(state),
        ts
      };
      break;
    }
    case "error":
      if (!asString(value.message)) return undefined;
      candidate = { kind: "error", message: value.message, ts };
      break;
    case "session_cleared":
      candidate = { kind: "cleared", ts };
      break;
    case "system": {
      const text = asString(value.text) ?? "";
      if (/compact(ed|ion)?\s+(done|complete)|context compacted/i.test(text)) {
        candidate = { kind: "compacted", ts };
      } else {
        return undefined;
      }
      break;
    }
    default:
      return undefined;
  }

  const parsed = AgentEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export class AgentControlSlotManager {
  private readonly statePath: string;
  private readonly clients = new Set<BridgeClient>();
  private readonly slots = new Map<string, RuntimeSlot>();
  private readonly sessionIndex = new Map<string, string>();
  private readonly subscriptions = new Set<string>();
  private readonly subscriptionsInFlight = new Set<string>();
  private readonly eventBuffers = new Map<string, AgentEvent[]>();
  private store: SlotStore = { version: 1, worlds: {} };
  private storeLoadPromise: Promise<void> | undefined;
  private writeQueue: Promise<void> = Promise.resolve();
  private operationQueue: Promise<void> = Promise.resolve();
  private capabilitiesCache: { expiresAt: number; agents: AgentCapabilities[] } | undefined;
  private daemonHealth: DaemonConnectionState;

  constructor(private readonly options: AgentControlSlotManagerOptions) {
    this.statePath = options.statePath ?? DEFAULT_STATE_PATH;
    this.daemonHealth = { state: options.daemon.isConnected?.() === true ? "connected" : "disconnected" };
    options.daemon.on("push", (push: DaemonPush) => this.handlePush(push));
    options.daemon.on("connection-state", (state: unknown) => this.handleDaemonConnectionState(state));
    options.daemon.on("connected", () => {
      this.subscriptions.clear();
      void this.restoreSubscriptions().catch((error: unknown) => {
        this.options.logger.warn({ error: errorMessage(error) }, "Unable to restore AgentControl subscriptions");
      });
    });
    options.daemon.on("disconnected", () => {
      this.subscriptions.clear();
      for (const state of this.slots.values()) state.alive = false;
      this.broadcastAllSlots();
    });
  }

  async start(): Promise<void> {
    await this.loadStore();
    void this.reattachStoredSessions().catch((error: unknown) => {
      this.options.logger.warn({ error: errorMessage(error) }, "Unable to reattach stored AgentControl sessions");
    });
  }

  registerClient(worldId: string, send: (message: AgentControlServerMessage) => void): () => void {
    this.assertWorld(worldId);
    const client: BridgeClient = { worldId, send };
    this.clients.add(client);
    this.send(client, this.daemonHealthMessage());
    this.send(client, { type: "agentcontrol.slots", slots: this.listSlots(worldId) });
    for (const slot of SLOTS) {
      const state = this.runtimeSlot(worldId, slot);
      if (state.configOptions) {
        this.send(client, { type: "agentcontrol.configOptions", slot, options: state.configOptions });
      }
    }
    return () => this.clients.delete(client);
  }

  async handleMessage(
    worldId: string,
    raw: unknown,
    send: (message: AgentControlServerMessage) => void
  ): Promise<void> {
    // Browser actions are independent messages, but the module intentionally
    // fires ensureSlot immediately followed by prompt/steer. Serialize control
    // operations so provisioning completes before the next command inspects
    // the scoped session mapping.
    const operation = this.operationQueue.then(() => this.handleMessageInner(worldId, raw, send));
    this.operationQueue = operation.catch(() => undefined);
    await operation;
  }

  private async handleMessageInner(
    worldId: string,
    raw: unknown,
    send: (message: AgentControlServerMessage) => void
  ): Promise<void> {
    let message: AgentControlClientMessage;
    try {
      message = AgentControlClientMessageSchema.parse(raw);
    } catch {
      send({ type: "agentcontrol.error", code: "INVALID_MESSAGE", message: "Invalid AgentControl control message" });
      return;
    }

    const slot = "slot" in message ? message.slot : undefined;
    try {
      this.assertWorld(worldId);
      await this.loadStore();
      switch (message.type) {
        case "agentcontrol.getCapabilities":
          send(await this.capabilitiesMessage());
          break;
        case "agentcontrol.listAgents":
          send(await this.agentsMessage());
          break;
        case "agentcontrol.modelCatalog":
          send(await this.modelCatalogMessage(message.agent));
          break;
        case "agentcontrol.listSlots":
          send({ type: "agentcontrol.slots", slots: this.listSlots(worldId) });
          break;
        case "agentcontrol.ensureSlot":
          await this.ensureSlot(worldId, message.slot, message);
          this.broadcastSlots(worldId);
          break;
        case "agentcontrol.destroySlot":
          await this.destroySlot(worldId, message.slot);
          this.broadcastSlots(worldId);
          break;
        case "agentcontrol.prompt":
          await this.controlSlot(worldId, message.slot, "send", { text: message.text });
          break;
        case "agentcontrol.steer":
          await this.controlSlot(worldId, message.slot, "send", { text: message.text, steer: true });
          break;
        case "agentcontrol.cancel":
          await this.controlSlot(worldId, message.slot, "cancel", {});
          break;
        case "agentcontrol.clear":
          await this.controlSlot(worldId, message.slot, "clear_session", {});
          break;
        case "agentcontrol.compact":
          // There is intentionally no daemon compact RPC: AgentControl exposes
          // compaction as the session command /compact.
          await this.controlSlot(worldId, message.slot, "send", { text: "/compact" });
          break;
        case "agentcontrol.respond":
          await this.controlSlot(worldId, message.slot, "respond", {
            request_id: message.requestId,
            ...(message.optionId ? { option_id: message.optionId } : {}),
            ...(message.answer !== undefined ? { answer: message.answer } : {})
          });
          break;
        case "agentcontrol.setModel":
          await this.controlSlot(worldId, message.slot, "set_model", { model: message.model });
          await this.updateStoredSlot(worldId, message.slot, { model: message.model });
          break;
        case "agentcontrol.setMode":
          await this.controlSlot(worldId, message.slot, "set_mode", { mode: message.mode });
          await this.updateStoredSlot(worldId, message.slot, { mode: message.mode });
          break;
        case "agentcontrol.setConfig":
        case "agentcontrol.setConfigOption":
          await this.controlSlot(worldId, message.slot, "set_config_option", {
            config_id: message.configId,
            value: message.value
          });
          break;
        case "agentcontrol.getState":
          this.sendSlotState(worldId, message.slot, send);
          break;
      }
    } catch (error) {
      this.options.logger.warn({ error: errorMessage(error), op: message.type }, "AgentControl control operation failed");
      send({
        type: "agentcontrol.error",
        ...(slot ? { slot } : {}),
        code: isUnknownSession(error) ? "SESSION_NOT_FOUND" : "OPERATION_FAILED",
        message: errorMessage(error),
        op: message.type
      });
    }
  }

  listSlots(worldId: string): AgentSlotState[] {
    this.assertWorld(worldId);
    return SLOTS.map((slot) => this.publicState(this.runtimeSlot(worldId, slot)));
  }

  async ensureSlot(
    worldId: string,
    slot: AgentSlot,
    options: { agent?: string | undefined; model?: string | undefined; mode?: string | undefined } = {}
  ): Promise<AgentSlotState> {
    this.assertWorld(worldId);
    await this.loadStore();
    const existing = this.store.worlds[worldId]?.[slot];
    if (existing) {
      try {
        const info = await this.options.daemon.request("session_info", { session: existing.sessionId });
        const state = this.runtimeSlot(worldId, slot);
        this.installStoredSession(state, existing);
        this.applySessionInfo(state, info);
        await this.subscribe(state, state.lastSeq > 0);
        await this.persistStore();
        return this.publicState(state);
      } catch (error) {
        if (!isUnknownSession(error)) throw error;
      }
    }

    const agent = options.agent ?? existing?.agent ?? await this.defaultAgent();
    const model = options.model ?? existing?.model;
    const mode = options.mode ?? existing?.mode;
    const worldWorkspace = path.join(this.options.workspaceRoot, sanitizePathComponent(worldId));
    await mkdir(worldWorkspace, { recursive: true });

    const request: Record<string, unknown> = {
      agent,
      cwd: worldWorkspace,
      title: `Foundry ${worldId} Agent ${slot}`,
      ...(model ? { model } : {}),
      ...(mode ? { mode } : {})
    };
    // The daemon silently ignores new_session.mcpServers. Foundry MCP access is
    // therefore configured at the workspace/agent level rather than injected here.
    const created = await this.options.daemon.request("new_session", request);
    const sessionId = isRecord(created) ? asString(created.session) : undefined;
    if (!sessionId) throw new Error("AgentControl daemon did not return a session id");

    const stored: StoredSlot = {
      sessionId,
      agent,
      ...(model ? { model } : {}),
      ...(mode ? { mode } : {})
    };
    this.mappingFor(worldId)[slot] = stored;
    await this.persistStore();

    const state = this.runtimeSlot(worldId, slot);
    this.installStoredSession(state, stored);
    await this.subscribe(state, false);
    try {
      this.applySessionInfo(state, await this.options.daemon.request("session_info", { session: sessionId }));
    } catch (error) {
      this.options.logger.warn({ error: errorMessage(error), slot }, "Unable to read initial AgentControl session state");
    }
    return this.publicState(state);
  }

  async destroySlot(worldId: string, slot: AgentSlot): Promise<void> {
    this.assertWorld(worldId);
    await this.loadStore();
    const stored = this.store.worlds[worldId]?.[slot];
    if (!stored) {
      this.resetRuntimeSlot(worldId, slot);
      return;
    }
    try {
      await this.options.daemon.request("sleep_session", { session: stored.sessionId });
    } catch (error) {
      if (!isUnknownSession(error)) throw error;
    }
    delete this.mappingFor(worldId)[slot];
    await this.persistStore();
    this.resetRuntimeSlot(worldId, slot);
  }

  private async controlSlot(
    worldId: string,
    slot: AgentSlot,
    req: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    const sessionId = await this.scopedSessionId(worldId, slot);
    await this.options.daemon.request(req, { session: sessionId, ...fields });
  }

  private async scopedSessionId(worldId: string, slot: AgentSlot): Promise<string> {
    this.assertWorld(worldId);
    await this.loadStore();
    const stored = this.store.worlds[worldId]?.[slot];
    if (!stored?.sessionId) throw new Error(`AgentControl slot ${slot} is not provisioned`);
    const state = this.runtimeSlot(worldId, slot);
    if (state.sessionId !== stored.sessionId) this.installStoredSession(state, stored);
    return stored.sessionId;
  }

  private sendSlotState(
    worldId: string,
    slot: AgentSlot,
    send: (message: AgentControlServerMessage) => void
  ): void {
    send({ type: "agentcontrol.slots", slots: this.listSlots(worldId) });
    const state = this.runtimeSlot(worldId, slot);
    if (state.configOptions) send({ type: "agentcontrol.configOptions", slot, options: state.configOptions });
    const buffered = this.eventBuffers.get(this.key(worldId, slot)) ?? [];
    for (const event of buffered) send({ type: "agentcontrol.event", slot, event });
  }

  private async capabilitiesMessage(): Promise<AgentControlServerMessage> {
    const now = Date.now();
    if (this.capabilitiesCache && this.capabilitiesCache.expiresAt > now) {
      return this.capabilitiesMessageFrom(this.capabilitiesCache.agents);
    }
    let agents: AgentCapabilities[] | undefined;
    try {
      const result = await this.options.daemon.request("list_agents");
      agents = normalizeCapabilities(result);
    } catch (error) {
      this.options.logger.warn({ error: errorMessage(error) }, "Unable to query AgentControl agent capabilities");
    }
    const capabilities = agents ?? FALLBACK_CAPABILITIES;
    this.capabilitiesCache = { expiresAt: now + 30_000, agents: capabilities };
    return this.capabilitiesMessageFrom(capabilities);
  }

  private capabilitiesMessageFrom(agents: AgentCapabilities[]): AgentControlServerMessage {
    const suggested = agents.find((agent) => agent.available) ?? agents[0];
    return {
      type: "agentcontrol.capabilities",
      agents,
      ...(suggested ? { suggestedAgent: suggested.id } : {}),
      ...(suggested?.models[0] ? { suggestedModel: suggested.models[0].value } : {}),
      ...(suggested?.modes[0] ? { suggestedMode: suggested.modes[0].value } : {})
    };
  }

  private async defaultAgent(): Promise<string> {
    const message = await this.capabilitiesMessage();
    return message.type === "agentcontrol.capabilities" ? message.suggestedAgent ?? "devin" : "devin";
  }

  private async agentsMessage(): Promise<AgentControlServerMessage> {
    const result = await this.options.daemon.request("list_agents");
    const agents = normalizeCapabilities(result);
    if (!agents) throw new Error("AgentControl daemon returned no agent capabilities");
    return { type: "agentcontrol.agents", agents };
  }

  private async modelCatalogMessage(agent: string): Promise<AgentControlServerMessage> {
    const result = await this.options.daemon.request("model_catalog", { agent });
    const models = isRecord(result) ? normalizeNamedOptions(result.models) : [];
    return { type: "agentcontrol.modelCatalog", agent, models };
  }

  private handlePush(push: DaemonPush): void {
    if (push.push !== "event" || typeof push.session !== "string") return;
    const key = this.sessionIndex.get(push.session);
    if (!key) return;
    const state = this.slots.get(key);
    if (!state) return;
    const sequence = isRecord(push.event) ? asNumber(push.event.seq) : undefined;
    if (sequence !== undefined && sequence <= state.lastSeq) return;
    const before = JSON.stringify(this.publicState(state));
    this.updateRuntimeFromDaemonEvent(state.worldId, state.slot, push.event);
    const normalized = normalizeDaemonEvent(push.event);
    if (normalized) {
      this.appendEvent(state, normalized);
      this.broadcast(state.worldId, { type: "agentcontrol.event", slot: state.slot, event: normalized });
    }
    if (JSON.stringify(this.publicState(state)) !== before) this.broadcastSlots(state.worldId);
  }

  private appendEvent(state: RuntimeSlot, event: AgentEvent): void {
    const key = this.key(state.worldId, state.slot);
    if (event.kind === "cleared") this.eventBuffers.delete(key);
    const buffer = this.eventBuffers.get(key) ?? [];
    buffer.push(event);
    if (buffer.length > 500) buffer.splice(0, buffer.length - 500);
    this.eventBuffers.set(key, buffer);
  }

  private updateRuntimeFromDaemonEvent(worldId: string, slot: AgentSlot, value: unknown): void {
    if (!isRecord(value)) return;
    const state = this.slots.get(this.key(worldId, slot));
    if (!state) return;
    const seq = asNumber(value.seq);
    if (seq !== undefined) state.lastSeq = Math.max(state.lastSeq, seq);
    switch (asString(value.type)) {
      case "status_changed": {
        const sessionState = asString(value.state) ?? "";
        state.busy = sessionState === "working" || sessionState === "compacting";
        state.alive = !["dead", "asleep", "interrupted"].includes(sessionState);
        break;
      }
      case "usage_update": {
        const used = asNumber(value.used);
        const size = asNumber(value.size);
        if (used !== undefined) state.contextUsed = used;
        if (size !== undefined) state.contextSize = size;
        break;
      }
      case "mode_changed": {
        const mode = asString(value.mode);
        if (mode) state.mode = mode;
        break;
      }
      case "config_options": {
        if (!Array.isArray(value.options)) break;
        state.configOptions = normalizeConfigOptions(value.options);
        this.broadcast(state.worldId, {
          type: "agentcontrol.configOptions",
          slot: state.slot,
          options: state.configOptions
        });
        for (const option of value.options) {
          if (!isRecord(option)) continue;
          const current = asString(option.currentValue);
          if (!current) continue;
          if (option.id === "model" || option.category === "model") state.model = current;
          if (option.id === "mode" || option.category === "mode") state.mode = current;
        }
        break;
      }
      case "session_deleted":
        state.alive = false;
        state.busy = false;
        break;
      case "session_cleared":
        delete state.contextUsed;
        break;
    }
  }

  private applySessionInfo(state: RuntimeSlot, value: unknown): void {
    if (!isRecord(value)) return;
    state.alive = value.alive === true;
    const meta = isRecord(value.meta) ? value.meta : undefined;
    if (!meta) return;
    const agent = asString(meta.agent);
    const model = asString(meta.model);
    const mode = asString(meta.mode);
    const title = asString(meta.title);
    const contextUsed = asNumber(meta.context_used);
    const contextSize = asNumber(meta.context_size);
    const sessionState = asString(meta.state) ?? "";
    if (agent) state.agent = agent;
    if (model) state.model = model;
    if (mode) state.mode = mode;
    if (title) state.title = title;
    if (contextUsed !== undefined) state.contextUsed = contextUsed;
    if (contextSize !== undefined) state.contextSize = contextSize;
    if (meta["config_options"] !== undefined) {
      state.configOptions = normalizeConfigOptions(meta["config_options"]);
      this.broadcast(state.worldId, {
        type: "agentcontrol.configOptions",
        slot: state.slot,
        options: state.configOptions
      });
    }
    state.busy = sessionState === "working" || sessionState === "compacting";
    if (["dead", "asleep", "interrupted"].includes(sessionState)) state.alive = false;
  }

  private installStoredSession(state: RuntimeSlot, stored: StoredSlot): void {
    if (state.sessionId && state.sessionId !== stored.sessionId) {
      this.sessionIndex.delete(state.sessionId);
      this.eventBuffers.delete(this.key(state.worldId, state.slot));
    }
    state.sessionId = stored.sessionId;
    state.agent = stored.agent;
    if (stored.model) state.model = stored.model;
    if (stored.mode) state.mode = stored.mode;
    state.title = `Foundry ${state.worldId} Agent ${state.slot}`;
    state.alive = true;
    this.sessionIndex.set(stored.sessionId, this.key(state.worldId, state.slot));
  }

  private resetRuntimeSlot(worldId: string, slot: AgentSlot): void {
    const key = this.key(worldId, slot);
    const previous = this.slots.get(key);
    if (previous?.sessionId) {
      this.sessionIndex.delete(previous.sessionId);
      this.subscriptions.delete(`${previous.sessionId}`);
    }
    this.eventBuffers.delete(key);
    this.slots.set(key, { worldId, slot, alive: false, busy: false, lastSeq: 0 });
  }

  private async subscribe(state: RuntimeSlot, incremental: boolean): Promise<void> {
    if (!state.sessionId) return;
    const key = state.sessionId;
    if (this.subscriptions.has(key) || this.subscriptionsInFlight.has(key)) return;
    this.subscriptionsInFlight.add(key);
    try {
      await this.options.daemon.request("subscribe", {
        session: state.sessionId,
        ...(incremental && state.lastSeq > 0 ? { after_seq: state.lastSeq } : {})
      });
      this.subscriptions.add(key);
    } finally {
      this.subscriptionsInFlight.delete(key);
    }
  }

  private async restoreSubscriptions(): Promise<void> {
    for (const state of this.slots.values()) {
      if (!state.sessionId) continue;
      try {
        const info = await this.options.daemon.request("session_info", { session: state.sessionId });
        this.applySessionInfo(state, info);
        await this.subscribe(state, true);
      } catch (error) {
        if (!isUnknownSession(error)) throw error;
        this.resetRuntimeSlot(state.worldId, state.slot);
      }
    }
    this.broadcastAllSlots();
  }

  private async reattachStoredSessions(): Promise<void> {
    await this.loadStore();
    const slots = this.store.worlds[this.options.targetWorldId] ?? {};
    for (const slot of SLOTS) {
      const stored = slots[slot];
      if (!stored) continue;
      try {
        const info = await this.options.daemon.request("session_info", { session: stored.sessionId });
        const state = this.runtimeSlot(this.options.targetWorldId, slot);
        this.installStoredSession(state, stored);
        this.applySessionInfo(state, info);
        await this.subscribe(state, false);
      } catch (error) {
        if (isUnknownSession(error)) {
          delete this.mappingFor(this.options.targetWorldId)[slot];
          await this.persistStore();
          this.resetRuntimeSlot(this.options.targetWorldId, slot);
        } else {
          this.options.logger.warn({ error: errorMessage(error), slot }, "Unable to reattach AgentControl slot");
        }
      }
    }
    this.broadcastAllSlots();
  }

  private async updateStoredSlot(worldId: string, slot: AgentSlot, patch: { model?: string; mode?: string }): Promise<void> {
    await this.loadStore();
    const stored = this.store.worlds[worldId]?.[slot];
    if (!stored) return;
    if (patch.model) stored.model = patch.model;
    if (patch.mode) stored.mode = patch.mode;
    const state = this.runtimeSlot(worldId, slot);
    if (patch.model) state.model = patch.model;
    if (patch.mode) state.mode = patch.mode;
    await this.persistStore();
    this.broadcastSlots(worldId);
  }

  private runtimeSlot(worldId: string, slot: AgentSlot): RuntimeSlot {
    const key = this.key(worldId, slot);
    let state = this.slots.get(key);
    if (!state) {
      state = { worldId, slot, alive: false, busy: false, lastSeq: 0 };
      this.slots.set(key, state);
    }
    return state;
  }

  private publicState(state: RuntimeSlot): AgentSlotState {
    return {
      slot: state.slot,
      ...(state.sessionId ? { sessionId: state.sessionId } : {}),
      ...(state.agent ? { agent: state.agent } : {}),
      ...(state.model ? { model: state.model } : {}),
      ...(state.mode ? { mode: state.mode } : {}),
      ...(state.title ? { title: state.title } : {}),
      alive: state.alive,
      busy: state.busy,
      ...(state.contextUsed !== undefined ? { contextUsed: state.contextUsed } : {}),
      ...(state.contextSize !== undefined ? { contextSize: state.contextSize } : {})
    };
  }

  private key(worldId: string, slot: AgentSlot): string {
    return `${worldId}:${slot}`;
  }

  private assertWorld(worldId: string): void {
    if (worldId !== this.options.targetWorldId) throw new Error("AgentControl slots are scoped to the configured Foundry world");
  }

  private mappingFor(worldId: string): SlotMapping {
    this.store.worlds[worldId] ??= {};
    return this.store.worlds[worldId];
  }

  private async loadStore(): Promise<void> {
    this.storeLoadPromise ??= (async () => {
      try {
        const raw = await readFile(this.statePath, "utf8");
        this.store = normalizeStore(JSON.parse(raw));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          this.options.logger.warn({ error: errorMessage(error) }, "Ignoring unreadable AgentControl slot store");
        }
        this.store = { version: 1, worlds: {} };
      }
    })();
    await this.storeLoadPromise;
  }

  private async persistStore(): Promise<void> {
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(path.dirname(this.statePath), { recursive: true });
      const temporary = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(this.store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, this.statePath);
    });
    await this.writeQueue;
  }

  private handleDaemonConnectionState(value: unknown): void {
    if (!isRecord(value)) return;
    const state = asString(value.state);
    if (state !== "connected" && state !== "disconnected" && state !== "error") return;
    const message = asString(value.message);
    if (this.daemonHealth.state === state && this.daemonHealth.message === message) return;
    this.daemonHealth = { state, ...(message ? { message } : {}) };
    this.broadcast(this.options.targetWorldId, this.daemonHealthMessage());
  }

  private daemonHealthMessage(): AgentControlServerMessage {
    return {
      type: "agentcontrol.daemonHealth",
      state: this.daemonHealth.state,
      ...(this.daemonHealth.message ? { message: this.daemonHealth.message } : {}),
      ts: Date.now()
    };
  }

  private broadcastSlots(worldId: string): void {
    this.broadcast(worldId, { type: "agentcontrol.slots", slots: this.listSlots(worldId) });
  }

  private broadcastAllSlots(): void {
    this.broadcastSlots(this.options.targetWorldId);
  }

  private broadcast(worldId: string, message: AgentControlServerMessage): void {
    for (const client of this.clients) {
      if (client.worldId === worldId) this.send(client, message);
    }
  }

  private send(client: BridgeClient, message: AgentControlServerMessage): void {
    try {
      client.send(message);
    } catch (error) {
      this.options.logger.warn({ error: errorMessage(error) }, "Unable to send AgentControl control message");
    }
  }
}
