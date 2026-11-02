import { createPreviewCursor } from './previewCursor';
import type { WorkerSegmentsData } from '@sienci/gviewer';

function fixture() {
    return {
        format: 'segments-v1',
        chunks: [
            {
                vertexCount: 2,
                attrs: new Uint8Array(2).buffer,
                positions: new Float32Array([0, 0, 0, 1, 2, 3]).buffer,
            },
            {
                vertexCount: 0,
                attrs: new ArrayBuffer(0),
                positions: new ArrayBuffer(0),
            },
            {
                vertexCount: 2,
                attrs: new Uint8Array(2).buffer,
                positions: new Float32Array([1, 2, 3, 4, 5, 6]).buffer,
            },
        ],
        totalVertices: 4,
        prefixEndVertex: new Uint32Array([0, 2, 2, 4]).buffer,
    } as WorkerSegmentsData;
}

test('maps headers, repeated modal lines and chunk boundaries without changing buffers', () => {
    const data = fixture();
    const before = new Float32Array(data.chunks[0].positions).slice();
    const cursor = createPreviewCursor(data);
    expect(cursor.position(0)).toBeNull();
    expect(cursor.position(1)).toBeNull();
    expect(cursor.position(2)).toEqual({ x: 1, y: 2, z: 3 });
    expect(cursor.position(3)).toEqual({ x: 1, y: 2, z: 3 });
    expect(cursor.position(4)).toEqual({ x: 4, y: 5, z: 6 });
    expect(cursor.position(100)).toEqual(cursor.position(4));
    expect(cursor.position(NaN)).toBeNull();
    expect(new Float32Array(data.chunks[0].positions)).toEqual(before);
});

test('rejects inconsistent vertex buffers and counts', () => {
    const data = fixture();
    data.totalVertices++;
    expect(() => createPreviewCursor(data)).toThrow('vertex count');
    data.totalVertices--;
    data.chunks[0].positions = new ArrayBuffer(4);
    expect(() => createPreviewCursor(data)).toThrow('position buffer');
});
