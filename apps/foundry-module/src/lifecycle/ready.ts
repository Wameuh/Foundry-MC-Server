import { BridgeClient } from "../bridge/bridge-client";
import { contextTracker } from "../bridge/context-tracker";
import { refreshPlutoniumCapabilities } from "../integrations/plutonium/capability-probe";
import { subscribeToBridgeSettings } from "../settings/register-settings";
import { offerAssistantAccountProvisioning } from "../provisioning/assistant-account";

let bridgeClient: BridgeClient | undefined;
let unsubscribeFromBridgeSettings: (() => void) | undefined;

export async function onReady(): Promise<void> {
  if (!game.user?.isGM) return;
  contextTracker.start();
  // Let every module finish its synchronous ready hook before probing optional APIs.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await refreshPlutoniumCapabilities();
  bridgeClient = new BridgeClient();
  bridgeClient.start();

  // Client-scoped settings use their registered onChange callback. This is
  // also triggered by the automated browser when it configures its profile.
  unsubscribeFromBridgeSettings = subscribeToBridgeSettings(() => bridgeClient?.restart());

  void offerAssistantAccountProvisioning();
}

export function getBridgeClient(): BridgeClient | undefined {
  return bridgeClient;
}

export function unsubscribeBridgeSettings(): void {
  unsubscribeFromBridgeSettings?.();
  unsubscribeFromBridgeSettings = undefined;
}
