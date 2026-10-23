import { jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react';
import * as THREE from 'three';

const renderer = {
    domElement: document.createElement('canvas'),
    setSize: jest.fn(),
    render: jest.fn(),
    dispose: jest.fn(),
};
const createRenderer = jest.fn(() => renderer);
const tail = new THREE.Group();
tail.userData = { rotaryRole: 'tailstock', tipX: 0 };
const load = jest.fn((_url, done) => {
    const scene = new THREE.Group();
    scene.add(tail);
    done({ scene });
});
jest.unstable_mockModule('three', () => ({
    ...THREE,
    WebGLRenderer: createRenderer,
}));
jest.unstable_mockModule('three/examples/jsm/loaders/GLTFLoader.js', () => ({
    GLTFLoader: class {
        load = load;
    },
}));
jest.unstable_mockModule(
    'three/examples/jsm/controls/OrbitControls.js',
    () => ({
        OrbitControls: class {
            target = new THREE.Vector3();
            update() {}
            addEventListener() {}
            dispose() {}
        },
    }),
);
const { RotaryViewport } = await import('./RotaryViewport');

test('tailstock tweens through intermediate positions even when reduced motion is set', () => {
    jest.useFakeTimers();
    const oldMatchMedia = window.matchMedia,
        oldResize = globalThis.ResizeObserver;
    window.matchMedia = jest.fn(() => ({ matches: true }));
    globalThis.ResizeObserver = class {
        observe() {}
        disconnect() {}
    };
    const stock = { length: 90, diameter: 25.4, grip: 19, ext: false };
    const props = {
        samples: [
            { x: 20, r: 10 },
            { x: 90, r: 10 },
        ],
        stock,
        moves: [],
        showStock: true,
        showPath: false,
        stl: null,
        mode: 'profile',
        what: 'test',
    };
    const view = render(<RotaryViewport {...props} />);
    act(() => jest.advanceTimersByTime(500));
    expect(tail.position.x).toBeCloseTo(0.09);
    const initialCameraX = renderer.render.mock.calls.at(-1)[1].position.x;
    const camera = renderer.render.mock.calls.at(-1)[1];
    expect(camera.position.x).toBeCloseTo(45);
    expect(camera.position.y).toBe(0);
    expect(camera.isOrthographicCamera).toBe(true);
    expect(camera.position.z).toBeGreaterThan(0);
    expect(
        view.getByRole('button', { name: 'Side-on stock view' }),
    ).toBeTruthy();
    expect(view.getByRole('button', { name: 'Fit part' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Fit machine' })).toBeTruthy();

    const canvas = view.container.querySelector('canvas');
    view.rerender(
        <RotaryViewport {...props} stock={{ ...stock, length: 120 }} />,
    );
    act(() => jest.advanceTimersByTime(399));
    expect(tail.position.x).toBeCloseTo(0.09);
    act(() => jest.advanceTimersByTime(1));
    expect(tail.position.x).toBeCloseTo(0.09);
    act(() => jest.advanceTimersByTime(225));
    expect(tail.position.x).toBeGreaterThan(0.1);
    expect(tail.position.x).toBeLessThan(0.12);
    expect(renderer.render.mock.calls.at(-1)[1].position.x).toBeGreaterThan(
        initialCameraX,
    );
    expect(renderer.render.mock.calls.at(-1)[1].position.x).toBeLessThan(60);
    act(() => jest.advanceTimersByTime(300));
    expect(tail.position.x).toBeCloseTo(0.12);
    expect(renderer.render.mock.calls.at(-1)[1].position.x).toBeCloseTo(60);
    expect(renderer.render.mock.calls.at(-1)[1].isOrthographicCamera).toBe(
        true,
    );
    fireEvent.click(view.getByRole('button', { name: 'Fit part' }));
    act(() => jest.advanceTimersByTime(16));
    expect(renderer.render.mock.calls.at(-1)[1].isPerspectiveCamera).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Fit machine' }));
    act(() => jest.advanceTimersByTime(16));
    expect(renderer.render.mock.calls.at(-1)[1].isPerspectiveCamera).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Side-on stock view' }));
    act(() => jest.advanceTimersByTime(16));
    expect(renderer.render.mock.calls.at(-1)[1].isOrthographicCamera).toBe(
        true,
    );
    expect(createRenderer).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('canvas')).toBe(canvas);
    expect(renderer.dispose).not.toHaveBeenCalled();
    view.rerender(<RotaryViewport {...props} mode="stl" stl={null} />);
    act(() => jest.advanceTimersByTime(500));
    const scene = renderer.render.mock.calls.at(-1)[0];
    const part = scene.children.find(
        (object) =>
            object.isMesh && object.material.color?.getHex() === 0xd9a066,
    );
    expect(part.geometry.getAttribute('position')?.count ?? 0).toBe(0);
    view.unmount();
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    window.matchMedia = oldMatchMedia;
    globalThis.ResizeObserver = oldResize;
    jest.useRealTimers();
});
