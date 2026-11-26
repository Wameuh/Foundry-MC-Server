import type { ContentKind } from "./catalog.js";

export type JsonRecord = Record<string, unknown>;

export type ConversionInput = {
  kind: ContentKind;
  entry: JsonRecord;
  foundryOverlay?: JsonRecord;
  resolveSpell?: ((name: string, source?: string | undefined) => { entry: JsonRecord; foundryOverlay?: JsonRecord } | undefined) | undefined;
};

export type ConversionResult = {
  converterVersion: string;
  supportLevel: "full" | "partial";
  documentType: "Actor" | "Item";
  document: JsonRecord;
  warnings: string[];
  source: {
    kind: ContentKind;
    name: string;
    source: string;
  };
  proficiencyBonus?: number;
};

export const CONTENT_CONVERTER_VERSION = "2026-11-26.1";
