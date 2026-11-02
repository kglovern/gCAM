const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Split a closed contour at bridge boundaries. Power belongs to each ending point. */
export function bridgeLaserContour(
    points,
    count,
    width,
    {
        bridgePlacement = 'count',
        bridgeSpacing = 25,
        bridgeLimit = false,
        bridgeMax = 100,
        bridgePower = 0,
    } = {},
    pointBudget = 2000000,
) {
    if (!Number.isFinite(bridgePower) || bridgePower < 0 || bridgePower > 1)
        throw new Error('Bridge power must be between zero and cutting power.');
    if (points.length < 4 || distance(points[0], points.at(-1)) > 1e-7)
        throw new Error('Laser holding bridges require closed shapes.');
    const lengths = points.slice(1).map((p, i) => distance(points[i], p));
    const perimeter = lengths.reduce((sum, length) => sum + length, 0);
    if (bridgePlacement === 'spacing') {
        count = Math.max(1, Math.ceil(perimeter / bridgeSpacing));
        if (bridgeLimit) count = Math.min(count, bridgeMax);
        if (count > 10000)
            throw new Error(
                'Too many laser bridges; increase spacing or limit the maximum.',
            );
    }
    if (count * width >= perimeter)
        throw new Error(
            'Holding bridges cover this shape; reduce width or count.',
        );
    if (points.length + 2 * count > pointBudget)
        throw new Error('Laser job is too large; reduce bridges or passes.');
    const boundaries = Array.from({ length: count }, (_, i) => {
        const center = ((i + 0.5) * perimeter) / count;
        return [center - width / 2, center + width / 2];
    }).flat();
    const result = [{ ...points[0] }];
    let offset = 0,
        boundary = 0;
    for (let i = 0; i < lengths.length; i++) {
        const length = lengths[i],
            end = offset + length;
        if (length === 0) continue;
        while (boundary < boundaries.length && boundaries[boundary] <= end) {
            const fraction = (boundaries[boundary] - offset) / length;
            result.push({
                ...points[i + 1],
                x: points[i].x + fraction * (points[i + 1].x - points[i].x),
                y: points[i].y + fraction * (points[i + 1].y - points[i].y),
                ...(boundary % 2
                    ? { power: Math.min(points[i + 1].power ?? 1, bridgePower) }
                    : {}),
            });
            boundary++;
        }
        if (distance(result.at(-1), points[i + 1]) > 1e-10)
            result.push({
                ...points[i + 1],
                ...(boundary % 2
                    ? { power: Math.min(points[i + 1].power ?? 1, bridgePower) }
                    : {}),
            });
        offset = end;
    }
    // Closing-segment power must survive rotation of the contour's start point.
    result[0] = { ...result[0], power: result.at(-1).power };
    return result;
}

/** Apply canvas tab distances after cut ordering; overlapping bridges form one interval. */
export function manualLaserBridges(
    paths,
    tabs,
    width,
    pointBudget = 2000000,
    bridgePower = 0,
) {
    if (
        !Array.isArray(tabs) ||
        tabs.length > 10000 ||
        !Number.isFinite(width) ||
        width <= 0 ||
        width > 100 ||
        !Number.isFinite(bridgePower) ||
        bridgePower < 0 ||
        bridgePower > 1
    )
        throw new Error('Invalid manual laser bridges.');
    const groups = new Map();
    for (const tab of tabs) {
        if (
            !Number.isInteger(tab?.contourIndex) ||
            tab.contourIndex < 0 ||
            tab.contourIndex >= paths.length ||
            !Number.isFinite(tab.along) ||
            tab.along < 0
        )
            throw new Error('Invalid manual laser bridge position.');
        const centers = groups.get(tab.contourIndex) ?? [];
        centers.push(tab.along);
        groups.set(tab.contourIndex, centers);
    }
    let remaining = pointBudget;
    return paths.map((path, index) => {
        const centers = groups.get(index);
        if (!centers) {
            remaining -= path.points.length;
            if (remaining < 0)
                throw new Error(
                    'Laser job is too large; reduce bridges or passes.',
                );
            return path;
        }
        const points = path.points;
        if (points.length < 4 || distance(points[0], points.at(-1)) > 1e-7)
            throw new Error('Laser holding bridges require closed shapes.');
        const lengths = points.slice(1).map((p, i) => distance(points[i], p));
        const total = lengths.reduce((a, b) => a + b, 0);
        if (!(total > width))
            throw new Error('Holding bridges cover this shape; reduce width.');
        const intervals = [];
        for (let center of centers) {
            if (center > total + 1e-7)
                throw new Error('Manual laser bridge is outside its contour.');
            center = Math.min(center, total);
            const start = center - width / 2,
                end = center + width / 2;
            intervals.push([Math.max(0, start), Math.min(total, end)]);
            if (start < 0) intervals.push([total + start, total]);
            if (end > total) intervals.push([0, end - total]);
        }
        intervals.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const interval of intervals) {
            const last = merged.at(-1);
            if (last && interval[0] <= last[1])
                last[1] = Math.max(last[1], interval[1]);
            else merged.push([...interval]);
        }
        if (merged.reduce((n, [a, b]) => n + b - a, 0) >= total - 1e-9)
            throw new Error(
                'Holding bridges cover this shape; reduce width or count.',
            );
        if (points.length + merged.length * 2 > remaining)
            throw new Error(
                'Laser job is too large; reduce bridges or passes.',
            );
        const boundaries = merged.flat();
        const result = [{ ...points[0] }];
        let offset = 0,
            boundary = 0,
            intervalIndex = 0;
        for (let i = 0; i < lengths.length; i++) {
            const length = lengths[i],
                end = offset + length;
            if (!length) continue;
            let from = offset;
            const append = (to) => {
                if (to <= from + 1e-12) return;
                const middle = (from + to) / 2;
                while (
                    intervalIndex < merged.length &&
                    merged[intervalIndex][1] < middle
                )
                    intervalIndex++;
                const gap =
                    intervalIndex < merged.length &&
                    merged[intervalIndex][0] <= middle &&
                    middle <= merged[intervalIndex][1];
                const fraction = (to - offset) / length;
                result.push({
                    ...points[i + 1],
                    x: points[i].x + fraction * (points[i + 1].x - points[i].x),
                    y: points[i].y + fraction * (points[i + 1].y - points[i].y),
                    ...(gap
                        ? {
                              power: Math.min(
                                  points[i + 1].power ?? 1,
                                  bridgePower,
                              ),
                          }
                        : {}),
                });
                from = to;
            };
            while (boundary < boundaries.length && boundaries[boundary] <= end)
                append(boundaries[boundary++]);
            append(end);
            offset = end;
        }
        result[0] = { ...result[0], power: result.at(-1).power };
        remaining -= result.length;
        return { ...path, points: result };
    });
}

