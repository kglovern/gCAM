/** Zhang-Suen thinning followed by one traversal per skeleton edge. Pixel coordinates use centres. */
export function traceCenterlines(
    image: { width: number; height: number; data: Uint8ClampedArray },
    speckle: number,
): { x: number; y: number }[][] {
    const stride = image.width + 2;
    const size = stride * (image.height + 2);
    const pixels = new Uint8Array(size);
    const marks = new Uint8Array(size);
    const active = new Int32Array(size);
    const offsets = [
        -stride,
        -stride + 1,
        1,
        stride + 1,
        stride,
        stride - 1,
        -1,
        -stride - 1,
    ];
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            pixels[(y + 1) * stride + x + 1] =
                image.data[(y * image.width + x) * 4] < 128 ? 1 : 0;
        }
    let count = 0;
    // The active array also serves as the component queue; no second full-size queue is needed.
    for (let y = 1; y <= image.height; y++)
        for (let x = 1; x <= image.width; x++) {
            const p = y * stride + x;
            if (!pixels[p] || marks[p]) continue;
            const start = count;
            active[count++] = p;
            marks[p] = 1;
            for (let head = start; head < count; head++) {
                for (const offset of offsets) {
                    const q = active[head] + offset;
                    if (pixels[q] && !marks[q]) {
                        marks[q] = 1;
                        active[count++] = q;
                    }
                }
            }
            if (count - start <= speckle) {
                for (let i = start; i < count; i++) pixels[active[i]] = 0;
                count = start;
            }
        }
    marks.fill(0);
    let work = 0;
    let changed: boolean;
    do {
        changed = false;
        for (let phase = 0; phase < 2; phase++) {
            work += count;
            if (work > 100000000)
                throw new Error(
                    'Center-line trace is too complex; choose a lower resolution.',
                );
            for (let i = 0; i < count; i++) {
                const p = active[i];
                const n0 = pixels[p - stride],
                    n1 = pixels[p - stride + 1],
                    n2 = pixels[p + 1],
                    n3 = pixels[p + stride + 1];
                const n4 = pixels[p + stride],
                    n5 = pixels[p + stride - 1],
                    n6 = pixels[p - 1],
                    n7 = pixels[p - stride - 1];
                const neighbors = n0 + n1 + n2 + n3 + n4 + n5 + n6 + n7;
                if (neighbors < 2 || neighbors > 6) continue;
                const transitions =
                    Number(!n0 && n1) +
                    Number(!n1 && n2) +
                    Number(!n2 && n3) +
                    Number(!n3 && n4) +
                    Number(!n4 && n5) +
                    Number(!n5 && n6) +
                    Number(!n6 && n7) +
                    Number(!n7 && n0);
                if (transitions !== 1) continue;
                const removable =
                    phase === 0 ? !n0 || !n2 || !n4 : !n0 || !n2 || !n6;
                const removable2 =
                    phase === 0 ? !n2 || !n4 || !n6 : !n0 || !n4 || !n6;
                if (removable && removable2) marks[p] = 1;
            }
            let kept = 0;
            for (let i = 0; i < count; i++) {
                const p = active[i];
                if (marks[p]) {
                    pixels[p] = 0;
                    marks[p] = 0;
                    changed = true;
                } else active[kept++] = p;
            }
            count = kept;
        }
    } while (changed);
    const neighbors = (p: number) => {
        const result: number[] = [];
        for (let d = 0; d < 8; d++) {
            if (!pixels[p + offsets[d]]) continue;
            // Cardinal connections already join this diagonal; avoid triangular double cuts at corners.
            if (
                d % 2 &&
                (pixels[p + offsets[(d + 7) % 8]] ||
                    pixels[p + offsets[(d + 1) % 8]])
            )
                continue;
            result.push(d);
        }
        return result;
    };
    const result: { x: number; y: number }[][] = [];
    let pointCount = 0;
    const walk = (start: number, direction: number) => {
        const points: { x: number; y: number }[] = [];
        const append = (p: number) => {
            const point = {
                x: (p % stride) - 0.5,
                y: Math.floor(p / stride) - 0.5,
            };
            const a = points[points.length - 2],
                b = points[points.length - 1];
            if (
                a &&
                b &&
                (b.x - a.x) * (point.y - b.y) === (b.y - a.y) * (point.x - b.x)
            )
                points[points.length - 1] = point;
            else {
                if (++pointCount > 1000000)
                    throw new Error(
                        'Center-line trace exceeds one million points; choose a lower resolution.',
                    );
                points.push(point);
            }
        };
        let p = start,
            d = direction;
        append(start);
        while (true) {
            const q = p + offsets[d];
            marks[p] |= 1 << d;
            marks[q] |= 1 << ((d + 4) % 8);
            append(q);
            if (q === start) break;
            const next = neighbors(q);
            if (next.length !== 2) break;
            const forward = next.find(
                (n) => n !== (d + 4) % 8 && !(marks[q] & (1 << n)),
            );
            if (forward === undefined) break;
            p = q;
            d = forward;
        }
        if (points.length >= 2) result.push(points);
    };
    for (let i = 0; i < count; i++) {
        const p = active[i],
            next = neighbors(p);
        if (next.length !== 2)
            for (const d of next) if (!(marks[p] & (1 << d))) walk(p, d);
    }
    for (let i = 0; i < count; i++) {
        const p = active[i];
        for (const d of neighbors(p)) if (!(marks[p] & (1 << d))) walk(p, d);
    }
    return result;
}
