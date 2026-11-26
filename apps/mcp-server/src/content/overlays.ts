import { asArray, asRecord, cloneJson, deepMerge, expandDottedKeys, stableId } from "./json.js";
import type { JsonRecord } from "./types.js";

function documentEffects(overlayEffects: unknown[], warnings: string[]): { byFoundryId: Map<string, JsonRecord>; documents: JsonRecord[] } {
  const byFoundryId = new Map<string, JsonRecord>();
  const documents: JsonRecord[] = [];
  for (const [index, candidate] of overlayEffects.entries()) {
    const effect = asRecord(candidate);
    if (!effect) {
      warnings.push(`Overlay warning: ignored non-object effect at index ${index}`);
      continue;
    }
    const clone = cloneJson(effect);
    const foundryId = typeof clone["foundryId"] === "string" ? clone["foundryId"] : undefined;
    const name = typeof clone["name"] === "string" ? clone["name"] : `Imported effect ${index + 1}`;
    const id = stableId("effect", foundryId ?? `${name}:${index}`);
    delete clone["foundryId"];
    clone["_id"] = id;
    clone["name"] = name;
    if (!("disabled" in clone)) clone["disabled"] = false;
    if (!("transfer" in clone)) clone["transfer"] = true;
    if (!("type" in clone)) clone["type"] = "base";
    if (asRecord(clone["descriptionEntries"]) && !clone["description"]) {
      warnings.push(`Overlay warning: effect ${name} uses descriptionEntries; structured description was approximated`);
    }
    delete clone["descriptionEntries"];
    documents.push(clone);
    if (foundryId) byFoundryId.set(foundryId, clone);
  }
  return { byFoundryId, documents };
}

function normalizeActivities(value: unknown, effectIds: Map<string, JsonRecord>, warnings: string[]): JsonRecord {
  const output: JsonRecord = {};
  const entries = Array.isArray(value)
    ? value.map((activity, index) => [String(index), activity] as const)
    : Object.entries(asRecord(value) ?? {});
  for (const [fallbackKey, candidate] of entries) {
    const activity = asRecord(candidate);
    if (!activity) {
      warnings.push(`Overlay warning: ignored non-object activity ${fallbackKey}`);
      continue;
    }
    const clone = cloneJson(activity);
    const type = typeof clone["type"] === "string" ? clone["type"] : "utility";
    const name = typeof clone["name"] === "string" && clone["name"] ? clone["name"] : type;
    const id = typeof clone["_id"] === "string"
      ? clone["_id"]
      : typeof clone["foundryId"] === "string"
        ? stableId("activity", clone["foundryId"])
        : stableId("activity", fallbackKey, type, name);
    delete clone["foundryId"];
    clone["_id"] = id;
    clone["type"] = type;
    if (!clone["name"]) clone["name"] = name;
    const effects = asArray(clone["effects"]).map((reference, referenceIndex) => {
      const referenceRecord = asRecord(reference);
      if (!referenceRecord) return reference;
      const foundryId = referenceRecord["foundryId"];
      if (typeof foundryId !== "string") return reference;
      const effect = effectIds.get(foundryId);
      if (!effect) return reference;
      const expanded = cloneJson(referenceRecord);
      delete expanded["foundryId"];
      expanded["_id"] = effect["_id"];
      return expanded;
    }).filter((reference) => {
      if (asRecord(reference)) return true;
      warnings.push(`Overlay warning: ignored malformed effect reference on activity ${name}`);
      return false;
    });
    if (effects.length) clone["effects"] = effects;
    else delete clone["effects"];
    output[id] = clone;
  }
  return output;
}

export function applyFoundryOverlay(system: JsonRecord, overlay: JsonRecord | undefined, warnings: string[]): {
  system: JsonRecord;
  effects: JsonRecord[];
} {
  if (!overlay) return { system, effects: [] };
  let merged = system;
  const overlaySystem = asRecord(overlay["system"]);
  if (overlaySystem) {
    merged = deepMerge(merged, expandDottedKeys(overlaySystem, warnings, "Foundry overlay"));
  }
  const { byFoundryId, documents } = documentEffects(asArray(overlay["effects"]), warnings);
  const activities = normalizeActivities(overlay["activities"], byFoundryId, warnings);
  if (Object.keys(activities).length) {
    merged = deepMerge(merged, { activities });
  }
  return { system: merged, effects: documents };
}
