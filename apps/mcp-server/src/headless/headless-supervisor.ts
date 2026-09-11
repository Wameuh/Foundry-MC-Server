import type { Logger } from "pino";

import type { AppConfig } from "../config.js";
import type { SessionRegistry } from "../bridge/session-registry.js";
import { PlaywrightFoundryBrowser } from "./playwright-foundry-browser.js";
import { prepareFoundrySession } from "./prepare-foundry-session.js";
import type { FoundryBrowserSession, HeadlessBrowserStatus, HeadlessStatusProvider } from "./types.js";

type BrowserFactory = () => FoundryBrowserSession;

export class HeadlessFoundrySupervisor implements HeadlessStatusProvider {
  private status: HeadlessBrowserStatus;
  private stopped = false;
  private browser: FoundryBrowserSession | undefined;
  private runPromise: Promise<void> | undefined;
  private sleepAbort: AbortController | undefined;

  constructor(
    private readonly config: AppConfig,
    private readonly sessions: Pick<SessionRegistry, "getActive">,
    private readonly logger: Logger,
    private readonly browserFactory: BrowserFactory = () => new PlaywrightFoundryBrowser(config.headlessBrowser)
  ) {
    this.status = config.headlessBrowser.enabled ? { state: "stopped" } : { state: "disabled" };
  }

  start(): void {
    if (!this.config.headlessBrowser.enabled || this.runPromise) return;
    this.stopped = false;
    this.status = { state: "starting" };
    this.runPromise = this.run();
  }

  async stop(): Promise<void> {
    if (!this.config.headlessBrowser.enabled) return;
    this.stopped = true;
    this.sleepAbort?.abort();
    await this.browser?.close().catch(() => undefined);
    await this.runPromise;
    this.runPromise = undefined;
    this.status = { state: "stopped" };
  }

  getStatus(): HeadlessBrowserStatus {
    return { ...this.status };
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      try {
        this.status = { state: "authenticating" };
        this.browser = this.browserFactory();
        await prepareFoundrySession(this.browser, this.config.headlessBrowser, this.config.bridgeSecret);
        this.status = { state: "waiting_for_bridge" };
        await this.waitForBridge();
        if (this.stopped) break;
        this.status = { state: "connected" };
        this.logger.info("Headless Foundry GM bridge connected");

        while (!this.stopped && this.sessions.getActive()) await this.sleep(5_000);
        if (!this.stopped) throw new Error("The Foundry bridge disconnected");
      } catch (error) {
        if (this.stopped) break;
        const message = error instanceof Error ? error.message : String(error);
        this.status = { state: "retrying", lastError: sanitizeError(message) };
        this.logger.warn({ error: sanitizeError(message) }, "Headless Foundry session failed; retrying");
      } finally {
        await this.browser?.close().catch(() => undefined);
        this.browser = undefined;
      }

      if (!this.stopped) await this.sleep(this.config.headlessBrowser.retryMs);
    }
  }

  private async waitForBridge(): Promise<void> {
    const deadline = Date.now() + this.config.headlessBrowser.bridgeGraceMs;
    while (!this.stopped && Date.now() < deadline) {
      if (this.sessions.getActive()) return;
      await this.sleep(500);
    }
    if (!this.stopped) throw new Error("The Foundry module did not establish its bridge before the deadline");
  }

  private async sleep(milliseconds: number): Promise<void> {
    const abort = new AbortController();
    this.sleepAbort = abort;
    try {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, milliseconds);
        abort.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    } finally {
      if (this.sleepAbort === abort) this.sleepAbort = undefined;
    }
  }
}

function sanitizeError(message: string): string {
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
