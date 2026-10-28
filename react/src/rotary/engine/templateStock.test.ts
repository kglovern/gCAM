import { fitTemplateStock } from './templateStock';
import { TEMPLATES, templateProfile, sampleProfile } from './profileModel';
import { defaultSupports, supportZones } from './supports';
import { runChecks } from './checks';
import type { RotaryStock, RotaryToolpathEntry } from './types';
const stock: RotaryStock = {
    length: 110,
    diameter: 25.4,
    grip: 19,
    ext: false,
    supports: { ...defaultSupports },
};
const entry: RotaryToolpathEntry = {
    id: 'test',
    operation: 'rough',
    tool: {
        type: 'ball',
        dia: 6.35,
        feed: 1000,
        plunge: 200,
        spindle: 16000,
        slotNum: 1,
    },
    ops: {
        face: false,
        rough: true,
        finish: false,
        allow: 0.5,
        roughStep: 2,
        raster: 270,
        groove: { on: false, x: 50, w: 3 },
        part: { on: false, x: 80 },
    },
};
test('every template sizes stock within standard capacity, including cutters and supports', () => {
    for (const name of Object.keys(TEMPLATES)) {
        const original = templateProfile(name),
            copy = JSON.stringify(original);
        const fitted = fitTemplateStock(original, stock, [entry]);
        const samples = sampleProfile(fitted.points, 16);
        expect(fitted.stock.length).toBeLessThanOrEqual(546);
        expect(fitted.stock.diameter).toBeLessThanOrEqual(101.6);
        expect(fitted.stock.supports).toEqual(stock.supports);
        expect(fitted.stock.ext).toBe(false);
        expect(
            runChecks(samples, fitted.stock, entry.tool, {
                ...entry.ops,
                pommels: [],
                compR: 0,
            }).filter((flag) => flag.level === 'e'),
        ).toEqual([]);
        expect(
            supportZones(
                fitted.stock,
                samples[0].x,
                samples[samples.length - 1].x,
            ),
        ).toHaveLength(3);
        expect(JSON.stringify(original)).toBe(copy);
    }
});
test('does not silently change machine capacity when an oversized cutter setup cannot fit', () => {
    const wide = { ...entry, tool: { ...entry.tool, dia: 80 } };
    expect(() =>
        fitTemplateStock(templateProfile('baluster'), stock, [wide]),
    ).toThrow(/capacity/);
    expect(
        fitTemplateStock(templateProfile('baluster'), { ...stock, ext: true }, [
            wide,
        ]).stock.ext,
    ).toBe(true);
});
