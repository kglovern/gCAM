import {
    laserCalibrationRange,
    exportLaserLibrary,
    importLaserLibrary,
    loadLaserRecipes,
    matchingLaserRecipe,
    saveLaserRecipes,
} from './laser-recipes';
const context = {
    laser: 'Test laser',
    machine: 'longmill-router',
    material: 'plywood',
    thickness: 3,
    operation: 'laser-cut',
};
test('surface recipes can ignore thickness while exact-thickness settings take priority', () => {
    const surface = { ...context, operation: 'laser-fill' };
    const generic = {
        ...surface,
        id: 'surface',
        name: 'Surface',
        thicknessIndependent: true,
        feed: 1000,
        power: 250,
        interval: 0.1,
        options: {},
        source: 'User settings',
    };
    const exact = {
        ...generic,
        id: 'exact',
        thicknessIndependent: false,
        feed: 1200,
    };
    expect(
        matchingLaserRecipe([generic], { ...surface, thickness: 18 }),
    ).toEqual(generic);
    expect(matchingLaserRecipe([exact, generic], surface)).toEqual(exact);
    expect(matchingLaserRecipe([generic, exact], surface)).toEqual(exact);
    expect(
        matchingLaserRecipe([exact, generic], { ...surface, maxFeed: 1100 }),
    ).toEqual(generic);
    for (const change of [
        { machine: 'other' },
        { laser: 'other' },
        { material: 'acrylic' },
        { operation: 'laser-cut' },
    ])
        expect(
            matchingLaserRecipe([generic], { ...surface, ...change }),
        ).toBeUndefined();
    const portable = importLaserLibrary(
        exportLaserLibrary([generic, exact]),
        [],
    );
    expect(portable).toEqual([generic, exact]);
    expect(
        matchingLaserRecipe(portable, { ...surface, thickness: 18 }),
    ).toEqual(generic);
});
test('thickness-independent cut recipes and malformed flags are rejected', () => {
    const recipe = {
        ...context,
        id: 'bad',
        name: 'Bad',
        thicknessIndependent: true,
        feed: 1000,
        power: 250,
        interval: 0.1,
        options: {},
        source: 'User settings',
    };
    expect(() => exportLaserLibrary([recipe])).toThrow('Invalid');
    expect(() => saveLaserRecipes([recipe])).toThrow('Invalid');
    expect(() =>
        importLaserLibrary(
            JSON.stringify({
                format: 'gcam-laser-materials',
                version: 1,
                recipes: [
                    {
                        ...recipe,
                        operation: 'laser-fill',
                        thicknessIndependent: 'yes',
                    },
                ],
            }),
            [],
        ),
    ).toThrow('Invalid');
});
test('calibrated recommendations match exact setup and override only matching manufacturer values', () => {
    const recipe = {
        ...context,
        id: 'test',
        name: 'Plywood',
        feed: 1000,
        power: 500,
        interval: 0.2,
        options: { passes: 2 },
        source: 'User calibrated',
    };
    localStorage.clear();
    saveLaserRecipes([recipe]);
    expect(loadLaserRecipes()).toEqual([recipe]);
    expect(matchingLaserRecipe(loadLaserRecipes(), context)).toEqual(recipe);
    for (const change of [
        { thickness: 6 },
        { laser: 'Other laser' },
        { operation: 'laser-fill' },
        { material: 'acrylic' },
        { machine: 'other' },
    ])
        expect(
            matchingLaserRecipe([recipe], { ...context, ...change }),
        ).toBeUndefined();
});
test('DIY wattage estimates preserve line energy and never cross laser families', () => {
    const diode = { ...context, laser: 'diode:10:', operation: 'laser-fill' };
    expect(matchingLaserRecipe([], diode)).toMatchObject({
        feed: 2177,
        power: 1000,
        estimated: true,
        family: 'diode',
    });
    expect(
        matchingLaserRecipe([], { ...diode, laser: 'co2:60:' }),
    ).toBeUndefined();
    expect(
        matchingLaserRecipe([], {
            ...context,
            laser: 'co2:60:',
            operation: 'laser-cut',
        }),
    ).toMatchObject({ feed: 1200, power: 600, estimated: true, family: 'co2' });
    expect(
        matchingLaserRecipe([], { ...diode, laser: 'diode:41:' }),
    ).toBeUndefined();
});

