import { jest } from '@jest/globals';

const create = jest.fn();
await jest.unstable_mockModule('../cam/cam-ops.js', () => ({
    createToolpathFromLoopsAsync: create,
    buildGcode: jest.fn(),
    buildGcodeAsync: jest.fn(),
}));
const oldClipper = globalThis.ClipperLib;
const oldPost = self.postMessage,
    oldHandler = self.onmessage;
globalThis.ClipperLib = {};
const post = jest.fn();
self.postMessage = post;
await import('./cam-worker');
afterAll(() => {
    globalThis.ClipperLib = oldClipper;
    self.postMessage = oldPost;
    self.onmessage = oldHandler;
});

test('geometry-only worker results retain machine-motion validation without producing G-code', async () => {
    const toolpath = {
        operation: 'laser-cut',
        label: 'Laser',
        laserFeed: 1200,
        laserPower: 500,
        laserOptions: { passes: 1 },
        laserPaths: [{ points: [{ x: NaN, y: 0, power: 500 }] }],
        previewContours: [],
    };
    create.mockResolvedValue(toolpath);
    const request = {
        type: 'build-toolpath',
        selectedLoops: [],
        config: { operation: 'laser-cut' },
        toolpathOptions: { validateResult: true },
    };
    await self.onmessage({ data: { ...request, id: 1 } });
    expect(
        post.mock.calls.some(([message]) =>
            message.error?.includes('Invalid saved laser motion'),
        ),
    ).toBe(true);
    expect(post.mock.calls.some(([message]) => 'result' in message)).toBe(
        false,
    );
    post.mockClear();
    toolpath.laserPaths[0].points[0].x = 0;
    await self.onmessage({ data: { ...request, id: 2 } });
    expect(
        post.mock.calls.some(([message]) => message.result === toolpath),
    ).toBe(true);
    expect(post.mock.calls.some(([message]) => 'error' in message)).toBe(false);
    expect(create.mock.calls[1][2]).not.toHaveProperty('validateResult');
});
