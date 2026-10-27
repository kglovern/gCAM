const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createPendantService } = require('./pendant.cjs');

// Minimal stand-in for a pendant's receiver (gSender remoteFileReceive).
function startTablet({ fileStatus = 200 } = {}) {
    const seen = { claims: [], files: [] };
    const server = http.createServer((req, res) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (req.url === '/pendant/pair/claim') {
                const claim = JSON.parse(body);
                seen.claims.push(claim);
                const ok =
                    (claim.nonce && claim.nonce === seen.pendingNonce) ||
                    claim.code === '123456';
                res.writeHead(ok ? 200 : 404, {
                    'Content-Type': 'application/json',
                });
                res.end(
                    JSON.stringify(
                        ok
                            ? {
                                  key: 'secret-key',
                                  deviceId: 'tab-1',
                                  deviceName: 'Shop Tablet',
                              }
                            : { msg: 'nope' },
                    ),
                );
                return;
            }
            if (req.url === '/pendant/file') {
                seen.files.push({ headers: req.headers, body });
                res.writeHead(fileStatus, {
                    'Content-Type': 'application/json',
                });
                res.end('{}');
                return;
            }
            res.writeHead(404);
            res.end();
        });
    });
    return new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () =>
            resolve({ server, port: server.address().port, seen }),
        ),
    );
}

function fakeBonjour() {
    const browser = new EventEmitter();
    browser.stop = () => {};
    return { browser, bonjour: { find: () => browser, destroy: () => {} } };
}

function makeService(t, extra = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcam-pendant-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const { browser, bonjour } = fakeBonjour();
    const changes = [];
    const storePath = path.join(dir, 'pendant.json');
    const service = createPendantService({
        storePath,
        desktopName: 'gCAM – test',
        createBonjour: () => bonjour,
        onChange: (state) => changes.push(state),
        ...extra,
    });
    t.after(() => service.dispose());
    return { service, browser, changes, storePath };
}

test('QR payload carries a nonce and a stable desktop id', (t) => {
    const { service } = makeService(t);
    const first = service.createQr();
    const second = service.createQr();
    const url = new URL(first.payload);
    assert.equal(url.protocol, 'gsender-pendant:');
    assert.equal(url.searchParams.get('v'), '1');
    assert.equal(url.searchParams.get('n'), first.nonce);
    assert.equal(url.searchParams.get('name'), 'gCAM – test');
    assert.equal(
        url.searchParams.get('d'),
        new URL(second.payload).searchParams.get('d'),
    );
    assert.notEqual(first.nonce, second.nonce);
});

test('stale nonce reports expiry', async (t) => {
    const { service } = makeService(t);
    const { nonce } = service.createQr();
    service.createQr();
    assert.deepEqual(await service.claim({ nonce }), {
        paired: false,
        expired: true,
    });
});

test('QR claim pairs a discovered tablet and keeps the key out of list()', async (t) => {
    const tablet = await startTablet();
    t.after(() => tablet.server.close());
    const { service, browser, storePath } = makeService(t);
    service.discover();
    browser.emit('up', {
        name: 'Shop Tablet (ab12)',
        port: tablet.port,
        addresses: ['127.0.0.1'],
        txt: { id: 'tab-1' },
    });
    const { nonce } = service.createQr();
    assert.deepEqual(await service.claim({ nonce }), { paired: false });

    tablet.seen.pendingNonce = nonce;
    const result = await service.claim({ nonce });
    assert.equal(result.paired, true);
    assert.equal(result.tablet.id, 'tab-1');
    assert.equal(tablet.seen.claims.at(-1).desktopName, 'gCAM – test');

    const listed = service.list().tablets;
    assert.deepEqual(listed, [
        {
            id: 'tab-1',
            name: 'Shop Tablet',
            host: '127.0.0.1',
            port: tablet.port,
            paired: true,
            online: true,
        },
    ]);
    const stored = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    assert.equal(stored.tablets['tab-1'].key, 'secret-key');
});

test('code claim maps a wrong code to a friendly message', async (t) => {
    const tablet = await startTablet();
    t.after(() => tablet.server.close());
    const { service } = makeService(t);
    const bad = await service.claim({
        host: '127.0.0.1',
        port: tablet.port,
        code: '000000',
    });
    assert.deepEqual(bad, { paired: false, message: 'Incorrect pairing code' });
    const good = await service.claim({
        host: '127.0.0.1',
        port: tablet.port,
        code: '123456',
    });
    assert.equal(good.paired, true);
});

test('send uploads multipart with the bearer key and loads it', async (t) => {
    const tablet = await startTablet();
    t.after(() => tablet.server.close());
    const { service } = makeService(t);
    await service.claim({
        host: '127.0.0.1',
        port: tablet.port,
        code: '123456',
    });

    const result = await service.send({
        tabletId: 'tab-1',
        name: 'part one.nc',
        gcode: 'G0 X1\n',
    });
    assert.deepEqual(result, { ok: true });
    const [{ headers, body }] = tablet.seen.files;
    assert.equal(headers.authorization, 'Bearer secret-key');
    assert.equal(headers['x-pendant-filename'], 'part%20one.nc');
    assert.ok(headers['x-pendant-desktop-id']);
    assert.match(headers['content-type'], /^multipart\/form-data/);
    assert.match(body, /name="gcode"; filename="part one.nc"/);
    assert.match(body, /G0 X1/);
    assert.match(body, /name="mode"\r\n\r\nactive/);
});

test('a 401 on send forgets the tablet', async (t) => {
    const tablet = await startTablet({ fileStatus: 401 });
    t.after(() => tablet.server.close());
    const { service } = makeService(t);
    await service.claim({
        host: '127.0.0.1',
        port: tablet.port,
        code: '123456',
    });

    const result = await service.send({
        tabletId: 'tab-1',
        name: 'a.nc',
        gcode: 'G0',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unpaired');
    assert.deepEqual(service.list().tablets, []);
});
