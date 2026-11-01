import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LaserImagePresets } from './LaserImagePresets';
import type { LaserOptions } from './toolpathRequest';
test('save/apply restores processing and gamma without changing job geometry or passes', () => {
    localStorage.clear();
    function Job() {
        const [gamma, setGamma] = useState(1.4);
        const [options, setOptions] = useState<LaserOptions>({
            brightness: 0.2,
            imageCrop: { left: 0.25, bottom: 0, right: 1, top: 1 },
            passes: 3,
        });
        return (
            <>
                <LaserImagePresets
                    gamma={gamma}
                    interval={0.1}
                    options={options}
                    onApply={(p) => {
                        if (p.gamma !== undefined) setGamma(p.gamma);
                        setOptions((current) => ({ ...current, ...p.options }));
                    }}
                />
                <button
                    onClick={() => {
                        setGamma(2);
                        setOptions((current) => ({
                            ...current,
                            brightness: 0.8,
                            passes: 5,
                        }));
                    }}
                >
                    Change job
                </button>
                <output data-testid="job">
                    {JSON.stringify({ gamma, options })}
                </output>
            </>
        );
    }
    render(<Job />);
    fireEvent.click(screen.getByText('Image presets'));
    fireEvent.change(screen.getByLabelText('Image preset name'), {
        target: { value: 'Photo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save image preset' }));
    fireEvent.click(screen.getByText('Change job'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply image preset' }));
    expect(screen.getByTestId('job')).toHaveTextContent('"gamma":1.4');
    expect(screen.getByTestId('job')).toHaveTextContent('"brightness":0.2');
    expect(screen.getByTestId('job')).toHaveTextContent('"passes":5');
    expect(screen.getByTestId('job')).toHaveTextContent('"left":0.25');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(
        screen.getByRole('button', { name: 'Apply image preset' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo remove' }));
    expect(screen.getByRole('option', { name: 'Photo' })).toBeInTheDocument();
});

test('All, None and Invert choose saved fields and excluded values survive apply', () => {
    localStorage.clear();
    function Job() {
        const [gamma, setGamma] = useState(1.4),
            [interval, setInterval] = useState(0.1),
            [options, setOptions] = useState<LaserOptions>({
                contrast: 1.6,
                brightness: 0.2,
                imageMode: 'threshold',
                passes: 3,
                imageCrop: { left: 0.25, bottom: 0, right: 1, top: 1 },
            });
        return (
            <>
                <LaserImagePresets
                    gamma={gamma}
                    interval={interval}
                    options={options}
                    onApply={(p) => {
                        if (p.gamma !== undefined) setGamma(p.gamma);
                        if (p.interval !== undefined) setInterval(p.interval);
                        setOptions((o) => ({ ...o, ...p.options }));
                    }}
                />
                <button
                    onClick={() => {
                        setGamma(2);
                        setInterval(0.5);
                        setOptions((o) => ({
                            ...o,
                            contrast: 3,
                            brightness: 0.7,
                            imageMode: 'stucki',
                            passes: 5,
                        }));
                    }}
                >
                    Change
                </button>
                <output data-testid="selected-job">
                    {JSON.stringify({ gamma, interval, options })}
                </output>
            </>
        );
    }
    render(<Job />);
    fireEvent.click(screen.getByText('Image presets'));
    fireEvent.click(screen.getByText(/Settings to save/));
    fireEvent.change(screen.getByLabelText('Image preset name'), {
        target: { value: 'Contrast only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(
        screen.getByRole('button', { name: 'Save image preset' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Include Contrast'));
    fireEvent.click(screen.getByRole('button', { name: 'Invert' }));
    expect(screen.getByLabelText('Include Contrast')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Invert' }));
    expect(screen.getByLabelText('Include Contrast')).toBeChecked();
    expect(screen.getByLabelText('Include Gamma')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save image preset' }));
    fireEvent.click(screen.getByText('Change'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply image preset' }));
    const job = JSON.parse(screen.getByTestId('selected-job').textContent!);
    expect(job.gamma).toBe(2);
    expect(job.interval).toBe(0.5);
    expect(job.options).toMatchObject({
        contrast: 1.6,
        brightness: 0.7,
        imageMode: 'stucki',
        passes: 5,
        imageCrop: { left: 0.25 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByLabelText('Include Gamma')).toBeChecked();
    expect(screen.getByLabelText('Include Resolution (DPI)')).toBeChecked();
});
