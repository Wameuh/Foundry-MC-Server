import { describe, expect, it } from 'vitest';
import { FoundryCreateDocumentsInputSchema, FoundryUpdateDocumentsInputSchema } from '../../packages/protocol/src/index.js';

describe('MCP tool schemas', () => {
  it('accepts a bounded document creation batch', () => {
    expect(FoundryCreateDocumentsInputSchema.safeParse({ documentType: 'Actor', documents: [{ name: 'Arannis', type: 'character' }] }).success).toBe(true);
  });

  it('rejects forbidden update paths', () => {
    expect(FoundryUpdateDocumentsInputSchema.safeParse({ updates: [{ uuid: 'Actor.12345678', changes: { '__proto__.polluted': true } }] }).success).toBe(false);
  });
});
