import { OperationError, requireRecord, requireString } from "../../operations/errors";
import { toDocumentReference } from "../../operations/document-reference";
import { refreshAutoAnimationsCapabilities } from "./capability-probe";
import { autoanimationsUnavailable } from "./errors";
import { readItemAutoAnimationFlags } from "./flag-builder";
import { getAutomatedAnimationsApi } from "./detect";

function rinseName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function findAutorecMatch(itemName: string): Record<string, unknown> | undefined {
  const api = getAutomatedAnimationsApi();
  if (!api) return undefined;
  const menus = api.AutorecManager.getAutorecEntries();
  const categories = ["melee", "range", "ontoken", "templatefx", "aura", "preset"] as const;
  const combined: Array<Record<string, unknown>> = [];
  for (const key of categories) {
    const entries = menus[key];
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (entry && typeof entry === "object") combined.push(entry as Record<string, unknown>);
      }
    }
  }
  const rinsed = rinseName(itemName);
  const sorted = combined.sort((a, b) => labelKeyLength(b.label) - labelKeyLength(a.label));
  const exact = sorted.find((entry) => entry.label === itemName);
  if (exact) return summarizeAutorec(exact);
  const best = sorted.find(
    (entry) => typeof entry.label === "string" && rinsed.includes(rinseName(entry.label)),
  );
  return best ? summarizeAutorec(best) : undefined;
}

function labelKeyLength(value: unknown): number {
  return typeof value === "string" ? value.replace(/\s+/g, "").length : 0;
}

function summarizeAutorec(entry: Record<string, unknown>): Record<string, unknown> {
  const primary =
    entry.primary && typeof entry.primary === "object"
      ? (entry.primary as Record<string, unknown>)
      : undefined;
  const video =
    primary?.video && typeof primary.video === "object"
      ? (primary.video as Record<string, unknown>)
      : undefined;
  return {
    id: entry.id,
    label: entry.label,
    menu: entry.menu,
    primaryVideo: video
      ? {
          dbSection: video.dbSection,
          menuType: video.menuType,
          animation: video.animation,
          variant: video.variant,
          color: video.color,
          enableCustom: video.enableCustom,
          customPath: video.customPath,
        }
      : undefined,
  };
}

export async function getItemAnimation(payload: unknown) {
  const capabilities = refreshAutoAnimationsCapabilities();
  if (!capabilities.itemRead) throw autoanimationsUnavailable(capabilities);

  const input = requireRecord(payload);
  const uuid = requireString(input.uuid, "uuid");
  const document = await fromUuid(uuid);
  if (!document) throw new OperationError("DOCUMENT_NOT_FOUND", `Document ${uuid} was not found.`);
  if (document.documentName !== "Item") {
    throw new OperationError("DOCUMENT_TYPE_UNSUPPORTED", "Automated Animations item tools require an Item document.");
  }

  const flags = readItemAutoAnimationFlags(document);
  const name = document.name ?? document.id;
  return {
    document: toDocumentReference(document),
    flags: flags ?? null,
    isCustomized: flags?.isCustomized === true,
    isEnabled: flags?.isEnabled !== false,
    menu: typeof flags?.menu === "string" ? flags.menu : null,
    autorecMatch: findAutorecMatch(name) ?? null,
  };
}
