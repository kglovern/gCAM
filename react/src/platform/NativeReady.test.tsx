import { render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { NativeReady } from './NativeReady';

test('signals native startup only after the renderer commits', () => {
    const ready = jest.fn();
    document.addEventListener('gcam-ready', ready);
    try {
        expect(ready).not.toHaveBeenCalled();
        render(<NativeReady />);
        expect(ready).toHaveBeenCalledTimes(1);
    } finally {
        document.removeEventListener('gcam-ready', ready);
    }
});
