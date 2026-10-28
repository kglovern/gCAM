const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createGsenderClient } = require('./gsender.cjs');

// Minimal stand-in for gSender's loopback handoff listener.
function startGsender({ loadStatus = 202, delayMs = 0 } = {}) {
    const seen = [];
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            seen.push({
                method: req.method,
                url: req.url,
                origin: req.headers.origin,
                contentType: req.headers['content-type'],
                body: Buffer.concat(chunks).toString('utf8'),
            });
            setTimeout(() => {
                const ping = req.url === '/gcam/v1/ping';
                res.writeHead(ping ? 200 : loadStatus, {
                    'Content-Type': 'application/json',
                });
                res.end(
                    JSON.stringify(
                        ping
                            ? { app: 'gSender', version: '1.6', enabled: true }
                            : { accepted: true, name: 'part.nc' },
                    ),
                );
            }, delayMs);
        });
    });
    return new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () =>
            resolve({ server, port: server.address().port, seen }),
        ),
    );
}

test('pings gSender on loopback', async (t) => {
    const gsender = await startGsender();
    t.after(() => gsender.server.close());
    const result = await createGsenderClient().ping(gsender.port);
    assert.equal(result.status, 200);
    assert.equal(result.body.app, 'gSender');
});

test('sends the program as JSON without an Origin header', async (t) => {
    const gsender = await startGsender();
    t.after(() => gsender.server.close());
    const result = await createGsenderClient().send({
        port: gsender.port,
        name: 'part.nc',
        gcode: 'G0 X0',
    });
    assert.deepEqual(result, {
        status: 202,
        body: { accepted: true, name: 'part.nc' },
    });
    const [req] = gsender.seen;
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/gcam/v1/load');
    assert.equal(req.origin, undefined);
    assert.equal(req.contentType, 'application/json');
    assert.deepEqual(JSON.parse(req.body), { name: 'part.nc', gcode: 'G0 X0' });
});

for (const status of [409, 503, 403, 413, 404]) {
    test(`passes HTTP ${status} through`, async (t) => {
        const gsender = await startGsender({ loadStatus: status });
        t.after(() => gsender.server.close());
        const result = await createGsenderClient().send({
            port: gsender.port,
            name: 'a.nc',
            gcode: 'G0',
        });
        assert.equal(result.status, status);
    });
}

test('reports status 0 when nothing is listening', async () => {
    const gsender = await startGsender();
    const { port } = gsender;
    await new Promise((resolve) => gsender.server.close(resolve));
    assert.deepEqual(await createGsenderClient().ping(port), {
        status: 0,
        body: null,
    });
});

test('times out slow responses', async (t) => {
    const gsender = await startGsender({ delayMs: 500 });
    t.after(() => {
        gsender.server.closeAllConnections();
        gsender.server.close();
    });
    const result = await createGsenderClient({ pingTimeoutMs: 20 }).ping(
        gsender.port,
    );
    assert.equal(result.status, 0);
});

test('refuses invalid ports without making a request', async () => {
    let called = false;
    const client = createGsenderClient({
        fetchImpl: async () => {
            called = true;
            throw new Error('should not fetch');
        },
    });
    for (const port of [80, 70000, 1.5, '47820', undefined])
        assert.equal((await client.ping(port)).status, 0);
    assert.equal(called, false);
});

test('rejects a send without g-code', async () => {
    const result = await createGsenderClient().send({ port: 47820, name: 'a' });
    assert.equal(result.status, 400);
});
