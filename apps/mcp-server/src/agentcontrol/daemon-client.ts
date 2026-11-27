import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import net from "node:net";

import type { Logger } from "pino";

/**
 * Verified AgentControl daemon NDJSON protocol (2026-11-26, daemon in this
 * container). Discovery was done against a disposable session which was then
 * deleted; the user's session was never modified.
 *
 * Transport: one JSON object per line over TCP. The first client line must be
 *   {"id":1,"req":"auth","token":"<daemon token>"}
 * Responses are {"id":N,"ok":true,"result":...} or
 * {"id":N,"ok":false,"error":"..."}. Subscription traffic is unsolicited:
 *   {"push":"event","session":"s-...","event":{...}}
 *
 * Verified request shapes:
 * - new_session: {agent,cwd,title?,mode?,model?,prompt?} -> {session}
 * - list_sessions: {} -> array of session metadata
 * - list_agents: {} -> array of agent descriptors
 * - session_info: {session} -> {alive,last_seq,meta,pending,queue,steps}
 * - events: {session,before_seq?,after_seq?} -> {events:[...]}
 * - subscribe: {session,after_seq?} -> {subscribed,last_seq,replay_events,...}
 * - send: {session,text,steer?,force?} -> queue/result object (there is no
 *   separate prompt RPC; compact is deliberately implemented as text
 *   "/compact" because the daemon has no compact RPC variant)
 * - cancel: {session}
 * - clear_session: {session}
 * - delete_session: {session}
 * - sleep_session: {session}
 * - set_mode: {session,mode}
 * - set_model: {session,model}
 * - set_config_option: {session,config_id,value} — note: `set_config` is not
 *   a daemon request variant despite older planning notes using that name
 * - respond: {session,request_id,option_id?,answer?}
 *
 * Useful event shapes observed empirically include user_message, agent_text,
 * agent_thought, tool_call, tool_call_update, permission_request,
 * question_request, permission_resolved, question_resolved, config_options,
 * usage_update, status_changed, session_cleared and error. Event timestamps
 * are ISO strings in `ts`.
 *
 * MCP injection investigation: the daemon ignores unknown new_session
 * mcpServers/mcp_servers fields and exposes no protocol support for them.
 * Foundry MCP access must therefore be configured at workspace/agent level.
 */

export type DaemonPush = {
  push?: string;
  session?: string;
  event?: unknown;
  [key: string]: unknown;
};

export type DaemonConnectionState = {
  state: "connected" | "disconnected" | "error";
  message?: string;
};

