import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { LaserMaskEditor } from './LaserMaskEditor';
const mask = [
    [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 },
        { x: 0.25, y: 0.25 },
    ],
];
const props = () => ({
    mask,
    image: { w: 100, h: 50, dataUrl: 'data:image/png;base64,AA==' },
    units: 'metric' as const,
    onApply: jest.fn(),
    onClose: jest.fn(),
});
test('cancel and Escape leave source mask unchanged; Apply commits transformed mask only', () => {
    const p = props();
    render(<LaserMaskEditor {...p} />);
    const move = screen.getByLabelText('Mask move X');
    fireEvent.change(move, { target: { value: '10' } });
    fireEvent.blur(move);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply mask' }));
    expect(p.onApply).toHaveBeenCalledWith(
        expect.arrayContaining([
            expect.arrayContaining([expect.objectContaining({ x: 0.35 })]),
        ]),
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledTimes(2);
    expect(mask[0][0].x).toBe(0.25);
});
test('keyboard movements and reset keep mask editing local', () => {
    const p = props();
    render(<LaserMaskEditor {...p} />);
    const preview = screen.getByRole('img', { name: 'Mask position preview' });
    fireEvent.keyDown(preview, { key: 'ArrowUp' });
    fireEvent.keyDown(preview, { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByLabelText('Mask move X')).toHaveValue(0.1);
    expect(screen.getByLabelText('Mask move Y')).toHaveValue(1);
    fireEvent.click(
        screen.getByRole('button', { name: 'Reset mask transform' }),
    );
    expect(screen.getByLabelText('Mask move X')).toHaveValue(0);
    expect(screen.getByLabelText('Mask move Y')).toHaveValue(0);
    expect(p.onApply).not.toHaveBeenCalled();
});
test('invalid size cannot be applied', () => {
    render(<LaserMaskEditor {...props()} />);
    fireEvent.change(screen.getByLabelText('Mask scale X'), {
        target: { value: '0' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid mask');
    expect(screen.getByRole('button', { name: 'Apply mask' })).toBeDisabled();
});

test('preview uses the existing crop in source coordinates and preserves even-odd mask holes', () => {
    render(
        <LaserMaskEditor
            {...props()}
            crop={{ left: 0.2, bottom: 0.1, right: 0.8, top: 0.7 }}
        />,
    );
    const svg = screen.getByRole('img', { name: 'Mask position preview' });
    const rect = svg.querySelector('clipPath rect')!;
    expect(rect.getAttribute('x')).toBe('20');
    expect(Number(rect.getAttribute('y'))).toBeCloseTo(15);
    expect(Number(rect.getAttribute('width'))).toBeCloseTo(60);
    expect(Number(rect.getAttribute('height'))).toBeCloseTo(30);
    const clip = svg.querySelector('clipPath')!;
    expect(svg.querySelectorAll('image')[1].getAttribute('clip-path')).toBe(
        `url(#${clip.id})`,
    );
    expect(svg.querySelector('mask path')!.getAttribute('fill-rule')).toBe(
        'evenodd',
    );
});
