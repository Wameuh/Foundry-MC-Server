export const PLUTONIUM_IMPORTERS = Object.freeze([
  "creature",
  "spell",
  "item",
  "class",
  "subclass",
  "race",
  "background",
  "feat",
  "optionalfeature",
  "condition",
  "disease",
  "vehicle",
  "object",
  "table",
]);

export type PlutoniumImporterMapping = {
  importerProps: readonly string[];
  dataProps: readonly string[];
};

const DEFAULT_IMPORTER_MAPPINGS: Readonly<Record<string, PlutoniumImporterMapping>> = Object.freeze(
  Object.fromEntries(PLUTONIUM_IMPORTERS.map((prop) => [
    prop,
    Object.freeze({ importerProps: [prop], dataProps: [prop] })
  ]))
);

// Versioned because the MCP-facing `creature` name differs from the canonical
// 5etools/Plutonium JSON property `monster`.
const CERTIFIED_CREATURE_MAPPING = Object.freeze({
  importerProps: ["monster", "creature"],
  dataProps: ["monster"]
});

const VERSIONED_IMPORTER_MAPPINGS: readonly {
  version: string;
  mappings: Readonly<Record<string, PlutoniumImporterMapping>>;
}[] = Object.freeze([
  Object.freeze({
    version: "2.15.8",
    mappings: Object.freeze({
      ...DEFAULT_IMPORTER_MAPPINGS,
      creature: CERTIFIED_CREATURE_MAPPING
    })
  }),
  Object.freeze({
    version: "2.18.1.v14",
    mappings: Object.freeze({
      ...DEFAULT_IMPORTER_MAPPINGS,
      creature: CERTIFIED_CREATURE_MAPPING
    })
  }),
  Object.freeze({
    version: "2.18.3.v14",
    mappings: Object.freeze({
      ...DEFAULT_IMPORTER_MAPPINGS,
      creature: CERTIFIED_CREATURE_MAPPING
    })
  })
]);

export function getPlutoniumImporterMapping(mcpType: string, version?: string): PlutoniumImporterMapping | undefined {
  if (!isKnownImporter(mcpType)) return undefined;
  const versioned = version
    ? VERSIONED_IMPORTER_MAPPINGS.find((entry) => version === entry.version)
    : undefined;
  return versioned?.mappings[mcpType] ?? DEFAULT_IMPORTER_MAPPINGS[mcpType];
}

export function isKnownImporter(prop: string): boolean {
  return PLUTONIUM_IMPORTERS.includes(prop);
}
