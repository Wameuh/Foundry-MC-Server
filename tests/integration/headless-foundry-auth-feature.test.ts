import { afterEach, describe, expect, it, vi } from "vitest";

import type { HeadlessBrowserConfig } from "../../apps/mcp-server/src/config.js";
import { computeBridgeHmac } from "../../apps/mcp-server/src/bridge/authentication.js";
import { createChallengeHmac } from "../../apps/foundry-module/src/bridge/authenticate.js";
import { prepareFoundrySession } from "../../apps/mcp-server/src/headless/prepare-foundry-session.js";
import type {
  FoundryBrowserSession,
  FoundryClientState
} from "../../apps/mcp-server/src/headless/types.js";

const config: HeadlessBrowserConfig = {
  enabled: true,
  foundryUrl: "http://127.0.0.1:30000",
  username: "MCP Bridge GM",
  accessKey: "foundry-access-key",
  bridgeUrl: "ws://127.0.0.1:3210/foundry-mcp/bridge",
  chromiumPath: "/usr/bin/chromium",
  profilePath: "/tmp/foundry-mcp-test-profile",
  readyTimeoutMs: 300_000,
  retryMs: 10_000,
  bridgeGraceMs: 60_000
};

class FeatureBrowser implements FoundryBrowserSession {
  readonly calls: string[] = [];

  constructor(
    private readonly destination: "game" | "join",
    private readonly state: FoundryClientState = { isGm: true, moduleActive: true, userName: "MCP Bridge GM" }
  ) {}

  async openGame() {
    this.calls.push("open-game");
    return this.destination;
  }

  async login(username: string, accessKey: string) {
    this.calls.push(`login:${username}:${accessKey}`);
  }

  async waitForFoundry() {
    this.calls.push("wait-for-foundry");
    return this.state;
  }

  async configureBridge(bridgeUrl: string, bridgeSecret: string) {
    this.calls.push(`configure:${bridgeUrl}:${bridgeSecret}`);
  }

  async close() {}
}

describe("automated Foundry authentication feature", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates the same bridge proof on an insecure HTTP page without Web Crypto", async () => {
    vi.stubGlobal("crypto", {});
    const inputs = ["shared-secret", "nonce-value-at-least-16", "test", "assistant-user"] as const;

    expect(createChallengeHmac(...inputs)).toBe(computeBridgeHmac(...inputs));
  });

  it("logs in a dedicated GM and configures its local bridge", async () => {
    const browser = new FeatureBrowser("join");

    await prepareFoundrySession(browser, config, "shared-bridge-secret");

    expect(browser.calls).toEqual([
      "open-game",
      "login:MCP Bridge GM:foundry-access-key",
      "wait-for-foundry",
      "configure:ws://127.0.0.1:3210/foundry-mcp/bridge:shared-bridge-secret"
    ]);
  });

  it("reuses an authenticated profile without submitting credentials again", async () => {
    const browser = new FeatureBrowser("game");

    await prepareFoundrySession(browser, config, "shared-bridge-secret");

    expect(browser.calls.some((call) => call.startsWith("login:"))).toBe(false);
    expect(browser.calls.at(-1)).toContain("configure:");
  });

  it("refuses a session that did not authenticate as a GM", async () => {
    const browser = new FeatureBrowser("game", { isGm: false, moduleActive: true, userName: "MCP Bridge GM" });
    await expect(prepareFoundrySession(browser, config, "shared-bridge-secret")).rejects.toThrow(/not a GM/i);
    expect(browser.calls.some((call) => call.startsWith("configure:"))).toBe(false);
  });

  it("refuses a persistent profile authenticated as another GM", async () => {
    const browser = new FeatureBrowser("game", { isGm: true, moduleActive: true, userName: "Regular GM" });
    await expect(prepareFoundrySession(browser, config, "shared-bridge-secret")).rejects.toThrow(/different user/i);
    expect(browser.calls.some((call) => call.startsWith("configure:"))).toBe(false);
  });
});
