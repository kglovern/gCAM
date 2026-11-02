import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { SendToGsenderButton } from './SendToGsenderButton';

const originalFetch = globalThis.fetch;
let fetchMock: jest.Mock<(url: string, init: RequestInit) => Promise<Response>>;

function respond(status: number, body: unknown = {}) {
    fetchMock.mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as Response);
}

beforeEach(() => {
    localStorage.clear();
    fetchMock =
        jest.fn<(url: string, init: RequestInit) => Promise<Response>>();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterAll(() => {
    globalThis.fetch = originalFetch;
});

test('is disabled without a program', () => {
    render(<SendToGsenderButton gcode="  " fileName="part.svg" />);
    expect(
        screen.getByRole('button', { name: /send to gsender/i }),
    ).toBeDisabled();
});

test('sends the program with the default .gcode name to the configured port', async () => {
    localStorage.setItem('gcam.gsender.port', '50123');
    respond(202, { accepted: true, name: 'part.gcode' });
    render(<SendToGsenderButton gcode="G0 X0" fileName="part.svg" />);

    fireEvent.click(screen.getByRole('button', { name: /send to gsender/i }));

    expect(await screen.findByText('Sent to gSender')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:50123/gcam/v1/load');
    expect(JSON.parse(init.body as string)).toEqual({
        name: 'part.gcode',
        gcode: 'G0 X0',
    });
});

test('shows the failure message', async () => {
    respond(409);
    render(<SendToGsenderButton gcode="G0 X0" fileName="part" />);

    fireEvent.click(screen.getByRole('button', { name: /send to gsender/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'gSender is running a job',
    );
});

test('uses the selected output extension for frame and job handoff', async () => {
    respond(202);
    render(
        <SendToGsenderButton
            gcode="M5\nG1 X10 S0"
            fileName="laser-frame"
            extension="gcode"
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: /send to gsender/i }));
    expect(await screen.findByText('Sent to gSender')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).name).toBe(
        'laser-frame.gcode',
    );
});

test.each(['duet', 'marlin', 'linuxcnc', 'mach3', 'mach4'] as const)(
    'does not offer gSender handoff for %s output',
    (controller) => {
        render(
            <SendToGsenderButton
                gcode="G1 X10"
                fileName="part.svg"
                controller={controller}
            />,
        );
        const button = screen.getByRole('button', { name: /send to gsender/i });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute(
            'title',
            expect.stringContaining('Grbl and grblHAL'),
        );
        fireEvent.click(button);
        expect(fetchMock).not.toHaveBeenCalled();
    },
);
