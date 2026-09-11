import { OperationError, requireRecord, requireString } from "../../operations/errors";
import type { PlutoniumApi } from "./types";

export async function createImportOptions(api: PlutoniumApi, rawDestination: unknown): Promise<unknown> {
  const destination = requireRecord(rawDestination ?? { type: "world" }, "destination");
  const type = requireString(destination.type, "destination.type");
  const options: Record<string, unknown> = { isTemp: false };
  if (type === "actor") {
    const actorUuid = requireString(destination.actorUuid, "destination.actorUuid");
    const actor = await fromUuid(actorUuid);
    if (!actor || actor.documentName !== "Actor") throw new OperationError("DOCUMENT_NOT_FOUND", `Actor ${actorUuid} was not found.`);
    options.actor = actor;
  } else if (type === "pack") {
    const packId = requireString(destination.packId, "destination.packId");
    const pack = game.packs.get(packId);
    if (!pack) throw new OperationError("DOCUMENT_NOT_FOUND", `Compendium ${packId} was not found.`);
    options.pack = pack;
  } else if (type === "world") {
    if (typeof destination.folderId === "string" && destination.folderId) options.folderId = destination.folderId;
  } else {
    throw new OperationError("INVALID_REQUEST", `Unsupported Plutonium destination ${type}.`);
  }
  return new api.importer.ImportOpts(options);
}
