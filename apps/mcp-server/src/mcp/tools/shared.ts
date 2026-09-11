import type { McpServer } from "@modelcontextprotocol/server";

import type { CapabilityCache } from "../../bridge/capability-cache.js";
import type { RequestRouter } from "../../bridge/request-router.js";
import type { SessionRegistry } from "../../bridge/session-registry.js";
import type { ConfirmationStore } from "../../deletion/confirmation-store.js";
import { errorDetails } from "../../errors.js";

export type ToolDependencies = {
  router: RequestRouter;
  sessions: SessionRegistry;
  capabilities: CapabilityCache;
  confirmations: ConfirmationStore;
};

export type ToolRegistrar = (server: McpServer, dependencies: ToolDependencies) => void;

export function toolSuccess(value: unknown) {
  const serializable = JSON.parse(JSON.stringify(value ?? null)) as unknown;
  const structuredContent = serializable && typeof serializable === "object" && !Array.isArray(serializable)
    ? serializable as Record<string, unknown>
    : { result: serializable };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(serializable, null, 2) }],
    structuredContent
  };
}

export function toolFailure(error: unknown) {
  const details = JSON.parse(JSON.stringify(errorDetails(error))) as Record<string, unknown>;
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
    structuredContent: { error: details }
  };
}

export async function runTool(callback: () => Promise<unknown>) {
  try {
    return toolSuccess(await callback());
  } catch (error) {
    return toolFailure(error);
  }
}
