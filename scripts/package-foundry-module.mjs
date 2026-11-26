/* global console */

import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

function collectFiles(root, base = root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? collectFiles(path, base) : [path];
  }).sort();
}

function writeZip(sourceDirectory, archivePath) {
  const chunks = [];
  const central = [];
  for (const path of collectFiles(sourceDirectory)) {
    const name = Buffer.from(relative(sourceDirectory, path).replaceAll('\\', '/'), 'utf8');
    const input = readFileSync(path);
    const compressed = deflateRawSync(input, { level: 9 });
    const crc = crc32(input);
    const offset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(input.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(input.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([entry, name]));
  }
  const centralStart = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  writeFileSync(archivePath, Buffer.concat([...chunks, centralDirectory, end]));
}

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
cpSync('apps/foundry-module/styles', resolve(stageRoot, 'styles'), { recursive: true });
cpSync('apps/foundry-module/dist/foundry-mcp.js', resolve(stageRoot, 'foundry-mcp.js'));
rmSync(archivePath, { force: true });
writeZip(stageRoot, archivePath);
console.log(`Foundry module archive created: ${archivePath}`);
