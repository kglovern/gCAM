import { exportProfile, importProfile } from './profileFile';
import type { ProfilePoint } from './types';

const points: ProfilePoint[] = [0, 50].map((x) => ({
    x,
    r: 10,
    type: 'smooth',
    h1: { x: x - 2, r: 11 },
    h2: { x: x + 2, r: 9 },
}));
test('profile files preserve spline points and handles exactly', () => {
    expect(importProfile(exportProfile(points))).toEqual(points);
});
test('rejects malformed, unsupported and unordered profiles', () => {
    for (const value of [
        '{}',
        'bad json',
        exportProfile([...points].reverse()),
        exportProfile([{ ...points[0], r: -1 }, points[1]]),
        exportProfile([{ ...points[0], h1: { x: NaN, r: 0 } }, points[1]]),
    ]) {
        expect(() => importProfile(value)).toThrow();
    }
});
