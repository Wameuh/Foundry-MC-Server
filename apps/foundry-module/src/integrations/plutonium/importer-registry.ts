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

export function isKnownImporter(prop: string): boolean {
  return PLUTONIUM_IMPORTERS.includes(prop);
}
