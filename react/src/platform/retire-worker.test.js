/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { jest } from '@jest/globals';

test('previous offline caches are retired without deleting projects or unrelated caches', async () => {
    const handlers = {};
    const self = {
        addEventListener: (name, handler) => {
            handlers[name] = handler;
        },
        skipWaiting: jest.fn(),
        clients: { claim: jest.fn() },
        registration: {
            scope: 'https://example.com/gCAM/',
            unregister: jest.fn(),
        },
    };
    const caches = {
        keys: async () => ['gcam:/gCAM/:old', 'gcam:/other/:keep', 'other-app'],
        delete: jest.fn(),
    };
    runInNewContext(readFileSync('public/sw.js', 'utf8'), {
        self,
        caches,
        URL,
    });
    handlers.install();
    let work;
    handlers.activate({
        waitUntil: (value) => {
            work = value;
        },
    });
    await work;
    expect(self.skipWaiting).toHaveBeenCalled();
    expect(caches.delete.mock.calls).toEqual([['gcam:/gCAM/:old']]);
    expect(self.registration.unregister).toHaveBeenCalled();
    expect(handlers.fetch).toBeUndefined();
});
