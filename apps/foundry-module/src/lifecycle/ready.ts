import { BridgeClient } from "../bridge/bridge-client";
import { subscribeToBridgeSettings } from "../settings/register-settings";
import { offerAssistantAccountProvisioning } from "../provisioning/assistant-account";

let bridgeClient: BridgeClient | undefined;
let unsubscribeFromBridgeSettings: (() => void) | undefined;

export function onReady(): void {
  if (!game.user?.isGM) return;
  // Connect synchronously from our ready hook; the control channel is small
  // and independent of module initialization order.
  bridgeClient = new BridgeClient();
  bridgeClient.start();

  // Client-scoped settings use their registered onChange callback.
  unsubscribeFromBridgeSettings = subscribeToBridgeSettings(() => bridgeClient?.restart());

  void offerAssistantAccountProvisioning(bridgeClient);
}

export function getBridgeClient(): BridgeClient | undefined {
  return bridgeClient;
}

export function unsubscribeBridgeSettings(): void {
  unsubscribeFromBridgeSettings?.();
  unsubscribeFromBridgeSettings = undefined;
}
