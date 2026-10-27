import { readFileSync, readdirSync } from 'node:fs';
import { standardGviewerOrbit } from '../../build/gviewer-orbit';

const id = '/node_modules/@sienci/gviewer/dist/viewer.js';
const source = `class Controls extends Base {
    _rotateUp(angle) { Base.prototype._rotateUp.call(this, -angle); }
}`;

test('uses standard OrbitControls pitch for both drag directions', () => {
    const result = standardGviewerOrbit.transform(source, id);
    class Base {
        _rotateUp(angle) {
            this.angle = angle;
        }
    }
    const Controls = new Function('Base', `${result.code}; return Controls;`)(
        Base,
    );
    const controls = new Controls();
    for (const angle of [0.3, -0.3]) {
        controls._rotateUp(angle);
        expect(controls.angle).toBe(angle);
    }
    expect(
        standardGviewerOrbit.transform(source, '/other/viewer.js'),
    ).toBeNull();
});

test('patches the installed viewer rather than only the example fixture', () => {
    const directory = 'node_modules/@sienci/gviewer/dist';
    const patched = readdirSync(directory)
        .filter((file) => file.endsWith('.js'))
        .map((file) =>
            standardGviewerOrbit.transform(
                readFileSync(`${directory}/${file}`, 'utf8'),
                `${process.cwd()}/${directory}/${file}`,
            ),
        )
        .filter(Boolean);
    expect(patched).toHaveLength(1);
    expect(patched[0].code).not.toMatch(
        /prototype\._rotateUp\.call\(this,\s*-/,
    );
});
