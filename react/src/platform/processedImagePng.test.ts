import { pngPhysicalSize } from './processedImagePng';

const source = Uint8Array.from(
    atob(
        'iVBORw0KGgoAAAANSUhEUgAAAIAAAABACAYAAADS1n9/AAACr0lEQVR4nO3YYUcrAByF8UmSJJkkSZIkySRJkiSZJMkkSZIkSZIkSSJJkmSSJEmSTDJJkiRJJjNJkiRJMpMkSZI8Vx/hvrjce//n4XyD36vjcDgcREVFER0dTUxMDLGxscTFxREfH09CQgKJiYk4nU6SkpJITk4mJSWF1NRU0tLSSE9PJyMjg8zMTLKyssjOziYnJ4fc3Fzy8vJwuVzk5+dTUFBAYWEhRUVFFBcXU1JSQmlpKWVlZZSXl1NRUUFlZSVut5uqqiqqq6upqamhtraWuro6PB4P9fX1NDQ00NjYSFNTE83NzbS0tNDa2kpbWxvt7e10dHTQ2dlJV1cX3d3d9PT00NvbS19fH/39/QwMDDA4OMjQ0BDDw8OMjIwwOjrK2NgY4+PjTExMMDk5ydTUFNPT08zMzOD1epmdnWVubo75+XkWFhZYXFxkaWmJ5eVlVlZWWF1dZW1tjfX1dXw+HxsbG2xubuL3+9na2mJ7e5udnR12d3fZ29tjf3+fg4MDDg8POTo64vj4mJOTEwKBAKenpwSDQUKhEGdnZ5yfn3NxccHl5SVXV1dcX19zc3PD7e0td3d33N/f8/DwwOPjI+FwmEgkwtPTE8/Pz7y8vPD6+srb2xvv7+98fHzw+fnJ19cX39/f/OQQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQAAEQgH8CAMp0AmA8ATCeABhPAIwnAMYTAOMJgPF+G8DPcaT9vRMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4xMA4/vjANT/lQAYTwCMJwDGEwDjCYDxBMB4AmC8XxtAMG2doIMcAAAAAElFTkSuQmCC',
    ),
    (c) => c.charCodeAt(0),
);
function chunks(bytes: Uint8Array) {
    const result: { type: string; bytes: Uint8Array }[] = [];
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 8; offset < bytes.length; ) {
        const length = view.getUint32(offset) + 12;
        result.push({
            type: String.fromCharCode(...bytes.slice(offset + 4, offset + 8)),
            bytes: bytes.slice(offset, offset + length),
        });
        offset += length;
    }
    return result;
}

test('PNG records actual cropped size, correct CRC and unchanged compressed pixels', () => {
    const original = source.slice();
    const result = pngPhysicalSize(source, 12.8, 6.4);
    const output = chunks(result);
    const physical = output.filter((c) => c.type === 'pHYs');
    expect(physical).toHaveLength(1);
    expect(output[1].type).toBe('pHYs');
    const view = new DataView(physical[0].bytes.buffer);
    expect(view.getUint32(8)).toBe(10000);
    expect(view.getUint32(12)).toBe(10000);
    expect(physical[0].bytes[16]).toBe(1);
    // Independent Python zlib.crc32(pHYs + big-endian 10000,10000,1).
    expect(view.getUint32(17)).toBe(0x94695119);
    expect(output.filter((c) => c.type !== 'pHYs')).toEqual(
        chunks(source).filter((c) => c.type !== 'pHYs'),
    );
    expect(source).toEqual(original);
    expect(pngPhysicalSize(result, 12.8, 6.4)).toEqual(result);
});

test('PNG permits independent horizontal/vertical density for rounded pixel dimensions', () => {
    const physical = chunks(pngPhysicalSize(source, 12.8, 3.2)).find(
        (c) => c.type === 'pHYs',
    )!;
    const view = new DataView(physical.bytes.buffer);
    expect([view.getUint32(8), view.getUint32(12)]).toEqual([10000, 20000]);
});

test('PNG rejects corrupt structure and unrepresentable physical sizes', () => {
    expect(() => pngPhysicalSize(source.slice(0, 25), 1, 1)).toThrow('PNG');
    expect(() => pngPhysicalSize(source.slice(0, -1), 1, 1)).toThrow('PNG');
    expect(() => pngPhysicalSize(new Uint8Array(40), 1, 1)).toThrow('PNG');
    for (const size of [0, -1, NaN, Infinity, 1e-12, 1e20])
        expect(() => pngPhysicalSize(source, size, 1)).toThrow('physical size');
});
