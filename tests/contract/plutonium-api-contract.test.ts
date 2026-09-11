import { describe, expect, it } from 'vitest';
import { isPlutoniumApi } from '../../apps/foundry-module/src/integrations/plutonium/detect.js';
import { createFakePlutonium } from '../helpers/fake-plutonium.js';

describe('Plutonium public API contract', () => {
  it('recognizes the supported public surface', () => expect(isPlutoniumApi(createFakePlutonium().api)).toBe(true));
  it('fails closed when an expected API member is missing', () => {
    const { api } = createFakePlutonium();
    expect(isPlutoniumApi({ ...api, importer: { ...api.importer, pGetImporter: undefined } })).toBe(false);
  });
});
