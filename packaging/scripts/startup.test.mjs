import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function startup(native) {
    const events = {},
        classes = new Set();
    let removed = false,
        delay;
    const screen = {
        isConnected: true,
        classList: { add: (name) => classes.add(name) },
        remove: () => {
            removed = true;
        },
    };
    const status = {},
        retry = { hidden: true, addEventListener() {} };
    const document = {
        getElementById: (id) =>
            ({
                'gcam-startup': screen,
                'gcam-startup-status': status,
                'gcam-startup-retry': retry,
            })[id],
        addEventListener: (name, listener) => {
            events[name] = listener;
        },
    };
    const window = {
        cordova: native ? {} : undefined,
        addEventListener: (name, listener) => {
            events[name] = listener;
        },
        setTimeout: (callback, duration) => {
            delay = duration;
            callback();
        },
        matchMedia: () => ({ matches: true }),
    };
    runInNewContext(
        readFileSync(
            new URL('../resources/startup.js', import.meta.url),
            'utf8',
        ),
        { window, document },
    );
    return {
        events,
        classes,
        status,
        retry,
        removed: () => removed,
        delay: () => delay,
    };
}
test('tablet animation waits for both editor and native bridge, without a fabricated startup delay', () => {
    const state = startup(true);
    state.events['gcam-ready']();
    assert.equal(state.removed(), false);
    state.events.deviceready();
    assert.equal(state.removed(), true);
    assert.equal(state.delay(), 0);
});
test('desktop clears on ready; startup errors offer retry and stop animation', () => {
    const desktop = startup(false);
    desktop.events['gcam-ready']();
    assert.equal(desktop.removed(), true);
    const failed = startup(true);
    failed.events['gcam-startup-error']();
    assert.equal(failed.retry.hidden, false);
    assert.equal(failed.classes.has('gcam-failed'), true);
    assert.equal(failed.removed(), false);
});
