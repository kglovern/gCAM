export const FULL_IMAGE = { left: 0, bottom: 0, right: 1, top: 1 };

export function validateImageRegion(crop = FULL_IMAGE, mask = []) {
    if (
        !crop ||
        !['left', 'bottom', 'right', 'top'].every(
            (k) => Number.isFinite(crop[k]) && crop[k] >= 0 && crop[k] <= 1,
        ) ||
        crop.left >= crop.right ||
        crop.bottom >= crop.top
    )
        throw new Error(
            'Image crop must leave a non-empty area within the image.',
        );
    if (!Array.isArray(mask) || mask.length > 1000)
        throw new Error('Invalid image mask.');
    let count = 0;
    for (const polygon of mask) {
        if (
            !Array.isArray(polygon) ||
            polygon.length < 4 ||
            polygon.some(
                (p) =>
                    !p ||
                    !Number.isFinite(p.x) ||
                    !Number.isFinite(p.y) ||
                    Math.abs(p.x) > 10000 ||
                    Math.abs(p.y) > 10000,
            ) ||
            Math.hypot(
                polygon[0].x - polygon[polygon.length - 1].x,
                polygon[0].y - polygon[polygon.length - 1].y,
            ) > 1e-7
        )
            throw new Error(
                'Image masks require closed shapes with finite coordinates.',
            );
        count += polygon.length;
    }
    if (count > 20000)
        throw new Error('Image mask is too detailed; simplify its shapes.');
}

/** Even-odd scan intervals preserve holes without testing every pixel against every edge. */
export function scanIntervals(polygons, y) {
    const xs = [];
    for (const polygon of polygons)
        for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
                b = polygon[(i + 1) % polygon.length];
            if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y))
                xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
    xs.sort((a, b) => a - b);
    const result = [];
    for (let i = 0; i + 1 < xs.length; i += 2)
        if (xs[i + 1] - xs[i] > 1e-9) result.push([xs[i], xs[i + 1]]);
    return result;
}

export function intersectIntervals(a, b) {
    const result = [];
    let i = 0,
        j = 0;
    while (i < a.length && j < b.length) {
        const lo = Math.max(a[i][0], b[j][0]),
            hi = Math.min(a[i][1], b[j][1]);
        if (hi - lo > 1e-9) result.push([lo, hi]);
        if (a[i][1] < b[j][1]) i++;
        else j++;
    }
    return result;
}

/** Resolve the same source-pixel crop for CAM, PNG export and linked image inspection. */
export function resolveImageCrop(
    crop = FULL_IMAGE,
    width,
    height,
    passThrough = false,
) {
    if (!passThrough) return crop;
    const axis = (low, high, count) => {
        const first = Math.max(
            0,
            Math.min(count - 1, Math.floor(low * count + 1e-9)),
        );
        const last = Math.min(
            count,
            Math.max(first + 1, Math.ceil(high * count - 1e-9)),
        );
        return [first / count, last / count];
    };
    const [left, right] = axis(crop.left, crop.right, width),
        [bottom, top] = axis(crop.bottom, crop.top, height);
    return { left, right, bottom, top };
}

export function validateImageMaskSources(ids = []) {
    if (
        !Array.isArray(ids) ||
        ids.length > 1000 ||
        new Set(ids).size !== ids.length ||
        ids.some(
            (id) => typeof id !== 'string' || !id.length || id.length > 512,
        )
    )
        throw new Error('Invalid linked image mask sources.');
}
