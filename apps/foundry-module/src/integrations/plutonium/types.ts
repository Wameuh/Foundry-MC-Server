export type PlutoniumImporter = {
  pImportEntry?: (entry: Record<string, unknown>, options: unknown) => Promise<unknown>;
};

export type PlutoniumApi = {
  importer: {
    pGetImporter(input: { prop: string }): Promise<PlutoniumImporter | null> | PlutoniumImporter | null;
    ImportOpts: new (options: Record<string, unknown>) => unknown;
  };
  util: {
    uuidFauxCompendium: {
      getCustomUuid(input: { tag: string; text: string }): string;
    };
  };
  hooks: {
    on(event: string, callback: (...args: unknown[]) => void): unknown;
    off?(event: string, callback: (...args: unknown[]) => void): void;
  };
};

export type PlutoniumCapabilities = {
  active: boolean;
  version?: string;
  compatible: boolean;
  importJson: boolean;
  importReference: boolean;
  importers: string[];
  destinations: Array<"world" | "actor" | "pack">;
  reason?: string;
};
