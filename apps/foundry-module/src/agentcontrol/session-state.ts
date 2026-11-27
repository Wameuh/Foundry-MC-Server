import type {
  AgentCapabilities,
  AgentConfigOption,
  AgentControlServerMessage,
  AgentEvent,
  AgentSlot,
  AgentSlotState,
  DaemonHealthState,
} from "@foundry-mcp/protocol";

export const AGENT_SLOTS: readonly AgentSlot[] = ["A", "B"];
const MAX_TRANSCRIPT_ENTRIES = 500;

export type SlotPreference = {
  agent?: string;
  model?: string;
  mode?: string;
};

export type AgentControlPreferences = Partial<Record<AgentSlot, SlotPreference>>;

export type TranscriptEntry = {
  id: number;
  ts: number;
} & (
  | { kind: "user"; text: string; local?: boolean; steered?: boolean }
  | { kind: "agent"; text: string; streaming?: boolean; activity?: boolean }
  | { kind: "tool"; name: string; status: "started" | "finished" | "failed"; detail?: string }
  | { kind: "error"; text: string }
  | { kind: "system"; text: string }
  | {
      kind: "permission";
      requestId: string;
      tool: string;
      detail?: string;
      options: Array<{ id: string; label: string }>;
      resolved: boolean;
    }
  | {
      kind: "question";
      requestId: string;
      question: string;
      options?: Array<{ id: string; label: string }>;
      schema?: unknown;
      resolved: boolean;
    }
);

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type TranscriptEntryInput = DistributiveOmit<TranscriptEntry, "id">;
type ToolTranscriptEntryInput = Omit<Extract<TranscriptEntry, { kind: "tool" }>, "id">;

export type AgentControlPanelSnapshot = {
  connected: boolean;
  activeSlot: AgentSlot;
  agents: AgentCapabilities[];
  suggestedAgent?: string;
  suggestedModel?: string;
  suggestedMode?: string;
  slots: Record<AgentSlot, AgentSlotState>;
  configOptions: Record<AgentSlot, AgentConfigOption[]>;
  pendingConfig: Record<AgentSlot, Record<string, string>>;
  entries: Record<AgentSlot, TranscriptEntry[]>;
  unread: Record<AgentSlot, number>;
  daemonHealth?: {
    state: DaemonHealthState;
    message?: string;
    ts: number;
  };
  errorBanner?: string;
};

export type Selection = {
  agent?: string;
  model?: string;
  mode?: string;
};

type StoreListener = () => void;

type StoreOptions = {
  sendControl: (message: unknown) => void;
  loadPreferences?: () => unknown;
  savePreferences?: (preferences: AgentControlPreferences) => void;
  now?: () => number;
};

function emptySlot(slot: AgentSlot): AgentSlotState {
  return { slot, alive: false, busy: false };
}

function emptyEntries(): Record<AgentSlot, TranscriptEntry[]> {
  return { A: [], B: [] };
}

function emptySlots(): Record<AgentSlot, AgentSlotState> {
  return { A: emptySlot("A"), B: emptySlot("B") };
}

function emptyConfigOptions(): Record<AgentSlot, AgentConfigOption[]> {
  return { A: [], B: [] };
}

function emptyPendingConfig(): Record<AgentSlot, Record<string, string>> {
  return { A: {}, B: {} };
}

