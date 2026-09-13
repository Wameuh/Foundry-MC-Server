import { mkdir } from "node:fs/promises";

import { chromium, type BrowserContext, type Locator, type Page } from "playwright-core";

import type { HeadlessBrowserConfig } from "../config.js";
import {
  defaultChromiumProfileLockDeps,
  prepareChromiumProfile,
  type ChromiumProfileLockDeps
} from "./chromium-profile-lock.js";
import type { FoundryBrowserSession, FoundryClientState } from "./types.js";

const MODULE_ID = "foundry-mcp-bridge";
const LOGIN_TIMEOUT_MS = 30_000;
const BASE_CHROMIUM_ARGS = ["--disable-dev-shm-usage"] as const;
const NO_SANDBOX_ARGS = ["--no-sandbox", "--disable-setuid-sandbox"] as const;

/** Foundry VTT 14 ApplicationV2 join UI (`#join-game-form`), verified on 14.364 and targeted at certified 14.367. */
export const FOUNDRY_V14_JOIN_FORM_SELECTOR =
  'form#join-game-form:visible, form#join-form:visible, form[name="join"]:visible';

export type PlaywrightFoundryBrowserOptions = {
  profileLock?: ChromiumProfileLockDeps;
  launchPersistentContext?: typeof chromium.launchPersistentContext;
};

export class PlaywrightFoundryBrowser implements FoundryBrowserSession {
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private readonly profileLock: ChromiumProfileLockDeps;
  private readonly launchPersistentContext: typeof chromium.launchPersistentContext;

  constructor(
    private readonly config: HeadlessBrowserConfig,
    options: PlaywrightFoundryBrowserOptions = {}
  ) {
    this.profileLock = options.profileLock ?? defaultChromiumProfileLockDeps;
    this.launchPersistentContext = options.launchPersistentContext ?? chromium.launchPersistentContext.bind(chromium);
  }

  async openGame(): Promise<"game" | "join"> {
    await mkdir(this.config.profilePath, { recursive: true });
    const preparation = await prepareChromiumProfile(this.config.profilePath, this.profileLock);
    try {
      this.context = await this.launchWithSandboxPolicy();
    } finally {
      await preparation.release();
    }
    const context = this.context;
    if (!context) throw new Error("Chromium launch did not produce a browser context");
    this.page = context.pages()[0] ?? await context.newPage();
    await this.page.goto(route(this.config.foundryUrl, "game"), { waitUntil: "domcontentloaded" });
    return new URL(this.page.url()).pathname.endsWith("/join") ? "join" : "game";
  }

  async login(username: string, accessKey: string): Promise<void> {
    const page = this.requirePage();
    // Prefer ApplicationV2 `#join-game-form` (Foundry 14.364+/14.367), keep legacy `#join-form` / name=join fallbacks.
    const form = page.locator(FOUNDRY_V14_JOIN_FORM_SELECTOR).first();
    await waitForVisible(form, LOGIN_TIMEOUT_MS, "Foundry join form", page);

    // Foundry v14.367 commonly uses a username text field. Some 14.x builds and
    // customized join pages expose the same field as a <select name="userid"> instead.
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

  private async launchWithSandboxPolicy(): Promise<BrowserContext> {
    const sandboxedArgs = [...BASE_CHROMIUM_ARGS];
    const unsandboxedArgs = [...BASE_CHROMIUM_ARGS, ...NO_SANDBOX_ARGS];

    if (this.config.chromiumNoSandbox === true) {
      return this.launchPersistentContext(this.config.profilePath, launchOptions(this.config, unsandboxedArgs));
    }

    try {
      return await this.launchPersistentContext(this.config.profilePath, launchOptions(this.config, sandboxedArgs));
    } catch (error) {
      if (this.config.chromiumNoSandbox !== "auto" || !isSandboxLaunchFailure(error)) throw error;
      return this.launchPersistentContext(this.config.profilePath, launchOptions(this.config, unsandboxedArgs));
    }
  }

  private requirePage(): Page {
    if (!this.page) throw new Error("The Foundry browser is not open");
    return this.page;
  }
}

function launchOptions(config: HeadlessBrowserConfig, args: string[]) {
  return {
    executablePath: config.chromiumPath,
    headless: true,
    viewport: { width: 1440, height: 900 },
    args
  };
}

export function isSandboxLaunchFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  // Only Chromium sandbox diagnostics — never generic launch crashes (OOM, profile, etc.).
  return /no usable sandbox|zygote_host_impl_linux.*sandbox|please install the chromium-sandbox|try using --no-sandbox/i.test(
    message
  );
}

async function waitForVisible(locator: Locator, timeout: number, element: string, page: Page): Promise<void> {
  try {
    await locator.waitFor({ state: "visible", timeout });
  } catch {
    throw new Error(`${element} was not visible within ${timeout}ms (${await pageDiagnostics(page)})`);
  }
}

async function pageDiagnostics(page: Page): Promise<string> {
  const selectors = ['form#join-game-form', 'form#join-form', 'form[name="join"]', 'input[name="username"]', 'select[name="username"]', 'select[name="userid"]', 'input[name="password"]', 'button[name="join"]'];
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
