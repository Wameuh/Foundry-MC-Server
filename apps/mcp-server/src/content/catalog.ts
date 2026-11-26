import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { AppError } from "../errors.js";

export type ContentKind = "spell" | "item" | "creature";
export type ContentEntry = {
  kind: ContentKind;
  name: string;
  source: string;
  file: string;
  raw: Record<string, unknown>;
};
export type ContentSummary = Omit<ContentEntry, "raw">;

type JsonRecord = Record<string, unknown>;

const COLLECTION_KEYS: Record<ContentKind, string> = {
  spell: "spell",
  item: "item",
  creature: "monster"
};

export class LocalContentCatalog {
  private readonly cache = new Map<ContentKind, Promise<ContentEntry[]>>();
  private readonly overlayCache = new Map<ContentKind, Promise<JsonRecord[]>>();

  constructor(private readonly rootPath: string) {}

  async search(input: { kind: ContentKind; query?: string | undefined; source?: string | undefined; limit?: number | undefined }): Promise<{ results: ContentSummary[]; total: number }> {
    const entries = await this.entries(input.kind);
    const query = input.query?.trim().toLocaleLowerCase() ?? "";
    const source = input.source?.trim().toLocaleLowerCase() ?? "";
    const filtered = entries.filter((entry) =>
      (!query || entry.name.toLocaleLowerCase().includes(query)) &&
      (!source || entry.source.toLocaleLowerCase() === source)
    );
    const limit = Math.max(1, Math.min(100, input.limit ?? 25));
    return {
      results: filtered.slice(0, limit).map(({ raw: _raw, ...summary }) => summary),
      total: filtered.length
    };
  }

  async get(input: { kind: ContentKind; name: string; source?: string | undefined }): Promise<{ entry: ContentEntry; foundryOverlay?: JsonRecord }> {
    const entries = await this.entries(input.kind);
    const name = input.name.trim().toLocaleLowerCase();
    const source = input.source?.trim().toLocaleLowerCase();
    const matches = entries.filter((entry) =>
      entry.name.toLocaleLowerCase() === name && (!source || entry.source.toLocaleLowerCase() === source)
    );
    if (!matches.length) throw new AppError("DOCUMENT_NOT_FOUND", `No local ${input.kind} entry named ${input.name}`);
    if (matches.length > 1 && !source) {
      throw new AppError("INVALID_REQUEST", `Several ${input.kind} entries are named ${input.name}; specify source`, {
        sources: matches.map((entry) => entry.source)
      });
    }
    const entry = matches[0];
    if (!entry) throw new AppError("DOCUMENT_NOT_FOUND", `No local ${input.kind} entry named ${input.name}`);
    const overlay = (await this.overlays(input.kind)).find((candidate) =>
      typeof candidate["name"] === "string" && candidate["name"].toLocaleLowerCase() === entry.name.toLocaleLowerCase() &&
      String(candidate["source"] ?? "").toLocaleLowerCase() === entry.source.toLocaleLowerCase()
    );
    return {
      entry,
      ...(overlay ? { foundryOverlay: overlay } : {})
    };
  }

  private entries(kind: ContentKind): Promise<ContentEntry[]> {
    const existing = this.cache.get(kind);
    if (existing) return existing;
    const promise = this.loadEntries(kind);
    this.cache.set(kind, promise);
    return promise;
  }

  private overlays(kind: ContentKind): Promise<JsonRecord[]> {
    const existing = this.overlayCache.get(kind);
    if (existing) return existing;
    const promise = this.loadOverlays(kind);
    this.overlayCache.set(kind, promise);
    return promise;
  }

  private async loadEntries(kind: ContentKind): Promise<ContentEntry[]> {
    if (kind === "item") {
      const files = [join(this.rootPath, "items-base.json"), join(this.rootPath, "items.json")];
      const loaded = await Promise.all(files.map((file) => this.readEntriesFromFile(kind, file, true)));
      return loaded.flat();
    }
    const directory = join(this.rootPath, kind === "spell" ? "spells" : "bestiary");
    const prefix = kind === "spell" ? "spells-" : "bestiary-";
    const files = (await readdir(directory))
      .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
      .map((file) => join(directory, file));
    const loaded = await Promise.all(files.map((file) => this.readEntriesFromFile(kind, file, false)));
    return loaded.flat();
  }

  private async readEntriesFromFile(kind: ContentKind, file: string, includeBaseItems: boolean): Promise<ContentEntry[]> {
    try {
      const json = JSON.parse(await readFile(file, "utf8")) as JsonRecord;
      const keys = includeBaseItems ? ["item", "baseitem"] : [COLLECTION_KEYS[kind]];
      return keys.flatMap((key) => Array.isArray(json[key]) ? json[key] as JsonRecord[] : [])
        .filter((raw) => typeof raw["name"] === "string")
        .map((raw) => ({
          kind,
          name: String(raw["name"]),
          source: String(raw["source"] ?? ""),
          file,
          raw
        }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async loadOverlays(kind: ContentKind): Promise<JsonRecord[]> {
    const file = kind === "spell"
      ? join(this.rootPath, "spells", "foundry.json")
      : kind === "creature"
        ? join(this.rootPath, "bestiary", "foundry.json")
        : join(this.rootPath, "foundry-items.json");
    try {
      const json = JSON.parse(await readFile(file, "utf8")) as JsonRecord;
      const keys = kind === "item" ? ["item", "baseitem"] : [COLLECTION_KEYS[kind]];
      return keys.flatMap((key) => Array.isArray(json[key]) ? json[key] as JsonRecord[] : []);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}
