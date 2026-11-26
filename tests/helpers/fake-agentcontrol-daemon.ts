import { once } from "node:events";
import net from "node:net";

export type FakeDaemonRequest = {
  id: number;
  req: string;
  [key: string]: unknown;
};

export class FakeAgentControlDaemon {
  readonly token = "fake-daemon-token";
  readonly requests: FakeDaemonRequest[] = [];
  readonly authLines: FakeDaemonRequest[] = [];
  private readonly server = net.createServer();
  private readonly sockets = new Set<net.Socket>();
  private sessionCounter = 0;
  port = 0;

  onRequest?: (request: FakeDaemonRequest, socket: net.Socket) => unknown | undefined | Promise<unknown | undefined>;

  async start(): Promise<void> {
    this.server.on("connection", (socket) => this.handleSocket(socket));
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("fake daemon did not bind");
    this.port = address.port;
  }

  get tcp(): string {
    return `127.0.0.1:${this.port}`;
  }

  push(socket: net.Socket, value: unknown): void {
    socket.write(`${JSON.stringify(value)}\n`);
  }

  pushAll(value: unknown): void {
    for (const socket of this.sockets) this.push(socket, value);
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (this.server.listening) {
      this.server.close();
      await once(this.server, "close").catch(() => undefined);
    }
  }

  private handleSocket(socket: net.Socket): void {
    this.sockets.add(socket);
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) break;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const request = JSON.parse(line) as FakeDaemonRequest;
        if (request.req === "auth") this.authLines.push(request);
        else this.requests.push(request);
        void this.answer(socket, request);
      }
    });
    socket.on("close", () => this.sockets.delete(socket));
    socket.on("error", () => undefined);
  }

  private async answer(socket: net.Socket, request: FakeDaemonRequest): Promise<void> {
    if (socket.destroyed) return;
    if (request.req === "auth") {
      const ok = request.token === this.token;
      this.push(socket, ok
        ? { id: request.id, ok: true, result: { auth: "ok" } }
        : { id: request.id, ok: false, error: "bad token" });
      return;
    }
    if (this.onRequest) {
      const custom = await this.onRequest(request, socket);
      if (custom !== undefined) {
        this.push(socket, { id: request.id, ok: true, result: custom });
        return;
      }
    }
    if (request.req === "hang") return;
    if (request.req === "new_session") {
      this.sessionCounter += 1;
      this.push(socket, { id: request.id, ok: true, result: { session: `s-fake-${this.sessionCounter}` } });
      return;
    }
    if (request.req === "subscribe") {
      this.push(socket, {
        id: request.id,
        ok: true,
        result: { subscribed: request.session, last_seq: 0, replay_events: 0, replay_bytes: 0, skipped: 0 }
      });
      return;
    }
    if (request.req === "session_info") {
      this.push(socket, {
        id: request.id,
        ok: true,
        result: {
          alive: true,
          last_seq: 0,
          meta: {
            agent: "devin",
            model: "swe-2-flash-medium",
            mode: "bypass",
            state: "idle",
            title: "fake session",
            context_used: 0,
            context_size: 262144
          },
          pending: [],
          queue: [],
          steps: []
        }
      });
      return;
    }
    if (request.req === "events") {
      this.push(socket, { id: request.id, ok: true, result: { events: [] } });
      return;
    }
    this.push(socket, { id: request.id, ok: true, result: {} });
  }
}
