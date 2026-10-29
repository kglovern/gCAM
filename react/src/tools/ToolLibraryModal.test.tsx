import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, jest, test } from '@jest/globals';
import { ToolLibraryModal } from './ToolLibraryModal';
import { TOOL_STORAGE_KEY, blankSlots } from './library';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
    localStorage.clear();
});

test('source tabs hide catalog in Custom and save a manual tool without vendor metadata', async () => {
    const slots = blankSlots();
    slots[0] = {
        ...slots[0],
        name: 'Catalog cutter',
        libraryToolId: 'sienci-one',
        vendor: 'sienci',
        vendorDisplayName: 'Sienci Labs',
        cuttingDiameterMm: 6.35,
        flutes: 2,
    };
    localStorage.setItem(TOOL_STORAGE_KEY, JSON.stringify({ slots }));
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => [
            {
                id: 'sienci-one',
                name: 'Catalog cutter',
                vendor: 'sienci',
                vendorDisplayName: 'Sienci Labs',
                toolType: 'flat',
                cuttingDiameterMm: 6.35,
                flutes: 2,
            },
            {
                id: 'other-one',
                name: 'Other cutter',
                vendor: 'other',
                vendorDisplayName: 'Other Tools',
                toolType: 'flat',
                cuttingDiameterMm: 3.175,
                flutes: 1,
            },
        ],
    } as Response);
    const changed = jest.fn();
    render(
        <ToolLibraryModal
            isOpen
            onClose={jest.fn()}
            initialSlot={1}
            onSlotChange={changed}
        />,
    );
    const other = await screen.findByRole('tab', { name: 'Other Tools' });
    expect(
        screen.getByRole('heading', { name: 'Tool Library: Editing slot T1' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Editing T1')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Sienci Labs' })).toHaveAttribute(
        'aria-selected',
        'true',
    );
    expect(screen.getByRole('radio', { name: 'Catalog cutter' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Other cutter' })).toBeNull();
    expect(screen.queryByLabelText('Tool Name *')).toBeNull();
    expect(screen.queryByText('Catalog tool')).toBeNull();
    fireEvent.click(other);
    expect(screen.getByRole('button', { name: 'Save Tool' })).toBeDisabled();
    expect(
        screen.getByRole('radio', { name: 'Other cutter' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Catalog cutter' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.queryByLabelText('Search catalog')).toBeNull();
    expect(
        screen.queryByRole('radiogroup', { name: 'Catalog tools' }),
    ).toBeNull();
    expect(screen.getByLabelText('Tool Name *')).toHaveValue('Catalog cutter');
    fireEvent.click(screen.getByRole('tab', { name: 'Sienci Labs' }));
    expect(screen.getByRole('radio', { name: 'Catalog cutter' })).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Tool Name *'), {
        target: { value: 'My cutter' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }));
    expect(changed).toHaveBeenCalledWith(
        expect.objectContaining({
            name: 'My cutter',
            libraryToolId: null,
            vendor: '',
            vendorDisplayName: '',
            cuttingDiameterMm: 6.35,
            flutes: 2,
        }),
    );
});
