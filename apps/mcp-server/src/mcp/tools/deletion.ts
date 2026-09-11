import {
  BridgeOperation,
  ConfirmDeletionInputSchema,
  PrepareDeletionInputSchema
} from "@foundry-mcp/protocol";

import { prepareDeletion } from "../../deletion/prepare-deletion.js";
import { runTool, type ToolRegistrar } from "./shared.js";

export const registerDeletionTools: ToolRegistrar = (server, dependencies) => {
  server.registerTool("foundry_prepare_delete", {
    description: "Preview exact Foundry deletion targets and issue a short-lived one-use confirmation token.",
    inputSchema: PrepareDeletionInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false }
  }, async (input) => runTool(() => prepareDeletion(
    dependencies.router,
    dependencies.confirmations,
    input.reason === undefined ? { uuids: input.uuids } : { uuids: input.uuids, reason: input.reason }
  )));

  server.registerTool("foundry_confirm_delete", {
    description: "Permanently delete only the exact targets from a valid, unexpired deletion preview.",
    inputSchema: ConfirmDeletionInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  }, async (input) => runTool(async () => {
    const confirmed = dependencies.confirmations.consume(input);
    return dependencies.router.route(
      BridgeOperation.DELETE_DOCUMENTS,
      { confirmed: true, uuids: confirmed.uuids },
      { tool: "foundry_confirm_delete" }
    );
  }));
};
