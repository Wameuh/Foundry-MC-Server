import { asArray, asRecord, number, slugify, stableId, text } from "./json.js";
import { applyFoundryOverlay } from "./overlays.js";
import { convertSpell } from "./spell.js";
import { render5etoolsBlocks, render5etoolsText } from "./tag-renderer.js";
import { CONTENT_CONVERTER_VERSION, type ConversionInput, type ConversionResult, type JsonRecord } from "./types.js";

const SIZES: Record<string, string> = { T: "tiny", S: "sm", M: "med", L: "lg", H: "huge", G: "grg" };
const SKILLS: Record<string, string> = {
  acrobatics: "acr",
  animalHandling: "ani",
  animalhandling: "ani",
  arcana: "arc",
  athletics: "ath",
  deception: "dec",
  history: "his",
  insight: "ins",
  intimidation: "itm",
  investigation: "inv",
  medicine: "med",
  nature: "nat",
  perception: "prc",
  performance: "prf",
  persuasion: "per",
  religion: "rel",
  sleightOfHand: "slp",
  sleightofhand: "slp",
  stealth: "ste",
  survival: "sur"
};
const SKILL_ABILITIES: Record<string, string> = {
  acr: "dex", ani: "wis", arc: "int", ath: "str", dec: "cha", his: "int", ins: "wis", itm: "cha", inv: "int",
  med: "wis", nat: "int", prc: "wis", prf: "cha", per: "cha", rel: "int", slp: "dex", ste: "dex", sur: "wis"
};
const DAMAGE_TYPES = new Set(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"]);
const LANGUAGES: Record<string, string> = {
  common: "common", draconic: "draconic", dwarvish: "dwarvish", elvish: "elvish", giant: "giant", gnomish: "gnomish",
  goblin: "goblin", halfling: "halfling", orc: "orc", aarakocra: "aarakocra", abyssal: "abyssal", celestial: "celestial",
  "deep speech": "deep", deepspeech: "deep", druidic: "druidic", gith: "gith", gnoll: "gnoll", infernal: "infernal",
  primordial: "primordial", aquan: "aquan", auran: "auran", ignan: "ignan", terran: "terran", sylvan: "sylvan",
  undercommon: "undercommon", "thieves' cant": "cant", "thieves cant": "cant"
};

function parseCr(value: unknown): number {
  if (typeof value === "number") return value;
  const raw = text(value, "0");
  if (raw.includes("/")) {
    const [numerator, denominator] = raw.split("/").map(Number);
    return denominator && numerator !== undefined ? numerator / denominator : 0;
  }
  return Number(raw) || 0;
}

export function proficiencyForCr(cr: number): number {
  return 2 + Math.max(0, Math.floor((Math.max(1, cr) - 1) / 4));
}

function modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function creatureType(value: unknown): { value: string; subtype: string; swarm: string; custom: string } {
  if (typeof value === "string") return { value, subtype: "", swarm: "", custom: "" };
  const record = asRecord(value);
  const type = text(record?.["type"], "");
  const tags = asArray(record?.["tags"]).map((tag) => typeof tag === "string" ? tag : text(asRecord(tag)?.["tag"])).filter(Boolean);
  return {
    value: type || "",
    subtype: tags.join(", "),
    swarm: "",
    custom: ""
  };
}

function alignment(value: unknown): string {
  const values = asArray(value).map((entry) => text(entry)).filter(Boolean);
  if (!values.length) return "";
  if (values.includes("U")) return "unaligned";
  if (values.includes("A")) return "any alignment";
  const names: Record<string, string> = { L: "lawful", N: "neutral", C: "chaotic", G: "good", E: "evil" };
  return values.map((entry) => names[entry] ?? entry.toLocaleLowerCase()).join(" ");
}

function movement(value: unknown): JsonRecord {
  const record = asRecord(value) ?? {};
  const speeds: JsonRecord = {};
  let hover = false;
  for (const key of ["walk", "burrow", "climb", "fly", "swim"] as const) {
    const entry = record[key];
    if (typeof entry === "number") speeds[key] = entry;
    else {
      const nested = asRecord(entry);
      if (typeof nested?.["number"] === "number") speeds[key] = nested["number"];
      if (key === "fly" && nested?.["condition"] === true) hover = true;
    }
  }
  if (!speeds["walk"]) speeds["walk"] = 0;
  return { speeds, units: "ft", ...(hover ? { hover: true } : {}) };
}

function senses(value: unknown): JsonRecord {
  const ranges: JsonRecord = {};
  const special: string[] = [];
  for (const entry of asArray(value)) {
    const raw = text(entry);
    const match = raw.match(/^(blindsight|darkvision|tremorsense|truesight)\s+(\d+(?:\.\d+)?)\s*ft/i);
    if (match?.[1] && match[2]) ranges[match[1].toLocaleLowerCase()] = Number(match[2]);
    else if (raw) special.push(raw);
  }
  return { ranges, units: "ft", special: special.join("; ") };
}

function traitValues(value: unknown, valid: Set<string>, warnings: string[], label: string): { value: string[]; custom: string } {
  const chosen: string[] = [];
  const custom: string[] = [];
  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      const normalized = entry.toLocaleLowerCase();
      if (valid.has(normalized)) chosen.push(normalized);
      else {
        custom.push(entry);
        warnings.push(`Creature approximation: ${label} value ${entry} was preserved as custom text`);
      }
      return;
    }
    const record = asRecord(entry);
    if (!record) return;
    const nested = asArray(record[label] ?? record["resist"] ?? record["immune"] ?? record["vulnerable"] ?? record["conditionImmune"]);
    for (const child of nested) visit(child);
    if (typeof record["note"] === "string") custom.push(String(record["note"]));
    if (typeof record["special"] === "string") custom.push(String(record["special"]));
  };
  for (const entry of asArray(value)) visit(entry);
  return { value: [...new Set(chosen)], custom: custom.join("; ") };
}

