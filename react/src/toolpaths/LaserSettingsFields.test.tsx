import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LaserSettingsFields } from './LaserSettingsFields';
import type { LaserOptions } from './toolpathRequest';
const noop = () => {};
test('saving or applying a material suggestion preserves the job region without saving it as material data', async () => {
    localStorage.clear();
    function Job() {
        const [options, setOptions] = useState<LaserOptions>({
            scanAlignment: {
                enabled: true,
                measurements: [
                    { feed: 1000, gap: 0.2 },
                    { feed: 3000, gap: 0.6 },
                ],
            },
            imageCrop: { left: 0.25, bottom: 0, right: 0.75, top: 1 },
            imageMask: [
                [
                    { x: 0, y: 0 },
                    { x: 1, y: 0 },
                    { x: 1, y: 1 },
                    { x: 0, y: 0 },
                ],
            ],
        });
        return (
            <>
                <LaserSettingsFields
                    operation="laser-raster"
                    gamma={1}
                    setGamma={noop}
                    units="metric"
                    options={options}
                    onChange={setOptions}
                    feed={1200}
                    power={500}
                    interval={0.2}
                    setFeed={noop}
                    setPower={noop}
                    setInterval={noop}
                    overscan={2}
                    setOverscan={noop}
                    material="plywood"
                    thickness={3}
                    machineId="longmill-router"
                    stock={{
                        widthMm: 100,
                        heightMm: 100,
                        thicknessMm: 3,
                        material: 'sheet-goods',
                        origin: 'front-left',
                    }}
                    onReady={noop}
                />
                <output data-testid="region">
                    {JSON.stringify(options.imageCrop)}
                </output>
                <output data-testid="alignment">
                    {JSON.stringify(options.scanAlignment)}
                </output>
            </>
        );
    }
    render(<Job />);
    fireEvent.change(
        screen.getByLabelText('Brightness', {
            selector: 'input[type="number"]',
        }),
        {
            target: { value: '0.3' },
        },
    );
    fireEvent.click(screen.getByLabelText('Pixel pass-through'));
    expect(
        screen.getByLabelText('Brightness', {
            selector: 'input[type="number"]',
        }),
    ).toBeDisabled();
    expect(
        screen.getByLabelText('Image mode', { selector: 'select' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Dot-width correction')).toBeEnabled();
    fireEvent.click(screen.getByLabelText('Pixel pass-through'));
    expect(
        screen.getByLabelText('Brightness', {
            selector: 'input[type="number"]',
        }),
    ).toHaveValue(0.3);
    expect(
        screen.getByLabelText('Image mode', { selector: 'select' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    fireEvent.change(screen.getByLabelText('Laser power percent'), {
        target: { value: '60' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save as suggestion' }));
    await waitFor(() =>
        expect(localStorage.getItem('gcam.laserRecipes.v1')).not.toBeNull(),
    );
    const saved = JSON.parse(localStorage.getItem('gcam.laserRecipes.v1')!)[0];
    expect(saved.options.imageCrop).toBeUndefined();
    expect(saved.options.imageMask).toBeUndefined();
    expect(saved.options.maskSourceIds).toBeUndefined();
    expect(saved.options.scanAlignment).toBeUndefined();
    fireEvent.click(screen.getByText('Material library (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Use settings' }));
    expect(screen.getByTestId('alignment')).toHaveTextContent('"enabled":true');
    expect(screen.getByTestId('region')).toHaveTextContent('"left":0.25');
});