test('estimated duty is reduced when feed reaches the selected machine limit', () => {
    const result = matchingLaserRecipe([], {
        ...context,
        laser: 'diode:40:',
        operation: 'laser-fill',
        maxFeed: 4000,
    });
    expect(result).toMatchObject({ feed: 4000, power: 459, estimated: true });
});

test('calibration ranges follow the reference and motion limit instead of sweeping full power', () => {
    expect(laserCalibrationRange(undefined, 4000)).toEqual({
        minFeed: 2250,
        maxFeed: 3750,
        minPower: 5,
        maxPower: 20,
    });
    expect(laserCalibrationRange({ feed: 1200, power: 600 }, 4000)).toEqual({
        minFeed: 900,
        maxFeed: 1500,
        minPower: 30,
        maxPower: 60,
    });
    expect(
        laserCalibrationRange({ feed: 5000, power: 500 }, 4000).maxFeed,
    ).toBe(4000);
});

const portable = {
    ...context,
    id: 'portable',
    name: 'Plywood cut',
    feed: 1200,
    power: 500,
    interval: 0.1,
    overscan: 3,
    options: { smoothing: 0.5, imageMode: 'stucki' as const },
    source: 'User calibrated',
};
test('portable libraries round-trip settings and preserve existing IDs on repeated import', () => {
    const text = exportLaserLibrary([portable]);
    expect(importLaserLibrary(text, [])).toEqual([portable]);
    const local = { ...portable, feed: 800 };
    expect(importLaserLibrary(text, [local])).toEqual([local]);
    expect(
        importLaserLibrary(
            exportLaserLibrary([{ ...portable, id: 'second' }]),
            [local],
        ),
    ).toHaveLength(2);
});
test('material backups exclude job regions and machine scan calibration', () => {
    const text = exportLaserLibrary([
        {
            ...portable,
            options: {
                ...portable.options,
                imageCrop: { left: 0.1, right: 0.8, bottom: 0, top: 1 },
                scanAlignment: { enabled: false, measurements: [] },
            },
        },
    ]);
    expect(text).not.toContain('imageCrop');
    expect(text).not.toContain('scanAlignment');
});
test.each([
    { format: 'other', version: 1, recipes: [] },
    { format: 'gcam-laser-materials', version: 2, recipes: [] },
    {
        format: 'gcam-laser-materials',
        version: 1,
        recipes: [portable, portable],
    },
    {
        format: 'gcam-laser-materials',
        version: 1,
        recipes: [{ ...portable, power: null }],
    },
    {
        format: 'gcam-laser-materials',
        version: 1,
        recipes: [{ ...portable, options: { passes: 1.5 } }],
    },
    {
        format: 'gcam-laser-materials',
        version: 1,
        recipes: [{ ...portable, operation: 'pocket' }],
    },
])('rejects malformed library without changing saved settings', (data) => {
    saveLaserRecipes([portable]);
    expect(() =>
        importLaserLibrary(JSON.stringify(data), [portable]),
    ).toThrow();
    expect(loadLaserRecipes()).toEqual([portable]);
});
test('rejects oversized material library before parsing', () => {
    expect(() =>
        importLaserLibrary(' '.repeat(2 * 1024 * 1024 + 1), []),
    ).toThrow(/2 MB/);
});

test.each([
    { family: 'diode', opticalWatts: -10 },
    { family: 'co2', opticalWatts: 300 },
    { opticalWatts: 10 },
    { family: 'invalid' },
    { estimated: 'true' },
])('rejects invalid imported hardware metadata %p', (metadata) => {
    const text = JSON.stringify({
        format: 'gcam-laser-materials',
        version: 1,
        recipes: [{ ...portable, ...metadata }],
    });
    expect(() => importLaserLibrary(text, [])).toThrow(/hardware/);
});

test('library limit measures UTF-8 bytes, including non-ASCII names', () => {
    expect(() =>
        exportLaserLibrary([{ ...portable, name: '木'.repeat(800000) }]),
    ).toThrow(/2 MB/);
});
