/* global console */

import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('apps/foundry-module/module.json', 'utf8'));
if (manifest.id !== 'foundry-mcp-bridge' || manifest.compatibility?.verified !== '14.367') throw new Error('Unexpected Foundry module manifest');
console.log('Foundry manifest verified.');
