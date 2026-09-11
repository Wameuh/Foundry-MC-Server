import { describe, expect, it } from 'vitest';
import { ConfirmationStore, hashDeletionTargets } from '../../apps/mcp-server/src/deletion/confirmation-store.js';

describe('deletion confirmation integration', () => {
  it('consumes only the exact prepared target set once', () => {
    const store = new ConfirmationStore(10_000);
    const plan = store.create(['Actor.12345678', 'Item.87654321']);
    expect(store.consume({ confirmationToken: plan.token, targetHash: plan.targetHash, uuids: [...plan.uuids].reverse() }).uuids).toEqual(plan.uuids);
    expect(() => store.consume({ confirmationToken: plan.token, targetHash: plan.targetHash, uuids: plan.uuids })).toThrow('invalid or expired');
  });

  it('rejects a changed target list', () => {
    const store = new ConfirmationStore(10_000);
    const plan = store.create(['Actor.12345678']);
    expect(() => store.consume({ confirmationToken: plan.token, targetHash: hashDeletionTargets(['Actor.87654321']), uuids: ['Actor.87654321'] })).toThrow('do not match');
  });
});
