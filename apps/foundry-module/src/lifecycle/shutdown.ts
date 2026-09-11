import { contextTracker } from "../bridge/context-tracker";
import { getBridgeClient } from "./ready";

export function onShutdown(): void {
  contextTracker.stop();
  getBridgeClient()?.stop();
}