function skills(raw: unknown, abilities: Record<string, number>, proficiency: number, warnings: string[]): JsonRecord {
  const output: JsonRecord = {};
  for (const [rawName, rawValue] of Object.entries(asRecord(raw) ?? {})) {
    const key = SKILLS[rawName] ?? SKILLS[rawName.toLocaleLowerCase()];
    if (!key) {
      warnings.push(`Creature approximation: unknown skill ${rawName} was dropped`);
      continue;
    }
    const total = Number(text(rawValue).replace("+", ""));
    const ability = SKILL_ABILITIES[key] ?? "int";
    const expectedWithoutProficiency = modifier(abilities[ability] ?? 10);
    const extra = total - expectedWithoutProficiency;
    const value = extra >= proficiency * 2 ? 2 : extra >= proficiency ? 1 : 0;
    output[key] = {
      value,
      ability,
      ...(value === 0 && total !== expectedWithoutProficiency ? { bonuses: { passive: String(total - expectedWithoutProficiency) } } : {})
    };
    if (value === 0 && total !== expectedWithoutProficiency) {
      warnings.push(`Creature approximation: skill ${rawName} total ${total} does not match a standard proficiency progression`);
    }
  }
  return output;
}

function saveProficiencies(raw: unknown): Record<string, number> {
  const output: Record<string, number> = {};
  for (const ability of ["str", "dex", "con", "int", "wis", "cha"] as const) {
    output[ability] = asRecord(raw)?.[ability] !== undefined ? 1 : 0;
  }
  return output;
}

function featureDocument(feature: unknown, category: string, creatureName: string, source: string, index: number, warnings: string[]): JsonRecord | undefined {
  const record = asRecord(feature);
  if (!record) return undefined;
  const name = text(record["name"], `${category} ${index + 1}`);
  const description = render5etoolsBlocks(asArray(record["entries"]), warnings);
  const id = stableId("creature-feature", creatureName, source, category, name, index);
  return {
    _id: id,
    name,
    type: "feat",
    img: "systems/dnd5e/icons/svg/items/feature.svg",
    system: {
      description: { value: description, chat: description },
      identifier: slugify(name),
      source: { book: source, custom: source, rules: "2014" },
      type: { value: "monster", subtype: category },
      requirements: null,
      properties: [],
      uses: { spent: 0, recovery: [] }
    },
    flags: {
      "foundry-mcp-bridge": {
        contentImport: {
          kind: "creature-feature",
          featureType: category,
          creature: creatureName,
          source,
          converterVersion: CONTENT_CONVERTER_VERSION
        }
      }
    }
  };
}

