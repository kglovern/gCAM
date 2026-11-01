const { defineConfig } = require('cypress');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = defineConfig({
    viewportWidth: 1440,
    viewportHeight: 1000,
    defaultCommandTimeout: 15000,
    video: false,
    allowCypressEnv: false,
    e2e: {
        baseUrl: 'http://127.0.0.1:5180',
        specPattern: 'cypress/e2e/**/*.cy.js',
        setupNodeEvents(on, config) {
            const folder = path.resolve(config.downloadsFolder);
            on('task', {
                compiledWorkers() {
                    const assets = path.resolve(
                        __dirname,
                        '../dist-gcam-react/assets',
                    );
                    if (!fs.existsSync(assets))
                        throw new Error(
                            'Run npm run build before the compiled-worker benchmark.',
                        );
                    const read = (pattern) => {
                        const matches = fs
                            .readdirSync(assets)
                            .filter((name) => pattern.test(name));
                        if (matches.length !== 1)
                            throw new Error(
                                'Expected one compiled worker; rebuild before benchmarking.',
                            );
                        const source = fs.readFileSync(
                            path.join(assets, matches[0]),
                            'utf8',
                        );
                        return {
                            name: matches[0],
                            sha256: createHash('sha256')
                                .update(source)
                                .digest('hex'),
                            source,
                        };
                    };
                    return {
                        trace: read(/^trace\.worker-[\w-]+\.js$/),
                        cam: read(/^cam-worker-[\w-]+\.js$/),
                    };
                },
                clearDownloads() {
                    fs.mkdirSync(folder, { recursive: true });
                    for (const name of fs.readdirSync(folder)) {
                        fs.unlinkSync(path.join(folder, name));
                    }
                    return null;
                },
                download(extension) {
                    const name = fs
                        .readdirSync(folder)
                        .find((n) => n.endsWith(extension));
                    return name
                        ? fs.readFileSync(path.join(folder, name), 'utf8')
                        : null;
                },
            });
        },
    },
});
