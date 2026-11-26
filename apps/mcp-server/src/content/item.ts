import { asArray, boolean, number, slugify, stableId, text } from "./json.js";
import { applyFoundryOverlay } from "./overlays.js";
import { render5etoolsBlocks } from "./tag-renderer.js";
import { CONTENT_CONVERTER_VERSION, type ConversionInput, type ConversionResult, type JsonRecord } from "./types.js";

const PROPERTY_MAP: Record<string, string> = {
  "2H": "two",
  A: "amm",
  AF: "amm",
  F: "fin",
  H: "hvy",
  L: "lgt",
  LD: "lod",
  R: "rch",
  RL: "rel",
  T: "thr",
  V: "ver",
  S: "spc"
};

const DAMAGE_TYPES: Record<string, string> = {
  A: "acid",
  B: "bludgeoning",
  C: "cold",
  F: "fire",
  R: "radiant",
  L: "lightning",
  N: "necrotic",
  P: "piercing",
  O: "poison",
  Y: "psychic",
  S: "slashing",
  T: "thunder",
  U: "force"
};

function price(valueCopper: number): JsonRecord {
  if (!valueCopper) return { value: 0, denomination: "gp" };
  if (valueCopper % 10_000 === 0) return { value: valueCopper / 10_000, denomination: "pp" };
  if (valueCopper % 100 === 0) return { value: valueCopper / 100, denomination: "gp" };
  if (valueCopper % 10 === 0) return { value: valueCopper / 10, denomination: "sp" };
  return { value: valueCopper, denomination: "cp" };
}

function baseType(rawType: string): string {
  return (rawType.split("|")[0] ?? rawType).trim();
}

function damagePart(formula: unknown, damageType: unknown, warnings: string[]): JsonRecord | undefined {
  if (typeof formula !== "string" || !formula.trim()) return undefined;
  const match = formula.trim().match(/^(\d*)d(\d+)(?:\s*\+\s*(\d+))?/i);
  if (!match) {
    warnings.push(`Item approximation: unsupported damage formula ${formula}`);
    return undefined;
  }
  const typeKey = text(damageType).toUpperCase();
  const type = DAMAGE_TYPES[typeKey];
  if (damageType && !type) warnings.push(`Item approximation: unknown damage type ${text(damageType)}`);
  return {
    number: Number(match[1] || 1),
    denomination: Number(match[2] || 0),
    ...(match[3] ? { bonus: match[3] } : {}),
    types: type ? [type] : []
  };
}

function weaponProperties(entry: JsonRecord): string[] {
  return asArray(entry["property"]).map((property) => PROPERTY_MAP[text(property)]).filter((property): property is string => Boolean(property));
}

function weaponType(entry: JsonRecord): string {
  const category = text(entry["weaponCategory"], "simple").toLocaleLowerCase() === "martial" ? "martial" : "simple";
  const isMelee = baseType(text(entry["type"], "M")) !== "R";
  return `${category}${isMelee ? "M" : "R"}`;
}

function weaponSystem(entry: JsonRecord, warnings: string[]): JsonRecord {
  const damage = damagePart(entry["dmg1"], entry["dmgType"], warnings) ?? { types: [] };
  const versatile = damagePart(entry["dmg2"], entry["dmgType"], warnings);
  const rawRange = text(entry["range"]);
  const [shortRange, longRange] = rawRange.split("/").map((part) => Number(part.trim()));
  return {
    type: { value: weaponType(entry), baseItem: slugify(text(entry["name"])) },
    damage: {
      base: damage,
      ...(versatile ? { versatile } : {})
    },
    range: {
      ...(Number.isFinite(shortRange) ? { value: shortRange } : {}),
      ...(Number.isFinite(longRange) ? { long: longRange } : {}),
      reach: 5,
      units: "ft"
    },
    properties: weaponProperties(entry),
    magicalBonus: "",
    ammunition: {},
    armor: {},
    proficient: null,
    mastery: ""
  };
}

function weaponActivity(entry: JsonRecord): JsonRecord {
  const melee = baseType(text(entry["type"], "M")) !== "R";
  const id = stableId("weapon-attack", text(entry["name"]), text(entry["source"]));
  return {
    [id]: {
      _id: id,
      type: "attack",
      name: "Attack",
      activation: { type: "action", value: 1 },
      attack: {
        type: { value: melee ? "melee" : "ranged", classification: "weapon" },
        flat: false
      },
      damage: { includeBase: true, parts: [] },
      consumption: { spellSlot: false, targets: [] },
      uses: { spent: 0, recovery: [] }
    }
  };
}

function equipmentType(entry: JsonRecord): string {
  const type = baseType(text(entry["type"]));
  if (type === "LA") return "light";
  if (type === "MA") return "medium";
  if (type === "HA") return "heavy";
  if (type === "S") return "shield";
  if (boolean(entry["wondrous"])) return "wondrous";
  if (type === "RD") return "rod";
  if (type === "RG") return "ring";
  if (type === "WD") return "wand";
  return "trinket";
}

