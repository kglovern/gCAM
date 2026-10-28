import fs from 'node:fs';
import { bakeForViewer, parseSTL } from './stl';
import { defaultMeshSettings, planMeshToolpath } from './meshToolpath';
import { defaultSupports, supportZones } from './supports';
import { rotarySurfaceMesh } from './meshCoordinates';

const mesh = {
    ...bakeForViewer(
        parseSTL(fs.readFileSync('cypress/fixtures/rotary-asymmetric.stl')),
        60,
    ),
    name: 'box',
    key: 'box',
};
const stock = {
    length: 140,
    diameter: 24,
    grip: 19,
    ext: false,
    supports: {
        ...defaultSupports,
        coreDiameter: 20,
        endDiameter: 22,
        chuckOverlap: 1,
        tailOverlap: 1,
    },
};
const tool = {
    type: 'ball',
    dia: 2,
    feed: 500,
    plunge: 100,
    spindle: 16000,
    slotNum: 1,
};

test.each(['around', 'along', 'helix', 'indexed', 'simultaneous'])(
    '%s STL finishing preserves supports through entire blocks',
    (strategy) => {
        const settings = {
            ...defaultMeshSettings,
            strategy,
            independentAxis: true,
            tolerance: 0.5,
            cellSize: 0.5,
            stepover: 1,
            angleStep: 90,
        };
        const moves = planMeshToolpath(
            mesh,
            stock,
            tool,
            'finish',
            2,
            0,
            settings,
        );
        expect(moves.length).toBeGreaterThan(0);
        const bounds = rotarySurfaceMesh(mesh, 0).bounds;
        const zones = supportZones(stock, bounds.minX, bounds.maxX);
        let from = { x: 0, y: 0, z: stock.diameter, a: 0 };
        let minClearance = Infinity;
        for (const move of moves) {
            const to = {
                x: move.x ?? from.x,
                y: move.y ?? from.y,
                z: move.z ?? from.z,
                a: move.a ?? from.a,
            };
            for (let i = 0; i <= 4; i++) {
                const t = i / 4,
                    x = from.x + (to.x - from.x) * t,
                    y = from.y + (to.y - from.y) * t,
                    z = from.z + (to.z - from.z) * t;
                for (const zone of zones) {
                    const dx = Math.max(zone.x0 - x, 0, x - zone.x1);
                    const dr = Math.max(
                        0,
                        Math.hypot(y, z + tool.dia / 2) - zone.radius,
                    );
                    minClearance = Math.min(
                        minClearance,
                        Math.hypot(dx, dr) - tool.dia / 2,
                    );
                }
            }
            if (!move.rapid) expect(move.minutes).toBeGreaterThan(0);
            from = to;
        }
        expect(minClearance).toBeGreaterThanOrEqual(-0.0001);
    },
    60000,
);
