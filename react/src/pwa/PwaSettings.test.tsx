import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { PwaSettings } from './PwaSettings';
import { startPwa } from './client';

test('offers installation on request and recognizes an installed tablet display mode', async () => {
    const previous = window.matchMedia;
    const changes = new Map<string, () => void>();
    let installed = false;
    window.matchMedia = jest.fn((query: string) => ({
        get matches() {
            return installed && query === '(display-mode: standalone)';
        },
        media: query,
        addEventListener: (_: string, listener: () => void) =>
            changes.set(query, listener),
    })) as unknown as typeof window.matchMedia;
    try {
        startPwa(false);
        render(<PwaSettings />);
        expect(
            screen.getByText('Add gCAM to your Home Screen'),
        ).toBeInTheDocument();
        const prompt = jest
            .fn<() => Promise<void>>()
            .mockResolvedValue(undefined);
        const event = Object.assign(
            new Event('beforeinstallprompt', { cancelable: true }),
            { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) },
        );
        act(() => {
            window.dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(true);
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Install gCAM' }),
            );
        });
        expect(prompt).toHaveBeenCalledTimes(1);
        expect(
            screen.queryByRole('button', { name: 'Install gCAM' }),
        ).not.toBeInTheDocument();
        act(() => {
            installed = true;
            changes.get('(display-mode: standalone)')?.();
        });
        expect(
            screen.getByText('gCAM is running as an app'),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Install on Android or iPad'),
        ).not.toBeInTheDocument();
    } finally {
        window.matchMedia = previous;
    }
});
