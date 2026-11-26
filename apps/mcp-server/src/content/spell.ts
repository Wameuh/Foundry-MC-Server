import { asArray, asRecord, boolean, number, slugify, text } from "./json.js";
import { applyFoundryOverlay } from "./overlays.js";
import { render5etoolsBlocks } from "./tag-renderer.js";
import { CONTENT_CONVERTER_VERSION, type ConversionInput, type ConversionResult, type JsonRecord } from "./types.js";

const SCHOOLS: Record<string, { key: string; icon: string }> = {
  A: { key: "abj", icon: "systems/dnd5e/icons/svg/schools/abjuration.svg" },
  C: { key: "con", icon: "systems/dnd5e/icons/svg/schools/conjuration.svg" },
  D: { key: "div", icon: "systems/dnd5e/icons/svg/schools/divination.svg" },
  E: { key: "enc", icon: "systems/dnd5e/icons/svg/schools/enchantment.svg" },
  V: { key: "evo", icon: "systems/dnd5e/icons/svg/schools/evocation.svg" },
  I: { key: "ill", icon: "systems/dnd5e/icons/svg/schools/illusion.svg" },
  N: { key: "nec", icon: "systems/dnd5e/icons/svg/schools/necromancy.svg" },
  T: { key: "trs", icon: "systems/dnd5e/icons/svg/schools/transmutation.svg" }
};

function activation(entry: JsonRecord, warnings: string[]): JsonRecord {
  const first = asRecord(asArray(entry["time"])[0]);
  if (!first) {
    warnings.push("Spell approximation: missing casting time; defaulted to 1 action");
    return { type: "action", value: 1 };
  }
  const unit = text(first["unit"], "action");
  const type = ["action", "bonus", "reaction", "minute", "hour", "day"].includes(unit) ? unit : "special";
  if (type !== unit) warnings.push(`Spell approximation: unsupported casting time unit ${unit}`);
  return {
    type,
    ...(number(first["number"], 1) ? { value: number(first["number"], 1) } : {}),
    ...(typeof first["condition"] === "string" && first["condition"] ? { condition: first["condition"] } : {})
  };
}

function range(entry: JsonRecord, warnings: string[]): JsonRecord {
  const rangeData = asRecord(entry["range"]);
  const distance = asRecord(rangeData?.["distance"]);
  const type = text(distance?.["type"], "self");
  if (type === "self") return { units: "self" };
  if (type === "touch") return { units: "touch" };
  if (type === "feet") return { ...(distance?.["amount"] !== undefined ? { value: number(distance?.["amount"], 0) } : {}), units: "ft" };
  if (type === "miles") return { ...(distance?.["amount"] !== undefined ? { value: number(distance?.["amount"], 0) } : {}), units: "mi" };
  if (type === "sight") return { units: "spec", special: "Sight" };
  if (type === "unlimited") return { units: "any" };
  warnings.push(`Spell approximation: unsupported range type ${type}; imported as special`);
  return { units: "spec", ...(type ? { special: type } : {}) };
}

function target(entry: JsonRecord): JsonRecord | undefined {
  const rangeData = asRecord(entry["range"]);
  const shape = text(rangeData?.["type"], "point");
  const distance = asRecord(rangeData?.["distance"]);
  const amount = number(distance?.["amount"], 0);
  const type = shape === "cone" ? "cone"
    : shape === "cube" ? "cube"
      : shape === "line" ? "line"
        : ["sphere", "radius", "emanation", "hemisphere", "cylinder"].includes(shape) ? "circle"
          : "";
  if (!type) return undefined;
  return {
    template: {
      type,
      ...(amount ? { size: String(amount) } : {}),
      units: "ft"
    },
    affects: {}
  };
}

