import { writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const config = resolve(root, 'packaging/mobile/build.json');
if (!process.env.RUNNER_TEMP) throw new Error('Signing runs in GitHub Actions');
const keystore = resolve(process.env.RUNNER_TEMP, 'gcam-android.keystore');
if (process.argv.includes('--clean')) {
    await rm(config, { force: true });
    await rm(keystore, { force: true });
} else {
    for (const key of [
        'ANDROID_KEYSTORE_BASE64',
        'ANDROID_KEYSTORE_PASSWORD',
        'ANDROID_KEY_ALIAS',
        'ANDROID_KEY_PASSWORD',
    ]) {
        if (!process.env[key])
            throw new Error(`Missing signing secret: ${key}`);
    }
    await writeFile(
        keystore,
        Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'),
        { mode: 0o600 },
    );
    await writeFile(
        config,
        JSON.stringify({
            android: {
                release: {
                    keystore,
                    storePassword: process.env.ANDROID_KEYSTORE_PASSWORD,
                    alias: process.env.ANDROID_KEY_ALIAS,
                    password: process.env.ANDROID_KEY_PASSWORD,
                },
            },
        }),
        { mode: 0o600 },
    );
}