export function resolveManualLaserTabs(paths, tabs) {
    if (!Array.isArray(tabs) || tabs.length > 10000)
        throw new Error('Invalid manual laser bridges.');
    if (!tabs.some((tab) => tab?.anchor)) return [...tabs];
    // Ordered segment blocks retain the original nearest-point tie breaking.
    let pointCount = 0;
    const indexed = paths.flatMap((path, contourIndex) => {
        const points = path.points;
        if (points.length < 4 || distance(points[0], points.at(-1)) > 1e-7)
            return [];
        pointCount += points.length;
        if (pointCount > 2000000)
            throw new Error('Laser job is too large; simplify shapes.');
        const prefix = new Float64Array(points.length);
        for (let i = 1; i < points.length; i++) {
            const dx = points[i].x - points[i - 1].x,
                dy = points[i].y - points[i - 1].y;
            prefix[i] = prefix[i - 1] + Math.sqrt(dx * dx + dy * dy);
        }
        const blocks = [];
        for (let start = 1; start < points.length; start += 64) {
            const end = Math.min(points.length, start + 64);
            let minX = Infinity,
                minY = Infinity,
                maxX = -Infinity,
                maxY = -Infinity;
            for (let i = start - 1; i < end; i++) {
                minX = Math.min(minX, points[i].x);
                minY = Math.min(minY, points[i].y);
                maxX = Math.max(maxX, points[i].x);
                maxY = Math.max(maxY, points[i].y);
            }
            blocks.push({ start, end, minX, minY, maxX, maxY });
        }
        return [{ points, contourIndex, prefix, blocks }];
    });
    let work = 0;
    return tabs.map((tab) => {
        if (!tab?.anchor) return tab;
        const anchor = tab.anchor;
        if (![anchor.x, anchor.y].every(Number.isFinite))
            throw new Error('Invalid manual laser bridge anchor.');
        let best;
        for (const { points, contourIndex, prefix, blocks } of indexed) {
            for (const block of blocks) {
                if (++work > 20000000)
                    throw new Error(
                        'Manual bridge placement is too complex; reduce bridges or simplify shapes.',
                    );
                if (
                    anchor.x < block.minX - 1.0000001e-5 ||
                    anchor.x > block.maxX + 1.0000001e-5 ||
                    anchor.y < block.minY - 1.0000001e-5 ||
                    anchor.y > block.maxY + 1.0000001e-5
                )
                    continue;
                for (let i = block.start; i < block.end; i++) {
                    if (++work > 20000000)
                        throw new Error(
                            'Manual bridge placement is too complex; reduce bridges or simplify shapes.',
                        );
                    const a = points[i - 1],
                        b = points[i];
                    const dx = b.x - a.x,
                        dy = b.y - a.y,
                        lengthSq = dx * dx + dy * dy;
                    if (!lengthSq) continue;
                    const t = Math.max(
                        0,
                        Math.min(
                            1,
                            ((anchor.x - a.x) * dx + (anchor.y - a.y) * dy) /
                                lengthSq,
                        ),
                    );
                    const gap = Math.hypot(
                        a.x + dx * t - anchor.x,
                        a.y + dy * t - anchor.y,
                    );
                    if (gap <= 1e-5 && (!best || gap < best.distance))
                        best = {
                            distance: gap,
                            contourIndex,
                            along: prefix[i - 1] + Math.sqrt(lengthSq) * t,
                        };
                }
            }
        }
        if (!best)
            throw new Error(
                'A manual bridge no longer matches its cut path; clear or replace it before changing geometry.',
            );
        return {
            contourIndex: best.contourIndex,
            along: best.along,
            anchor: { ...anchor },
        };
    });
}
