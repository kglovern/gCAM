import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cwd = resolve(root, 'packaging/mobile');
const platform = process.argv[2];
if (!['android', 'ios'].includes(platform))
    throw new Error('Choose android or ios');
const manifest = JSON.parse(
    await readFile(resolve(cwd, 'package.json'), 'utf8'),
);
const version = manifest.devDependencies[`cordova-${platform}`];
const cli = resolve(cwd, 'node_modules/cordova/bin/cordova');
const result = spawnSync(
    process.execPath,
    [cli, 'platform', 'add', `${platform}@${version}`, '--nosave'],
    { cwd, stdio: 'inherit' },
);
process.exitCode = result.status ?? 1;