function features(entry: JsonRecord, name: string, source: string, warnings: string[]): JsonRecord[] {
  const groups: Array<[string, string[]]> = [
    ["trait", asArray(entry["trait"]).map((value) => value).filter((value) => value !== undefined) as string[]],
    ["action", asArray(entry["action"]).map((value) => value).filter((value) => value !== undefined) as string[]],
    ["bonus", asArray(entry["bonus"]).map((value) => value).filter((value) => value !== undefined) as string[]],
    ["reaction", asArray(entry["reaction"]).map((value) => value).filter((value) => value !== undefined) as string[]],
    ["legendary", asArray(entry["legendary"]).map((value) => value).filter((value) => value !== undefined) as string[]],
    ["mythic", asArray(entry["mythic"]).map((value) => value).filter((value) => value !== undefined) as string[]]
  ];
  return groups.flatMap(([category, values]) =>
    values.map((feature, index) => featureDocument(feature, category, name, source, index, warnings))
      .filter((feature): feature is JsonRecord => Boolean(feature))
  );
}

type SpellReference = { raw: string; name: string; source?: string | undefined; note: string };
type EmbeddedSpell = SpellReference & { level: number; method: string; prepared: number; groupLabel: string };

function parseSpellReference(rawValue: unknown): SpellReference | undefined {
  const raw = text(rawValue).trim();
  const match = raw.match(/\{@spell\s+([^}|]+)(?:\|([^}|]+))?(?:\|([^}]+))?\}(.*)/i);
  if (!match) return undefined;
  const name = (match[1] ?? "").replace(/\*+\s*$/, "").trim();
  if (!name) return undefined;
  const second = (match[2] ?? "").trim();
  const third = (match[3] ?? "").trim();
  const trailing = (match[4] ?? "").trim();
  const source = /^[A-Z0-9]{2,12}$/i.test(second) ? second.toUpperCase() : undefined;
  const note = [source ? third : second, trailing].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { raw, name, ...(source ? { source } : {}), note };
}

function ordinal(level: number): string {
  return level === 1 ? "1st" : level === 2 ? "2nd" : level === 3 ? "3rd" : `${level}th`;
}

function spellReferences(entries: unknown): SpellReference[] {
  return asArray(entries).map(parseSpellReference).filter((entry): entry is SpellReference => Boolean(entry));
}

function formatReferenceList(refs: SpellReference[]): string {
  return refs.map((ref) => render5etoolsText(ref.raw)).join(", ");
}

