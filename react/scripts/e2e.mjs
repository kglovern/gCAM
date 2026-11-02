import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url);
const localCache = resolve('.cache/Cypress');
if (
    !process.env.CYPRESS_CACHE_FOLDER &&
    existsSync(resolve(localCache, require('cypress/package.json').version))
) {
    process.env.CYPRESS_CACHE_FOLDER = localCache;
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_RUN_AS_NODE;
await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(5180, '127.0.0.1', () => probe.close(resolve));
});
const server = spawn(
    process.execPath,
    [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        '5180',
        '--strictPort',
        '--base',
        '/',
    ],
    { stdio: 'inherit', env, windowsHide: true },
);
let code = 1;
try {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (server.exitCode !== null)
            throw new Error('Test server failed to start');
        try {
            const response = await fetch('http://127.0.0.1:5180');
            if (response.ok) {
                if (server.exitCode !== null)
                    throw new Error('Test server failed to start');
                break;
            }
        } catch {}
        if (attempt === 99) throw new Error('Test server did not become ready');
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const cypress = require('cypress');
    code = process.argv.includes('--open')
        ? await cypress.open().then(() => 0)
        : await cypress
              .run({
                  browser: 'electron',
                  ...(process.argv[2] ? { spec: process.argv[2] } : {}),
                  ...(process.argv[2]?.includes('cypress/benchmarks/')
                      ? {
                            config: {
                                specPattern: [
                                    'cypress/e2e/**/*.cy.js',
                                    'cypress/benchmarks/**/*.cy.js',
                                ],
                            },
                        }
                      : {}),
              })
              .then((result) => result.totalFailed || result.failures || 0);
} finally {
    server.kill();
}
process.exitCode = code ? 1 : 0;
