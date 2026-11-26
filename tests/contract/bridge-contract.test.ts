import { describe, expect, it } from 'vitest';
import { BridgeRegistrationSchema } from '../../packages/protocol/src/index.js';
import { testRegistration } from '../helpers/test-bridge.js';

describe('bridge protocol contract', () => {
  it('accepts a GM registration for the certified matrix', () => expect(BridgeRegistrationSchema.safeParse(testRegistration).success).toBe(true));
  it('rejects non-GM registrations', () => expect(BridgeRegistrationSchema.safeParse({ ...testRegistration, user: { ...testRegistration.user, isGM: false } }).success).toBe(false));
});