function spellcastingBlocks(entry: JsonRecord, creatureName: string, source: string, input: ConversionInput, warnings: string[]): { features: JsonRecord[]; spells: JsonRecord[] } {
  const featuresOut: JsonRecord[] = [];
  const spellsOut: JsonRecord[] = [];
  const seenSpells = new Set<string>();
  for (const [blockIndex, blockValue] of asArray(entry["spellcasting"]).entries()) {
    const block = asRecord(blockValue);
    if (!block) continue;
    const blockName = text(block["name"], "Spellcasting");
    const embedded: EmbeddedSpell[] = [];
    const listParts: string[] = [];
    const addGroup = (refs: SpellReference[], label: string, level: number, method: string, prepared: number): void => {
      if (!refs.length) return;
      listParts.push(`<p><strong>${label}:</strong> ${formatReferenceList(refs)}</p>`);
      for (const ref of refs) embedded.push({ ...ref, level, method, prepared, groupLabel: label });
    };
    addGroup(spellReferences(block["will"]), "At will", 0, "atwill", 2);
    const daily = asRecord(block["daily"]) ?? {};
    for (const key of Object.keys(daily).sort()) {
      const times = /^(\d+)/.exec(key)?.[1] ?? "1";
      addGroup(spellReferences(daily[key]), `${times}/day each`, 0, "innate", 2);
    }
    const levels = asRecord(block["spells"]) ?? {};
    for (const levelKey of Object.keys(levels).sort((a, b) => Number(a) - Number(b))) {
      const level = Number(levelKey);
      const levelData = asRecord(levels[levelKey]) ?? {};
      const slots = number(levelData["slots"], 0);
      const label = level === 0 ? "Cantrips (at will)" : `${ordinal(level)} level${slots ? ` (${slots} slots)` : ""}`;
      addGroup(spellReferences(levelData["spells"]), label, level, "spell", level === 0 ? 2 : 1);
    }
    const header = render5etoolsBlocks(asArray(block["headerEntries"]), warnings);
    const footer = render5etoolsBlocks(asArray(block["footerEntries"]), warnings);
    const description = [header, ...listParts, footer].filter(Boolean).join("\n");
    const id = stableId("creature-spellcasting", creatureName, source, blockName, blockIndex);
    featuresOut.push({
      _id: id,
      name: blockName,
      type: "feat",
      img: "systems/dnd5e/icons/svg/items/feature.svg",
      system: {
        description: { value: description, chat: description },
        identifier: slugify(blockName),
        source: { book: source, custom: source, rules: "2014" },
        type: { value: "monster", subtype: "spellcasting" },
        requirements: null,
        properties: [],
        uses: { spent: 0, recovery: [] }
      },
      flags: { "foundry-mcp-bridge": { contentImport: { kind: "creature-spellcasting", creature: creatureName, source, converterVersion: CONTENT_CONVERTER_VERSION } } }
    });
    for (const ref of embedded) {
      const key = `${ref.name.toLocaleLowerCase()}|${ref.method}|${ref.level}`;
      if (seenSpells.has(key)) continue;
      seenSpells.add(key);
      const resolved = input.resolveSpell?.(ref.name, ref.source);
      let spell: JsonRecord;
      if (resolved) {
        const converted = convertSpell({ kind: "spell", entry: resolved.entry, ...(resolved.foundryOverlay ? { foundryOverlay: resolved.foundryOverlay } : {}) });
        spell = converted.document;
        for (const warning of converted.warnings) warnings.push(`Spell ${ref.name}: ${warning}`);
      } else {
        warnings.push(`Creature spellcasting warning: spell ${ref.name} was not found in the local spell catalog; imported as a reference-only placeholder`);
        spell = {
          name: ref.name,
          type: "spell",
          img: "systems/dnd5e/icons/svg/schools/abjuration.svg",
          system: {
            description: { value: `<p>${render5etoolsText(ref.raw)}</p>`, chat: `<p>${render5etoolsText(ref.raw)}</p>` },
            identifier: slugify(ref.name),
            source: { custom: source, rules: "2014" },
            level: ref.level,
            school: "abj",
            activation: { type: "action", value: 1 },
            duration: { units: "inst" },
            range: { units: "self" },
            materials: { value: "", consumed: false, cost: 0, supply: 0 },
            properties: []
          }
        };
      }
      const spellSystem = asRecord(spell["system"]) ?? {};
      spellSystem["method"] = ref.method;
      spellSystem["prepared"] = ref.prepared;
      spell["system"] = spellSystem;
      const existingFlags = asRecord(spell["flags"]) ?? {};
      const existingBridge = asRecord(existingFlags["foundry-mcp-bridge"]) ?? {};
      spell["flags"] = {
        ...existingFlags,
        "foundry-mcp-bridge": {
          ...existingBridge,
          creatureSpellcasting: { creature: creatureName, block: blockName, group: ref.groupLabel, ...(ref.note ? { note: ref.note } : {}) }
        }
      };
      spellsOut.push(spell);
    }
  }
  return { features: featuresOut, spells: spellsOut };
}

