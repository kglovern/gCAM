import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** Build-specific offline shell; optional fonts/catalog photos are cached when used. */
export function pwa(): Plugin {
    let config: ResolvedConfig;
    return {
        name: 'gcam-pwa',
        apply: 'build',
        enforce: 'post',
        configResolved(value) {
            config = value;
        },
        async generateBundle(_, bundle) {
            const manifest = JSON.parse(
                await readFile(
                    resolve(config.publicDir, 'manifest.webmanifest'),
                    'utf8',
                ),
            );
            this.emitFile({
                type: 'asset',
                fileName: 'manifest.webmanifest',
                source: JSON.stringify(
                    {
                        ...manifest,
                        id: config.base,
                        scope: config.base,
                        start_url: config.base,
                    },
                    null,
                    2,
                ),
            });
            const revision = createHash('sha256');
            const files = Object.keys(bundle)
                .filter((name) => !name.endsWith('.map'))
                .sort();
            for (const name of files) {
                const asset = bundle[name];
                revision
                    .update(name)
                    .update(asset.type === 'chunk' ? asset.code : asset.source);
            }
            const publicFiles: string[] = [];
            const walk = async (directory: string, prefix = '') => {
                for (const entry of await readdir(directory, {
                    withFileTypes: true,
                })) {
                    const name = `${prefix}${entry.name}`;
                    if (entry.isDirectory())
                        await walk(resolve(directory, entry.name), `${name}/`);
                    else if (
                        /\.(json|png|svg|js|wasm|dxf|webmanifest)$/.test(
                            name,
                        ) &&
                        !name.startsWith('assets/fonts/') &&
                        !name.startsWith('library/tools/sienci/images/')
                    ) {
                        publicFiles.push(name);
                    }
                }
            };
            await walk(config.publicDir);
            for (const name of publicFiles.sort())
                revision
                    .update(name)
                    .update(await readFile(resolve(config.publicDir, name)));
            const template = await readFile(
                resolve(config.root, 'build/service-worker.js'),
                'utf8',
            );
            revision.update(template);
            const source = template
                .replace('__GCAM_BASE__', JSON.stringify(config.base))
                .replace(
                    '__GCAM_VERSION__',
                    JSON.stringify(revision.digest('hex').slice(0, 16)),
                )
                .replace(
                    '__GCAM_PRECACHE__',
                    JSON.stringify(
                        [...new Set([...files, ...publicFiles])].map(
                            (name) => `${config.base}${name}`,
                        ),
                    ),
                );
            this.emitFile({ type: 'asset', fileName: 'sw.js', source });
        },
    };
}
