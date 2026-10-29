/**
 * Purpose: Regression coverage for canvas toolbar command wiring.
 * Tests: Toolbar buttons call selection commands without forwarding React events.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ToolbarCommands } from './ToolbarCommands';
import type { CanvasToolbarProps } from './types';

describe('ToolbarCommands', () => {
    it('calls delete without forwarding the click event as selected ids', () => {
        const calls: unknown[][] = [];
        const onDeleteSelected = (...args: unknown[]) => calls.push(args);
        const props = {
            activeTool: 'select',
            drawTool: 'line',
            transformMode: null,
            hasSelection: true,
            hasGeometry: true,
            onDeleteSelected,
        } as unknown as CanvasToolbarProps;

        render(<ToolbarCommands props={props} open={null} close={() => {}} />);

        fireEvent.click(
            screen.getByRole('button', { name: 'Delete selection' }),
        );

        expect(calls).toEqual([[]]);
        expect(
            screen.getByRole('button', { name: 'Transform selection' }),
        ).toBeInTheDocument();
        for (const name of [
            'Move selection',
            'Rotate selection',
            'Scale selection',
        ])
            expect(
                screen.queryByRole('button', { name }),
            ).not.toBeInTheDocument();
    });
});

test('Select and Transform highlighting are mutually exclusive', () => {
    const props = {
        activeTool: 'select',
        drawTool: null,
        transformMode: 'transform',
        hasSelection: true,
    } as CanvasToolbarProps;
    const { rerender } = render(
        <ToolbarCommands props={props} open={null} close={() => {}} />,
    );
    const select = screen.getByRole('button', { name: 'Select shapes' });
    expect(select).toHaveAttribute('aria-pressed', 'false');
    expect(select).not.toHaveClass('bg-robin-500');
    expect(
        screen.getByRole('button', { name: 'Transform selection' }),
    ).toHaveAttribute('aria-pressed', 'true');
    rerender(
        <ToolbarCommands
            props={{ ...props, transformMode: null }}
            open={null}
            close={() => {}}
        />,
    );
    expect(select).toHaveAttribute('aria-pressed', 'true');
    expect(
        screen.getByRole('button', { name: 'Transform selection' }),
    ).toHaveAttribute('aria-pressed', 'false');
});

test('Transform can be armed before selecting geometry', () => {
    const modes: unknown[] = [];
    const props = {
        activeTool: 'select',
        drawTool: null,
        transformMode: null,
        hasSelection: false,
        hasGeometry: false,
        onTransformMode: (mode) => {
            modes.push(mode);
        },
    } as CanvasToolbarProps;
    render(<ToolbarCommands props={props} open={null} close={() => {}} />);
    const button = screen.getByRole('button', { name: 'Transform selection' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(modes).toEqual(['transform']);
});

test.each([
    { drawTool: 'slot', cornerTool: null, guidePlacement: null },
    { drawTool: null, cornerTool: 'dogbone', guidePlacement: null },
    { drawTool: null, cornerTool: null, guidePlacement: 'edge' },
])(
    'Select is not highlighted while another canvas tool is active: %j',
    (mode) => {
        const props = {
            activeTool: 'select',
            transformMode: null,
            ...mode,
        } as unknown as CanvasToolbarProps;
        render(<ToolbarCommands props={props} open={null} close={() => {}} />);
        expect(
            screen.getByRole('button', { name: 'Select shapes' }),
        ).toHaveAttribute('aria-pressed', 'false');
        expect(
            screen.getByRole('button', { name: 'Select shapes' }),
        ).not.toHaveClass('bg-robin-500');
        expect(screen.getByRole('button', { name: 'Draw' })).toHaveAttribute(
            'aria-pressed',
            String(Boolean(mode.drawTool || mode.guidePlacement)),
        );
    },
);
