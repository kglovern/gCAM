// Frozen pre-index bridge resolver for exact-result and timing comparisons.
import { findNearestPolylinePoint } from '../../src/cam/tabs.js';
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export function resolveManualLaserTabs(paths, tabs) {
    if (!Array.isArray(tabs) || tabs.length > 10000)
        throw new Error('Invalid manual laser bridges.');
    let work = 0;
    return tabs.map((tab) => {
        if (!tab?.anchor) return tab;
        if (![tab.anchor.x, tab.anchor.y].every(Number.isFinite))
            throw new Error('Invalid manual laser bridge anchor.');
        let best;
        paths.forEach((path, contourIndex) => {
            const points = path.points;
            if (points.length < 4 || distance(points[0], points.at(-1)) > 1e-7)
                return;
            work += points.length;
            if (work > 20000000)
                throw new Error(
                    'Manual bridge placement is too complex; reduce bridges or simplify shapes.',
                );
            const hit = findNearestPolylinePoint(points, tab.anchor);
            if (hit && (!best || hit.distance < best.distance))
                best = { ...hit, contourIndex };
        });
        if (!best || best.distance > 1e-5)
            throw new Error(
                'A manual bridge no longer matches its cut path; clear or replace it before changing geometry.',
            );
        return {
            contourIndex: best.contourIndex,
            along: best.along,
            anchor: { ...tab.anchor },
        };
    });
}
