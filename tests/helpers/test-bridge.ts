import type { BridgeRegistration } from '../../packages/protocol/src/index.js';

export const testRegistration: BridgeRegistration = {
  bridgeVersion: '0.1.0',
  world: { id: 'test-world', title: 'Test World' },
  user: { id: 'gm', name: 'Game Master', isGM: true },
  foundry: { version: '14.370' },
  system: { id: 'dnd5e', version: '6.1.1' },
  capabilities: ['foundry.control.provision', 'agentcontrol.control']
};