function duration(entry: JsonRecord, warnings: string[]): { duration: JsonRecord; concentration: boolean } {
  const first = asRecord(asArray(entry["duration"])[0]);
  if (!first) return { duration: { units: "inst" }, concentration: false };
  const type = text(first["type"], "instant");
  const concentration = boolean(first["concentration"]);
  if (type === "instant") return { duration: { units: "inst" }, concentration };
  if (type === "permanent") return { duration: { units: "perm" }, concentration };
  if (type === "special") return { duration: { units: "spec", special: "Special" }, concentration };
  if (type === "timed") {
    const timed = asRecord(first["duration"]);
    const unit = text(timed?.["type"], "round");
    if (!["turn", "round", "minute", "hour", "day", "week", "month", "year"].includes(unit)) {
      warnings.push(`Spell approximation: unsupported duration unit ${unit}; imported as special`);
      return { duration: { units: "spec", special: unit }, concentration };
    }
    return {
      duration: {
        ...(timed?.["amount"] !== undefined ? { value: String(number(timed?.["amount"], 0)) } : {}),
        units: unit
      },
      concentration
    };
  }
  warnings.push(`Spell approximation: unsupported duration type ${type}; imported as instantaneous`);
  return { duration: { units: "inst" }, concentration };
}

function components(entry: JsonRecord, warnings: string[]): { properties: string[]; materials: JsonRecord } {
  const raw = asRecord(entry["components"]) ?? {};
  const properties: string[] = [];
  if (raw["v"] === true) properties.push("vocal");
  if (raw["s"] === true) properties.push("somatic");
  const material = raw["m"];
  let materialText = "";
  let cost = 0;
  let consumed = false;
  if (typeof material === "string") materialText = material;
  else {
    const record = asRecord(material);
    if (record) {
      materialText = text(record["text"]);
      cost = number(record["cost"], 0) / 100;
      consumed = record["consume"] === true;
    }
  }
  if (material) properties.push("material");
  if (raw["r"]) warnings.push("Spell approximation: component flag r is not represented in dnd5e spell properties");
  return {
    properties,
    materials: {
      value: materialText,
      consumed,
      cost,
      supply: 0
    }
  };
}

export function convertSpell(input: ConversionInput): ConversionResult {
  const warnings: string[] = [];
  const entry = input.entry;
  const name = text(entry["name"], "Unnamed spell");
  const source = text(entry["source"]);
  const school = SCHOOLS[text(entry["school"])] ?? SCHOOLS["A"];
  if (!SCHOOLS[text(entry["school"])]) warnings.push(`Spell approximation: unknown school ${text(entry["school"])}; defaulted to abjuration`);
  const durationData = duration(entry, warnings);
  const componentData = components(entry, warnings);
  const properties = [...componentData.properties];
  if (durationData.concentration) properties.push("concentration");
  if (boolean(asRecord(entry["meta"])?.["ritual"])) properties.push("ritual");
  const descriptionParts = [
    render5etoolsBlocks(asArray(entry["entries"]), warnings),
    render5etoolsBlocks(asArray(entry["entriesHigherLevel"]), warnings)
  ].filter(Boolean);
  const description = descriptionParts.join("\n");
  const page = entry["page"];
  const systemWithoutOverlay: JsonRecord = {
    description: { value: description, chat: description },
    identifier: slugify(name),
    source: {
      book: source,
      ...(typeof page === "number" ? { page: String(page) } : {}),
      custom: `${source}${typeof page === "number" ? ` p. ${page}` : ""}`.trim(),
      rules: "2014"
    },
    level: number(entry["level"], 0),
    school: school?.key ?? "abj",
    activation: activation(entry, warnings),
    duration: durationData.duration,
    range: range(entry, warnings),
    materials: componentData.materials,
    properties,
    method: "",
    prepared: 0
  };
  const targetData = target(entry);
  if (targetData) systemWithoutOverlay["target"] = targetData;
  const overlaid = applyFoundryOverlay(systemWithoutOverlay, input.foundryOverlay, warnings);
  if (!Object.keys(asRecord(overlaid.system["activities"]) ?? {}).length) {
    warnings.push("Spell warning: no mechanized damage, attack, save, or utility activity was available from the Foundry overlay; the spell is primarily reference text");
  }
  const document: JsonRecord = {
    name,
    type: "spell",
    img: school?.icon,
    system: overlaid.system,
    ...(overlaid.effects.length ? { effects: overlaid.effects } : {}),
    flags: {
      "foundry-mcp-bridge": {
        contentImport: {
          kind: "spell",
          name,
          source,
          converterVersion: CONTENT_CONVERTER_VERSION
        }
      }
    }
  };
  return {
    converterVersion: CONTENT_CONVERTER_VERSION,
    supportLevel: warnings.some((warning) => warning.includes("approximation")) ? "partial" : "full",
    documentType: "Item",
    document,
    warnings,
    source: { kind: "spell", name, source }
  };
}
