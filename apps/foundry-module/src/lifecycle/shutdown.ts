import { getBridgeClient, unsubscribeBridgeSettings } from "./ready";

export function onShutdown(): void {
  unsubscribeBridgeSettings();
  getBridgeClient()?.stop();
}
