import { DEFAULT_JOB_STOCK, jobStockBounds, normalizeJobStock } from './stock';
import { deserializeProject, serializeProject } from '../lib/project';
test('legacy stock remains front-left and centre stock straddles zero', () => {
    expect(normalizeJobStock({ widthMm: 200, heightMm: 100 }).origin).toBe(
        'front-left',
    );
    expect(
        jobStockBounds({
            ...DEFAULT_JOB_STOCK,
            widthMm: 200,
            heightMm: 100,
            origin: 'center',
        }),
    ).toEqual({ minX: -100, minY: -50, maxX: 100, maxY: 50 });
    expect(
        jobStockBounds({ ...DEFAULT_JOB_STOCK, widthMm: 200, heightMm: 100 }),
    ).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 100 });
});
test('centre origin survives project save and load without moving geometry', () => {
    const loops = [
        {
            points: [
                { x: -20, y: 10 },
                { x: 20, y: 10 },
            ],
        },
    ];
    const result = deserializeProject(
        serializeProject({
            loops,
            selected: [],
            hidden: [],
            stack: [],
            bitmaps: [],
            guides: [],
            fileName: 'clock',
            stock: { ...DEFAULT_JOB_STOCK, origin: 'center' },
        }),
    );
    expect(result.stock?.origin).toBe('center');
    expect(result.loops).toEqual(loops);
});

test('laser material survives save/load independently of milling material', () => {
    const result = deserializeProject(
        serializeProject({
            loops: [],
            selected: [],
            hidden: [],
            stack: [],
            bitmaps: [],
            guides: [],
            fileName: 'laser',
            stock: { ...DEFAULT_JOB_STOCK, laserMaterial: 'paper-card' },
        }),
    );
    expect(result.stock?.laserMaterial).toBe('paper-card');
    expect(result.stock?.material).toBe(DEFAULT_JOB_STOCK.material);
});

test('rotary job setup persists and corrupt calibration requires rechecking', () => {
    const setup = {
        type: 'roller',
        axis: 'Z',
        objectDiameter: 80,
        rollerDiameter: 20,
        unitsPerTurn: 100,
        reverse: true,
        confirmed: true,
    };
    expect(
        normalizeJobStock({ ...DEFAULT_JOB_STOCK, laserRotary: setup })
            .laserRotary,
    ).toEqual(setup);
    expect(
        normalizeJobStock({
            ...DEFAULT_JOB_STOCK,
            laserRotary: { ...setup, unitsPerTurn: 0 },
        }).laserRotary?.confirmed,
    ).toBe(false);
    expect(normalizeJobStock(DEFAULT_JOB_STOCK).laserRotary).toBeUndefined();
});
