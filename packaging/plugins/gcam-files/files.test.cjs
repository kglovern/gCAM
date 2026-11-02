const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('file bridge uses separate binary action and preserves payload and callbacks', () => {
    const calls = [];
    const exports = {};
    vm.runInNewContext(
        fs.readFileSync(require.resolve('./www/files.js'), 'utf8'),
        {
            exports,
            require: (id) => {
                assert.equal(id, 'cordova/exec');
                return (...args) => calls.push(args);
            },
        },
    );
    const ok = () => {},
        fail = () => {};
    exports.saveBinary('sample.png', 'iVBORw0KGgoA/4A=', 'image/png', ok, fail);
    exports.save('sample.gcode', 'G0 X1', 'text/plain', ok, fail);
    assert.equal(calls[0][0], ok);
    assert.equal(calls[0][1], fail);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].slice(2))), [
        'GcamFiles',
        'saveBinary',
        ['sample.png', 'iVBORw0KGgoA/4A=', 'image/png'],
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1].slice(2))), [
        'GcamFiles',
        'save',
        ['sample.gcode', 'G0 X1', 'text/plain'],
    ]);
});
