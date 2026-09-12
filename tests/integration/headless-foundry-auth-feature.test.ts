import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("playwright-core", () => ({
  chromium: { launchPersistentContext: vi.fn() }
}));

import type { HeadlessBrowserConfig } from "../../apps/mcp-server/src/config.js";
import { computeBridgeHmac } from "../../apps/mcp-server/src/bridge/authentication.js";
import { createChallengeHmac } from "../../apps/foundry-module/src/bridge/authenticate.js";
import { prepareFoundrySession } from "../../apps/mcp-server/src/headless/prepare-foundry-session.js";
import { PlaywrightFoundryBrowser } from "../../apps/mcp-server/src/headless/playwright-foundry-browser.js";
import { chromium } from "playwright-core";
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

class FoundryV14LoginPage {
  readonly actions: string[] = [];
  private currentUrl = "http://127.0.0.1:30000/game";

  async goto(url: string): Promise<void> {
    this.actions.push(`goto:${url}`);
    this.currentUrl = "http://127.0.0.1:30000/join";
  }

  url(): string {
    return this.currentUrl;
  }

  locator(selector: string): FoundryV14Locator {
    this.actions.push(`locator:${selector}`);
    if (selector !== 'form#join-form:visible, form[name="join"]:visible') {
      throw new Error(`Unexpected top-level selector: ${selector}`);
    }
    return new FoundryV14Form(this, true);
  }

  async waitForURL(predicate: (url: URL) => boolean): Promise<void> {
    this.currentUrl = "http://127.0.0.1:30000/game";
    expect(predicate(new URL(this.currentUrl))).toBe(true);
    this.actions.push("wait-for-url:/game");
  }

  goToGame(): void {
    this.currentUrl = "http://127.0.0.1:30000/game";
  }
}

interface FoundryV14Locator {
  first(): FoundryV14Locator;
  count(): Promise<number>;
  waitFor(options: { state: "visible"; timeout?: number }): Promise<void>;
  locator(selector: string): FoundryV14Locator;
  selectOption(option: { label: string } | { value: string }, options?: { timeout?: number }): Promise<void>;
  fill(value: string): Promise<void>;
  click(): Promise<void>;
}

class FoundryV14Form implements FoundryV14Locator {
  constructor(
    protected readonly page: FoundryV14LoginPage,
    private readonly present: boolean
  ) {}

  first(): FoundryV14Locator { return this; }
  async count(): Promise<number> { return this.present ? 1 : 0; }

  async waitFor(options: { state: "visible" }): Promise<void> {
    this.page.actions.push(`wait-form:${options.state}`);
  }

  locator(selector: string): FoundryV14Locator {
    this.page.actions.push(`form-locator:${selector}`);
    if (selector.startsWith('input[name="username"]')) return new FoundryV14Username(this.page, true);
    if (selector.startsWith('select[name="username"]')) return new FoundryV14Username(this.page, false);
    if (selector.startsWith('input[name="password"]')) return new FoundryV14Password(this.page, true);
    if (selector.startsWith('button[name="join"]')) return new FoundryV14JoinButton(this.page, true);
    throw new Error(`Unexpected form selector: ${selector}`);
  }

  async selectOption(): Promise<void> { throw new Error("selectOption called on form"); }
  async fill(): Promise<void> { throw new Error("fill called on form"); }
  async click(): Promise<void> { throw new Error("click called on form"); }
}

class FoundryV14Username extends FoundryV14Form {
  async waitFor(): Promise<void> {}
  locator(): FoundryV14Locator { throw new Error("Unexpected nested selector"); }
  async selectOption(): Promise<void> { throw new Error("selectOption called on username input"); }
  async fill(value: string): Promise<void> {
    expect(value).toBe("MCP Bridge GM");
    this.page.actions.push("fill-username:MCP Bridge GM");
  }
  async click(): Promise<void> { throw new Error("click called on username input"); }
}

class FoundryV14Password extends FoundryV14Form {
  async waitFor(): Promise<void> {}
  locator(): FoundryV14Locator { throw new Error("Unexpected nested selector"); }
  async selectOption(): Promise<void> { throw new Error("selectOption called on password"); }
  async fill(value: string): Promise<void> {
    expect(value).toBe("foundry-access-key");
    this.page.actions.push("fill-password");
  }
  async click(): Promise<void> { throw new Error("click called on password"); }
}

class FoundryV14JoinButton extends FoundryV14Form {
  async waitFor(): Promise<void> {}
  locator(): FoundryV14Locator { throw new Error("Unexpected nested selector"); }
  async selectOption(): Promise<void> { throw new Error("selectOption called on join button"); }
  async fill(): Promise<void> { throw new Error("fill called on join button"); }
  async click(): Promise<void> {
    this.page.actions.push("click-join");
    this.page.goToGame();
  }
}

describe("automated Foundry authentication feature", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("completes the Foundry v14 join form and reaches the game", async () => {
    const page = new FoundryV14LoginPage();
    const context = {
      pages: () => [page],
      newPage: async () => page,
      close: async () => undefined
    };
    vi.mocked(chromium.launchPersistentContext).mockResolvedValue(context as never);

    const browser = new PlaywrightFoundryBrowser(config);
    expect(await browser.openGame()).toBe("join");
    await browser.login(config.username, config.accessKey);

    expect(page.actions).toEqual([
      "goto:http://127.0.0.1:30000/game",
      'locator:form#join-form:visible, form[name="join"]:visible',
      "wait-form:visible",
      'form-locator:input[name="username"]:visible, input#join-username:visible, input[name="userid"]:visible',
      "fill-username:MCP Bridge GM",
      'form-locator:input[name="password"]:visible, input[type="password"]:visible',
      "fill-password",
      'form-locator:button[name="join"]:visible, button[type="submit"]:visible, input[type="submit"]:visible',
      "click-join",
      "wait-for-url:/game"
    ]);
    await browser.close();
  });

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
