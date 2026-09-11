import type { BridgeRegistration } from '../../packages/protocol/src/index.js';

export const testRegistration: BridgeRegistration = {
  bridgeVersion: '0.1.0',
  world: { id: 'test-world', title: 'Test World' },
  user: { id: 'gm', name: 'Game Master', isGM: true },
  foundry: { version: '14.367' },
  system: { id: 'dnd5e', version: '5.3.3' },
  modules: { plutonium: { active: true, version: '2.18.1.v14', compatible: true } },
  capabilities: ['foundry.documents.read', 'plutonium.import.json']
};
