import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { describe, expect, it, afterEach } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";

import { FoundryDirectClient } from "../../apps/mcp-server/src/foundry-direct/client.js";
import { parseSocketFrame } from "../../apps/mcp-server/src/foundry-direct/socket-protocol.js";

type FakeDocument = Record<string, unknown> & { _id: string; name?: string };

class FakeFoundryServer {
  readonly server: Server;
  readonly wss: WebSocketServer;
  readonly actors = new Map<string, FakeDocument>();
  readonly items = new Map<string, FakeDocument>();
  url = "";
  private nextId = 1;

  constructor() {
    this.server = createServer((request, response) => {
      if (request.url === "/api/status") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ active: true, version: "14.370" }));
        return;
      }
      if (request.url === "/join" && request.method === "POST") {
        let body = "";
        request.on("data", (chunk) => { body += String(chunk); });
        request.on("end", () => {
          const json = JSON.parse(body) as Record<string, unknown>;
          if (json["password"] !== "secret" || json["userid"] !== "gm-id") {
            response.writeHead(200, { "content-type": "application/json" });
            response.end(JSON.stringify({ status: "failed", message: "bad credentials" }));
            return;
          }
          response.writeHead(200, {
            "content-type": "application/json",
            "set-cookie": "session=fake-session; HttpOnly; Path=/; SameSite=Strict"
          });
          response.end(JSON.stringify({ status: "success", message: "joined" }));
        });
        return;
      }
      response.writeHead(404).end();
    });
    this.wss = new WebSocketServer({ noServer: true });
    this.server.on("upgrade", (request, socket, head) => {
      if (!request.url?.startsWith("/socket.io/") || !request.headers.cookie?.includes("session=fake-session")) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(request, socket, head, (ws) => this.handleSocket(ws));
    });
  }

  async listen(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    const address = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    for (const client of this.wss.clients) client.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) => this.server.close((error) => error ? reject(error) : resolve()));
  }

  private handleSocket(ws: WebSocket): void {
    ws.send('0{"sid":"engine","pingInterval":1000,"pingTimeout":5000,"upgrades":[]}');
    ws.on("message", (raw) => {
      const text = raw.toString();
      if (text === "3") return;
      if (text === "40") {
        ws.send('42["session",{"sessionId":"fake-session","userId":"gm-id"}]');
        return;
      }
      const frame = parseSocketFrame(text);
      if (frame.type !== "socketEvent" || frame.ackId === undefined) return;
      if (frame.event === "world") {
        ws.send(`43${frame.ackId}${JSON.stringify([{ world: { id: "world-one" }, actors: [...this.actors.values()], packs: [] }])}`);
        return;
      }
      if (frame.event !== "modifyDocument") return;
      const request = frame.args[0] as { type: string; action: string; operation: Record<string, unknown> };
      const collection = request.type === "Item" ? this.items : this.actors;
      if (request.action === "get") {
        ws.send(`43${frame.ackId}${JSON.stringify([{ type: request.type, action: "get", result: [...collection.values()] }])}`);
        return;
      }
      if (request.action === "create") {
        const data = request.operation["data"] as FakeDocument[];
        const created = data.map((document) => {
          const withId = { ...document, _id: document._id ?? `id${this.nextId++}` };
          collection.set(withId._id, withId);
          return withId;
        });
        ws.send(`43${frame.ackId}${JSON.stringify([{ type: request.type, action: "create", result: created }])}`);
        return;
      }
      if (request.action === "update") {
        const updates = request.operation["updates"] as FakeDocument[];
        const updated = updates.map((update) => {
          const current = collection.get(update._id) ?? { _id: update._id };
          const merged = { ...current, ...update };
          collection.set(update._id, merged);
          return merged;
        });
        ws.send(`43${frame.ackId}${JSON.stringify([{ type: request.type, action: "update", result: updated }])}`);
        return;
      }
      if (request.action === "delete") {
        const ids = request.operation["ids"] as string[];
        for (const id of ids) collection.delete(id);
        ws.send(`43${frame.ackId}${JSON.stringify([{ type: request.type, action: "delete", result: ids }])}`);
      }
    });
  }
}

describe("Foundry direct client", () => {
  const servers: FakeFoundryServer[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it("joins, binds the socket session and performs document operations", async () => {
    const fake = new FakeFoundryServer();
    servers.push(fake);
    await fake.listen();

    const client = new FoundryDirectClient({
      foundryUrl: fake.url,
      credentials: { userId: "gm-id", username: "MCP Bridge GM", password: "secret" },
      requestTimeoutMs: 2_000,
      connectTimeoutMs: 2_000
    });
    await client.connect();

    const world = await client.requestWorldData();
    expect(world["world"]).toEqual({ id: "world-one" });

    const created = await client.createDocuments("Actor", [{ name: "Test Actor" }]);
    expect((created["result"] as FakeDocument[])[0]?.name).toBe("Test Actor");
    const actorId = (created["result"] as FakeDocument[])[0]?._id;
    expect(actorId).toBeTruthy();

    const updated = await client.updateDocuments("Actor", [{ _id: actorId, name: "Renamed" }]);
    expect((updated["result"] as FakeDocument[])[0]?.name).toBe("Renamed");

    const read = await client.getDocuments("Actor", { query: {} });
    expect((read["result"] as FakeDocument[])[0]?.name).toBe("Renamed");

    await client.deleteDocuments("Actor", [String(actorId)]);
    expect(fake.actors.size).toBe(0);
    await client.close();
  });

  it("rejects invalid credentials", async () => {
    const fake = new FakeFoundryServer();
    servers.push(fake);
    await fake.listen();
    const client = new FoundryDirectClient({
      foundryUrl: fake.url,
      credentials: { userId: "gm-id", username: "MCP Bridge GM", password: "wrong" },
      requestTimeoutMs: 2_000,
      connectTimeoutMs: 2_000
    });
    await expect(client.connect()).rejects.toThrow(/rejected/i);
  });
});
