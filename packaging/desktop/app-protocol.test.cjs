const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { assetPath, isAppUrl, isExternalUrl } = require('./app-protocol.cjs');

test('packaged HTML, workers and catalogue stay inside the renderer root', () => {
    const root = resolve('www');
    assert.equal(assetPath(root, 'gcam://app/'), resolve(root, 'index.html'));
    assert.equal(
        assetPath(root, 'gcam://app/assets/cam-worker.js'),
        resolve(root, 'assets/cam-worker.js'),
    );
    assert.equal(
        assetPath(root, 'gcam://app/library/tools.json'),
        resolve(root, 'library/tools.json'),
    );
    for (const url of [
        'gcam://other/index.html',
        'https://app/index.html',
        'gcam://app/%2e%2e%2fsecret',
        'gcam://app/%5csecret',
        'gcam://app/%00',
        'gcam://user@app/file',
    ])
        assert.equal(assetPath(root, url), null);
});
test('navigation stays in the app; external links only use web protocols', () => {
    assert.equal(isAppUrl('gcam://app/index.html'), true);
    for (const url of [
        'gcam://other/',
        'file:///etc/passwd',
        'https://app/',
        'bad',
    ])
        assert.equal(isAppUrl(url), false);
    assert.equal(
        isExternalUrl('https://github.com/petervanderwalt/gCAM'),
        true,
    );
    for (const url of [
        'file:///tmp/tool',
        'javascript:alert(1)',
        'https://user:password@example.com/',
    ])
        assert.equal(isExternalUrl(url), false);
});
