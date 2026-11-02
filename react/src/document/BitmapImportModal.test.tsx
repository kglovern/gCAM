import { act, fireEvent, render, screen } from '@testing-library/react';
import { BitmapImportModal } from './BitmapImportModal';
import { jest } from '@jest/globals';

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
            onSetupOrientation={onSetupOrientation}
            onCancel={() => {}}
        />,
    );
    await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Front face up' }));
    });
    expect(appliedDirection).toEqual([0, 1, 0]);
});

test('embedded import dimensions use the preferred display units', () => {
    render(
        <BitmapImportModal
            units="imperial"
            choice={{
                fileName: 'sized.stl',
                isSurfaceModel: true,
                physicalSize: { wMm: 25.4, hMm: 12.7 },
            }}
            onUseBitmap={() => {}}
            onCancel={() => {}}
        />,
    );
    expect(screen.getByText('Embedded size: 1in × 0.5in')).toBeVisible();
});
