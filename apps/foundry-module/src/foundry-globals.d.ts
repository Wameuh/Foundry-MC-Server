interface FoundryCollection<T = FoundryDocument> extends Iterable<T> {
  get(id: string): T | undefined;
  contents: T[];
}

interface FoundryDocument {
  id: string;
  uuid: string;
  name?: string;
  documentName: string;
  parent?: FoundryDocument;
  pack?: string;
  toObject(source?: boolean): Record<string, unknown>;
  update(changes: Record<string, unknown>, options?: Record<string, unknown>): Promise<FoundryDocument>;
  delete(options?: Record<string, unknown>): Promise<FoundryDocument>;
  createEmbeddedDocuments(type: string, data: Record<string, unknown>[], options?: Record<string, unknown>): Promise<FoundryDocument[]>;
  updateEmbeddedDocuments(type: string, updates: Record<string, unknown>[], options?: Record<string, unknown>): Promise<FoundryDocument[]>;
  deleteEmbeddedDocuments(type: string, ids: string[], options?: Record<string, unknown>): Promise<FoundryDocument[]>;
  getEmbeddedCollection?(type: string): FoundryCollection;
}

interface FoundryDocumentConstructor {
  createDocuments(data: Record<string, unknown>[], options?: Record<string, unknown>): Promise<FoundryDocument[]>;
  updateDocuments(updates: Record<string, unknown>[], options?: Record<string, unknown>): Promise<FoundryDocument[]>;
  deleteDocuments(ids: string[], options?: Record<string, unknown>): Promise<FoundryDocument[]>;
}

interface FoundryPack {
  collection: string;
  documentName: string;
  metadata: { id?: string; label?: string; type?: string; packageName?: string };
  index: Iterable<Record<string, unknown>>;
  getIndex(options?: Record<string, unknown>): Promise<Iterable<Record<string, unknown>>>;
  getDocument(id: string): Promise<FoundryDocument | null>;
  importDocument(document: FoundryDocument, options?: Record<string, unknown>): Promise<FoundryDocument>;
}

interface FoundryGame {
  user?: { id: string; name: string; isGM: boolean };
  world?: { id: string; title: string };
  system: { id: string; version: string };
  version: string;
  settings: {
    register(module: string, key: string, data: Record<string, unknown>): void;
    get(module: string, key: string): unknown;
  };
  modules?: Map<string, { active: boolean; version?: string; api?: unknown }>;
  collections: Map<string, FoundryCollection>;
  packs: Map<string, FoundryPack>;
  scenes?: FoundryCollection;
  actors?: FoundryCollection;
  items?: FoundryCollection;
}

interface FoundryHooks {
  once(hook: string, callback: (...args: unknown[]) => void): number;
  on(hook: string, callback: (...args: unknown[]) => void): number;
  off(hook: string, id: number): void;
}

declare const game: FoundryGame;
declare const Hooks: FoundryHooks;
declare const canvas: {
  scene?: FoundryDocument;
  tokens?: { controlled: Array<{ document: FoundryDocument; actor?: FoundryDocument }> };
};
declare const ui: { notifications?: { info(message: string): void; warn(message: string): void; error(message: string): void } };
declare const CONFIG: Record<string, { documentClass?: FoundryDocumentConstructor }>;
declare function fromUuid(uuid: string): Promise<FoundryDocument | null>;
declare function getDocumentClass(documentName: string): FoundryDocumentConstructor | undefined;
