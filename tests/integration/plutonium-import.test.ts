import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshPlutoniumCapabilities } from '../../apps/foundry-module/src/integrations/plutonium/capability-probe.js';
import { isPlutoniumApi } from '../../apps/foundry-module/src/integrations/plutonium/detect.js';
import { importPlutoniumReference } from '../../apps/foundry-module/src/integrations/plutonium/reference-import.js';
import { createFakePlutonium } from '../helpers/fake-plutonium.js';

describe('Plutonium import integration contract', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).game;
    delete (globalThis as Record<string, unknown>).fromUuid;
  });

  it('supports the JSON importer shape used by the bridge', async () => {
    const fake = createFakePlutonium();
    expect(isPlutoniumApi(fake.api)).toBe(true);
    const importer = await fake.api.importer.pGetImporter({ prop: 'spell' });
    await importer?.pImportEntry({ name: 'Fireball', source: 'PHB', __prop: 'spell' }, {});
    expect(fake.imported).toHaveLength(1);
  });

  it('reports unsupported importer types as unavailable', async () => {
    const fake = createFakePlutonium();
    expect(await fake.api.importer.pGetImporter({ prop: 'adventure' })).toBeNull();
  });

  it('reports the provider timeout before the enclosing MCP deadline', async () => {
    vi.useFakeTimers();
    const fake = createFakePlutonium();
    (globalThis as Record<string, unknown>).game = {
      user: { isGM: true },
      modules: new Map([['plutonium', { active: true, version: '2.18.3.v14', api: fake.api }]])
    };
    (globalThis as Record<string, unknown>).fromUuid = () => new Promise(() => undefined);
    await refreshPlutoniumCapabilities();

    const result = importPlutoniumReference({
      type: 'creature',
      name: 'Goblin',
      source: 'MM',
      destination: { type: 'world' }
    }, 'operation-timeout');
    const assertion = expect(result).rejects.toMatchObject({ code: 'PLUTONIUM_IMPORT_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(110_000);

    await assertion;
  });
});
