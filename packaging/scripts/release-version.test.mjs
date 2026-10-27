import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseVersion } from './release-version.mjs';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('release versions generate increasing Android codes and reject unsafe tags', () => {
    assert.deepEqual(releaseVersion('v1.2.3'), {
        version: '1.2.3',
        androidCode: 1002003,
    });
    assert.ok(
        releaseVersion('v0.2.0').androidCode >
            releaseVersion('v0.1.999').androidCode,
    );
    for (const tag of [
        'v0.0.0',
        '1.2.3',
        'v01.2.3',
        'v1.2.3-beta',
        'v1.1000.0',
        'v1.2.3; echo bad',
    ])
        assert.throws(() => releaseVersion(tag));
});

test('tag stamping keeps manifests, lockfiles and Cordova build versions aligned on reruns', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gcam-release-'));
    try {
        await mkdir(join(root, 'packaging/scripts'), { recursive: true });
        await cp(
            new URL('./release-version.mjs', import.meta.url),
            join(root, 'packaging/scripts/release-version.mjs'),
        );
        for (const directory of [
            'react',
            'packaging/desktop',
            'packaging/mobile',
        ]) {
            await mkdir(join(root, directory), { recursive: true });
            await writeFile(
                join(root, directory, 'package.json'),
                '{"version":"0.1.0"}',
            );
            if (directory !== 'react')
                await writeFile(
                    join(root, directory, 'package-lock.json'),
                    '{"version":"0.1.0","packages":{"":{"version":"0.1.0"}}}',
                );
        }
        await writeFile(
            join(root, 'packaging/mobile/config.xml'),
            '<widget id="com.petervanderwalt.gcam" version="0.1.0"></widget>',
        );
        for (let run = 0; run < 2; run++)
            execFileSync(
                process.execPath,
                [join(root, 'packaging/scripts/release-version.mjs')],
                {
                    env: {
                        ...process.env,
                        RELEASE_TAG: 'v0.2.0',
                        GITHUB_RUN_NUMBER: '44',
                        GITHUB_RUN_ATTEMPT: '2',
                    },
                },
            );
        const config = await readFile(
            join(root, 'packaging/mobile/config.xml'),
            'utf8',
        );
        assert.match(config, /version="0.2.0"/);
        assert.match(config, /android-versionCode="2000"/);
        assert.match(config, /ios-CFBundleVersion="44.2"/);
        assert.equal(config.match(/android-versionCode=/g).length, 1);
        for (const directory of [
            'react',
            'packaging/desktop',
            'packaging/mobile',
        ])
            assert.equal(
                JSON.parse(
                    await readFile(
                        join(root, directory, 'package.json'),
                        'utf8',
                    ),
                ).version,
                '0.2.0',
            );
        const lock = JSON.parse(
            await readFile(
                join(root, 'packaging/desktop/package-lock.json'),
                'utf8',
            ),
        );
        assert.equal(lock.packages[''].version, '0.2.0');
    } finally {
        assert.ok(
            resolve(root).startsWith(resolve(join(tmpdir(), 'gcam-release-'))),
        );
        await rm(root, { recursive: true, force: true });
    }
});
