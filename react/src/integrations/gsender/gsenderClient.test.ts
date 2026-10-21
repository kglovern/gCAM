import { jest } from '@jest/globals';
import { pingGsender, sendGcodeToGsender } from './gsenderClient';
import {
    DEFAULT_GSENDER_PORT,
    GSENDER_PORT_STORAGE_KEY,
    loadGsenderPort,
    saveGsenderPort,
} from './settings';

function jsonResponse(status: number, body: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as Response;
}

describe('sendGcodeToGsender', () => {
    test('posts the program as JSON to the loopback listener', async () => {
        const fetchImpl = jest.fn(async () =>
            jsonResponse(202, { accepted: true, name: 'part.nc' }),
        );
        const result = await sendGcodeToGsender(47820, 'part.nc', 'G0 X0', {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result).toEqual({ ok: true, name: 'part.nc' });
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [
            string,
            RequestInit,
        ];
        expect(url).toBe('http://127.0.0.1:47820/gcam/v1/load');
        expect(init.method).toBe('POST');
        expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(JSON.parse(init.body as string)).toEqual({
            name: 'part.nc',
            gcode: 'G0 X0',
        });
    });

    test.each([
        [409, 'busy'],
        [503, 'disabled'],
        [403, 'refused'],
        [413, 'too-large'],
        [404, 'unreachable'],
        [500, 'failed'],
    ])('maps HTTP %i to %s', async (status, reason) => {
        const fetchImpl = jest.fn(async () => jsonResponse(status, {}));
        const result = await sendGcodeToGsender(1, 'a.nc', 'G0', {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result).toMatchObject({ ok: false, reason });
    });

    test('reports gSender as unreachable when the request fails', async () => {
        const fetchImpl = jest.fn(async () => {
            throw new TypeError('Failed to fetch');
        });
        const result = await sendGcodeToGsender(1, 'a.nc', 'G0', {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
    });

    test('aborts after the timeout', async () => {
        const fetchImpl = jest.fn(
            (_url: string, init: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init.signal?.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError')),
                    );
                }),
        );
        const result = await sendGcodeToGsender(1, 'a.nc', 'G0', {
            fetchImpl: fetchImpl as unknown as typeof fetch,
            timeoutMs: 10,
        });
        expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
    });
});

describe('pingGsender', () => {
    test.each([
        [
            { app: 'gSender', version: '1.6', enabled: true, busy: false },
            'ready',
        ],
        [{ app: 'gSender', version: '1.6', enabled: true, busy: true }, 'busy'],
        [{ app: 'gSender', version: '1.6', enabled: false }, 'disabled'],
        [{ app: 'something-else' }, 'unreachable'],
    ])('reads %j as %s', async (body, state) => {
        const fetchImpl = jest.fn(async () => jsonResponse(200, body));
        const result = await pingGsender(1, {
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        expect(result.state).toBe(state);
    });
});

describe('gSender port setting', () => {
    beforeEach(() => localStorage.clear());

    test('defaults when nothing valid is stored', () => {
        expect(loadGsenderPort()).toBe(DEFAULT_GSENDER_PORT);
        localStorage.setItem(GSENDER_PORT_STORAGE_KEY, '80');
        expect(loadGsenderPort()).toBe(DEFAULT_GSENDER_PORT);
    });

    test('persists a valid port and ignores invalid ones', () => {
        saveGsenderPort(50000);
        expect(loadGsenderPort()).toBe(50000);
        saveGsenderPort(70000);
        expect(loadGsenderPort()).toBe(50000);
    });
});
