import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { GcodeExportButton } from './GcodeExportButton';
import type { ToolpathStackEntry } from './useToolpathStack';

const entries = [10, 80].map((x, index) => ({
    id: String(index),
    label: `Profile ${index + 1}`,
    args: {
        loops: [],
        operation: 'profile-outside',
        toolDiameter: 3,
        cutDepth: 2,
    },
    preview: [],
    toolpath: {
        operation: 'profile-outside',
        label: `Profile ${index + 1}`,
        safeZ: 5,
        feedRate: 100,
        plungeRate: 50,
        spindle: 1000,
        toolNumber: 1,
        toolDiameter: 3,
        cutDepth: 2,
        passDepth: 2,
        passDepths: [-2],
        previewContours: [
            [
                { x, y: 0 },
                { x: x + 5, y: 0 },
            ],
        ],
        tabs: [],
        tabHeight: 0,
    },
})) as ToolpathStackEntry[];

test('exports one complete program with current units and no other toolpath', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = jest.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:test';
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = jest.fn();
    const click = jest
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
    render(
        <GcodeExportButton
            gcode="combined"
            fileName="job.svg"
            stack={entries}
            units="imperial"
            emitArcs={false}
        />,
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Export individual toolpaths' }),
    );
    fireEvent.click(screen.getByRole('button', { name: '1. Profile 1' }));
    const raw = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(blobs[0]);
    });
    expect(raw).toContain('G20');
    expect(raw).toMatch(/M(?:2|30)\b/);
    expect(raw).toContain('M5');
    expect(raw).not.toContain('Profile 2');
    expect(raw).toMatch(/X0.3937/);
    expect(
        screen.getByRole('button', { name: 'Export individual toolpaths' }),
    ).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Export G-code' }));
    expect(blobs).toHaveLength(2);
    click.mockRestore();
});

test('empty stack disables individual exports', () => {
    render(
        <GcodeExportButton
            gcode=""
            fileName=""
            stack={[]}
            units="metric"
            emitArcs
        />,
    );
    expect(
        screen.getByRole('button', { name: 'Export individual toolpaths' }),
    ).toBeDisabled();
    expect(
        screen.getByRole('button', { name: 'Export G-code' }),
    ).toBeDisabled();
});
