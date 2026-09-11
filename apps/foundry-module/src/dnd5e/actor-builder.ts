import type { BuildCharacterInput } from "@foundry-mcp/protocol";
import { emptyReceipt, toDocumentReference } from "../operations/document-reference";
import { OperationError, requireGm, requireRecord, requireString } from "../operations/errors";
import { getPublicDocumentClass } from "../operations/create-documents";
import { importCompendium } from "../operations/compendium-import";
import { importPlutoniumReference } from "../integrations/plutonium/reference-import";
import { requireDnd5e } from "./system-guard";
import { buildActorSource, buildActorUpdate, type AbilityValues } from "./actor-fields";
import { createActorItems } from "./item-service";
import { createActorEffects } from "./effect-service";
import { getAdvancementWarnings } from "./advancement-service";

export async function buildCharacter(payload: unknown, operationId: string) {
  requireGm();
  requireDnd5e();
  const input = parseInput(payload);
  let actor: FoundryDocument;
  let actorWasCreated = false;
  if (input.actorUuid) {
    const existing = await fromUuid(input.actorUuid);
    if (!existing || existing.documentName !== "Actor") throw new OperationError("DOCUMENT_NOT_FOUND", `Actor ${input.actorUuid} was not found.`);
    actor = await existing.update(buildActorUpdate(toActorFields(input)), { diff: true, recursive: true });
  } else {
    const createdActors = await getPublicDocumentClass("Actor").createDocuments([buildActorSource(toActorFields(input))], { renderSheet: false });
    const createdActor = createdActors[0];
    if (!createdActor) throw new OperationError("INTERNAL_ERROR", "Foundry did not return the created Actor.");
    actor = createdActor;
    actorWasCreated = true;
  }

  const added: FoundryDocument[] = [];
  for (const item of input.imports ?? []) {
    if (item.provider === "compendium") {
      const receipt = await importCompendium(
        { packId: item.packId, documentId: item.documentId, destination: { type: "actor", actorUuid: actor.uuid } },
        operationId,
      );
      await collectReceiptDocuments(receipt.created, added);
    } else {
      const receipt = await importPlutoniumReference(
        { type: item.type, name: item.name, source: item.source, destination: { type: "world" } },
        operationId,
      );
      for (const reference of receipt.created) {
        const source = await fromUuid(reference.uuid);
        if (!source || source.documentName !== "Item") continue;
        const data = source.toObject(false);
        delete data._id;
        added.push(...await actor.createEmbeddedDocuments("Item", [data], { renderSheet: false }));
      }
    }
  }
  added.push(...await createActorItems(actor, input.items ?? []));
  added.push(...await createActorEffects(actor, input.effects ?? []));

  return {
    ...emptyReceipt(operationId),
    created: [
      ...(actorWasCreated ? [toDocumentReference(actor)] : []),
      ...added.map(toDocumentReference),
    ],
    updated: actorWasCreated ? [] : [toDocumentReference(actor)],
    warnings: getAdvancementWarnings(added),
  };
}

function toActorFields(input: BuildCharacterInput): {
  name: string;
  image?: string;
  abilities?: AbilityValues;
  biography?: string;
} {
  return {
    name: input.name,
    ...(input.image !== undefined ? { image: input.image } : {}),
    ...(input.abilities !== undefined ? { abilities: input.abilities } : {}),
    ...(input.biography !== undefined ? { biography: input.biography } : {}),
  };
}

function parseInput(payload: unknown): BuildCharacterInput {
  const input = requireRecord(payload);
  const name = requireString(input.name, "name");
  const abilities = input.abilities === undefined ? undefined : requireRecord(input.abilities, "abilities");
  if (abilities) {
    for (const [key, value] of Object.entries(abilities)) {
      if (!["str", "dex", "con", "int", "wis", "cha"].includes(key) || typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 30) {
        throw new OperationError("INVALID_REQUEST", `Invalid ability ${key}.`);
      }
    }
  }
  return {
    ...input,
    name,
    abilities,
  };
}

async function collectReceiptDocuments(references: Array<{ uuid: string }>, output: FoundryDocument[]): Promise<void> {
  for (const reference of references) {
    const document = await fromUuid(reference.uuid);
    if (document) output.push(document);
  }
}
