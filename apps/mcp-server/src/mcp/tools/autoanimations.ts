import {
  AutoAnimationsGetAutorecInputSchema,
  AutoAnimationsGetCapabilitiesInputSchema,
  AutoAnimationsGetItemInputSchema,
  AutoAnimationsSearchCatalogInputSchema,
  AutoAnimationsSetItemInputSchema,
  BridgeOperation
} from "@foundry-mcp/protocol";

import { runTool, type ToolRegistrar } from "./shared.js";

export const registerAutoAnimationsTools: ToolRegistrar = (server, { router }) => {
  server.registerTool("autoanimations_get_capabilities", {
    description:
      "Report whether Automated Animations is active and which item/autorec/catalog APIs are available through the Foundry bridge.",
    inputSchema: AutoAnimationsGetCapabilitiesInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) =>
    runTool(() =>
      router.route(BridgeOperation.AUTOANIMATIONS_GET_CAPABILITIES, input, {
        tool: "autoanimations_get_capabilities"
      })
    ));

  server.registerTool("autoanimations_get_item_animation", {
    description:
      "Read the Automated Animations flags on a Foundry Item and report any Global Automatic Recognition name match.",
    inputSchema: AutoAnimationsGetItemInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) =>
    runTool(() =>
      router.route(BridgeOperation.AUTOANIMATIONS_GET_ITEM, input, {
        tool: "autoanimations_get_item_animation"
      })
    ));

  server.registerTool("autoanimations_set_item_animation", {
    description:
      "Assign or update Automated Animations settings on a Foundry Item (for example a spell) by writing flags.autoanimations.",
    inputSchema: AutoAnimationsSetItemInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async (input) =>
    runTool(() =>
      router.route(BridgeOperation.AUTOANIMATIONS_SET_ITEM, input, {
        tool: "autoanimations_set_item_animation"
      })
    ));

  server.registerTool("autoanimations_get_autorec", {
    description:
      "Read the Automated Animations Global Automatic Recognition menus via AutomatedAnimations.AutorecManager.getAutorecEntries().",
    inputSchema: AutoAnimationsGetAutorecInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) =>
    runTool(() =>
      router.route(BridgeOperation.AUTOANIMATIONS_GET_AUTOREC, input, {
        tool: "autoanimations_get_autorec"
      })
    ));

  server.registerTool("autoanimations_search_catalog", {
    description:
      "Search Sequencer database paths registered under autoanimations (typically JB2A assets mirrored by Automated Animations).",
    inputSchema: AutoAnimationsSearchCatalogInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async (input) =>
    runTool(() =>
      router.route(BridgeOperation.AUTOANIMATIONS_SEARCH_CATALOG, input, {
        tool: "autoanimations_search_catalog"
      })
    ));
};
