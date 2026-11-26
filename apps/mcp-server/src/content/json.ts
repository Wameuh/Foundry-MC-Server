import { createHash } from "node:crypto";

import { AppError } from "../errors.js";
import { assertSafeJson } from "../security/safe-json.js";
import type { JsonRecord } from "./types.js";

export const MAX_CONVERTED_DOCUMENT_BYTES = 256 * 1024;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function cloneJson<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

export function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function boolean(value: unknown): boolean {
  return value === true;
}

const LATIN_ACCENTS: Record<string, string> = {
  "à": "a", "á": "a", "â": "a", "ä": "a", "ã": "a", "å": "a",
  "ç": "c",
  "è": "e", "é": "e", "ê": "e", "ë": "e",
  "ì": "i", "í": "i", "î": "i", "ï": "i",
  "ñ": "n",
  "ò": "o", "ó": "o", "ô": "o", "ö": "o", "õ": "o", "ø": "o",
  "ù": "u", "ú": "u", "û": "u", "ü": "u",
  "ý": "y", "ÿ": "y",
  "æ": "ae", "œ": "oe"
};

export function slugify(value: string): string {
  const slug = value
    .toLocaleLowerCase()
    .replace(/[àáâäãåçèéêëìíîïñòóôöõøùúûüýÿæœ]/g, (character) => LATIN_ACCENTS[character] ?? character)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "imported-content";
}

export function stableId(...parts: unknown[]): string {
  const hash = createHash("sha256").update(parts.map((part) => String(part)).join("|")).digest("hex");
  return hash.slice(0, 16);
}

export function deepMerge(base: JsonRecord, overlay: JsonRecord): JsonRecord {
  const output = cloneJson(base);
  for (const [key, value] of Object.entries(overlay)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const current = output[key];
    const baseObject = asRecord(current);
    const overlayObject = asRecord(value);
    output[key] = baseObject && overlayObject ? deepMerge(baseObject, overlayObject) : cloneJson(value);
  }
  return output;
}

export function expandDottedKeys(input: JsonRecord, warnings: string[], label: string): JsonRecord {
  const output: JsonRecord = {};
  for (const [key, value] of Object.entries(input)) {
    const parts = key.split(".").filter(Boolean);
    if (!parts.length || parts.some((part) => DANGEROUS_KEYS.has(part))) {
      warnings.push(`${label}: ignored unsafe system key ${key}`);
      continue;
    }
    let target = output;
    for (const [index, part] of parts.entries()) {
      if (index === parts.length - 1) {
        const existing = target[part];
        const existingObject = asRecord(existing);
        const valueObject = asRecord(value);
        target[part] = existingObject && valueObject ? deepMerge(existingObject, valueObject) : cloneJson(value);
      } else {
        const next = asRecord(target[part]);
        if (!next) target[part] = {};
        target = target[part] as JsonRecord;
      }
    }
  }
  return output;
}

export function assertConvertedDocumentSafe(document: JsonRecord): void {
  assertSafeJson(document);
  const bytes = Buffer.byteLength(JSON.stringify(document), "utf8");
  if (bytes > MAX_CONVERTED_DOCUMENT_BYTES) {
    throw new AppError("INVALID_PAYLOAD", `Converted document exceeds the ${MAX_CONVERTED_DOCUMENT_BYTES}-byte safety cap`, {
      bytes,
      maxBytes: MAX_CONVERTED_DOCUMENT_BYTES
    });
  }
}

export function compactObject<T extends JsonRecord>(value: T): JsonRecord {
  const output: JsonRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) output[key] = entry;
  }
  return output;
}
