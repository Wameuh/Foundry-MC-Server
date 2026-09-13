import {
  AutoAnimationsSetItemInputSchema,
  type AutoAnimationsMenu,
  type AutoAnimationsVideo,
} from "@foundry-mcp/protocol";
import { emptyReceipt, toDocumentReference } from "../../operations/document-reference";
import { OperationError, requireGm } from "../../operations/errors";
import { assertSafeObject } from "../../operations/safe-data";
import { refreshAutoAnimationsCapabilities } from "./capability-probe";
import { AUTOANIMATIONS_FLAG_VERSION, AUTOANIMATIONS_MODULE_ID } from "./detect";
import { AutoAnimationsError, autoanimationsUnavailable } from "./errors";
import { buildItemAnimationFlags, readItemAutoAnimationFlags } from "./flag-builder";

export async function setItemAnimation(payload: unknown, operationId: string) {
  requireGm();
  const capabilities = refreshAutoAnimationsCapabilities();
  if (!capabilities.itemWrite) throw autoanimationsUnavailable(capabilities);

  const parsed = AutoAnimationsSetItemInputSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AutoAnimationsError("AUTOANIMATIONS_INVALID_FLAGS", "Invalid Automated Animations item payload.", {
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }
  const input = parsed.data;
  const document = await fromUuid(input.uuid);
  if (!document) throw new OperationError("DOCUMENT_NOT_FOUND", `Document ${input.uuid} was not found.`);
  if (document.documentName !== "Item") {
    throw new OperationError("DOCUMENT_TYPE_UNSUPPORTED", "Automated Animations item tools require an Item document.");
  }

  let flags: Record<string, unknown>;
  if (input.flags) {
    assertSafeObject(input.flags, "flags");
    flags = {
      ...input.flags,
      isCustomized: true,
      isEnabled: input.isEnabled,
      menu: input.menu,
      version: typeof input.flags.version === "number" ? input.flags.version : AUTOANIMATIONS_FLAG_VERSION,
      label: typeof input.flags.label === "string" ? input.flags.label : document.name ?? document.id,
    };
  } else if (input.primary) {
    const existing = readItemAutoAnimationFlags(document);
    flags = buildItemAnimationFlags({
      label: document.name ?? document.id,
      menu: input.menu as AutoAnimationsMenu,
      isEnabled: input.isEnabled,
      primary: input.primary as AutoAnimationsVideo,
      ...(existing ? { existing } : {}),
      merge: input.merge,
    });
  } else {
    throw new AutoAnimationsError("AUTOANIMATIONS_INVALID_FLAGS", "primary is required unless flags is provided.");
  }

  const updated = await document.update(
    { flags: { [AUTOANIMATIONS_MODULE_ID]: flags } },
    { diff: false, recursive: true },
  );

  return {
    ...emptyReceipt(operationId, "autoanimations"),
    providerVersion: capabilities.version,
    updated: [toDocumentReference(updated)],
    flags,
  };
}
