/** @type {{enabled:boolean, measurements:Array<{feed:number,gap:number}>}} */
export const DEFAULT_SCAN_ALIGNMENT = { enabled: false, measurements: [] };

export function scanAlignmentApplies(operation, options) {
    return !!(
        options?.scanAlignment?.enabled &&
        options.bidirectional !== false &&
        (operation === 'laser-raster' ||
            (operation === 'laser-fill' && options.fillMode !== 'offset'))
    );
}

export function validateScanAlignment(value = DEFAULT_SCAN_ALIGNMENT) {
    if (
        !value ||
        typeof value.enabled !== 'boolean' ||
        !Array.isArray(value.measurements) ||
        value.measurements.length > 24
    )
        throw new Error('Invalid scan alignment settings.');
    const measurements = value.measurements
        .map((p) => {
            if (
                !p ||
                !Number.isFinite(p.feed) ||
                p.feed <= 0 ||
                !Number.isFinite(p.gap) ||
                Math.abs(p.gap) > 20
            )
                throw new Error(
                    'Scan alignment needs positive speeds and measured gaps between -20 and 20 mm.',
                );
            return { feed: p.feed, gap: p.gap };
        })
        .sort((a, b) => a.feed - b.feed);
    if (
        value.enabled &&
        (measurements.length < 2 ||
            measurements.some(
                (p, i) => i > 0 && p.feed === measurements[i - 1].feed,
            ))
    )
        throw new Error(
            'Enter measurements at two or more different speeds for scan alignment.',
        );
    return { enabled: value.enabled, measurements };
}

/** Positive gaps compensate lag by advancing each row against its travel. */
export function scanAlignmentOffset(value, feed) {
    const calibration = validateScanAlignment(value);
    if (!calibration.enabled) return 0;
    const rows = calibration.measurements;
    if (
        !Number.isFinite(feed) ||
        feed < rows[0].feed ||
        feed > rows[rows.length - 1].feed
    )
        throw new Error(
            'Scan speed is outside the measured alignment range. Add a measurement at this speed.',
        );
    const right = rows.findIndex((p) => p.feed >= feed);
    if (right === 0 || rows[right].feed === feed) return rows[right].gap / 2;
    const a = rows[right - 1],
        b = rows[right];
    return (
        (a.gap + (b.gap - a.gap) * ((feed - a.feed) / (b.feed - a.feed))) / 2
    );
}

export function alignScanPaths(paths, calibration, feed) {
    const offset = scanAlignmentOffset(calibration, feed);
    if (!offset) return paths;
    for (const { points } of paths) {
        if (points.length < 2) continue;
        const first = points[0],
            last = points[points.length - 1];
        const length = Math.hypot(last.x - first.x, last.y - first.y);
        if (length < 1e-9) continue;
        const x = (offset * (last.x - first.x)) / length,
            y = (offset * (last.y - first.y)) / length;
        for (const p of points) {
            p.x -= x;
            p.y -= y;
        }
    }
    return paths;
}

export function overscanFillPaths(paths, distance) {
    if (!Number.isFinite(distance) || distance <= 0)
        throw new Error(
            'Set positive overscan for bidirectional fill alignment.',
        );
    return paths.map((path) => {
        const points = path.points,
            first = points[0],
            last = points[points.length - 1];
        const length = Math.hypot(last.x - first.x, last.y - first.y);
        if (length < 1e-9) return path;
        const x = (distance * (last.x - first.x)) / length,
            y = (distance * (last.y - first.y)) / length;
        return {
            ...path,
            points: [
                { x: first.x - x, y: first.y - y, power: 0 },
                { ...first, power: 0 },
                ...points.slice(1),
                { x: last.x + x, y: last.y + y, power: 0 },
            ],
        };
    });
}
