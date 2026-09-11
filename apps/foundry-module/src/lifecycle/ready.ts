import { BridgeClient } from "../bridge/bridge-client";
import { contextTracker } from "../bridge/context-tracker";
import { refreshPlutoniumCapabilities } from "../integrations/plutonium/capability-probe";

let bridgeClient: BridgeClient | undefined;

export async function onReady(): Promise<void> {
  if (!game.user?.isGM) return;
  contextTracker.start();
  // Let every module finish its synchronous ready hook before probing optional APIs.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await refreshPlutoniumCapabilities();
  bridgeClient = new BridgeClient();
  bridgeClient.start();
}

export function getBridgeClient(): BridgeClient | undefined {
  return bridgeClient;
}
