const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Script, runInNewContext } = require('node:vm');

test('desktop scripts parse before launching Electron', () => {
    for (const name of readdirSync(__dirname)) {
        if (!name.endsWith('.cjs')) continue;
        new Script(readFileSync(join(__dirname, name), 'utf8'), {
            filename: name,
        });
    }
});

test('smoke startup failures exit instead of opening an Electron error dialog', () => {
    const startupError = new SyntaxError('Desktop startup failed');
    const calls = [];
    runInNewContext(readFileSync(join(__dirname, 'smoke.cjs'), 'utf8'), {
        require(name) {
            if (name === 'electron')
                return {
                    app: {
                        commandLine: {
                            appendSwitch: (value) => calls.push(value),
                        },
                        exit: (code) => calls.push(code),
                    },
                };
            assert.equal(name, './main.cjs');
            throw startupError;
        },
        console: { error: (error) => calls.push(error) },
    });
    assert.deepEqual(calls, ['smoke-test', startupError, 1]);
});