export function normalizePreferences(value: unknown): AgentControlPreferences {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const output: AgentControlPreferences = {};
  for (const slot of AGENT_SLOTS) {
    const raw = input[slot];
    if (!raw || typeof raw !== "object") continue;
    const preference = raw as Record<string, unknown>;
    const normalized: SlotPreference = {};
    if (typeof preference.agent === "string" && preference.agent) normalized.agent = preference.agent;
    if (typeof preference.model === "string" && preference.model) normalized.model = preference.model;
    if (typeof preference.mode === "string" && preference.mode) normalized.mode = preference.mode;
    if (Object.keys(normalized).length) output[slot] = normalized;
  }
  return output;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function eventFingerprint(event: AgentEvent): string {
  return stableJson(event);
}

/**
 * UI-facing reducer for the AgentControl control plane. The wire contract has
 * no event sequence ids, so replayed getState batches are deduplicated by
 * stable event fingerprints before being reduced into transcript entries.
 */
export class AgentControlPanelStore {
  private readonly sendControl: (message: unknown) => void;
  private readonly savePreferences?: ((preferences: AgentControlPreferences) => void) | undefined;
  private readonly now: () => number;
  private readonly listeners = new Set<StoreListener>();
  private readonly eventFingerprints: Record<AgentSlot, Set<string>> = {
    A: new Set(),
    B: new Set(),
  };
  private preferences: AgentControlPreferences;
  private nextEntryId = 1;
  private snapshotRequestPending = false;
  private snapshotValue: AgentControlPanelSnapshot;

  constructor(options: StoreOptions) {
    this.sendControl = options.sendControl;
    this.savePreferences = options.savePreferences;
    this.now = options.now ?? (() => Date.now());
    this.preferences = normalizePreferences(options.loadPreferences?.());
    this.snapshotValue = {
      connected: false,
      activeSlot: "A",
      agents: [],
      slots: emptySlots(),
      configOptions: emptyConfigOptions(),
      pendingConfig: emptyPendingConfig(),
      entries: emptyEntries(),
      unread: { A: 0, B: 0 },
    };
  }

  get snapshot(): AgentControlPanelSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (!this.snapshotValue.connected) {
      this.snapshotRequestPending = true;
      this.requestSnapshot();
    }
  }

  setConnected(connected: boolean): void {
    const wasConnected = this.snapshotValue.connected;
    if (wasConnected !== connected) {
      this.snapshotValue.connected = connected;
      this.emit();
    }
    if (connected && !wasConnected) {
      if (this.snapshotRequestPending) this.snapshotRequestPending = false;
      else this.requestSnapshot();
    }
  }

  requestSnapshot(): void {
    this.sendControl({ type: "agentcontrol.getCapabilities" });
    for (const slot of AGENT_SLOTS) this.sendControl({ type: "agentcontrol.getState", slot });
  }

  setActiveSlot(slot: AgentSlot): void {
    this.snapshotValue.activeSlot = slot;
    this.snapshotValue.unread[slot] = 0;
    this.emit();
  }

  handleServerMessage(message: AgentControlServerMessage): void {
    switch (message.type) {
      case "agentcontrol.capabilities":
        this.snapshotValue.agents = message.agents;
        if (message.suggestedAgent !== undefined) this.snapshotValue.suggestedAgent = message.suggestedAgent;
        else delete this.snapshotValue.suggestedAgent;
        if (message.suggestedModel !== undefined) this.snapshotValue.suggestedModel = message.suggestedModel;
        else delete this.snapshotValue.suggestedModel;
        if (message.suggestedMode !== undefined) this.snapshotValue.suggestedMode = message.suggestedMode;
        else delete this.snapshotValue.suggestedMode;
        break;
      case "agentcontrol.agents":
        this.snapshotValue.agents = message.agents;
        break;
      case "agentcontrol.configOptions":
        this.snapshotValue.configOptions[message.slot] = message.options;
        this.clearSettledPendingConfig(message.slot);
        break;
      case "agentcontrol.daemonHealth":
        this.snapshotValue.daemonHealth = {
          state: message.state,
          ...(message.message !== undefined ? { message: message.message } : {}),
          ts: message.ts,
        };
        break;
      case "agentcontrol.modelCatalog":
        // Catalog responses are available to consumers that request them; the
        // slot-scoped dynamic selectors are driven by configOptions instead.
        break;
      case "agentcontrol.slots": {
        // listSlots is a complete inventory: slots omitted by the server no
        // longer exist and must not remain sticky in the UI.
        const slots = emptySlots();
        for (const slot of message.slots) slots[slot.slot] = slot;
        this.snapshotValue.slots = slots;
        for (const slot of AGENT_SLOTS) {
          if (!slots[slot].sessionId) {
            this.snapshotValue.configOptions[slot] = [];
            this.snapshotValue.pendingConfig[slot] = {};
          }
        }
        break;
      }
      case "agentcontrol.event":
        this.applyEvent(message.slot, message.event);
        break;
      case "agentcontrol.error":
        if (message.slot) {
          if (message.op === "agentcontrol.setConfig" || message.op === "agentcontrol.setConfigOption") {
            this.clearRejectedPendingConfig(message.slot, message.message);
          }
          this.appendEntry(message.slot, { kind: "error", text: message.message, ts: this.now() });
        } else {
          this.snapshotValue.errorBanner = message.message;
        }
        break;
    }
    this.emit();
  }

  dismissError(): void {
    delete this.snapshotValue.errorBanner;
    this.emit();
  }

  resolveSelection(slot: AgentSlot): Selection {
    const preference = this.preferences[slot] ?? {};
    const slotState = this.snapshotValue.slots[slot];
    const agents = this.snapshotValue.agents;
    const preferredAgent = preference.agent && (!agents.length || agents.some((agent) => agent.id === preference.agent))
      ? preference.agent
      : undefined;
    const agent = preferredAgent
      ?? (slotState.agent && agents.some((candidate) => candidate.id === slotState.agent) ? slotState.agent : undefined)
      ?? this.snapshotValue.suggestedAgent
      ?? agents.find((candidate) => candidate.available)?.id
      ?? agents[0]?.id;
    const capabilities = agent ? agents.find((candidate) => candidate.id === agent) : undefined;
    const preferredModel = preference.model && (!capabilities || capabilities.models.some((model) => model.value === preference.model))
      ? preference.model
      : undefined;
    const preferredMode = preference.mode && (!capabilities || capabilities.modes.some((mode) => mode.value === preference.mode))
      ? preference.mode
      : undefined;
    const selection: Selection = {};
    if (agent) selection.agent = agent;
    const suggestedModel = agent && agent === this.snapshotValue.suggestedAgent ? this.snapshotValue.suggestedModel : undefined;
    const suggestedMode = agent && agent === this.snapshotValue.suggestedAgent ? this.snapshotValue.suggestedMode : undefined;
    const model = preferredModel
      ?? slotState.model
      ?? suggestedModel
      ?? capabilities?.models[0]?.value;
    const mode = preferredMode
      ?? slotState.mode
      ?? suggestedMode
      ?? capabilities?.modes[0]?.value;
    if (model) selection.model = model;
    if (mode) selection.mode = mode;
    return selection;
  }

  selectAgent(slot: AgentSlot, agent: string): void {
    const capabilities = this.snapshotValue.agents.find((candidate) => candidate.id === agent);
    const preference: SlotPreference = { agent };
    const model = capabilities?.models[0]?.value ?? this.snapshotValue.suggestedModel;
    const mode = capabilities?.modes[0]?.value ?? this.snapshotValue.suggestedMode;
    if (model) preference.model = model;
    if (mode) preference.mode = mode;
    this.setPreference(slot, preference);
    this.ensureSlot(slot);
  }

  recreateSlotWithAgent(slot: AgentSlot, agent: string): void {
    this.destroy(slot);
    this.selectAgent(slot, agent);
    this.appendEntry(slot, { kind: "system", text: "Provider change requested — previous session detached; new session starting.", ts: this.now() });
    this.emit();
  }

  selectModel(slot: AgentSlot, model: string): void {
    this.setPreference(slot, { ...(this.preferences[slot] ?? {}), model });
    const modelConfig = this.findConfigOption(slot, "model");
    if (modelConfig) {
      this.selectConfigOption(slot, modelConfig.id, model);
      return;
    }
    if (this.hasSession(slot)) this.sendControl({ type: "agentcontrol.setModel", slot, model });
    else this.ensureSlot(slot);
  }

  selectMode(slot: AgentSlot, mode: string): void {
    this.setPreference(slot, { ...(this.preferences[slot] ?? {}), mode });
    const modeConfig = this.findConfigOption(slot, "mode");
    if (modeConfig) {
      this.selectConfigOption(slot, modeConfig.id, mode);
      return;
    }
    if (this.hasSession(slot)) this.sendControl({ type: "agentcontrol.setMode", slot, mode });
    else this.ensureSlot(slot);
  }

  selectConfigOption(slot: AgentSlot, configId: string, value: string): void {
    if (!configId || !value) return;
    const option = this.snapshotValue.configOptions[slot].find((candidate) => candidate.id === configId);
    const isModel = configId === "model" || option?.id === "model" || option?.category === "model";
    const isMode = configId === "mode" || option?.id === "mode" || option?.category === "mode";
    if (isModel) this.setPreference(slot, { ...(this.preferences[slot] ?? {}), model: value });
    if (isMode) this.setPreference(slot, { ...(this.preferences[slot] ?? {}), mode: value });
    if (!this.hasSession(slot)) {
      if (isModel || isMode) this.ensureSlot(slot);
      return;
    }
    this.snapshotValue.pendingConfig[slot][configId] = value;
    this.sendControl({ type: "agentcontrol.setConfigOption", slot, configId, value });
    this.emit();
  }

  findConfigOption(slot: AgentSlot, idOrCategory: string): AgentConfigOption | undefined {
    return this.snapshotValue.configOptions[slot].find((option) => option.id === idOrCategory || option.category === idOrCategory);
  }

  sendPrompt(slot: AgentSlot, text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    this.ensureSlotUnlessPresent(slot);
    this.sendControl({ type: "agentcontrol.prompt", slot, text: trimmed });
    this.appendUserEcho(slot, trimmed, false);
    return true;
  }

  sendSteer(slot: AgentSlot, text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    this.ensureSlotUnlessPresent(slot);
    this.sendControl({ type: "agentcontrol.steer", slot, text: trimmed });
    this.appendUserEcho(slot, trimmed, true);
    return true;
  }

  cancel(slot: AgentSlot): void {
    this.sendControl({ type: "agentcontrol.cancel", slot });
  }

  clear(slot: AgentSlot): void {
    this.sendControl({ type: "agentcontrol.clear", slot });
  }

  compact(slot: AgentSlot): void {
    this.sendControl({ type: "agentcontrol.compact", slot });
  }

  destroy(slot: AgentSlot): void {
    this.sendControl({ type: "agentcontrol.destroySlot", slot });
  }

  respond(slot: AgentSlot, requestId: string, response: { optionId?: string; answer?: unknown }): void {
    const message: Record<string, unknown> = { type: "agentcontrol.respond", slot, requestId };
    if (response.optionId !== undefined) message.optionId = response.optionId;
    if (response.answer !== undefined) message.answer = response.answer;
    this.sendControl(message);
  }

  ensureSlot(slot: AgentSlot): void {
    const selection = this.resolveSelection(slot);
    const message: Record<string, unknown> = { type: "agentcontrol.ensureSlot", slot };
    if (selection.agent) message.agent = selection.agent;
    if (selection.model) message.model = selection.model;
    if (selection.mode) message.mode = selection.mode;
    this.sendControl(message);
  }

  private ensureSlotUnlessPresent(slot: AgentSlot): void {
    if (!this.hasSession(slot)) this.ensureSlot(slot);
  }

  private hasSession(slot: AgentSlot): boolean {
    const state = this.snapshotValue.slots[slot];
    return state.alive || typeof state.sessionId === "string";
  }

  private setPreference(slot: AgentSlot, preference: SlotPreference): void {
    this.preferences = { ...this.preferences, [slot]: preference };
    this.savePreferences?.(this.preferences);
  }

  private clearSettledPendingConfig(slot: AgentSlot): void {
    const pending = this.snapshotValue.pendingConfig[slot];
    for (const [configId, value] of Object.entries(pending)) {
      const option = this.snapshotValue.configOptions[slot].find((candidate) => candidate.id === configId);
      if (!option || option.currentValue === value) delete pending[configId];
    }
  }

  private clearRejectedPendingConfig(slot: AgentSlot, message: string): void {
    const pending = this.snapshotValue.pendingConfig[slot];
    const match = /set_config_option(?:=|\s+)([A-Za-z0-9_-]+)/.exec(message);
    if (match?.[1] && pending[match[1]] !== undefined) delete pending[match[1]];
    else for (const configId of Object.keys(pending)) delete pending[configId];
  }

  private applyEvent(slot: AgentSlot, event: AgentEvent): void {
    const fingerprint = eventFingerprint(event);
    const seen = this.eventFingerprints[slot];
    if (seen.has(fingerprint)) return;
    if (event.kind === "cleared") seen.clear();
    seen.add(fingerprint);
    if (seen.size > 1_000) {
      const oldest = seen.values().next().value;
      if (oldest !== undefined) seen.delete(oldest);
    }

    switch (event.kind) {
      case "user_message":
        this.appendServerUserMessage(slot, event.text, event.ts);
        break;
      case "agent_message":
        this.appendAgentMessage(slot, event.text, event.ts);
        break;
      case "agent_chunk":
        this.appendAgentChunk(slot, event.text, event.ts);
        break;
      case "tool_call": {
        this.appendToolCall(slot, {
          kind: "tool",
          name: event.name,
          status: event.status,
          ts: event.ts,
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
        });
        break;
      }
      case "permission_request":
        this.appendEntry(slot, {
          kind: "permission",
          requestId: event.requestId,
          tool: event.tool,
          ...(event.detail !== undefined ? { detail: event.detail } : {}),
          options: event.options,
          resolved: false,
          ts: event.ts,
        });
        break;
      case "question":
        this.appendEntry(slot, {
          kind: "question",
          requestId: event.requestId,
          question: event.question,
          ...(event.options !== undefined ? { options: event.options } : {}),
          ...(event.schema !== undefined ? { schema: event.schema } : {}),
          resolved: false,
          ts: event.ts,
        });
        break;
      case "permission_resolved":
        this.resolveRequest(slot, event.requestId);
        break;
      case "status":
        this.snapshotValue.slots[slot] = {
          ...this.snapshotValue.slots[slot],
          alive: event.alive,
          busy: event.busy,
        };
        return;
      case "error":
        this.appendEntry(slot, { kind: "error", text: event.message, ts: event.ts });
        break;
      case "cleared":
        this.snapshotValue.entries[slot] = [{ id: this.nextEntryId++, kind: "system", text: "Transcript cleared.", ts: event.ts }];
        this.noteActivity(slot);
        break;
      case "compacted":
        this.appendEntry(slot, { kind: "system", text: "Context compacted.", ts: event.ts });
        break;
    }
  }

  private appendToolCall(slot: AgentSlot, entry: ToolTranscriptEntryInput): void {
    const entries = this.snapshotValue.entries[slot];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const existing = entries[index];
      if (existing?.kind !== "tool") continue;
      const genericUpdate = entry.name === "tool";
      if (existing.name !== entry.name && !genericUpdate) continue;
      if (existing.status !== "started" && entry.status === "started") continue;
      existing.status = entry.status;
      existing.ts = entry.ts;
      if (entry.detail !== undefined) existing.detail = entry.detail;
      this.noteActivity(slot);
      return;
    }
    this.appendEntry(slot, entry);
  }

  private appendServerUserMessage(slot: AgentSlot, text: string, ts: number): void {
    const entries = this.snapshotValue.entries[slot];
    const last = entries[entries.length - 1];
    if (last?.kind === "user" && last.local && last.text === text && ts - last.ts < 10_000) {
      delete last.local;
      return;
    }
    this.appendEntry(slot, { kind: "user", text, ts });
  }

  private appendUserEcho(slot: AgentSlot, text: string, steered: boolean): void {
    this.appendEntry(slot, { kind: "user", text, local: true, steered, ts: this.now() });
    this.emit();
  }

  private appendAgentChunk(slot: AgentSlot, text: string, ts: number): void {
    const entries = this.snapshotValue.entries[slot];
    const last = entries[entries.length - 1];
    if (last?.kind === "agent" && last.streaming) {
      if (text.startsWith(last.text)) last.text = text;
      else if (!last.text.endsWith(text)) last.text += text;
      last.ts = ts;
    } else {
      this.appendEntry(slot, { kind: "agent", text, streaming: true, activity: true, ts });
    }
    this.closeOtherStreams(slot);
  }

  private appendAgentMessage(slot: AgentSlot, text: string, ts: number): void {
    const entries = this.snapshotValue.entries[slot];
    const last = entries[entries.length - 1];
    if (last?.kind === "agent" && last.streaming) {
      const streamIsFinalPrefix = text.startsWith(last.text);
      const streamAlreadyContainsFinal = last.text === text || last.text.endsWith(text);
      if (!streamIsFinalPrefix && !streamAlreadyContainsFinal) {
        last.streaming = false;
        this.appendEntry(slot, { kind: "agent", text, ts });
        return;
      }
      if (streamIsFinalPrefix) last.text = text;
      last.streaming = false;
      delete last.activity;
      last.ts = ts;
    } else {
      this.appendEntry(slot, { kind: "agent", text, ts });
    }
    this.closeOtherStreams(slot);
  }

  private closeOtherStreams(slot: AgentSlot): void {
    const entries = this.snapshotValue.entries[slot];
    for (let index = 0; index < entries.length - 1; index += 1) {
      const entry = entries[index];
      if (entry?.kind === "agent") entry.streaming = false;
    }
  }

  private resolveRequest(slot: AgentSlot, requestId: string): void {
    for (const entry of this.snapshotValue.entries[slot]) {
      if ((entry.kind === "permission" || entry.kind === "question") && entry.requestId === requestId) {
        entry.resolved = true;
      }
    }
  }

  private appendEntry(slot: AgentSlot, entry: TranscriptEntryInput): void {
    const entries = this.snapshotValue.entries[slot];
    if (entry.kind !== "agent") {
      for (const existing of entries) {
        if (existing.kind === "agent") existing.streaming = false;
      }
    }
    entries.push({ ...entry, id: this.nextEntryId++ });
    if (entries.length > MAX_TRANSCRIPT_ENTRIES) entries.splice(0, entries.length - MAX_TRANSCRIPT_ENTRIES);
    this.noteActivity(slot);
  }

  private noteActivity(slot: AgentSlot): void {
    if (slot === this.snapshotValue.activeSlot) this.snapshotValue.unread[slot] = 0;
    else this.snapshotValue.unread[slot] += 1;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
