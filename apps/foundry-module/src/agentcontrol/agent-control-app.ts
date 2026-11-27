import type { AgentConfigOption, AgentSlot, AgentSlotState } from "@foundry-mcp/protocol";
import type { BridgeClient } from "../bridge/bridge-client";
import { loadAgentControlPreferences, saveAgentControlPreferences } from "./preferences";
import {
  AGENT_SLOTS,
  AgentControlPanelStore,
  type TranscriptEntry,
} from "./session-state";

type ApplicationV2Instance = {
  element?: HTMLElement;
  render(options?: unknown): Promise<unknown>;
  close(options?: unknown): Promise<unknown>;
  bringToFront?(): unknown;
};

type ApplicationV2Constructor = new (options?: Record<string, unknown>) => ApplicationV2Instance;

class ApplicationV2Fallback implements ApplicationV2Instance {
  element?: HTMLElement;
  render(): Promise<unknown> { return Promise.resolve(this); }
  close(): Promise<unknown> { return Promise.resolve(this); }
}

const applicationV2Base: ApplicationV2Constructor = ((globalThis as {
  foundry?: { applications?: { api?: { ApplicationV2?: ApplicationV2Constructor } } };
}).foundry?.applications?.api?.ApplicationV2 ?? ApplicationV2Fallback);

