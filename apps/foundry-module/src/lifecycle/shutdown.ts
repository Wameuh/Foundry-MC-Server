import { contextTracker } from "../bridge/context-tracker";
import { getBridgeClient, unregisterSettingHook } from "./ready";

export function onShutdown(): void {
  contextTracker.stop();
  unregisterSettingHook();
  getBridgeClient()?.stop();
}