type PendingRequest = {
  req: string;
  payload: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export type AgentControlDaemonClientOptions = {
  tcp: string;
  tokenPath?: string;
  logger?: Logger;
  requestTimeoutMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
};

const DEFAULT_TOKEN_PATH = "/config/.agentcontrol/daemon.token";

function parseTcpAddress(value: string): { host: string; port: number } {
  const index = value.lastIndexOf(":");
  if (index <= 0 || index === value.length - 1) throw new Error(`Invalid AgentControl TCP address: ${value}`);
  const host = value.slice(0, index);
  const port = Number(value.slice(index + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid AgentControl TCP port in: ${value}`);
  }
  return { host, port };
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class AgentControlDaemonClient extends EventEmitter {
  private socket: net.Socket | undefined;
  private buffer = "";
  // Request ids never reset across reconnects. That avoids collisions with
  // requests queued while disconnected; only the per-connection auth line is
  // required to use id 1.
  private nextId = 2;
  private authenticated = false;
  private started = false;
  private stopped = false;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private backoffMs: number;
  private closeError: string | undefined;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly queued: number[] = [];

  constructor(private readonly options: AgentControlDaemonClientOptions) {
    super();
    this.backoffMs = options.initialBackoffMs ?? 250;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.started = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.destroy();
    this.rejectAll(new Error("AgentControl daemon client stopped"));
    this.publishConnectionState("disconnected");
  }

  isConnected(): boolean {
    return this.authenticated && !!this.socket && !this.socket.destroyed;
  }

  private publishConnectionState(state: DaemonConnectionState["state"], message?: string): void {
    this.emit("connection-state", {
      state,
      ...(message ? { message } : {})
    } satisfies DaemonConnectionState);
  }

  async request<T = unknown>(req: string, fields: Record<string, unknown> = {}): Promise<T> {
    if (this.stopped) throw new Error("AgentControl daemon client is stopped");
    if (req === "auth") throw new Error("auth is managed internally by the daemon client");

    const id = this.nextId++;
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.removeQueued(id);
        reject(new Error(`AgentControl daemon request timed out: ${req}`));
      }, this.options.requestTimeoutMs ?? 15_000);
      timer.unref();

      this.pending.set(id, {
        req,
        payload: { ...fields, req },
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });

      if (!this.writeRequest(id)) this.queued.push(id);
    });
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.socket) return;
    const tokenPath = this.options.tokenPath ?? DEFAULT_TOKEN_PATH;
    let token: string;
    try {
      token = (await readFile(tokenPath, "utf8")).trim();
    } catch (error) {
      const message = `Unable to read AgentControl daemon token: ${asErrorMessage(error)}`;
      this.options.logger?.warn({ error: asErrorMessage(error) }, "Unable to read AgentControl daemon token");
      this.publishConnectionState("error", message);
      this.scheduleReconnect();
      return;
    }

    const { host, port } = parseTcpAddress(this.options.tcp);
    this.authenticated = false;
    this.buffer = "";

    const socket = net.createConnection({ host, port });
    this.socket = socket;

    socket.on("connect", () => {
      // Authentication is deliberately always id 1 and the first line on the wire.
      socket.write(`${JSON.stringify({ id: 1, req: "auth", token })}\n`);
    });
    socket.on("data", (chunk) => this.handleData(chunk));
    socket.on("error", (error) => {
      this.closeError = error.message;
      this.options.logger?.warn({ error: error.message }, "AgentControl daemon socket error");
    });
    socket.on("close", () => {
      if (this.socket === socket) this.socket = undefined;
      const wasAuthenticated = this.authenticated;
      this.authenticated = false;
      const closeError = this.closeError;
      this.closeError = undefined;
      this.rejectAll(new Error("AgentControl daemon disconnected"));
      this.publishConnectionState(closeError ? "error" : "disconnected", closeError);
      this.emit("disconnected");
      if (wasAuthenticated) this.options.logger?.warn("AgentControl daemon connection closed");
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.options.maxBackoffMs ?? 5_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref();
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        this.options.logger?.warn("Ignoring malformed AgentControl daemon line");
        continue;
      }
      this.handleMessage(message);
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== "object") return;
    const value = message as { id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
    if (typeof value.id !== "number") {
      this.emit("push", value);
      return;
    }

    if (value.id === 1) {
      if (value.ok === true) {
        this.authenticated = true;
        this.backoffMs = this.options.initialBackoffMs ?? 250;
        this.closeError = undefined;
        this.publishConnectionState("connected");
        this.emit("connected");
        this.flushQueue();
      } else {
        this.closeError = "AgentControl daemon authentication failed";
        this.options.logger?.error("AgentControl daemon authentication failed");
        this.socket?.destroy();
      }
      return;
    }

    const pending = this.pending.get(value.id);
    if (!pending) return;
    this.pending.delete(value.id);
    this.removeQueued(value.id);
    clearTimeout(pending.timer);
    if (value.ok === true) {
      pending.resolve(value.result);
    } else {
      pending.reject(new Error(typeof value.error === "string" ? value.error : `AgentControl daemon request failed: ${pending.req}`));
    }
  }

  private writeRequest(id: number): boolean {
    const socket = this.socket;
    const pending = this.pending.get(id);
    if (!socket || socket.destroyed || !this.authenticated || !pending) return false;
    socket.write(`${JSON.stringify({ id, ...pending.payload })}\n`);
    return true;
  }

  private flushQueue(): void {
    while (this.queued.length) {
      const id = this.queued.shift();
      if (id === undefined) return;
      if (!this.writeRequest(id)) {
        this.queued.unshift(id);
        return;
      }
    }
  }

  private removeQueued(id: number): void {
    const index = this.queued.indexOf(id);
    if (index >= 0) this.queued.splice(index, 1);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    this.queued.length = 0;
  }
}
