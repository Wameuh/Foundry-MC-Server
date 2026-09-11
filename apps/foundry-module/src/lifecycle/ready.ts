import { BridgeClient } from "../bridge/bridge-client";
import { contextTracker } from "../bridge/context-tracker";
import { refreshPlutoniumCapabilities } from "../integrations/plutonium/capability-probe";
import { MODULE_ID } from "../settings/register-settings";

let bridgeClient: BridgeClient | undefined;
let settingHookId: number | undefined;

export async function onReady(): Promise<void> {
  if (!game.user?.isGM) return;
  contextTracker.start();
  // Let every module finish its synchronous ready hook before probing optional APIs.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await refreshPlutoniumCapabilities();
  bridgeClient = new BridgeClient();
  bridgeClient.start();

  // Setting changes are emitted after the settings form is saved. Restarting
  // here makes URL/secret changes take effect without a page reload.
  settingHookId = Hooks.on("updateSetting", (...args: unknown[]) => {
    const setting = args[0] as { key?: unknown } | undefined;
    if (
      setting?.key === `${MODULE_ID}.bridgeUrl` ||
      setting?.key === `${MODULE_ID}.bridgeSecret`
    ) {
      bridgeClient?.restart();
    }
  });
}

export function getBridgeClient(): BridgeClient | undefined {
  return bridgeClient;
}

export function unregisterSettingHook(): void {
  if (settingHookId === undefined) return;
  Hooks.off("updateSetting", settingHookId);
  settingHookId = undefined;
}