type AgentControlAppOptions = {
  bridgeClient: BridgeClient;
  onClosed?: () => void;
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cssEscape(value: string): string {
  const css = (globalThis as { CSS?: { escape?: (input: string) => string } }).CSS;
  if (css?.escape) return css.escape(value);
  return value.replace(/["\\\]]/g, "\\$&");
}

function formatText(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function optionTags(options: Array<{ value: string; label: string; description?: string | undefined }>, selected: string | undefined): string {
  return options.map((option) => {
    const isSelected = option.value === selected ? " selected" : "";
    const title = option.description ? ` title="${escapeHtml(option.description)}"` : "";
    return `<option value="${escapeHtml(option.value)}"${isSelected}${title}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function formatTime(ts: number): string {
  if (!ts) return "";
  try {
    const date = new Date(ts);
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function isConfig(option: AgentConfigOption, idOrCategory: string): boolean {
  return option.id === idOrCategory || option.category === idOrCategory;
}

function findConfig(options: AgentConfigOption[], idOrCategory: string): AgentConfigOption | undefined {
  return options.find((option) => isConfig(option, idOrCategory));
}

function humanizeConfigId(id: string): string {
  return id.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

type QuestionSchema = Record<string, unknown> & {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  placeholder?: unknown;
  properties?: unknown;
  required?: unknown;
  items?: unknown;
  oneOf?: unknown;
  anyOf?: unknown;
  enum?: unknown;
  const?: unknown;
};

type QuestionField = {
  key: string;
  schema: QuestionSchema;
  required: boolean;
};

function schemaType(schema: QuestionSchema | undefined): string {
  const type = schema?.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type)) return type.find((item): item is string => typeof item === "string" && item !== "null") ?? "string";
  return schema?.items ? "array" : "string";
}

type PrimitiveSchemaValue = string | number | boolean;

function isPrimitiveSchemaValue(value: unknown): value is PrimitiveSchemaValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function schemaChoices(schema: QuestionSchema | undefined): Array<{ value: string; label: string; raw: PrimitiveSchemaValue; description?: string }> {
  if (!schema) return [];
  const variants = [schema.oneOf, schema.anyOf].find((value) => Array.isArray(value)) as unknown[] | undefined;
  if (variants) {
    return variants.flatMap((variant) => {
      if (!isRecord(variant) || !isPrimitiveSchemaValue(variant.const)) return [];
      const raw = variant.const;
      return [{
        value: String(raw),
        label: typeof variant.title === "string" ? variant.title : String(raw),
        raw,
        ...(typeof variant.description === "string" ? { description: variant.description } : {}),
      }];
    });
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.flatMap((raw: unknown) => isPrimitiveSchemaValue(raw) ? [{ value: String(raw), label: String(raw), raw }] : []);
  }
  return isPrimitiveSchemaValue(schema.const)
    ? [{ value: String(schema.const), label: String(schema.const), raw: schema.const }]
    : [];
}

export function questionFields(schema: unknown): QuestionField[] | undefined {
  if (!isRecord(schema) || !isRecord(schema.properties)) return undefined;
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  const fields = Object.entries(schema.properties).flatMap(([key, value]) => {
    if (!isRecord(value)) return [];
    return [{ key, schema: value, required: required.has(key) }];
  });
  return fields.length ? fields : undefined;
}

export function primitiveInputValue(schema: QuestionSchema | undefined, value: string): unknown {
  const choice = schemaChoices(schema).find((candidate) => candidate.value === value);
  if (choice) return choice.raw;
  switch (schemaType(schema)) {
    case "number":
    case "integer": {
      const number = Number(value);
      return Number.isFinite(number) ? number : value;
    }
    case "boolean":
      return value === "true" ? true : value === "false" ? false : value;
    default:
      return value;
  }
}

export function arrayInputValues(schema: QuestionSchema | undefined, value: string): unknown[] {
  const items = isRecord(schema?.items) ? schema.items as QuestionSchema : undefined;
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).map((item) => primitiveInputValue(items, item));
}

export function parseFreeformAnswer(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { answer: text };
  }
}

export class AgentControlApp extends applicationV2Base {
  static DEFAULT_OPTIONS = {
    id: "foundry-mcp-agentcontrol",
    classes: ["foundry-mcp-agentcontrol"],
    tag: "div",
    window: {
      title: "AgentControl",
      icon: "fa-solid fa-robot",
      resizable: true,
      minimizable: true,
    },
    position: {
      width: 760,
      height: 640,
    },
  };

  private readonly bridgeClient: BridgeClient;
  private readonly store: AgentControlPanelStore;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly onClosed: (() => void) | undefined;
  private drafts: Record<AgentSlot, string> = { A: "", B: "" };
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private stickToBottom = true;
  private inputHadFocus = false;

  constructor(options: AgentControlAppOptions) {
    super(options);
    this.bridgeClient = options.bridgeClient;
    this.onClosed = options.onClosed;
    this.store = new AgentControlPanelStore({
      sendControl: (message) => this.bridgeClient.sendControl(message),
      loadPreferences: loadAgentControlPreferences,
      savePreferences: saveAgentControlPreferences,
    });
    this.store.setConnected(this.bridgeClient.isRegistered());
    this.unsubscribers.push(this.bridgeClient.onServerMessage((message) => this.store.handleServerMessage(message)));
    this.unsubscribers.push(this.bridgeClient.onConnectionStateChange((connected) => this.store.setConnected(connected)));
    this.unsubscribers.push(this.store.subscribe(() => this.queueRender()));
    this.store.start();
  }

  protected _renderHTML(): Promise<HTMLElement> {
    const root = document.createElement("div");
    root.className = "ac-root";
    root.innerHTML = this.template();
    return Promise.resolve(root);
  }

  protected _replaceHTML(result: HTMLElement, content: HTMLElement): void {
    content.replaceChildren(result);
  }

  protected _onRender(): Promise<void> {
    this.attachListeners();
    const transcript = this.element?.querySelector<HTMLElement>(".ac-transcript");
    if (transcript && this.stickToBottom) transcript.scrollTop = transcript.scrollHeight;
    const input = this.element?.querySelector<HTMLTextAreaElement>(".ac-input");
    if (input && this.inputHadFocus) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    return Promise.resolve();
  }

  protected _onClose(): void {
    this.closed = true;
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = undefined;
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.onClosed?.();
  }

  private queueRender(): void {
    if (this.closed || this.renderTimer) return;
    // Streaming chunks can arrive in bursts. Coalesce them into one DOM render
    // while keeping the transcript responsive enough to feel live.
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined;
      this.captureViewState();
      if (!this.closed) void this.render({});
    }, 40);
  }

  private captureViewState(): void {
    const transcript = this.element?.querySelector<HTMLElement>(".ac-transcript");
    this.stickToBottom = !transcript || transcript.scrollTop + transcript.clientHeight >= transcript.scrollHeight - 48;
    this.inputHadFocus = typeof document !== "undefined" && this.element?.querySelector(".ac-input") === document.activeElement;
  }

  private template(): string {
    const snapshot = this.store.snapshot;
    const slot = snapshot.activeSlot;
    const slotState = snapshot.slots[slot];
    const selection = this.store.resolveSelection(slot);
    const capabilities = selection.agent
      ? snapshot.agents.find((agent) => agent.id === selection.agent)
      : undefined;
    const connected = snapshot.connected;
    const explicitHealth = snapshot.daemonHealth;
    const daemonDegraded = connected && (explicitHealth
      ? explicitHealth.state !== "connected"
      : snapshot.agents.length > 0 && snapshot.agents.every((agent) => !agent.available));
    const daemonMessage = explicitHealth && explicitHealth.state !== "connected"
      ? `AgentControl daemon ${explicitHealth.state}${explicitHealth.message ? ` — ${explicitHealth.message}` : ""}. Actions may fail until it reconnects.`
      : "AgentControl daemon appears unavailable — no agent is currently reported as available. Actions may fail until it reconnects.";
    const configOptions = snapshot.configOptions[slot];
    const modelConfig = findConfig(configOptions, "model");
    const modeConfig = findConfig(configOptions, "mode");
    const extraConfigs = configOptions.filter((option) => !isConfig(option, "model") && !isConfig(option, "mode"));
    const pendingConfig = snapshot.pendingConfig[slot];
    const modelControl = modelConfig?.id ?? "model";
    const modeControl = modeConfig?.id ?? "mode";
    const modelOptions = modelConfig?.options ?? capabilities?.models ?? [];
    const modeOptions = modeConfig?.options ?? capabilities?.modes ?? [];
    const inputDisabled = connected ? "" : " disabled";
    return `
      ${this.renderErrorBanner()}
      <div class="ac-tabs" role="tablist" aria-label="Agent slots">
        ${AGENT_SLOTS.map((candidate) => this.renderTab(candidate)).join("")}
      </div>
      <div class="ac-connection ${connected ? "is-connected" : "is-disconnected"}">
        <span class="ac-connection-dot" aria-hidden="true"></span>
        <span>${connected ? "Connected to control plane" : "Disconnected — waiting for bridge registration"}</span>
      </div>
      ${daemonDegraded ? `<div class="ac-daemon-warning" role="alert">${escapeHtml(daemonMessage)}</div>` : ""}
      <section class="ac-config" aria-label="Agent configuration">
        ${this.renderSelect("agent", "Agent", snapshot.agents.map((agent) => ({
          value: agent.id,
          label: `${agent.name}${agent.available ? "" : " (unavailable)"}`,
        })), selection.agent, !connected || !snapshot.agents.length)}
        ${this.renderSelect(modelControl, modelConfig?.name ?? "Model", modelOptions, pendingConfig[modelControl] ?? modelConfig?.currentValue ?? selection.model, !connected || !modelOptions.length, pendingConfig[modelControl])}
        ${this.renderSelect(modeControl, modeConfig?.name ?? "Mode", modeOptions, pendingConfig[modeControl] ?? modeConfig?.currentValue ?? selection.mode, !connected || !modeOptions.length, pendingConfig[modeControl])}
        ${extraConfigs.map((option) => this.renderSelect(
          option.id,
          option.name ?? humanizeConfigId(option.id),
          option.options,
          pendingConfig[option.id] ?? option.currentValue,
          !connected || !option.options.length,
          pendingConfig[option.id],
        )).join("")}
      </section>
      ${this.renderSlotStatus(slotState)}
      <div class="ac-live-note">Live control-plane view — recent events are restored after reconnect when the server buffer still contains them.</div>
      <div class="ac-transcript" aria-live="polite">
        ${this.renderTranscript(slot, slotState)}
      </div>
      <div class="ac-composer">
        <textarea class="ac-input" rows="3" placeholder="Message Agent ${slot}… (Enter sends, Ctrl+Enter steers)"${inputDisabled}>${escapeHtml(this.drafts[slot])}</textarea>
        <div class="ac-composer-buttons">
          <button type="button" class="ac-button ac-primary" data-action="send"${inputDisabled}>Send</button>
          <button type="button" class="ac-button" data-action="steer" title="Steer the active agent without interrupting it"${inputDisabled}>Steer</button>
        </div>
      </div>
      <div class="ac-actions">
        <button type="button" class="ac-button" data-action="cancel"${connected && slotState.busy ? "" : " disabled"}>Stop</button>
        <button type="button" class="ac-button" data-action="compact"${connected && this.hasSlot(slotState) ? "" : " disabled"}>Compact</button>
        <button type="button" class="ac-button" data-action="clear"${connected && this.hasSlot(slotState) ? "" : " disabled"}>Clear</button>
        <span class="ac-actions-spacer"></span>
        <button type="button" class="ac-button ac-danger" data-action="destroy"${connected && this.hasSlot(slotState) ? "" : " disabled"}>Destroy slot</button>
      </div>
    `;
  }

  private renderErrorBanner(): string {
    const error = this.store.snapshot.errorBanner;
    if (!error) return "";
    return `<div class="ac-error-banner" role="alert">
      <span>${escapeHtml(error)}</span>
      <button type="button" class="ac-icon-button" data-action="dismiss-error" aria-label="Dismiss error">×</button>
    </div>`;
  }

  private renderTab(slot: AgentSlot): string {
    const snapshot = this.store.snapshot;
    const active = snapshot.activeSlot === slot;
    const pending = snapshot.entries[slot].filter((entry) =>
      (entry.kind === "permission" || entry.kind === "question") && !entry.resolved,
    ).length;
    const unread = snapshot.unread[slot];
    const attention = slot === snapshot.activeSlot ? 0 : unread + pending;
    const badge = attention ? `<span class="ac-tab-badge" aria-label="${attention} pending events">${attention > 9 ? "9+" : attention}</span>` : "";
    return `<button type="button" role="tab" aria-selected="${active}" class="ac-tab ${active ? "is-active" : ""}" data-action="set-tab" data-slot="${slot}">
      <span>Agent ${slot}</span>${badge}
    </button>`;
  }

  private renderSelect(
    control: string,
    label: string,
    options: Array<{ value: string; label: string; description?: string | undefined }>,
    selected: string | undefined,
    disabled: boolean,
    pendingValue?: string,
  ): string {
    const placeholder = options.length ? "" : `<option value="">${control === "agent" ? "Loading capabilities…" : `No ${control} available`}</option>`;
    const pending = pendingValue !== undefined;
    return `<label class="ac-field ${pending ? "is-pending" : ""}">
      <span>${escapeHtml(label)}${pending ? " · applying…" : ""}</span>
      <select data-control="${escapeHtml(control)}"${disabled || pending ? " disabled" : ""}>
        ${placeholder}${optionTags(options, selected)}
      </select>
    </label>`;
  }

  private renderSlotStatus(slot: AgentSlotState): string {
    const alive = slot.alive || typeof slot.sessionId === "string";
    const state = alive ? slot.busy ? "Working" : "Ready" : "No slot";
    const stateClass = alive ? slot.busy ? "is-busy" : "is-ready" : "is-empty";
    const context = typeof slot.contextUsed === "number" && typeof slot.contextSize === "number" && slot.contextSize > 0
      ? `<span class="ac-context" title="Context usage">${Math.round((slot.contextUsed / slot.contextSize) * 100)}% context</span>`
      : "";
    const title = slot.title ? `<span class="ac-slot-title">${escapeHtml(slot.title)}</span>` : "";
    return `<div class="ac-slot-status ${stateClass}">
      <span class="ac-status-pill">${state}</span>${title}${context}
    </div>`;
  }

  private renderTranscript(slot: AgentSlot, slotState: AgentSlotState): string {
    const entries = this.store.snapshot.entries[slot];
    if (!entries.length) {
      const text = this.hasSlot(slotState)
        ? "No live events yet. Send a message to start the transcript."
        : "No AgentControl session exists for this slot yet. Choose an agent or send a message to create it.";
      return `<div class="ac-empty"><div class="ac-empty-icon">◌</div><p>${text}</p></div>`;
    }
    return entries.map((entry) => this.renderEntry(slot, entry)).join("");
  }

  private renderEntry(slot: AgentSlot, entry: TranscriptEntry): string {
    const time = formatTime(entry.ts);
    const timestamp = time ? `<time>${time}</time>` : "";
    switch (entry.kind) {
      case "user":
        return `<article class="ac-entry ac-user">
          <div class="ac-entry-meta"><span>${entry.steered ? "You (steer)" : "You"}${entry.local ? " · sending" : ""}</span>${timestamp}</div>
          <div class="ac-entry-text">${formatText(entry.text)}</div>
        </article>`;
      case "agent": {
        const activity = entry.activity === true && !entry.streaming;
        const label = entry.streaming ? "Agent · typing" : activity ? "Agent activity" : "Agent";
        const body = activity
          ? `<details class="ac-activity-details"><summary>Show activity details</summary><div class="ac-entry-text">${formatText(entry.text)}</div></details>`
          : `<div class="ac-entry-text">${formatText(entry.text)}</div>`;
        return `<article class="ac-entry ac-agent ${activity ? "ac-agent-activity" : ""}">
          <div class="ac-entry-meta"><span>${label}</span>${timestamp}</div>
          ${body}
        </article>`;
      }
      case "tool":
        return `<article class="ac-entry ac-tool ac-tool-${entry.status}">
          <div class="ac-tool-line"><span class="ac-tool-icon">⚙</span><strong>${escapeHtml(entry.name)}</strong><span>${entry.status}</span>${timestamp}</div>
          ${entry.detail ? `<details><summary>Details</summary><pre>${escapeHtml(entry.detail)}</pre></details>` : ""}
        </article>`;
      case "error":
        return `<article class="ac-entry ac-error" role="alert"><strong>Error</strong><div>${formatText(entry.text)}</div></article>`;
      case "system":
        return `<article class="ac-entry ac-system"><div>${formatText(entry.text)}</div></article>`;
      case "permission": {
        const disabled = entry.resolved || !this.store.snapshot.connected ? " disabled" : "";
        return `<article class="ac-entry ac-request ${entry.resolved ? "is-resolved" : ""}">
          <div class="ac-entry-meta"><span>Permission requested</span>${timestamp}</div>
          <div class="ac-request-title">${escapeHtml(entry.tool)}</div>
          ${entry.detail ? `<div class="ac-request-detail">${formatText(entry.detail)}</div>` : ""}
          <div class="ac-request-options">
            ${entry.options.map((option) => {
              const always = /allow[_-]?always|always/i.test(`${option.id} ${option.label}`);
              return `<button type="button" class="ac-button ${always ? "ac-permission-always" : ""}" data-action="respond" data-slot="${slot}" data-request-id="${escapeHtml(entry.requestId)}" data-option-id="${escapeHtml(option.id)}"${disabled}>${escapeHtml(option.label)}</button>`;
            }).join("")}
          </div>
          ${entry.resolved ? `<div class="ac-resolved">Resolved</div>` : ""}
        </article>`;
      }
      case "question": {
        return `<article class="ac-entry ac-request ${entry.resolved ? "is-resolved" : ""}">
          <div class="ac-entry-meta"><span>Agent question</span>${timestamp}</div>
          <div class="ac-request-title">${formatText(entry.question)}</div>
          ${this.renderQuestionInteraction(slot, entry)}
          ${entry.resolved ? `<div class="ac-resolved">Resolved</div>` : ""}
        </article>`;
      }
    }
  }

  private renderQuestionInteraction(slot: AgentSlot, entry: Extract<TranscriptEntry, { kind: "question" }>): string {
    const disabled = entry.resolved || !this.store.snapshot.connected ? " disabled" : "";
    const fields = questionFields(entry.schema);
    if (fields) {
      return `<div class="ac-question-form" data-question-form data-request-id="${escapeHtml(entry.requestId)}">
        ${fields.map((field) => this.renderQuestionField(field, disabled)).join("")}
        <div class="ac-question-actions">
          <button type="button" class="ac-button ac-primary" data-action="respond-schema" data-slot="${slot}" data-request-id="${escapeHtml(entry.requestId)}"${disabled}>Submit answer</button>
        </div>
      </div>`;
    }
    if (entry.options?.length) {
      return `<div class="ac-request-options">
        ${entry.options.map((option) => `<button type="button" class="ac-button" data-action="respond" data-slot="${slot}" data-request-id="${escapeHtml(entry.requestId)}" data-option-id="${escapeHtml(option.id)}"${disabled}>${escapeHtml(option.label)}</button>`).join("")}
      </div>`;
    }
    return `<div class="ac-question-freeform">
      <input type="text" class="ac-question-answer" data-request-id="${escapeHtml(entry.requestId)}" placeholder="Type an answer or JSON object…"${disabled}>
      <button type="button" class="ac-button" data-action="respond-answer" data-slot="${slot}" data-request-id="${escapeHtml(entry.requestId)}"${disabled}>Answer</button>
    </div>`;
  }

  private renderQuestionField(field: QuestionField, disabled: string): string {
    const schema = field.schema;
    const type = schemaType(schema);
    const title = typeof schema.title === "string" && schema.title ? schema.title : humanizeConfigId(field.key);
    const description = typeof schema.description === "string" ? schema.description : "";
    const placeholder = typeof schema.placeholder === "string" ? schema.placeholder : "";
    const required = field.required ? `<span class="ac-required" aria-hidden="true">*</span>` : "";
    const common = `data-question-field data-field-key="${escapeHtml(field.key)}"${disabled}`;
    let control = "";
    if (type === "array") {
      const items = isRecord(schema.items) ? schema.items as QuestionSchema : undefined;
      const choices = schemaChoices(items);
      if (choices.length) {
        control = `<select multiple size="${Math.min(Math.max(choices.length, 2), 6)}" ${common}>${choices.map((choice) => `<option value="${escapeHtml(choice.value)}" title="${escapeHtml(choice.description ?? "")}">${escapeHtml(choice.label)}</option>`).join("")}</select>`;
      } else {
        control = `<textarea rows="2" placeholder="${escapeHtml(placeholder || "One value per line, or comma-separated")}" ${common}></textarea>`;
      }
    } else {
      const choices = schemaChoices(schema);
      if (choices.length) {
        control = `<select ${common}>
          <option value="">Choose…</option>
          ${choices.map((choice) => `<option value="${escapeHtml(choice.value)}" title="${escapeHtml(choice.description ?? "")}">${escapeHtml(choice.label)}</option>`).join("")}
        </select>`;
      } else if (type === "boolean") {
        control = `<select ${common}><option value="">Choose…</option><option value="true">True</option><option value="false">False</option></select>`;
      } else if (type === "number" || type === "integer") {
        control = `<input type="number" placeholder="${escapeHtml(placeholder)}" ${common}>`;
      } else if (schema.format === "textarea" || schema["ui:widget"] === "textarea") {
        control = `<textarea rows="3" placeholder="${escapeHtml(placeholder)}" ${common}></textarea>`;
      } else {
        control = `<input type="text" placeholder="${escapeHtml(placeholder)}" ${common}>`;
      }
    }
    return `<label class="ac-question-field">
      <span>${escapeHtml(title)}${required}</span>
      ${control}
      ${description ? `<small>${formatText(description)}</small>` : ""}
    </label>`;
  }

  private collectSchemaAnswer(requestId: string): unknown {
    const slot = this.store.snapshot.activeSlot;
    const entry = this.store.snapshot.entries[slot].find((candidate) => candidate.kind === "question" && candidate.requestId === requestId);
    const fields = questionFields(entry?.kind === "question" ? entry.schema : undefined);
    const form = this.element?.querySelector<HTMLElement>(`[data-question-form][data-request-id="${cssEscape(requestId)}"]`);
    if (!fields || !form) return undefined;
    const answer: Record<string, unknown> = {};
    for (const field of fields) {
      const control = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-question-field][data-field-key="${cssEscape(field.key)}"]`);
      if (!control) continue;
      if (schemaType(field.schema) === "array") {
        const items = isRecord(field.schema.items) ? field.schema.items as QuestionSchema : undefined;
        const selectControl = control as HTMLSelectElement;
        if (selectControl.multiple) {
          const values = Array.from(selectControl.selectedOptions).map((option) => primitiveInputValue(items, option.value));
          if (values.length || field.required) answer[field.key] = values;
        } else {
          const values = arrayInputValues(field.schema, control.value);
          if (values.length || field.required) answer[field.key] = values;
        }
        continue;
      }
      const value = control.value.trim();
      if (!value && !field.required) continue;
      answer[field.key] = primitiveInputValue(field.schema, value);
    }
    return answer;
  }

  private attachListeners(): void {
    const root = this.element;
    if (!root) return;
    for (const button of Array.from(root.querySelectorAll<HTMLElement>("[data-action]"))) {
      button.addEventListener("click", (event: MouseEvent) => {
        const target = event.currentTarget as HTMLElement;
        void this.handleAction(target);
      });
    }
    const slot = this.store.snapshot.activeSlot;
    for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>(".ac-config select[data-control]"))) {
      select.addEventListener("change", () => {
        const control = select.dataset.control ?? "";
        if (!select.value) return;
        if (control === "agent") void this.handleAgentSelection(slot, select.value);
        else if (control === "model") this.store.selectModel(slot, select.value);
        else if (control === "mode") this.store.selectMode(slot, select.value);
        else this.store.selectConfigOption(slot, control, select.value);
      });
    }
    const input = root.querySelector<HTMLTextAreaElement>(".ac-input");
    input?.addEventListener("input", () => {
      this.drafts[slot] = input.value;
    });
    input?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) this.sendSteer();
      else this.sendPrompt();
    });
    const transcript = root.querySelector<HTMLElement>(".ac-transcript");
    transcript?.addEventListener("scroll", () => {
      this.stickToBottom = transcript.scrollTop + transcript.clientHeight >= transcript.scrollHeight - 48;
    });
  }

  private async handleAgentSelection(slot: AgentSlot, agent: string): Promise<void> {
    const slotState = this.store.snapshot.slots[slot];
    if (this.hasSlot(slotState) && slotState.agent === agent) {
      this.queueRender();
      return;
    }
    if (this.hasSlot(slotState)) {
      const confirmed = await this.confirm(
        "Replace this agent slot?",
        "Changing providers requires detaching the current session and creating a new one. The current session is slept, not deleted, but its context will no longer be attached to this slot.",
      );
      if (!confirmed) {
        this.queueRender();
        return;
      }
      this.store.recreateSlotWithAgent(slot, agent);
      return;
    }
    this.store.selectAgent(slot, agent);
  }

  private async handleAction(target: HTMLElement): Promise<void> {
    const action = target.dataset.action;
    const activeSlot = this.store.snapshot.activeSlot;
    const slot = target.dataset.slot === "A" || target.dataset.slot === "B" ? target.dataset.slot : activeSlot;
    switch (action) {
      case "set-tab":
        this.store.setActiveSlot(slot);
        break;
      case "send":
        this.sendPrompt();
        break;
      case "steer":
        this.sendSteer();
        break;
      case "cancel":
        this.store.cancel(activeSlot);
        break;
      case "compact":
        this.store.compact(activeSlot);
        break;
      case "clear":
        if (await this.confirm("Clear transcript context?", "The agent session will be cleared. This cannot be undone.")) {
          this.store.clear(activeSlot);
        }
        break;
      case "destroy":
        if (await this.confirm("Destroy this agent slot?", "The AgentControl session will be detached from this slot and slept, not deleted.")) {
          this.store.destroy(activeSlot);
        }
        break;
      case "respond": {
        const requestId = target.dataset.requestId;
        const optionId = target.dataset.optionId;
        if (requestId && optionId) this.store.respond(slot, requestId, { optionId });
        break;
      }
      case "respond-schema": {
        const requestId = target.dataset.requestId;
        const answer = requestId ? this.collectSchemaAnswer(requestId) : undefined;
        if (requestId && answer !== undefined) this.store.respond(slot, requestId, { answer });
        break;
      }
      case "respond-answer": {
        const requestId = target.dataset.requestId;
        const input = this.element?.querySelector<HTMLInputElement>(`.ac-question-answer[data-request-id="${cssEscape(requestId ?? "")}"]`);
        const answer = input?.value.trim();
        if (requestId && answer) this.store.respond(slot, requestId, { answer: parseFreeformAnswer(answer) });
        break;
      }
      case "dismiss-error":
        this.store.dismissError();
        break;
    }
  }

  private sendPrompt(): void {
    const slot = this.store.snapshot.activeSlot;
    const text = this.drafts[slot];
    if (!this.store.sendPrompt(slot, text)) return;
    this.drafts[slot] = "";
  }

  private sendSteer(): void {
    const slot = this.store.snapshot.activeSlot;
    const text = this.drafts[slot];
    if (!this.store.sendSteer(slot, text)) return;
    this.drafts[slot] = "";
  }

  private hasSlot(slot: AgentSlotState): boolean {
    return slot.alive || typeof slot.sessionId === "string";
  }

  private async confirm(title: string, content: string): Promise<boolean> {
    const dialog = (globalThis as {
      foundry?: { applications?: { api?: { DialogV2?: { confirm(options: Record<string, unknown>): Promise<boolean> } } } };
    }).foundry?.applications?.api?.DialogV2;
    if (dialog) {
      return Boolean(await dialog.confirm({
        window: { title },
        content: `<p>${escapeHtml(content)}</p>`,
        yes: { label: "Confirm" },
        no: { label: "Cancel" },
        defaultYes: false,
      }));
    }
    return globalThis.confirm?.(content) ?? false;
  }
}
