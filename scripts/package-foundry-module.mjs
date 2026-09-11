/* global console */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const manifest = JSON.parse(readFileSync('apps/foundry-module/module.json', 'utf8'));
const stageRoot = resolve('build/foundry-mcp-bridge');
const archiveRoot = resolve('artifacts');
const archivePath = resolve(archiveRoot, `foundry-mcp-bridge-${manifest.version}.zip`);

execFileSync('npm', ['--workspace', '@foundry-mcp/foundry-module', 'run', 'build'], { stdio: 'inherit' });
rmSync(stageRoot, { recursive: true, force: true });
mkdirSync(stageRoot, { recursive: true });
mkdirSync(archiveRoot, { recursive: true });
cpSync('apps/foundry-module/module.json', resolve(stageRoot, 'module.json'));
cpSync('apps/foundry-module/lang', resolve(stageRoot, 'lang'), { recursive: true });
cpSync('apps/foundry-module/dist/foundry-mcp.js', resolve(stageRoot, 'foundry-mcp.js'));
rmSync(archivePath, { force: true });
execFileSync('zip', ['-rq', archivePath, '.'], { cwd: stageRoot, stdio: 'inherit' });
console.log(`Foundry module archive created: ${archivePath}`);
