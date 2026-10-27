/**
 * Purpose: STL import for rotary work — parse (binary + ASCII), extract the
 * max-radius turning silhouette along Z, decimate to vector control points,
 * and bake viewer coordinates. Ported from VortexCAM.
 */
import { fitHandles } from './profileModel';
import type { ProfilePoint, ProfileSample } from './types';

export function parseSTL(buf: ArrayBuffer | Uint8Array): Float32Array {
    const bytes = ArrayBuffer.isView(buf)
        ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        : new Uint8Array(buf);
    if (bytes.length < 15 || bytes.length > 20_000_000)
        throw new Error('STL file is empty or exceeds 20 MB.');
    const head = String.fromCharCode(...bytes.slice(0, 200));
    if (head.startsWith('solid') && head.includes('facet')) {
        return parseASCII(bytes);
    }
    return parseBinary(bytes);
}

function decodeAscii(bytes: Uint8Array): string {
    // Chunked: String.fromCharCode overflows the stack on large arrays,
    // and some test runtimes lack TextDecoder.
    let txt = '';
    const CHUNK = 65536;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        txt += String.fromCharCode(...bytes.slice(i, i + CHUNK));
    }
    return txt;
}

function parseASCII(bytes: Uint8Array): Float32Array {
    const txt = decodeAscii(bytes);
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    const v: number[] = [];
    let m: RegExpExecArray | null = re.exec(txt);
    while (m) {
        v.push(+m[1], +m[2], +m[3]);
        if (v.length > 900_000)
            throw new Error(
                'STL exceeds the 100,000-triangle limit. Simplify the mesh.',
            );
        m = re.exec(txt);
    }
    return new Float32Array(v);
}

function parseBinary(bytes: Uint8Array): Float32Array {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 84) throw new Error('Incomplete binary STL header.');
    const n = dv.getUint32(80, true);
    if (!n || n > 100_000 || 84 + n * 50 > bytes.length)
        throw new Error('Invalid or oversized binary STL triangle count.');
    const v = new Float32Array(n * 9);
    let o = 84;
    for (let i = 0; i < n; i++) {
        o += 12;
        for (let k = 0; k < 9; k++, o += 4) {
            v[i * 9 + k] = dv.getFloat32(o, true);
        }
        o += 2;
    }
    return v;
}

export function meshBounds(verts: Float32Array): {
    mn: number[];
    mx: number[];
} {
    const mn = [1e9, 1e9, 1e9];
    const mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < verts.length; i += 3) {
        for (let a = 0; a < 3; a++) {
            const val = verts[i + a];
            if (val < mn[a]) {
                mn[a] = val;
            }
            if (val > mx[a]) {
                mx[a] = val;
            }
        }
    }
    return { mn, mx };
}

/** Max-radius silhouette along Z (maps to +X work coordinates). */
export function silhouette(
    verts: Float32Array,
    stations = 120,
    smoothWin = 3,
): ProfileSample[] {
    const { mn, mx } = meshBounds(verts);
    const z0 = mn[2];
    const dz = (mx[2] - z0) / stations;
    const r = new Array<number>(stations + 1).fill(0);
    for (let i = 0; i < verts.length; i += 3) {
        const rad = Math.hypot(verts[i], verts[i + 1]);
        let s = Math.floor((verts[i + 2] - z0) / dz);
        if (s < 0) {
            s = 0;
        }
        if (s > stations) {
            s = stations;
        }
        if (rad > r[s]) {
            r[s] = rad;
        }
    }
    for (let k = 0; k < 2; k++) {
        for (let s = 0; s <= stations; s++) {
            if (r[s] === 0) {
                const l = s > 0 ? r[s - 1] : 0;
                const rr = s < stations ? r[s + 1] : 0;
                r[s] = Math.max(l, rr);
            }
        }
    }
    const w = Math.max(1, smoothWin);
    const sm = r.map((_, s) => {
        let acc = 0;
        let n = 0;
        for (let k = -w; k <= w; k++) {
            const j = s + k;
            if (j >= 0 && j <= stations) {
                acc += r[j];
                n++;
            }
        }
        return acc / n;
    });
    return sm.map((rad, s) => ({ x: s * dz, r: Math.max(0.3, rad) }));
}

