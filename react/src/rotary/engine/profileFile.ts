import type { ProfilePoint } from './types';

export function exportProfile(points: ProfilePoint[]): string {
    return JSON.stringify(
        { format: 'gcam-lathe-profile', version: 1, units: 'mm', points },
        null,
        2,
    );
}

export function importProfile(text: string): ProfilePoint[] {
    const data = JSON.parse(text);
    const coordinate = (p: any) =>
        p && Number.isFinite(p.x) && Number.isFinite(p.r);
    if (
        data?.format !== 'gcam-lathe-profile' ||
        data.version !== 1 ||
        data.units !== 'mm' ||
        !Array.isArray(data.points) ||
        data.points.length < 2 ||
        data.points.length > 10000 ||
        !data.points.every(
            (p: any, i: number) =>
                coordinate(p) &&
                p.x >= 0 &&
                p.r >= 0 &&
                ['corner', 'smooth', 'sym'].includes(p.type) &&
                coordinate(p.h1) &&
                coordinate(p.h2) &&
                (i === 0 || p.x >= data.points[i - 1].x),
        )
    ) {
        throw new Error(
            'Invalid lathe profile. Choose a gCAM lathe profile JSON file.',
        );
    }
    return data.points.map((p: ProfilePoint) => ({
        x: p.x,
        r: p.r,
        type: p.type,
        h1: { x: p.h1.x, r: p.h1.r },
        h2: { x: p.h2.x, r: p.h2.r },
    }));
}
