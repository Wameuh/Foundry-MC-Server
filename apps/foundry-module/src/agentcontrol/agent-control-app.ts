import type { AgentSlot, AgentSlotState } from "@foundry-mcp/protocol";
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

function formatText(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function optionTags(options: Array<{ value: string; label: string }>, selected: string | undefined): string {
  return options.map((option) => {
    const isSelected = option.value === selected ? " selected" : "";
    return `<option value="${escapeHtml(option.value)}"${isSelected}>${escapeHtml(option.label)}</option>`;
  }).join("");
}

function formatTime(ts: number): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
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
    const daemonDegraded = connected && snapshot.agents.length > 0 && snapshot.agents.every((agent) => !agent.available);
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
      ${daemonDegraded ? `<div class="ac-daemon-warning" role="alert">AgentControl daemon appears unavailable — no agent is currently reported as available. Actions may fail until it reconnects.</div>` : ""}
      <section class="ac-config" aria-label="Agent configuration">
        ${this.renderSelect("agent", "Agent", snapshot.agents.map((agent) => ({
          value: agent.id,
          label: `${agent.name}${agent.available ? "" : " (unavailable)"}`,
        })), selection.agent, !connected || !snapshot.agents.length)}
        ${this.renderSelect("model", "Model", capabilities?.models ?? [], selection.model, !connected || !capabilities)}
        ${this.renderSelect("mode", "Mode", capabilities?.modes ?? [], selection.mode, !connected || !capabilities)}
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
    control: "agent" | "model" | "mode",
    label: string,
    options: Array<{ value: string; label: string }>,
    selected: string | undefined,
    disabled: boolean,
  ): string {
    const placeholder = options.length ? "" : `<option value="">${control === "agent" ? "Loading capabilities…" : `No ${control} available`}</option>`;
    return `<label class="ac-field">
      <span>${label}</span>
      <select data-control="${control}"${disabled ? " disabled" : ""}>
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
            ${entry.options.map((option) => `<button type="button" class="ac-button" data-action="respond" data-slot="${slot}" data-request-id="${escapeHtml(entry.requestId)}" data-option-id="${escapeHtml(option.id)}"${disabled}>${escapeHtml(option.label)}</button>`).join("")}
          </div>
          ${entry.resolved ? `<div class="ac-resolved">Resolved</div>` : ""}
        </article>`;
      }
      case "question": {
        const disabled = entry.resolved || !this.store.snapshot.connected ? " disabled" : "";
        return `<article class="ac-entry ac-request ${entry.resolved ? "is-resolved" : ""}">
          <div class="ac-entry-meta"><span>Agent question</span>${timestamp}</div>
          <div class="ac-request-title">${formatText(entry.question)}</div>
          ${entry.options?.length ? `<div class="ac-request-options">
            ${entry.options.map((option) => `<button type="button" class="ac-button" data-action="respond" data-slot="${slot}" data-request-id="${escapeHtml(entry.requestId)}" data-option-id="${escapeHtml(option.id)}"${disabled}>${escapeHtml(option.label)}</button>`).join("")}
          </div>` : `<div class="ac-question-freeform">
            <input type="text" class="ac-question-answer" data-request-id="${escapeHtml(entry.requestId)}" placeholder="Type an answer…"${disabled}>
            <button type="button" class="ac-button" data-action="respond-answer" data-slot="${slot}" data-request-id="${escapeHtml(entry.requestId)}"${disabled}>Answer</button>
          </div>`}
          ${entry.resolved ? `<div class="ac-resolved">Resolved</div>` : ""}
        </article>`;
      }
    }
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
    const agentSelect = root.querySelector<HTMLSelectElement>("select[data-control='agent']");
    agentSelect?.addEventListener("change", () => {
      if (agentSelect.value) void this.handleAgentSelection(slot, agentSelect.value);
    });
    const modelSelect = root.querySelector<HTMLSelectElement>("select[data-control='model']");
    modelSelect?.addEventListener("change", () => {
      if (modelSelect.value) this.store.selectModel(slot, modelSelect.value);
    });
    const modeSelect = root.querySelector<HTMLSelectElement>("select[data-control='mode']");
    modeSelect?.addEventListener("change", () => {
      if (modeSelect.value) this.store.selectMode(slot, modeSelect.value);
    });
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
      case "respond-answer": {
        const requestId = target.dataset.requestId;
        const input = this.element?.querySelector<HTMLInputElement>(`.ac-question-answer[data-request-id="${CSS.escape(requestId ?? "")}"]`);
        const answer = input?.value.trim();
        if (requestId && answer) this.store.respond(slot, requestId, { answer });
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
