import { AppError } from "../errors.js";
import type { LocalContentCatalog, ContentKind } from "./catalog.js";
import { convertContentEntry } from "./converter.js";
import { asArray, asRecord, cloneJson } from "./json.js";
import type { ConversionResult, JsonRecord } from "./types.js";

export type ContentImportDestination = {
  folderId?: string | undefined;
  actorUuid?: string | undefined;
};

export type ContentImportOptions = {
  overwrite: boolean;
};

export type ContentImportInput = {
  kind: ContentKind;
  name: string;
  source?: string | undefined;
  destination: ContentImportDestination;
  options: ContentImportOptions;
};

export type ContentBackendOperations = {
  searchDocuments(payload: JsonRecord): Promise<JsonRecord>;
  getDocument(payload: JsonRecord): Promise<JsonRecord>;
  createDocuments(payload: JsonRecord): Promise<JsonRecord>;
  updateDocuments(payload: JsonRecord): Promise<JsonRecord>;
  createEmbedded(payload: JsonRecord): Promise<JsonRecord>;
  updateEmbedded(payload: JsonRecord): Promise<JsonRecord>;
};

function exactNameMatches(results: unknown, name: string): JsonRecord[] {
  return asArray(results).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => Boolean(entry))
    .filter((entry) => typeof entry["name"] === "string" && String(entry["name"]).toLocaleLowerCase() === name.toLocaleLowerCase());
}

function firstReceiptDocument(receipt: JsonRecord, collection: "created" | "updated"): JsonRecord | undefined {
  return asArray(receipt[collection]).map((entry) => asRecord(entry)).find((entry): entry is JsonRecord => Boolean(entry));
}

export class ContentImporter {
  constructor(
    private readonly catalog: LocalContentCatalog,
    private readonly backend: ContentBackendOperations
  ) {}

  async preview(input: ContentImportInput): Promise<JsonRecord> {
    const conversion = await this.convert(input);
    return this.previewResult(conversion, input);
  }

  async commit(input: ContentImportInput): Promise<JsonRecord> {
    const conversion = await this.convert(input);
    const preview = this.previewResult(conversion, input);
    const duplicate = await this.findDuplicate(input, conversion);
    if (duplicate && !input.options.overwrite) {
      throw new AppError("DUPLICATE_DOCUMENT", `A ${conversion.documentType} named ${conversion.source.name} already exists; pass options.overwrite=true to update it`, {
        existing: duplicate,
        overwriteRequired: true
      });
    }
    const receipt = duplicate
      ? await this.updateExisting(input, conversion, duplicate)
      : await this.createNew(input, conversion);
    const action = duplicate ? "updated" : "created";
    const target = firstReceiptDocument(receipt, action);
    return {
      status: "completed",
      action,
      message: duplicate
        ? `Updated existing ${conversion.documentType} ${conversion.source.name} instead of creating a duplicate.`
        : `Created ${conversion.documentType} ${conversion.source.name}.`,
      documentType: conversion.documentType,
      supportLevel: conversion.supportLevel,
      warnings: conversion.warnings,
      ...(target ? { target } : {}),
      receipt,
      source: preview["source"],
      converterVersion: conversion.converterVersion
    };
  }

  private async convert(input: ContentImportInput): Promise<ConversionResult> {
    if (input.destination.actorUuid && input.kind !== "item") {
      throw new AppError("INVALID_REQUEST", "Only items can be imported into an actor");
    }
    if (input.destination.actorUuid && input.destination.folderId) {
      throw new AppError("INVALID_REQUEST", "Choose either destination.folderId or destination.actorUuid, not both");
    }
    const { entry, foundryOverlay } = await this.catalog.get({
      kind: input.kind,
      name: input.name,
      ...(input.source ? { source: input.source } : {})
    });
    const conversion = convertContentEntry({
      kind: input.kind,
      entry: cloneJson(entry.raw),
      ...(foundryOverlay ? { foundryOverlay: cloneJson(foundryOverlay) } : {})
    });
    return conversion;
  }

  private previewResult(conversion: ConversionResult, input: ContentImportInput): JsonRecord {
    return {
      supportLevel: conversion.supportLevel,
      documentType: conversion.documentType,
      destination: input.destination.actorUuid
        ? { type: "actor", actorUuid: input.destination.actorUuid }
        : { type: "world", ...(input.destination.folderId ? { folderId: input.destination.folderId } : {}) },
      document: conversion.document,
      warnings: conversion.warnings,
      source: conversion.source,
      converterVersion: conversion.converterVersion,
      ...(conversion.proficiencyBonus !== undefined ? { proficiencyBonus: conversion.proficiencyBonus } : {})
    };
  }

  private async findDuplicate(input: ContentImportInput, conversion: ConversionResult): Promise<JsonRecord | undefined> {
    const name = conversion.source.name;
    if (input.destination.actorUuid) {
      const actor = await this.backend.getDocument({ uuid: input.destination.actorUuid, includeEmbedded: true });
      const data = asRecord(actor["data"]) ?? {};
      const embedded = asArray(data["items"]).map((entry) => asRecord(entry)).filter((entry): entry is JsonRecord => Boolean(entry))
        .find((item) => typeof item["name"] === "string" && item["name"].toLocaleLowerCase() === name.toLocaleLowerCase() && typeof item["_id"] === "string");
      return embedded
        ? {
            uuid: `${input.destination.actorUuid}.Item.${String(embedded["_id"])}`,
            documentType: "Item",
            name: String(embedded["name"]),
            parentUuid: input.destination.actorUuid
          }
        : undefined;
    }
    const response = await this.backend.searchDocuments({
      documentType: conversion.documentType,
      query: name,
      limit: 100
    });
    return exactNameMatches(response["results"], name)[0];
  }

  private async createNew(input: ContentImportInput, conversion: ConversionResult): Promise<JsonRecord> {
    const document = cloneJson(conversion.document);
    if (input.destination.actorUuid) {
      return this.backend.createEmbedded({
        parentUuid: input.destination.actorUuid,
        embeddedType: "Item",
        documents: [document]
      });
    }
    return this.backend.createDocuments({
      documentType: conversion.documentType,
      documents: [document],
      ...(input.destination.folderId ? { folderId: input.destination.folderId } : {})
    });
  }

  private async updateExisting(input: ContentImportInput, conversion: ConversionResult, duplicate: JsonRecord): Promise<JsonRecord> {
    const uuid = typeof duplicate["uuid"] === "string" ? duplicate["uuid"] : "";
    if (!uuid) throw new AppError("INTERNAL_ERROR", "Duplicate target did not include a UUID");
    const changes = cloneJson(conversion.document);
    if (input.destination.actorUuid) {
      return this.backend.updateEmbedded({
        parentUuid: input.destination.actorUuid,
        embeddedType: "Item",
        updates: [{ uuid, changes }]
      });
    }
    return this.backend.updateDocuments({
      updates: [{ uuid, changes }]
    });
  }
}
