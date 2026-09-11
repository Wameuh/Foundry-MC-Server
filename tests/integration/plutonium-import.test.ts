import { describe, expect, it } from 'vitest';
import { isPlutoniumApi } from '../../apps/foundry-module/src/integrations/plutonium/detect.js';
import { createFakePlutonium } from '../helpers/fake-plutonium.js';

describe('Plutonium import integration contract', () => {
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
});
