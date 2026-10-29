import { fireEvent, render, screen, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ToolCatalogSelect } from './ToolCatalogSelect';
import type { LibraryTool } from '../lib/library';

test('tool-type filter narrows catalog rows and selecting one applies it', () => {
    const select = jest.fn();
    render(
        <ToolCatalogSelect
            catalog={
                [
                    { id: 'flat', name: 'Flat cutter', toolType: 'flat' },
                    { id: 'v', name: 'V cutter', toolType: 'v-bit' },
                ] as LibraryTool[]
            }
            catalogError=""
            selectedId=""
            units="metric"
            className=""
            onSelect={select}
        />,
    );
    fireEvent.change(screen.getByLabelText('Search Tool type'), {
        target: { value: 'V-bit' },
    });
    expect(
        within(screen.getByRole('group', { name: 'Tool type' })).queryByRole(
            'radio',
            { name: 'Flat' },
        ),
    ).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'V-bit' }));
    expect(screen.queryByRole('radio', { name: /Flat cutter/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /V cutter/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'V cutter' }));
    expect(select).toHaveBeenCalledWith('v');
});

test('inch size ranges combine with search and Clear filters restores all tools', () => {
    const select = jest.fn();
    render(
        <ToolCatalogSelect
            catalog={
                [
                    {
                        id: 'quarter',
                        name: 'Quarter downcut',
                        toolType: 'flat',
                        cuttingDiameterMm: 6.35,
                        cuttingLengthMm: 25.4,
                    },
                    {
                        id: 'eighth',
                        name: 'Eighth downcut',
                        toolType: 'flat',
                        cuttingDiameterMm: 3.175,
                        cuttingLengthMm: 12.7,
                    },
                ] as LibraryTool[]
            }
            catalogError=""
            selectedId="quarter"
            units="imperial"
            className=""
            onSelect={select}
        />,
    );
    fireEvent.change(screen.getByLabelText('Search catalog'), {
        target: { value: 'downcut' },
    });
    fireEvent.change(screen.getByLabelText('Min cutting diameter (in)'), {
        target: { value: '0.2' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 tools');
    fireEvent.change(screen.getByLabelText('Min cutting length (in)'), {
        target: { value: '2' },
    });
    expect(screen.getByText(/No matching tools/)).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 tools');
    expect(screen.getByLabelText('Min cutting diameter (in)')).toHaveValue(
        null,
    );
    expect(
        screen.getByRole('radio', { name: 'Quarter downcut' }),
    ).toBeChecked();
});

test('each column searches its own values and combines selected parameters', () => {
    render(
        <ToolCatalogSelect
            catalog={
                [
                    {
                        id: 'small',
                        name: 'Small cutter',
                        toolType: 'flat',
                        shankDiameterMm: 3.175,
                        flutes: 1,
                        cuttingDiameterMm: 3.175,
                    },
                    {
                        id: 'large',
                        name: 'Large cutter',
                        toolType: 'flat',
                        shankDiameterMm: 6.35,
                        flutes: 2,
                        cuttingDiameterMm: 6.35,
                    },
                ] as LibraryTool[]
            }
            catalogError=""
            selectedId=""
            units="metric"
            className=""
            onSelect={jest.fn()}
        />,
    );
    fireEvent.change(screen.getByLabelText('Search Shank diameter (mm)'), {
        target: { value: '6.35' },
    });
    const shank = within(
        screen.getByRole('group', { name: 'Shank diameter (mm)' }),
    );
    expect(shank.queryByRole('radio', { name: '3.175' })).toBeNull();
    // Searching a column only narrows its values, until a value is chosen.
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 tools');
    fireEvent.click(shank.getByRole('radio', { name: '6.35' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 tools');
    fireEvent.change(screen.getByLabelText('Search Flute count'), {
        target: { value: '1' },
    });
    fireEvent.click(
        within(screen.getByRole('group', { name: 'Flute count' })).getByRole(
            'radio',
            { name: '1' },
        ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('0 of 2 tools');
    fireEvent.click(screen.getByText('Clear filters'));
    expect(screen.getByRole('status')).toHaveTextContent('2 of 2 tools');
    expect(screen.getByLabelText('Search Shank diameter (mm)')).toHaveValue('');
    expect(screen.getByLabelText('Search Flute count')).toHaveValue('');
});
