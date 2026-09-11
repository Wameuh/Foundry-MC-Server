import { mkdir } from "node:fs/promises";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import type { HeadlessBrowserConfig } from "../config.js";
import type { FoundryBrowserSession, FoundryClientState } from "./types.js";

const MODULE_ID = "foundry-mcp-bridge";

export class PlaywrightFoundryBrowser implements FoundryBrowserSession {
  private context: BrowserContext | undefined;
  private page: Page | undefined;

  constructor(private readonly config: HeadlessBrowserConfig) {}

  async openGame(): Promise<"game" | "join"> {
    await mkdir(this.config.profilePath, { recursive: true });
    this.context = await chromium.launchPersistentContext(this.config.profilePath, {
      executablePath: this.config.chromiumPath,
      headless: true,
      viewport: { width: 1280, height: 900 },
      args: ["--disable-dev-shm-usage"]
    });
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    await this.page.goto(route(this.config.foundryUrl, "game"), { waitUntil: "domcontentloaded" });
    return new URL(this.page.url()).pathname.endsWith("/join") ? "join" : "game";
  }

  async login(username: string, accessKey: string): Promise<void> {
    const page = this.requirePage();
    const form = page.locator('form[name="join"]');
    await form.waitFor({ state: "visible" });
    await form.locator('input[name="username"]').fill(username);
    await form.locator('input[name="password"]').fill(accessKey);
    await form.locator('button[name="join"]').click();
    await page.waitForURL((url) => url.pathname.endsWith("/game"), { timeout: 30_000 });
  }

  async waitForFoundry(): Promise<FoundryClientState> {
    const page = this.requirePage();
    await page.waitForFunction(() => Boolean((globalThis as unknown as { game?: { ready?: boolean } }).game?.ready), undefined, {
      timeout: this.config.readyTimeoutMs
    });
    return page.evaluate((moduleId) => {
      const foundryGame = (globalThis as unknown as {
        game: {
          user?: { isGM?: boolean; name?: string };
          modules?: Map<string, { active?: boolean }>;
        };
      }).game;
      return {
        isGm: foundryGame.user?.isGM === true,
        moduleActive: foundryGame.modules?.get(moduleId)?.active === true,
        userName: foundryGame.user?.name ?? ""
      };
    }, MODULE_ID);
  }

  async configureBridge(bridgeUrl: string, bridgeSecret: string): Promise<void> {
    const page = this.requirePage();
    await page.evaluate(async ({ moduleId, url, secret }) => {
      const foundryGame = (globalThis as unknown as {
        game: {
          settings: {
            get(module: string, key: string): unknown;
            set(module: string, key: string, value: unknown): Promise<unknown>;
          };
        };
      }).game;
      // Set the secret first. The URL update is last and triggers the useful reconnect.
      if (foundryGame.settings.get(moduleId, "bridgeSecret") !== secret) {
        await foundryGame.settings.set(moduleId, "bridgeSecret", secret);
      }
      if (foundryGame.settings.get(moduleId, "bridgeUrl") !== url) {
        await foundryGame.settings.set(moduleId, "bridgeUrl", url);
      }
    }, { moduleId: MODULE_ID, url: bridgeUrl, secret: bridgeSecret });
  }

  async close(): Promise<void> {
    const context = this.context;
    this.page = undefined;
    this.context = undefined;
    await context?.close();
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("The Foundry browser is not open");
    return this.page;
  }
}

function route(baseUrl: string, name: string): string {
  const base = new URL(baseUrl);
  const prefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  base.pathname = `${prefix}${name}`.replace(/\/+/g, "/");
  base.search = "";
  base.hash = "";
  return base.toString();
}
