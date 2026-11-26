import { describe, expect, it } from "vitest";

import { LocalContentCatalog } from "../../../apps/mcp-server/src/content/catalog.js";
import { convertContentEntry } from "../../../apps/mcp-server/src/content/converter.js";
import type { JsonRecord } from "../../../apps/mcp-server/src/content/types.js";

const DATA_PATH = "/data/Data/modules/plutonium/data";
const catalog = new LocalContentCatalog(DATA_PATH);

async function convert(kind: "spell" | "item" | "creature", name: string, source: string) {
  const { entry, foundryOverlay } = await catalog.get({ kind, name, source });
  await catalog.warm("spell");
  return convertContentEntry({
    kind,
    entry: entry.raw,
    ...(foundryOverlay ? { foundryOverlay } : {}),
    resolveSpell: (spellName, spellSource) => {
      const found = catalog.getCached({ kind: "spell", name: spellName, ...(spellSource ? { source: spellSource } : {}) });
      return found ? { entry: found.entry.raw, ...(found.foundryOverlay ? { foundryOverlay: found.foundryOverlay } : {}) } : undefined;
    }
  });
}

function system(result: { document: JsonRecord }): JsonRecord {
  return result.document["system"] as JsonRecord;
}

describe("content converters against real Plutonium data", () => {
  it("converts Absorb Elements completely and preserves overlay activities and effects", async () => {
    const result = await convert("spell", "Absorb Elements", "XGE");
    const doc = result.document;
    const data = system(result);
    expect(result.documentType).toBe("Item");
    expect(doc["type"]).toBe("spell");
    expect(doc["name"]).toBe("Absorb Elements");
    expect(data["level"]).toBe(1);
    expect(data["school"]).toBe("abj");
    expect((data["activation"] as JsonRecord)["type"]).toBe("reaction");
    expect((data["duration"] as JsonRecord)["units"]).toBe("round");
    expect(data["properties"]).toEqual(expect.arrayContaining(["somatic"]));
    expect(String((data["description"] as JsonRecord)["value"])).toContain("1d6");
    expect(String((data["description"] as JsonRecord)["value"])).not.toContain("{@");
    expect(Object.keys(data["activities"] as JsonRecord).length).toBeGreaterThan(0);
    expect(Array.isArray(doc["effects"])).toBe(true);
    expect((doc["effects"] as JsonRecord[]).length).toBeGreaterThan(0);
    expect((doc["effects"] as JsonRecord[]).some((effect) => String(effect["name"]).includes("Resistance"))).toBe(true);
  });

  it("converts the Longsword as a martial weapon with damage, properties and an attack activity", async () => {
    const result = await convert("item", "Longsword", "PHB");
    const doc = result.document;
    const data = system(result);
    expect(doc["type"]).toBe("weapon");
    expect((data["type"] as JsonRecord)["value"]).toBe("martialM");
    expect((data["damage"] as JsonRecord)["base"]).toMatchObject({ number: 1, denomination: 8, types: ["slashing"] });
    expect((data["damage"] as JsonRecord)["versatile"]).toMatchObject({ number: 1, denomination: 10 });
    expect(data["properties"]).toEqual(expect.arrayContaining(["ver"]));
    expect(data["price"]).toMatchObject({ value: 15, denomination: "gp" });
    expect(Object.keys(data["activities"] as JsonRecord).length).toBeGreaterThan(0);
    expect(String((data["description"] as JsonRecord)["value"])).not.toContain("{@");
  });

  it("converts the Cat as a valid basic NPC with abilities, movement, skills and feature items", async () => {
    const result = await convert("creature", "Cat", "MM");
    const doc = result.document;
    const data = system(result);
    expect(result.documentType).toBe("Actor");
    expect(doc["type"]).toBe("npc");
    expect((data["abilities"] as JsonRecord)["dex"]).toMatchObject({ value: 15 });
    expect((data["attributes"] as JsonRecord)["hp"]).toMatchObject({ value: 2, max: 2 });
    expect((data["attributes"] as JsonRecord)["ac"]).toMatchObject({ flat: 12 });
    expect(((data["attributes"] as JsonRecord)["movement"] as JsonRecord)["speeds"]).toMatchObject({ walk: 40, climb: 30 });
    expect((data["details"] as JsonRecord)["cr"]).toBe(0);
    expect((data["traits"] as JsonRecord)["size"]).toBe("tiny");
    expect((data["skills"] as JsonRecord)["prc"]).toMatchObject({ value: 1 });
    const features = doc["items"] as JsonRecord[];
    expect(features.length).toBeGreaterThan(0);
    expect(features.every((feature) => feature["type"] === "feat")).toBe(true);
    expect(features.some((feature) => feature["name"] === "Claws")).toBe(true);
  });
  it("converts the Mage spellcasting trait and resolves its prepared spell items", async () => {
    const result = await convert("creature", "Mage", "MM");
    const doc = result.document;
    const data = system(result);
    const items = doc["items"] as JsonRecord[];
    const spellcastingFeature = items.find((item) => item["name"] === "Spellcasting" && item["type"] === "feat");
    expect(spellcastingFeature).toBeDefined();
    const featureDescription = String(((spellcastingFeature as JsonRecord)["system"] as JsonRecord)["description"] && ((((spellcastingFeature as JsonRecord)["system"] as JsonRecord)["description"] as JsonRecord)["value"]));
    expect(featureDescription).toContain("Cantrips");
    expect(featureDescription).toContain("3rd level");
    expect(featureDescription).not.toContain("{@");
    const spells = items.filter((item) => item["type"] === "spell");
    expect(spells.length).toBe(16);
    const fireball = spells.find((item) => item["name"] === "Fireball");
    expect(fireball).toBeDefined();
    expect(((fireball as JsonRecord)["system"] as JsonRecord)["level"]).toBe(3);
    expect(((fireball as JsonRecord)["system"] as JsonRecord)["method"]).toBe("spell");
    expect(((fireball as JsonRecord)["system"] as JsonRecord)["prepared"]).toBe(1);
    const fireBolt = spells.find((item) => item["name"] === "Fire Bolt");
    expect(((fireBolt as JsonRecord)["system"] as JsonRecord)["prepared"]).toBe(2);
    expect((data["attributes"] as JsonRecord)["spellcasting"]).toBe("int");
    expect(result.warnings.some((warning) => warning.includes("not imported in converter v1"))).toBe(false);
  });

  it("converts daily innate spellcasting with innate preparation", async () => {
    const result = await convert("creature", "Barlgura", "MM");
    const items = result.document["items"] as JsonRecord[];
    expect(items.some((item) => item["name"] === "Innate Spellcasting" && item["type"] === "feat")).toBe(true);
    const entangle = items.find((item) => item["name"] === "Entangle" && item["type"] === "spell");
    expect(entangle).toBeDefined();
    expect(((entangle as JsonRecord)["system"] as JsonRecord)["method"]).toBe("innate");
    expect(((entangle as JsonRecord)["system"] as JsonRecord)["prepared"]).toBe(2);
  });

  it("keeps unresolved spellcasting entries as placeholders with explicit warnings", async () => {
    const { entry } = await catalog.get({ kind: "creature", name: "Acolyte", source: "MM" });
    const raw = JSON.parse(JSON.stringify(entry.raw)) as JsonRecord;
    (((raw["spellcasting"] as JsonRecord[])[0]?.["spells"] as JsonRecord)["0"] as JsonRecord)["spells"] = ["{@spell definitely not a real spell}"];
    await catalog.warm("spell");
    const result = convertContentEntry({
      kind: "creature",
      entry: raw,
      resolveSpell: (spellName, spellSource) => {
        const found = catalog.getCached({ kind: "spell", name: spellName, ...(spellSource ? { source: spellSource } : {}) });
        return found ? { entry: found.entry.raw, ...(found.foundryOverlay ? { foundryOverlay: found.foundryOverlay } : {}) } : undefined;
      }
    });
    const items = result.document["items"] as JsonRecord[];
    expect(items.some((item) => item["name"] === "definitely not a real spell" && item["type"] === "spell")).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("definitely not a real spell") && warning.includes("not found"))).toBe(true);
  });

});
