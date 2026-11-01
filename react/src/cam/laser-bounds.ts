import { laserLeadEndpoints } from './laser-leads.js';
import { laserOvercutPoints } from './laser-overcut.js';

type Point = { x: number; y: number; power: number };
export type LaserBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
type Path = { points: Point[]; laserLeadInside?: boolean };
type PlannedLaser = {
    operation: string;
    laserPaths: Path[];
    laserPower: number;
    laserOptions: {
        passes: number;
        overcut?: number;
        leadInLength?: number;
        leadOutLength?: number;
        leadInAngle?: number;
        leadOutAngle?: number;
    };
};

/** Planned flat XY centreline extents; excludes unknown host position and custom output blocks. */
export function laserJobBounds(toolpaths: Record<string, unknown>[]): {
    travel: LaserBounds | null;
    powered: LaserBounds | null;
} {
    let travel: LaserBounds | null = null,
        powered: LaserBounds | null = null;
    const add = (bounds: LaserBounds | null, p: Point): LaserBounds => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
            throw new Error('Invalid laser bounds coordinates.');
        if (!bounds) return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
        bounds.minX = Math.min(bounds.minX, p.x);
        bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.minY = Math.min(bounds.minY, p.y);
        bounds.maxY = Math.max(bounds.maxY, p.y);
        return bounds;
    };
    const burn = (a: Point, b: Point, power = b.power) => {
        if (Math.round(power) > 0) {
            powered = add(powered, a);
            powered = add(powered, b);
        }
    };
    for (const raw of toolpaths) {
        if (
            !String(raw.operation).startsWith('laser-') ||
            !Array.isArray(raw.laserPaths)
        )
            continue;
        const job = raw as unknown as PlannedLaser;
        for (const path of job.laserPaths) {
            if (path.points.length < 2) continue;
            for (let i = 0; i < path.points.length; i++) {
                travel = add(travel, path.points[i]);
                if (i) burn(path.points[i - 1], path.points[i]);
            }
            if (job.operation !== 'laser-cut') continue;
            const options = job.laserOptions;
            if (!options.leadInLength && !options.leadOutLength) continue;
            const tail = options.leadOutLength
                ? laserOvercutPoints(path.points, options.overcut ?? 0)
                : undefined;
            // Overcut retraces existing segments; only its exit lead can enlarge their bounds.
            const variants =
                tail && options.passes > 1 ? [undefined, tail] : [tail];
            for (const overcut of variants) {
                const leads = laserLeadEndpoints(
                    path,
                    options,
                    job.laserPower,
                    overcut,
                );
                if (leads.entry) {
                    travel = add(travel, leads.entry);
                    burn(leads.entry, path.points[0], job.laserPower);
                }
                if (leads.exit) {
                    const end =
                        overcut?.[overcut.length - 1] ??
                        path.points[path.points.length - 1];
                    travel = add(travel, leads.exit);
                    burn(end, leads.exit, job.laserPower);
                }
            }
        }
    }
    return { travel, powered };
}