function perpDist(
    p: ProfileSample,
    a: ProfileSample,
    b: ProfileSample,
): number {
    const dx = b.x - a.x;
    const dr = b.r - a.r;
    const L = Math.hypot(dx, dr) || 1;
    return Math.abs(dr * p.x - dx * p.r + b.x * a.r - b.r * a.x) / L;
}

function rdp(pts: ProfileSample[], tol: number): Set<number> {
    const keep = new Set<number>([0, pts.length - 1]);
    const stack: Array<[number, number]> = [[0, pts.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop() ?? [0, 0];
        let dmax = 0;
        let imax = -1;
        for (let i = a + 1; i < b; i++) {
            const d = perpDist(pts[i], pts[a], pts[b]);
            if (d > dmax) {
                dmax = d;
                imax = i;
            }
        }
        if (dmax > tol && imax > 0) {
            keep.add(imax);
            stack.push([a, imax], [imax, b]);
        }
    }
    return keep;
}

/** Ramer-Douglas-Peucker decimation to vector control points. */
export function fitPoints(
    samples: ProfileSample[],
    maxPts = 28,
): ProfilePoint[] {
    const pts = samples.map((p) => ({ ...p }));
    let keep = new Set<number>([0, pts.length - 1]);
    let t = 0.15;
    while (keep.size < maxPts && t > 0.01) {
        keep = rdp(pts, t);
        if (keep.size > maxPts * 1.5) {
            break;
        }
        t *= 0.7;
        if (keep.size >= maxPts) {
            break;
        }
    }
    const idx = [...keep].sort((a, b) => a - b);
    const thin =
        idx.length > maxPts
            ? idx.filter((_, k) => k % Math.ceil(idx.length / maxPts) === 0)
            : idx;
    if (thin[thin.length - 1] !== pts.length - 1) {
        thin.push(pts.length - 1);
    }
    return fitHandles(
        thin.map((i) => {
            const p = pts[i];
            return {
                x: p.x,
                r: p.r,
                type: 'smooth' as const,
                h1: { x: p.x - 4, r: p.r },
                h2: { x: p.x + 4, r: p.r },
            };
        }),
    );
}

/**
 * Bake STL vertices (Z-up, base at zMin) into viewer coords: X along rotary
 * (base ring at X=shift), Y/Z radial, axis at origin. Radius is preserved.
 */
export function bakeForViewer(
    verts: Float32Array,
    shift: number,
): { positions: Float32Array; triangles: number } {
    const { mn } = meshBounds(verts);
    const zMin = mn[2];
    const out = new Float32Array(verts.length);
    for (let i = 0; i < verts.length; i += 3) {
        out[i] = shift + (verts[i + 2] - zMin);
        out[i + 1] = verts[i];
        out[i + 2] = verts[i + 1];
    }
    return { positions: out, triangles: out.length / 9 };
}

/** Orient a source STL onto longitudinal Z and optionally centre its cross section. */
export function orientRotaryImport(
    vertices: Float32Array,
    axis: 'x' | 'y' | 'z' | 'auto',
    center: boolean,
): Float32Array {
    if (axis === 'auto') {
        const { mn, mx } = meshBounds(vertices);
        const spans = mx.map((value, i) => value - mn[i]);
        axis = (['x', 'y', 'z'] as const)[spans.indexOf(Math.max(...spans))];
    }
    const out = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
        const p = [vertices[i], vertices[i + 1], vertices[i + 2]];
        const oriented =
            axis === 'x'
                ? [p[1], p[2], p[0]]
                : axis === 'y'
                  ? [p[2], p[0], p[1]]
                  : p;
        out.set(oriented, i);
    }
    if (center) {
        const { mn, mx } = meshBounds(out),
            cx = (mn[0] + mx[0]) / 2,
            cy = (mn[1] + mx[1]) / 2;
        for (let i = 0; i < out.length; i += 3) {
            out[i] -= cx;
            out[i + 1] -= cy;
        }
    }
    return out;
}
export function rotaryMeshKey(vertices: Float32Array, name: string): string {
    let hash = 2166136261;
    for (const byte of new Uint8Array(
        vertices.buffer,
        vertices.byteOffset,
        vertices.byteLength,
    ))
        hash = Math.imul(hash ^ byte, 16777619);
    return `${name}:${vertices.length / 9}:${hash >>> 0}`;
}
