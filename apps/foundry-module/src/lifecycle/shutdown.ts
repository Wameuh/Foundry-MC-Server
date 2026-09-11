import { contextTracker } from "../bridge/context-tracker";
import { getBridgeClient, unsubscribeBridgeSettings } from "./ready";

export function onShutdown(): void {
  contextTracker.stop();
  unsubscribeBridgeSettings();
  getBridgeClient()?.stop();
}
