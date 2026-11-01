import { jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { RasterRegionFields, normalizedImageMask } from './RasterRegionFields';
test('a mask is normalized against image rotation and can be removed without deleting pixels', () => {
    const mask = normalizedImageMask(
        [
            [
                { x: 15, y: 5 },
                { x: 15, y: 15 },
                { x: -5, y: 15 },
                { x: -5, y: 5 },
                { x: 15, y: 5 },
            ],
        ],
        { x: 0, y: 0, w: 10, h: 20, rotation: 90 },
    );
    expect(mask[0][0].x).toBeCloseTo(0);
    expect(mask[0][0].y).toBeCloseTo(0);
    expect(mask[0][2].x).toBeCloseTo(1);
    expect(mask[0][2].y).toBeCloseTo(1);
    let value = {};
    render(
        <RasterRegionFields
            options={{ imageMask: mask }}
            onChange={(v) => {
                value = v;
            }}
            maskShapes={[]}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reset image region' }));
    expect(value).toEqual({
        imageMask: [],
        imageCrop: { left: 0, bottom: 0, right: 1, top: 1 },
    });
    expect(
        screen.getByRole('button', { name: 'Use selected shapes as mask' }),
    ).toBeDisabled();
});

test('broken links remain removable and selected closed shapes can create a live link', () => {
    const onMaskLink = jest.fn(),
        onChange = jest.fn();
    const shapes = [
        [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 0 },
        ],
    ];
    render(
        <RasterRegionFields
            options={{ maskSourceIds: ['missing'] }}
            linkIds={['missing']}
            linkError="Linked shape missing"
            image={{ x: 0, y: 0, w: 10, h: 10 }}
            maskShapes={shapes}
            maskShapeIds={['replacement']}
            onMaskLink={onMaskLink}
            onChange={onChange}
        />,
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Link selected shapes as mask' }),
    );
    expect(onMaskLink).toHaveBeenCalledWith(['replacement']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove mask' }));
    expect(onMaskLink).toHaveBeenLastCalledWith();
    expect(onChange).toHaveBeenCalledWith({ maskSourceIds: [], imageMask: [] });
});
