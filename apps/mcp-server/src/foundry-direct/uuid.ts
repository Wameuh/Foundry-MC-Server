import { AppError } from "../errors.js";

export type ParsedFoundryUuid =
  | { kind: "world"; documentType: string; id: string }
  | { kind: "embedded"; documentType: string; id: string; parentUuid: string; parentType: string; parentId: string }
  | { kind: "compendium"; packId: string; id: string };

export function parseFoundryUuid(uuid: string): ParsedFoundryUuid {
  const parts = uuid.split(".").filter(Boolean);
  if (parts[0] === "Compendium") {
    if (parts.length < 3) throw new AppError("INVALID_REQUEST", `Invalid compendium UUID ${uuid}`);
    return {
      kind: "compendium",
      packId: parts.slice(1, -1).join("."),
      id: parts[parts.length - 1] ?? ""
    };
  }
  if (parts.length === 2) {
    return { kind: "world", documentType: parts[0] ?? "", id: parts[1] ?? "" };
  }
  if (parts.length >= 4 && parts.length % 2 === 0) {
    const parentType = parts[parts.length - 4] ?? "";
    const parentId = parts[parts.length - 3] ?? "";
    const documentType = parts[parts.length - 2] ?? "";
    const id = parts[parts.length - 1] ?? "";
    const parentUuid = parts.slice(0, -2).join(".");
    return { kind: "embedded", documentType, id, parentUuid, parentType, parentId };
  }
  throw new AppError("INVALID_REQUEST", `Invalid Foundry UUID ${uuid}`);
}

export function worldUuid(documentType: string, id: string): string {
  return `${documentType}.${id}`;
}

export function embeddedUuid(parentUuid: string, embeddedType: string, id: string): string {
  return `${parentUuid}.${embeddedType}.${id}`;
}

export function compendiumUuid(packId: string, id: string): string {
  return `Compendium.${packId}.${id}`;
}

export function documentNameOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function documentReferenceFromData(
  uuid: string,
  documentType: string,
  data: Record<string, unknown>,
  options: { parentUuid?: string; packId?: string } = {}
): Record<string, unknown> {
  return {
    uuid,
    documentType,
    name: typeof data["name"] === "string" && data["name"] ? data["name"] : String(data["_id"] ?? uuid),
    ...(options.parentUuid ? { parentUuid: options.parentUuid } : {}),
    ...(options.packId ? { packId: options.packId } : {})
  };
}
