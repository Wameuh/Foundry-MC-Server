import { mkdir } from "node:fs/promises";

import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";

import type { HeadlessBrowserConfig } from "../config.js";
import type { FoundryBrowserSession, FoundryClientState } from "./types.js";

const MODULE_ID = "foundry-mcp-bridge";
const LOGIN_TIMEOUT_MS = 30_000;

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
    const formSelector = 'form#join-form:visible, form[name="join"]:visible';
    const form = page.locator(formSelector).first();
    await waitForVisible(form, LOGIN_TIMEOUT_MS, "Foundry join form", page);

    // Foundry v14.367 uses a username text field. Earlier v14 builds and
    // customized join pages can expose the same field as a select instead.
    const usernameInput = form.locator(
      'input[name="username"]:visible, input#join-username:visible, input[name="userid"]:visible'
    ).first();
    if (await usernameInput.count() > 0) {
      await usernameInput.fill(username);
    } else {
      const userSelect = form.locator(
        'select[name="username"]:visible, select#join-username:visible, select[name="userid"]:visible, select#userid:visible'
      ).first();
      await waitForVisible(userSelect, LOGIN_TIMEOUT_MS, "Foundry user selector", page);
      try {
        await userSelect.selectOption({ label: username }, { timeout: 5_000 });
      } catch {
        const matchingOption = userSelect.locator("option").filter({ hasText: username }).first();
        if (await matchingOption.count() === 0) {
          throw new Error(`Foundry user selector did not contain the requested user (${await pageDiagnostics(page)})`);
        }
        const value = await matchingOption.getAttribute("value");
        if (value === null) {
          throw new Error(`Foundry user selector option was not selectable (${await pageDiagnostics(page)})`);
        }
        await userSelect.selectOption({ value });
      }
    }

    const password = form.locator('input[name="password"]:visible, input[type="password"]:visible').first();
    await waitForVisible(password, LOGIN_TIMEOUT_MS, "Foundry password field", page);
    await password.fill(accessKey);

    const joinButton = form.locator('button[name="join"]:visible, button[type="submit"]:visible, input[type="submit"]:visible').first();
    await waitForVisible(joinButton, LOGIN_TIMEOUT_MS, "Foundry join button", page);
    await joinButton.click();
    await page.waitForURL((url) => url.pathname.endsWith("/game"), { timeout: LOGIN_TIMEOUT_MS });
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

async function waitForVisible(locator: Locator, timeout: number, element: string, page: Page): Promise<void> {
  try {
    await locator.waitFor({ state: "visible", timeout });
  } catch {
    throw new Error(`${element} was not visible within ${timeout}ms (${await pageDiagnostics(page)})`);
  }
}

async function pageDiagnostics(page: Page): Promise<string> {
  const selectors = ['form#join-form', 'form[name="join"]', 'input[name="username"]', 'select[name="username"]', 'select[name="userid"]', 'input[name="password"]', 'button[name="join"]'];
  const counts = await Promise.all(selectors.map(async (selector) => `${selector}=${await page.locator(selector).count()}`));
  return `url=${new URL(page.url()).pathname}; ${counts.join(", ")}`;
}

function route(baseUrl: string, name: string): string {
  const base = new URL(baseUrl);
  const prefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  base.pathname = `${prefix}${name}`.replace(/\/+/g, "/");
  base.search = "";
  base.hash = "";
  return base.toString();
}
