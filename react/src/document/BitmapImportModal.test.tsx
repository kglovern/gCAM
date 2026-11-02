import { act, fireEvent, render, screen } from '@testing-library/react';
import { BitmapImportModal } from './BitmapImportModal';
import { jest } from '@jest/globals';

test('heightmap import preserves units, reports errors and aborts on Cancel', async () => {
    let signal: AbortSignal | undefined;
    const convert = jest.fn(
        async (
            _height: number,
            _spacing: number,
            _invert: boolean,
            next: AbortSignal,
        ) => {
            signal = next;
            throw new Error('Opaque image required');
        },
    );
    const cancel = jest.fn();
    render(
        <BitmapImportModal
            choice={{ fileName: 'map.png' }}
            units="imperial"
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onUseHeightmap={convert}
            onCancel={cancel}
        />,
    );
    fireEvent.click(screen.getByText('3D heightmap'));
    const height = screen.getByLabelText('Heightmap relief height');
    fireEvent.focus(height);
    fireEvent.change(height, { target: { value: '0.25' } });
    fireEvent.blur(height);
    fireEvent.click(screen.getByLabelText('Invert heights'));
    await act(async () => {
        fireEvent.click(screen.getByText('Use as 3D heightmap'));
    });
    expect(convert.mock.calls[0][0]).toBeCloseTo(6.35, 8);
    expect(convert.mock.calls[0][2]).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Opaque');
    fireEvent.click(screen.getByText('Cancel'));
    expect(signal!.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
});

test('heightmap controls stay out of Laser image import', () => {
    render(
        <BitmapImportModal
            choice={{ fileName: 'map.png', laser: true }}
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onUseHeightmap={async () => {}}
            onCancel={() => {}}
        />,
    );
    expect(screen.queryByText('3D heightmap')).toBeNull();
});

test('applies an explicit setup direction from the STL import modal', async () => {
    let applied: [number, number, number] | null = null;
    const onSetupOrientation = async (machineUp: [number, number, number]) => {
        applied = machineUp;
    };
    render(
        <BitmapImportModal
            choice={{
                fileName: 'part.stl',
                isSurfaceModel: true,
                surfaceMachinableTopDown: true,
                machineUp: [0, 0, 1],
                surfacePreviewUrl: 'data:image/png;base64,preview',
            }}
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onSetupOrientation={onSetupOrientation}
            onCancel={() => {}}
        />,
    );

    fireEvent.click(screen.getByText('Fine-tune direction'));
    fireEvent.change(screen.getByLabelText('Setup azimuth'), {
        target: { value: '90' },
    });
    fireEvent.change(screen.getByLabelText('Setup elevation'), {
        target: { value: '0' },
    });
    await act(async () => {
        fireEvent.click(
            screen.getByRole('button', { name: 'Apply fine-tuned direction' }),
        );
    });

    expect(applied?.[0]).toBeCloseTo(1);
    expect(applied?.[1]).toBeCloseTo(0);
    expect(applied?.[2]).toBeCloseTo(0);
    expect(
        screen.getByRole('button', { name: /Place 3D model/ }),
    ).toBeInTheDocument();
});

test('blocks placement while the current model setup has no top-down surface', () => {
    render(
        <BitmapImportModal
            choice={{
                fileName: 'vertical.stl',
                isSurfaceModel: true,
                surfaceMachinableTopDown: false,
                machineUp: [0, 0, 1],
                surfacePreviewUrl: 'data:image/svg+xml,preview',
            }}
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onSetupOrientation={async () => {}}
            onCancel={() => {}}
        />,
    );

    expect(screen.getByText(/standing on its edge/i)).toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: /choose which side faces up/i }),
    ).toBeDisabled();
    fireEvent.click(screen.getByText('Fine-tune direction'));
    expect(
        screen.getByRole('button', { name: 'Apply fine-tuned direction' }),
    ).toBeEnabled();
});

test('offers one-click orthogonal machining faces', async () => {
    let appliedDirection: [number, number, number] | null = null;
    const onSetupOrientation = async (direction: [number, number, number]) => {
        appliedDirection = direction;
    };
    render(
        <BitmapImportModal
            choice={{
                fileName: 'part.stl',
                isSurfaceModel: true,
                machineUp: [0, 0, 1],
            }}
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onSetupOrientation={onSetupOrientation}
            onCancel={() => {}}
        />,
    );
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Front face up' }));
    });
    expect(appliedDirection).toEqual([0, 1, 0]);
});

test('laser image import names engraving directly without milling choices', () => {
    let placed = false;
    render(
        <BitmapImportModal
            choice={{ fileName: 'photo.png', laser: true }}
            onUseBitmap={() => {
                placed = true;
            }}
            onTrace={() => {}}
            onCancel={() => {}}
        />,
    );
    expect(
        screen.getByRole('heading', { name: 'Engrave this image?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Engrave image/ }));
    expect(placed).toBe(true);
    expect(screen.queryByText(/wavy, halftone/)).not.toBeInTheDocument();
});

test('embedded import dimensions use the preferred display units', () => {
    render(
        <BitmapImportModal
            units="imperial"
            choice={{
                fileName: 'sized.png',
                laser: true,
                physicalSize: { wMm: 25.4, hMm: 12.7 },
            }}
            onUseBitmap={() => {}}
            onTrace={() => {}}
            onCancel={() => {}}
        />,
    );
    expect(screen.getByText('Embedded size: 1in × 0.5in')).toBeVisible();
});
