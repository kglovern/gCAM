import { jest } from '@jest/globals';
import { useState } from 'react';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import type { ToolpathStackEntry } from './useToolpathStack';

const requests: {
    signal: AbortSignal;
    resolve: (entries: ToolpathStackEntry[]) => void;
}[] = [];
const rebuild = jest.fn(
    (_entries: unknown, _patch: unknown, options: { signal: AbortSignal }) =>
        new Promise<ToolpathStackEntry[]>((resolve) =>
            requests.push({ signal: options.signal, resolve }),
        ),
);
await jest.unstable_mockModule('./rebuild-laser-operations', () => ({
    rebuildLaserOperations: rebuild,
}));
const { LaserBulkSettings } = await import('./LaserBulkSettings');
const entry: ToolpathStackEntry = {
    id: 'a',
    label: 'A',
    args: { operation: 'laser-cut', toolDiameter: 1, cutDepth: 1, loops: [] },
    preview: [],
    toolpath: {},
};
const stack = [entry],
    bitmaps: [] = [];
beforeEach(() => {
    requests.length = 0;
    rebuild.mockClear();
});

test('cancel keeps the job unchanged and a later successful retry commits exactly once', async () => {
    const onCommit = jest.fn();
    function Job() {
        const [busy, setBusy] = useState(false);
        return (
            <LaserBulkSettings
                stack={stack}
                entries={stack}
                bitmaps={bitmaps}
                units="metric"
                busy={busy}
                onBusy={setBusy}
                onCommit={onCommit}
            />
        );
    }
    render(<Job />);
    fireEvent.click(screen.getByText('Edit selected settings'));
    fireEvent.click(screen.getByLabelText('Apply selected power'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to selected' }));
    expect(screen.getByLabelText('Apply selected power')).toBeDisabled();
    expect(
        screen.getByRole('button', { name: 'Cancel bulk rebuild' }),
    ).toBeEnabled();
    fireEvent.click(
        screen.getByRole('button', { name: 'Cancel bulk rebuild' }),
    );
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () =>
        requests[0].resolve([
            { ...entry, args: { ...entry.args, laserPower: 400 } },
        ]),
    );
    await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('cancelled'),
    );
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply to selected' }));
    const changed = { ...entry, args: { ...entry.args, laserPower: 400 } };
    await act(async () => requests[1].resolve([changed]));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(stack, [changed]);
    expect(screen.getByRole('status')).toHaveTextContent('1 operation updated');
});

test('changing the job cancels a pending rebuild instead of applying stale results', async () => {
    const onBusy = jest.fn(),
        onCommit = jest.fn();
    const props = {
        stack,
        entries: stack,
        bitmaps,
        units: 'metric' as const,
        busy: false,
        onBusy,
        onCommit,
    };
    const view = render(<LaserBulkSettings {...props} />);
    fireEvent.click(screen.getByText('Edit selected settings'));
    fireEvent.click(screen.getByLabelText('Apply selected speed'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply to selected' }));
    view.rerender(
        <LaserBulkSettings
            {...props}
            stack={[{ ...entry, label: 'Changed' }]}
        />,
    );
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => requests[0].resolve([entry]));
    expect(onCommit).not.toHaveBeenCalled();
});
