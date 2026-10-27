import { jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { UpdateControls } from './UpdateControls';
import { checkUpdates } from './store';
import { RELEASE_API } from './release';

test('Android checks its installed version, opens only the offered APK, and recovers from offline checks', async () => {
    const oldFetch = window.fetch;
    const fetch = jest.fn<typeof window.fetch>();
    const open = jest.fn((_url: string, success: () => void) => success());
    const url =
        'https://github.com/petervanderwalt/gCAM/releases/download/v0.2.0/gCAM-0.2.0-android.apk';
    const response = (data: unknown) =>
        ({ ok: true, status: 200, json: async () => data }) as Response;
    fetch.mockResolvedValueOnce(response({ version: '0.1.0' }));
    fetch.mockResolvedValueOnce(
        response({
            tag_name: 'v0.2.0',
            assets: [
                { name: 'gCAM-0.2.0-android.apk', browser_download_url: url },
            ],
        }),
    );
    window.fetch = fetch;
    window.gcamMobileUpdates = { open };
    Object.assign(window, { cordova: { platformId: 'android' } });
    try {
        render(<UpdateControls />);
        fireEvent.click(
            await screen.findByRole('button', { name: 'Download APK' }),
        );
        expect(open).toHaveBeenCalledWith(
            url,
            expect.any(Function),
            expect.any(Function),
        );
        expect(fetch).toHaveBeenCalledWith(
            RELEASE_API,
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
        fetch.mockRejectedValueOnce(new Error('offline'));
        await act(async () => {
            await checkUpdates();
        });
        expect(screen.getByRole('status')).toHaveTextContent(
            'Try again when online',
        );
        fetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
        fireEvent.click(
            screen.getByRole('button', { name: 'Check for updates' }),
        );
        await screen.findByText('You are up to date.');
        expect(open).toHaveBeenCalledTimes(1);
    } finally {
        window.fetch = oldFetch;
        delete window.gcamMobileUpdates;
        Reflect.deleteProperty(window, 'cordova');
    }
});
