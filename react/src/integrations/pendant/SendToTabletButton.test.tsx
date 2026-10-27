import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import type {
    PendantBridge,
    PendantSendResult,
    PendantState,
    PendantTablet,
} from './pendantBridge';
import { SendToTabletButton } from './SendToTabletButton';

type BridgeWindow = Window & { gcamPendant?: PendantBridge };

const shop: PendantTablet = {
    id: 'tab-1',
    name: 'Shop Tablet',
    paired: true,
    online: true,
};
const garage: PendantTablet = {
    id: 'tab-2',
    name: 'Garage Tablet',
    paired: true,
    online: false,
};

let sendMock: jest.Mock<PendantBridge['send']>;

function installBridge(tablets: PendantTablet[]) {
    const state: PendantState = { browsing: true, tablets };
    sendMock = jest.fn<PendantBridge['send']>();
    (window as BridgeWindow).gcamPendant = {
        discover: async () => state,
        createQr: async () => ({ nonce: 'n', expiresAt: 0, payload: 'p' }),
        claim: async () => ({ paired: false }),
        forget: async () => true,
        send: sendMock,
        onChanged: () => () => {},
    };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
    delete (window as BridgeWindow).gcamPendant;
});

test('renders nothing outside the desktop app', () => {
    const { container } = render(
        <SendToTabletButton gcode="G0 X0" fileName="part" />,
    );
    expect(container).toBeEmptyDOMElement();
});

test('renders nothing until a tablet is paired', async () => {
    installBridge([{ ...shop, paired: false }]);
    const { container } = render(
        <SendToTabletButton gcode="G0 X0" fileName="part" />,
    );
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
});

test('sends straight to the only paired tablet', async () => {
    installBridge([shop]);
    sendMock.mockResolvedValue({ ok: true });
    render(<SendToTabletButton gcode="G0 X0" fileName="part.svg" />);

    fireEvent.click(
        await screen.findByRole('button', { name: /send to shop tablet/i }),
    );

    expect(await screen.findByText('Sent to Shop Tablet')).toBeInTheDocument();
    expect(sendMock).toHaveBeenCalledWith({
        tabletId: 'tab-1',
        name: 'part.nc',
        gcode: 'G0 X0',
    });
});

test('asks which tablet when several are paired', async () => {
    installBridge([shop, garage]);
    sendMock.mockResolvedValue({ ok: true });
    render(<SendToTabletButton gcode="G0 X0" fileName="part" />);

    fireEvent.click(
        await screen.findByRole('button', { name: /send to tablet/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /garage tablet/i }));

    expect(
        await screen.findByText('Sent to Garage Tablet'),
    ).toBeInTheDocument();
    expect(sendMock.mock.calls[0][0].tabletId).toBe('tab-2');
    expect(localStorage.getItem('gcam.pendant.lastTabletId')).toBe('tab-2');
});

test('shows the failure message', async () => {
    installBridge([shop]);
    sendMock.mockResolvedValue({
        ok: false,
        reason: 'unpaired',
        message: 'Shop Tablet no longer trusts gCAM — pair it again in Config',
    } satisfies PendantSendResult);
    render(<SendToTabletButton gcode="G0 X0" fileName="part" />);

    fireEvent.click(
        await screen.findByRole('button', { name: /send to shop tablet/i }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
        'no longer trusts gCAM',
    );
});
