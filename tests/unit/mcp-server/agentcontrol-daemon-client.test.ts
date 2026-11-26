import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentControlDaemonClient, type DaemonPush } from "../../../apps/mcp-server/src/agentcontrol/daemon-client.js";
import { FakeAgentControlDaemon } from "../../helpers/fake-agentcontrol-daemon.js";

describe("AgentControlDaemonClient", () => {
  let directory: string;
  let tokenPath: string;
  let daemon: FakeAgentControlDaemon;
  let client: AgentControlDaemonClient | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "agentcontrol-client-test-"));
    tokenPath = path.join(directory, "daemon.token");
    daemon = new FakeAgentControlDaemon();
    await daemon.start();
    await writeFile(tokenPath, daemon.token, { mode: 0o600 });
  });

  afterEach(async () => {
    await client?.stop();
    await daemon.close();
    await rm(directory, { recursive: true, force: true });
  });

  function createClient(): AgentControlDaemonClient {
    client = new AgentControlDaemonClient({
      tcp: daemon.tcp,
      tokenPath,
      requestTimeoutMs: 1_000,
      initialBackoffMs: 10,
      maxBackoffMs: 25
    });
    client.start();
    return client;
  }

  it("authenticates as the first line and matches responses by request id", async () => {
    const instance = createClient();

    await expect(instance.request("list_agents")).resolves.toEqual({});

    expect(daemon.authLines).toHaveLength(1);
    expect(daemon.authLines[0]).toMatchObject({ id: 1, req: "auth", token: daemon.token });
    expect(daemon.requests[0]).toMatchObject({ req: "list_agents" });
    expect(daemon.requests[0]?.id).toBeGreaterThan(1);
  });

  it("dispatches unsolicited subscription pushes", async () => {
    const instance = createClient();
    const pushes: DaemonPush[] = [];
    instance.on("push", (push: DaemonPush) => pushes.push(push));
    await instance.request("subscribe", { session: "s-test" });

    daemon.pushAll({
      push: "event",
      session: "s-test",
      event: { seq: 1, type: "status_changed", state: "working", ts: new Date().toISOString() }
    });
    await vi.waitFor(() => expect(pushes).toHaveLength(1));
    expect(pushes[0]).toMatchObject({ push: "event", session: "s-test" });
  });

  it("rejects pending requests when the daemon disconnects", async () => {
    const instance = createClient();
    const pending = instance.request("hang");
    const rejection = expect(pending).rejects.toThrow(/disconnected/i);
    await vi.waitFor(() => expect(daemon.requests.some((request) => request.req === "hang")).toBe(true));

    await daemon.close();

    await rejection;
  });
});
