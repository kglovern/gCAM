import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { releaseVersion } from './release-version.mjs';

const tag = process.env.RELEASE_TAG;
const { version } = releaseVersion(tag);
const directory = resolve('release-assets');
const files = (await readdir(directory))
    .filter((name) =>
        /\.(?:exe|dmg|zip|AppImage|deb|apk|aab|ipa|yml|blockmap)$/.test(name),
    )
    .sort();
for (const required of [
    `gCAM-${version}-win-x64.exe`,
    `gCAM-${version}-linux-x64.AppImage`,
    `gCAM-${version}-android.apk`,
    'latest.yml',
    'latest-linux.yml',
    'latest-mac.yml',
]) {
    if (!files.includes(required))
        throw new Error(`Missing release asset: ${required}`);
}
const sums = [];
for (const name of files) {
    const digest = createHash('sha256')
        .update(await readFile(resolve(directory, name)))
        .digest('hex');
    sums.push(`${digest}  ${name}`);
}
await writeFile(resolve(directory, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`);
const gh = (...args) =>
    execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
let existing;
try {
    existing = JSON.parse(gh('release', 'view', tag, '--json', 'isDraft'));
} catch (error) {
    if (!String(error.stderr).includes('release not found')) throw error;
}
if (existing && !existing.isDraft)
    throw new Error(
        'Published releases are immutable; create a new version tag.',
    );
if (!existing)
    gh(
        'release',
        'create',
        tag,
        '--verify-tag',
        '--draft',
        '--title',
        `gCAM ${version}`,
        '--generate-notes',
    );
gh(
    'release',
    'upload',
    tag,
    ...files.map((name) => resolve(directory, name)),
    resolve(directory, 'SHA256SUMS.txt'),
    '--clobber',
);
console.log(
    `Draft ${tag} is ready. Review downloads and publish it to make updates available.`,
);
