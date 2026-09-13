import { BridgeClient } from "../bridge/bridge-client";
import { contextTracker } from "../bridge/context-tracker";
import { refreshAutoAnimationsCapabilities } from "../integrations/autoanimations/capability-probe";
import { refreshPlutoniumCapabilities } from "../integrations/plutonium/capability-probe";
import { subscribeToBridgeSettings } from "../settings/register-settings";
import { offerAssistantAccountProvisioning } from "../provisioning/assistant-account";

let bridgeClient: BridgeClient | undefined;
let unsubscribeFromBridgeSettings: (() => void) | undefined;

export function onReady(): void {
  if (!game.user?.isGM) return;
  contextTracker.start();

  // Connect synchronously from our ready hook. Plutonium can perform lengthy
  // asynchronous initialization, and capability discovery is recoverable.
  bridgeClient = new BridgeClient();
  bridgeClient.start();

  // Capability discovery can instantiate several Plutonium importers. Keep it
  // off the critical bridge connection path; MCP calls re-probe before use.
  void refreshPlutoniumCapabilities();
  // Automated Animations publishes window.AutomatedAnimations during aa.initialize.
  Hooks.once("aa.initialize", () => {
    refreshAutoAnimationsCapabilities();
    bridgeClient?.restart();
  });
  refreshAutoAnimationsCapabilities();

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
