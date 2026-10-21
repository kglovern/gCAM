/** @jest-environment node */
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker() {
    const handlers = {},
        stores = new Map();
    const key = (value) => (typeof value === 'string' ? value : value.url);
    const caches = {
        keys: async () => [...stores.keys()],
        delete: async (name) => stores.delete(name),
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const entries = stores.get(name);
            return {
                match: async (request, options) => {
                    const response = entries.get(key(request));
                    return response?.headers.has('vary') && !options?.ignoreVary
                        ? undefined
                        : response;
                },
                put: async (request, response) =>
                    entries.set(key(request), response),
                addAll: jest.fn(),
            };
        },
    };
    const fetch = jest.fn(async () => new Response('network'));
    const self = {
        location: { origin: 'https://example.com' },
        clients: { claim: jest.fn() },
        skipWaiting: jest.fn(),
        addEventListener: (name, handler) => {
            handlers[name] = handler;
        },
    };
    const source = readFileSync('build/service-worker.js', 'utf8')
        .replace('__GCAM_BASE__', JSON.stringify('/gCAM/'))
        .replace('__GCAM_VERSION__', JSON.stringify('current'))
        .replace('__GCAM_PRECACHE__', JSON.stringify(['/gCAM/index.html']));
    runInNewContext(source, { self, caches, fetch, URL, Response });
    const request = (path, mode = 'cors', method = 'GET') => ({
        url: `https://example.com${path}`,
        mode,
        method,
        headers: new Headers(),
    });
    const send = async (request) => {
        let response;
        handlers.fetch({
            request,
            respondWith: (promise) => {
                response = promise;
            },
            waitUntil: () => {},
        });
        return response;
    };
    return { handlers, caches, fetch, self, request, send };
}

test('offline navigation uses the coherent active shell under the Pages subpath', async () => {
    const w = worker();
    await (await w.caches.open('gcam:/gCAM/:current')).put(
        '/gCAM/index.html',
        new Response('cached shell', { headers: { Vary: 'Origin' } }),
    );
    expect(await (await w.send(w.request('/gCAM/', 'navigate'))).text()).toBe(
        'cached shell',
    );
    expect(w.fetch).not.toHaveBeenCalled();
});

test('does not intercept another site path or project uploads', async () => {
    const w = worker();
    expect(await w.send(w.request('/other-app/', 'navigate'))).toBeUndefined();
    expect(
        await w.send(w.request('/gCAM/import', 'cors', 'POST')),
    ).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
});

test('another open tab can load a previous build chunk with Vary headers', async () => {
    const w = worker();
    const request = w.request('/gCAM/assets/editor-previous.js');
    await (await w.caches.open('gcam:/gCAM/:previous')).put(
        request,
        new Response('previous chunk', { headers: { Vary: 'Origin' } }),
    );
    expect(await (await w.send(request)).text()).toBe('previous chunk');
    expect(w.fetch).not.toHaveBeenCalled();
});

test('retains one previous build and never removes another app cache', async () => {
    const w = worker();
    for (const name of [
        'unrelated-app',
        'gcam:/gCAM/:oldest',
        'gcam:/gCAM/:previous',
        'gcam:/gCAM/:current',
    ])
        await w.caches.open(name);
    let activation;
    w.handlers.activate({
        waitUntil: (promise) => {
            activation = promise;
        },
    });
    await activation;
    expect(await w.caches.keys()).toEqual([
        'unrelated-app',
        'gcam:/gCAM/:previous',
        'gcam:/gCAM/:current',
    ]);
    expect(w.self.clients.claim).toHaveBeenCalled();
});

test('a new worker only skips waiting on the explicit update message', () => {
    const w = worker();
    w.handlers.message({ data: { type: 'other' } });
    expect(w.self.skipWaiting).not.toHaveBeenCalled();
    w.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(w.self.skipWaiting).toHaveBeenCalledTimes(1);
});