function equipmentSystem(entry: JsonRecord, warnings: string[]): JsonRecord {
  const type = equipmentType(entry);
  const system: JsonRecord = {
    type: { value: type, baseItem: slugify(text(entry["name"])) },
    armor: {},
    proficient: null,
    properties: [],
    strength: 0
  };
  if (["light", "medium", "heavy", "shield"].includes(type)) {
    system["armor"] = {
      value: number(entry["ac"], type === "shield" ? 2 : 10),
      ...(type === "light" ? {} : type === "medium" ? { dex: 2 } : { dex: 0 })
    };
    if (entry["strength"]) system["strength"] = Number(entry["strength"]) || 0;
    if (entry["stealth"] === true) system["properties"] = ["stealthDisadvantage"];
  } else if (entry["ac"] !== undefined) {
    warnings.push("Item approximation: armor class value exists on non-armor equipment and was not mapped");
  }
  return system;
}

function toolSystem(entry: JsonRecord): JsonRecord {
  const type = baseType(text(entry["type"]));
  return {
    type: {
      value: type === "AT" ? "art" : type === "GS" ? "game" : type === "INS" ? "music" : "",
      baseItem: slugify(text(entry["name"]))
    },
    ability: "int",
    proficient: null,
    properties: []
  };
}

function consumableSystem(entry: JsonRecord): JsonRecord {
  const type = baseType(text(entry["type"]));
  return {
    type: {
      value: boolean(entry["poison"]) ? "poison" : type === "P" ? "potion" : type === "SC" ? "scroll" : type === "A" ? "ammo" : "trinket",
      subtype: ""
    },
    properties: [],
    uses: { spent: 0, recovery: [] }
  };
}

function itemKind(entry: JsonRecord): "weapon" | "equipment" | "tool" | "consumable" | "loot" {
  const type = baseType(text(entry["type"]));
  if (boolean(entry["weapon"]) || type === "M" || type === "R") return "weapon";
  if (["LA", "MA", "HA", "S"].includes(type) || boolean(entry["armor"]) || boolean(entry["wondrous"]) || ["RD", "RG", "WD"].includes(type)) return "equipment";
  if (["AT", "GS", "INS", "T"].includes(type)) return "tool";
  if (["A", "P", "SC"].includes(type) || boolean(entry["poison"])) return "consumable";
  return "loot";
}

export function convertItem(input: ConversionInput): ConversionResult {
  const warnings: string[] = [];
  const entry = input.entry;
  const name = text(entry["name"], "Unnamed item");
  const source = text(entry["source"]);
  const kind = itemKind(entry);
  if (kind === "loot") warnings.push("Item warning: no weapon, armor, tool, or consumable specifics were derivable; imported as generic loot");
  const description = render5etoolsBlocks(asArray(entry["entries"]), warnings);
  const page = entry["page"];
  const rarity = text(entry["rarity"], "none").toLocaleLowerCase();
  const base: JsonRecord = {
    description: { value: description, chat: description },
    identifier: slugify(name),
    source: {
      book: source,
      ...(typeof page === "number" ? { page: String(page) } : {}),
      custom: `${source}${typeof page === "number" ? ` p. ${page}` : ""}`.trim(),
      rules: "2014"
    },
    quantity: Math.max(1, Math.trunc(number(entry["quantity"], 1))),
    weight: { value: number(entry["weight"], 0), units: "lb" },
    price: price(number(entry["value"], 0)),
    rarities: rarity && rarity !== "none" ? [rarity.replaceAll(" ", "")] : [],
    attunement: entry["reqAttune"] ? "required" : "",
    attuned: false,
    equipped: false,
    identified: true,
    uses: { spent: 0, recovery: [] }
  };
  const specific = kind === "weapon" ? weaponSystem(entry, warnings)
    : kind === "equipment" ? equipmentSystem(entry, warnings)
      : kind === "tool" ? toolSystem(entry)
        : kind === "consumable" ? consumableSystem(entry)
          : { type: { value: "gear", subtype: "" }, properties: [] };
  let system: JsonRecord = { ...base, ...specific };
  if (kind === "weapon") system = { ...system, activities: weaponActivity(entry) };
  const overlaid = applyFoundryOverlay(system, input.foundryOverlay, warnings);
  const img = kind === "weapon" ? "systems/dnd5e/icons/svg/items/weapon.svg"
    : kind === "equipment" ? "systems/dnd5e/icons/svg/items/equipment.svg"
      : kind === "tool" ? "systems/dnd5e/icons/svg/items/tool.svg"
        : kind === "consumable" ? "systems/dnd5e/icons/svg/items/consumable.svg"
          : "systems/dnd5e/icons/svg/items/loot.svg";
  const document: JsonRecord = {
    name,
    type: kind,
    img,
    system: overlaid.system,
    ...(overlaid.effects.length ? { effects: overlaid.effects } : {}),
    flags: {
      "foundry-mcp-bridge": {
        contentImport: {
          kind: "item",
          name,
          source,
          converterVersion: CONTENT_CONVERTER_VERSION
        }
      }
    }
  };
  return {
    converterVersion: CONTENT_CONVERTER_VERSION,
    supportLevel: warnings.some((warning) => warning.includes("approximation") || warning.includes("generic loot")) ? "partial" : "full",
    documentType: "Item",
    document,
    warnings,
    source: { kind: "item", name, source }
  };
}
