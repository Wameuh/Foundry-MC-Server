/* global console */

import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const manifest = readJson('apps/foundry-module/module.json');
if (manifest.id !== 'foundry-mcp-bridge' || manifest.compatibility?.verified !== '14.367') throw new Error('Unexpected Foundry module manifest');
const releaseBase = `https://github.com/Wameuh/Foundry-MC-Server/releases/download/v${manifest.version}`;
if (manifest.manifest !== 'https://raw.githubusercontent.com/Wameuh/Foundry-MC-Server/main/apps/foundry-module/module.json') throw new Error('Unexpected Foundry manifest URL');
if (manifest.download !== `${releaseBase}/foundry-mcp-bridge-${manifest.version}.zip`) throw new Error('Foundry download URL does not match the module version');

for (const path of [
  'package.json',
  'apps/mcp-server/package.json',
  'apps/foundry-module/package.json',
  'packages/protocol/package.json',
]) {
  if (readJson(path).version !== manifest.version) {
    throw new Error(`${path} version does not match the Foundry module version`);
  }
}

const constants = readFileSync('packages/protocol/src/constants.ts', 'utf8');
if (!constants.includes(`export const APPLICATION_VERSION = "${manifest.version}" as const;`)) {
  throw new Error('APPLICATION_VERSION does not match the Foundry module version');
}
console.log('Foundry manifest verified.');
