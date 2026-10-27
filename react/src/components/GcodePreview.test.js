import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';

const download = jest.fn();
const sendToTablet = jest.fn(() => null);
jest.unstable_mockModule('../toolpaths/exportGcode', () => ({
    downloadGcode: download,
}));
jest.unstable_mockModule('../integrations/gsender/SendToGsenderButton', () => ({
    SendToGsenderButton: () => null,
}));
jest.unstable_mockModule('../integrations/pendant/SendToTabletButton', () => ({
    SendToTabletButton: sendToTablet,
}));
jest.unstable_mockModule('../hooks/useMediaQuery', () => ({
    useMediaQuery: () => false,
}));
const { GcodePreview } = await import('./GcodePreview');

test('limits DOM text for a large program but exports the complete file', () => {
    const gcode = 'G1 X1 Y2 Z3\n'.repeat(100000);
    const { container } = render(
        <GcodePreview gcode={gcode} fileName="large" />,
    );
    expect(container.querySelector('pre').textContent.length).toBeLessThan(
        20100,
    );
    expect(container.querySelector('pre').textContent).toContain(
        'Preview truncated',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save GCODE' }));
    expect(download).toHaveBeenCalledWith(gcode, 'large');
    expect(sendToTablet.mock.calls[0][0]).toMatchObject({
        gcode,
        fileName: 'large',
    });
});
