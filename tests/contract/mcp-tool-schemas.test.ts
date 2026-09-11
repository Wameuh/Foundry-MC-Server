import { describe, expect, it } from 'vitest';
import { FoundryCreateDocumentsInputSchema, FoundryUpdateDocumentsInputSchema, PlutoniumEntriesImportSchema } from '../../packages/protocol/src/index.js';

describe('MCP tool schemas', () => {
  it('accepts a bounded document creation batch', () => {
    expect(FoundryCreateDocumentsInputSchema.safeParse({ documentType: 'Actor', documents: [{ name: 'Arannis', type: 'character' }] }).success).toBe(true);
  });

  it('rejects forbidden update paths and malformed Plutonium entries', () => {
    expect(FoundryUpdateDocumentsInputSchema.safeParse({ updates: [{ uuid: 'Actor.12345678', changes: { '__proto__.polluted': true } }] }).success).toBe(false);
    expect(PlutoniumEntriesImportSchema.safeParse({ entries: [{ prop: 'spell', data: { name: 'Fireball', source: 'PHB', __prop: 'creature' } }], destination: { type: 'world' } }).success).toBe(false);
  });
});
