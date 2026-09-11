import { afterEach, describe, expect, it } from "vitest";
import { getPlutoniumCompatibility } from "../../apps/foundry-module/src/integrations/plutonium/compatibility.js";
import { refreshPlutoniumCapabilities } from "../../apps/foundry-module/src/integrations/plutonium/capability-probe.js";
import { createFakePlutonium } from "../helpers/fake-plutonium.js";

type FoundryGame = {
  modules: Map<string, { active: boolean; version?: string; api?: unknown }>;
};

function installPlutonium(version: string, api: unknown = createFakePlutonium().api) {
  if (api && typeof api === "object") {
    (api as Record<string, unknown>).config = { getValue: () => true };
  }
  (globalThis as Record<string, unknown>).game = {
    modules: new Map([["plutonium", { active: true, version, api }]]),
  } satisfies FoundryGame;
}

describe("Plutonium compatibility feature", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).game;
  });

  it.each(["2.18.1.v14", "2.18.3.v14"])("accepts tested version %s", async (version) => {
    installPlutonium(version);

    expect(getPlutoniumCompatibility()).toMatchObject({ compatible: true, version });
    await expect(refreshPlutoniumCapabilities()).resolves.toMatchObject({
      active: true,
      compatible: true,
      importJson: true,
      importReference: true,
    });
  });

  it("rejects an unknown version and disables imports", async () => {
    installPlutonium("2.99.0.v14");

    expect(getPlutoniumCompatibility()).toMatchObject({ compatible: false, version: "2.99.0.v14" });
    await expect(refreshPlutoniumCapabilities()).resolves.toMatchObject({
      active: true,
      compatible: false,
      importJson: false,
      importReference: false,
      importers: [],
      destinations: [],
    });
  });

  it("disables imports when the public API is incomplete", async () => {
    const { api } = createFakePlutonium();
    const incompleteApi = {
      ...api,
      importer: { ...api.importer, pGetImporter: undefined },
    };
    installPlutonium("2.18.3.v14", incompleteApi);

    expect(getPlutoniumCompatibility()).toMatchObject({ compatible: true, version: "2.18.3.v14" });
    await expect(refreshPlutoniumCapabilities()).resolves.toMatchObject({
      active: true,
      compatible: false,
      importJson: false,
      importReference: false,
      importers: [],
      destinations: [],
    });
  });

  it("recovers when Plutonium publishes its API after the initial probe", async () => {
    installPlutonium("2.18.3.v14", null);

    await expect(refreshPlutoniumCapabilities()).resolves.toMatchObject({
      active: true,
      compatible: false,
      importJson: false,
      importReference: false,
    });

    const module = (globalThis as Record<string, unknown>).game as FoundryGame;
    const recoveredApi = createFakePlutonium().api;
    (recoveredApi as Record<string, unknown>).config = { getValue: () => true };
    module.modules.get("plutonium")!.api = recoveredApi;

    await expect(refreshPlutoniumCapabilities()).resolves.toMatchObject({
      active: true,
      compatible: true,
      importJson: true,
      importReference: true,
    });
  });

  it("does not eagerly initialize importers during capability probing", async () => {
    const { api } = createFakePlutonium();
    let importerProbes = 0;
    const originalGetImporter = api.importer.pGetImporter;
    api.importer.pGetImporter = async (input) => {
      importerProbes += 1;
      return await originalGetImporter(input);
    };
    installPlutonium("2.18.3.v14", api);

    await refreshPlutoniumCapabilities();
    const probesAfterFirstRefresh = importerProbes;
    await refreshPlutoniumCapabilities();

    expect(probesAfterFirstRefresh).toBe(0);
    expect(importerProbes).toBe(0);
  });

  it("does not advertise reference imports when Plutonium's fromUuid patch is disabled", async () => {
    const { api } = createFakePlutonium();
    (api as Record<string, unknown>).config = { getValue: () => false };
    (globalThis as Record<string, unknown>).game = {
      modules: new Map([["plutonium", { active: true, version: "2.18.3.v14", api }]]),
    } satisfies FoundryGame;

    await expect(refreshPlutoniumCapabilities()).resolves.toMatchObject({
      importJson: true,
      importReference: false,
    });
  });
});
