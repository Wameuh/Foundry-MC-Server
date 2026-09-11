import type { HeadlessBrowserConfig } from "../config.js";
import type { FoundryBrowserSession } from "./types.js";

export async function prepareFoundrySession(
  browser: FoundryBrowserSession,
  config: HeadlessBrowserConfig,
  bridgeSecret: string
): Promise<void> {
  const destination = await browser.openGame();
  if (destination === "join") {
    if (!config.username || !config.accessKey) throw new Error("Headless Foundry credentials are unavailable");
    await browser.login(config.username, config.accessKey);
  }

  const state = await browser.waitForFoundry();
  if (!state.isGm) throw new Error("The automated Foundry user is not a GM");
  if (config.username && state.userName !== config.username) {
    throw new Error("The persistent Foundry profile belongs to a different user");
  }
  if (!state.moduleActive) throw new Error("Foundry MCP Bridge is not active in the world");
  await browser.configureBridge(config.bridgeUrl, bridgeSecret);
}
