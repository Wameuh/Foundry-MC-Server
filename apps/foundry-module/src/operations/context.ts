import type { FoundryContext } from "@foundry-mcp/protocol";
import { contextTracker } from "../bridge/context-tracker";

export function getContext(): FoundryContext {
  return contextTracker.snapshot();
}
