import type { ContentKind } from "./catalog.js";
import { convertCreature } from "./creature.js";
import { convertItem } from "./item.js";
import { assertConvertedDocumentSafe } from "./json.js";
import { convertSpell } from "./spell.js";
import type { ConversionInput, ConversionResult } from "./types.js";

export type { ConversionInput, ConversionResult } from "./types.js";
export { CONTENT_CONVERTER_VERSION } from "./types.js";

export function convertContentEntry(input: ConversionInput): ConversionResult {
  const converters: Record<ContentKind, (input: ConversionInput) => ConversionResult> = {
    spell: convertSpell,
    item: convertItem,
    creature: convertCreature
  };
  const result = converters[input.kind](input);
  assertConvertedDocumentSafe(result.document);
  return result;
}
