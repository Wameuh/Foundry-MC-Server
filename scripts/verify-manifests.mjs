/* global console */

import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('apps/foundry-module/module.json', 'utf8'));
if (manifest.id !== 'foundry-mcp-bridge' || manifest.compatibility?.verified !== '14.367') throw new Error('Unexpected Foundry module manifest');
const releaseBase = `https://github.com/Wameuh/Foundry-MC-Server/releases/download/v${manifest.version}`;
if (manifest.manifest !== 'https://raw.githubusercontent.com/Wameuh/Foundry-MC-Server/main/apps/foundry-module/module.json') throw new Error('Unexpected Foundry manifest URL');
if (manifest.download !== `${releaseBase}/foundry-mcp-bridge-${manifest.version}.zip`) throw new Error('Foundry download URL does not match the module version');
console.log('Foundry manifest verified.');
