export class FakeFoundryDocument {
  readonly documentName: string;
  readonly uuid: string;
  readonly id: string;
  name: string;
  parent?: FakeFoundryDocument;
  pack?: string;
  private deleted = false;
  private readonly data: Record<string, unknown>;
  readonly items: FakeFoundryDocument[] = [];

  constructor(documentName: string, id: string, name: string, parent?: FakeFoundryDocument, data: Record<string, unknown> = {}) {
    this.documentName = documentName;
    this.id = id;
    this.uuid = `${documentName}.${id}`;
    this.name = name;
    this.parent = parent;
    this.data = { ...data, _id: id, name };
  }

  toObject(_source = true) {
    return {
      ...structuredClone(this.data),
      _id: this.id,
      name: this.name,
      type: this.documentName,
      items: this.items.map((item) => item.toObject(_source)),
    };
  }

  async update(changes: Record<string, unknown>, options: Record<string, unknown> = {}) {
    if (options.recursive === true) {
      deepMerge(this.data, changes);
    } else {
      Object.assign(this.data, changes);
    }
    if (typeof changes.name === "string") this.name = changes.name;
    return this;
  }

  async createEmbeddedDocuments(documentName: string, entries: Record<string, unknown>[]) {
    const created = entries.map((entry, index) => new FakeFoundryDocument(
      documentName,
      String(entry._id ?? `${this.id}-embedded-${this.items.length + index + 1}`),
      String(entry.name ?? "Unnamed"),
      this,
      entry,
    ));
    this.items.push(...created);
    return created;
  }

  async delete() { this.deleted = true; }

  isDeleted() { return this.deleted; }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const current = target[key];
      const nested =
        current && typeof current === "object" && !Array.isArray(current)
          ? (current as Record<string, unknown>)
          : {};
      target[key] = nested;
      deepMerge(nested, value as Record<string, unknown>);
      continue;
    }
    target[key] = value;
  }
}

export function installFakeFoundry(documents: FakeFoundryDocument[]) {
  const byUuid = new Map(documents.map((document) => [document.uuid, document]));
  (globalThis as Record<string, unknown>).fromUuid = async (uuid: string) => byUuid.get(uuid);
  (globalThis as Record<string, unknown>).getDocumentClass = (documentType: string) => {
    class FakeDocumentClass {
      static async createDocuments(entries: Record<string, unknown>[]) {
        const created = entries.map((entry, index) => new FakeFoundryDocument(
          documentType,
          String(entry._id ?? `created-${Date.now()}-${index}`),
          String(entry.name ?? "Unnamed"),
          undefined,
          entry,
        ));
        for (const document of created) byUuid.set(document.uuid, document);
        return created;
      }
    }
    return FakeDocumentClass;
  };
  return byUuid;
}
