export function createFakePlutonium() {
  const hooks = new Map<string, Array<(...args: unknown[]) => void>>();
  const imported: Array<Record<string, unknown>> = [];
  const api = {
    importer: {
      async pGetImporter({ prop }: { prop: string }) {
        if (!['spell', 'creature', 'item'].includes(prop)) return null;
        return {
          async pImportEntry(entry: Record<string, unknown>) {
            imported.push(entry);
            return { status: 'completed', name: entry.name };
          }
        };
      },
      ImportOpts: class { constructor(public readonly options: Record<string, unknown>) {} }
    },
    util: { uuidFauxCompendium: { getCustomUuid: ({ tag, text }: { tag: string; text: string }) => `Plutonium.${tag}.${text}` } },
    hooks: {
      on(event: string, callback: (...args: unknown[]) => void) {
        hooks.set(event, [...(hooks.get(event) ?? []), callback]);
      },
      off() {}
    }
  };
  return { api, imported, emit(event: string, ...args: unknown[]) { for (const callback of hooks.get(event) ?? []) callback(...args); } };
}
