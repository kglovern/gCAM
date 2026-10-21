import { jest } from '@jest/globals';
import { saveTextFile } from './saveTextFile';

test('tablet exports use the native picker, sanitize filenames and handle cancellation', () => {
    const runtime = window as Window & {
        cordova?: unknown;
        gcamFiles?: { save: ReturnType<typeof jest.fn> };
    };
    const save = jest.fn();
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});
    runtime.cordova = {};
    runtime.gcamFiles = { save };
    try {
        saveTextFile('G0 X1', 'part/test.nc');
        expect(save).toHaveBeenCalledWith(
            'part-test.nc',
            'G0 X1',
            'text/plain',
            expect.any(Function),
            expect.any(Function),
        );
        const failure = save.mock.calls[0][4] as (error: string) => void;
        failure('CANCELLED');
        expect(alert).not.toHaveBeenCalled();
        failure('No space');
        expect(alert).toHaveBeenCalledWith('Could not save file: No space');
        delete runtime.gcamFiles;
        saveTextFile('{}', 'project.json', 'application/json');
        expect(alert).toHaveBeenCalledWith(
            expect.stringContaining('not ready'),
        );
    } finally {
        delete runtime.cordova;
        delete runtime.gcamFiles;
        alert.mockRestore();
    }
});