export function convertCreature(input: ConversionInput): ConversionResult {
  const warnings: string[] = [];
  const entry = input.entry;
  const name = text(entry["name"], "Unnamed creature");
  const source = text(entry["source"]);
  const cr = parseCr(entry["cr"]);
  const proficiency = proficiencyForCr(cr);
  const abilityScores = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((ability) => [ability, number(entry[ability], 10)])) as Record<string, number>;
  const saves = saveProficiencies(entry["save"]);
  const sizeKey = text(asArray(entry["size"])[0], "M");
  const acEntry = asArray(entry["ac"])[0];
  const ac = typeof acEntry === "number" ? acEntry : number(asRecord(acEntry)?.["ac"], 10);
  if (asRecord(acEntry)?.["from"]) warnings.push("Creature approximation: armor sources in the AC line were flattened to a fixed natural AC value");
  const hp = asRecord(entry["hp"]) ?? {};
  const spellcasting = asArray(entry["spellcasting"]);

  const resistanceDamageTypes = DAMAGE_TYPES;
  const baseSystem: JsonRecord = {
    abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((ability) => [ability, {
      value: abilityScores[ability] ?? 10,
      proficient: saves[ability] ?? 0
    }])),
    attributes: {
      ac: {
        flat: ac,
        calcs: ["natural"]
      },
      hp: {
        value: number(hp["average"], 1),
        max: number(hp["average"], 1),
        formula: text(hp["formula"]),
        temp: 0,
        tempmax: 0
      },
      movement: movement(entry["speed"]),
      senses: senses(entry["senses"]),
      spellcasting: text(asRecord(asArray(entry["spellcasting"])[0])?.["ability"]),
      exhaustion: 0,
      spell: { level: 0 }
    },
    details: {
      biography: { value: "", public: "" },
      alignment: alignment(entry["alignment"]),
      type: creatureType(entry["type"]),
      cr,
      habitat: { value: asArray(entry["environment"]).map((habitat) => ({ type: text(habitat) })).filter((habitat) => habitat.type), custom: "" },
      treasure: { value: [] }
    },
    traits: {
      size: SIZES[sizeKey] ?? "med",
      di: traitValues(entry["immune"], resistanceDamageTypes, warnings, "immune"),
      dr: traitValues(entry["resist"], resistanceDamageTypes, warnings, "resist"),
      dv: traitValues(entry["vulnerable"], resistanceDamageTypes, warnings, "vulnerable"),
      ci: traitValues(entry["conditionImmune"], new Set(["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]), warnings, "conditionImmune"),
      languages: {
        value: asArray(entry["languages"]).map((language) => LANGUAGES[text(language).toLocaleLowerCase()]).filter((language): language is string => Boolean(language)),
        custom: asArray(entry["languages"]).map((language) => text(language)).filter((language) => !LANGUAGES[language.toLocaleLowerCase()]).join("; ")
      }
    },
    skills: skills(entry["skill"], abilityScores, proficiency, warnings),
    source: { book: source, custom: source, rules: "2014" },
    resources: {
      legact: { max: asArray(entry["legendary"]).length ? 3 : 0, spent: 0 },
      legres: { max: 0, spent: 0 },
      lair: { value: false, initiative: 20, inside: false }
    }
  };
  if (!SIZES[sizeKey]) warnings.push(`Creature approximation: unknown size ${sizeKey}; defaulted to medium`);
  const overlaid = applyFoundryOverlay(baseSystem, input.foundryOverlay, warnings);
  const spellcastingContent = spellcastingBlocks(entry, name, source, input, warnings);
  const embeddedFeatures = [...features(entry, name, source, warnings), ...spellcastingContent.features, ...spellcastingContent.spells];
  const prototypeToken = asRecord(input.foundryOverlay?.["prototypeToken"]);
  const type = creatureType(entry["type"]);
  const creatureIcons: Record<string, string> = {
    beast: "icons/creatures/claws/claw-bear-paw-swipe-red.webp",
    humanoid: "icons/environment/people/group.webp",
    dragon: "icons/creatures/abilities/dragon-fire-breath-orange.webp",
    undead: "icons/magic/death/skull-horned-worn-fire-blue.webp"
  };
  const document: JsonRecord = {
    name,
    type: "npc",
    img: creatureIcons[type.value] ?? "icons/creatures/abilities/mouth-teeth-rows-red.webp",
    system: overlaid.system,
    ...(embeddedFeatures.length ? { items: embeddedFeatures } : {}),
    ...(overlaid.effects.length ? { effects: overlaid.effects } : {}),
    ...(prototypeToken ? { prototypeToken } : {}),
    flags: {
      "foundry-mcp-bridge": {
        contentImport: {
          kind: "creature",
          name,
          source,
          converterVersion: CONTENT_CONVERTER_VERSION,
          proficiencyBonus: proficiency
        }
      }
    }
  };
  return {
    converterVersion: CONTENT_CONVERTER_VERSION,
    supportLevel: warnings.length ? "partial" : "full",
    documentType: "Actor",
    document,
    warnings,
    source: { kind: "creature", name, source },
    proficiencyBonus: proficiency
  };
}
