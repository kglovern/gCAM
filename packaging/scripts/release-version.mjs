import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function releaseVersion(tag) {
    const match =
        /^v(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.exec(tag);
    if (!match)
        throw new Error(
            'Release tags must use vMAJOR.MINOR.PATCH (each part 0–999).',
        );
    const [, major, minor, patch] = match;
    const androidCode =
        Number(major) * 1000000 + Number(minor) * 1000 + Number(patch);
    if (!androidCode)
        throw new Error('Release version must be greater than zero.');
    return { version: `${major}.${minor}.${patch}`, androidCode };
}

if (
    process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const tag = process.env.RELEASE_TAG;
    if (tag) {
        const { version, androidCode } = releaseVersion(tag);
        const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
        for (const directory of [
            'react',
            'packaging/desktop',
            'packaging/mobile',
        ]) {
            const path = resolve(root, directory, 'package.json');
            const manifest = JSON.parse(await readFile(path, 'utf8'));
            manifest.version = version;
            await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
            if (directory !== 'react') {
                const lockPath = resolve(root, directory, 'package-lock.json');
                const lock = JSON.parse(await readFile(lockPath, 'utf8'));
                lock.version = lock.packages[''].version = version;
                await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
            }
        }
        const configPath = resolve(root, 'packaging/mobile/config.xml');
        const config = (await readFile(configPath, 'utf8')).replace(
            / (?:android-versionCode|ios-CFBundleVersion)="[^"]*"/g,
            '',
        );
        const build = `${process.env.GITHUB_RUN_NUMBER || androidCode}.${process.env.GITHUB_RUN_ATTEMPT || 1}`;
        await writeFile(
            configPath,
            config.replace(
                /(<widget\b[^>]*\bversion=")[^"]+"/,
                (_match, prefix) =>
                    `${prefix}${version}" android-versionCode="${androidCode}" ios-CFBundleVersion="${build}"`,
            ),
        );
        console.log(`Building gCAM ${version}`);
    }
}
