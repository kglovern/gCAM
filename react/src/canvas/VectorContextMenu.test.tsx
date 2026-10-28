import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { VectorContextMenu } from './VectorContextMenu';
import type { ViewLoop } from './types';

function setup(hidden: string[] = [], selected: string[] = []) {
    const canvasRef = createRef<HTMLCanvasElement>();
    const onSelect = jest.fn();
    const onProperties = jest.fn();
    const actions = {
        duplicate: jest.fn(),
        delete: jest.fn(),
        transform: jest.fn(),
    };
    function Harness() {
        const [selection, setSelection] = useState(selected);
        return (
            <VectorContextMenu
                canvasRef={canvasRef}
                cameraRef={{ current: { tx: 0, ty: 0, scale: 1 } }}
                loops={[
                    {
                        id: 'vector',
                        points: [
                            { x: 0, y: 0 },
                            { x: 100, y: 0 },
                        ],
                    } as ViewLoop,
                ]}
                hidden={hidden}
                selected={selection}
                actions={actions}
                onSelect={(ids) => {
                    onSelect(ids);
                    setSelection(ids);
                }}
                onProperties={onProperties}
            >
                <canvas ref={canvasRef} data-testid="canvas" />
            </VectorContextMenu>
        );
    }
    render(<Harness />);
    return {
        canvas: screen.getByTestId('canvas'),
        onSelect,
        onProperties,
        actions,
    };
}

test('right-click selects the vector and Properties explicitly opens its editor', () => {
    const { canvas, onSelect, onProperties } = setup();
    fireEvent.contextMenu(canvas, { clientX: 20, clientY: 0 });
    expect(onSelect).toHaveBeenCalledWith(['vector']);
    expect(onProperties).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Properties' }));
    expect(onProperties).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('blank space and hidden vectors do not offer properties', () => {
    const { canvas, onSelect } = setup(['vector']);
    fireEvent.contextMenu(canvas, { clientX: 20, clientY: 0 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.contextMenu(canvas, { clientX: 200, clientY: 200 });
    expect(onSelect).not.toHaveBeenCalled();
});

test('Escape dismisses the menu', () => {
    const { canvas } = setup();
    fireEvent.contextMenu(canvas, { clientX: 20, clientY: 0 });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('right-button dragging pans without opening properties', () => {
    const { canvas, onSelect } = setup();
    fireEvent(
        canvas,
        new MouseEvent('pointerdown', {
            bubbles: true,
            button: 2,
            clientX: 10,
            clientY: 0,
        }),
    );
    fireEvent.contextMenu(canvas, { clientX: 30, clientY: 0 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
});

test.each(['Clone', 'Delete', 'Transform'])(
    '%s uses the existing action without passing the click event',
    (label) => {
        const { canvas, actions } = setup();
        fireEvent.contextMenu(canvas, { clientX: 20, clientY: 0 });
        fireEvent.click(screen.getByRole('menuitem', { name: label }));
        if (label === 'Clone') expect(actions.duplicate).toHaveBeenCalledWith();
        else if (label === 'Delete')
            expect(actions.delete).toHaveBeenCalledWith();
        else
            expect(actions.transform).toHaveBeenCalledWith(label.toLowerCase());
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    },
);

test('right-click on a selected vector preserves the multi-selection', () => {
    const { canvas, onSelect } = setup([], ['vector', 'another']);
    fireEvent.contextMenu(canvas, { clientX: 20, clientY: 0 });
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Properties' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'Clone' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeEnabled();
});

test('right-click on another vector replaces the selection', () => {
    const { canvas, onSelect } = setup([], ['another']);
    fireEvent.contextMenu(canvas, { clientX: 20, clientY: 0 });
    expect(onSelect).toHaveBeenCalledWith(['vector']);
});

test('rotated bitmap interiors offer actions but not vector properties', () => {
    const canvasRef = createRef<HTMLCanvasElement>();
    const duplicate = jest.fn();
    render(
        <VectorContextMenu
            canvasRef={canvasRef}
            cameraRef={{ current: { tx: 0, ty: 0, scale: 1 } }}
            loops={[{ id: 'image-loop', bitmapId: 'image', points: [] }]}
            bitmaps={[
                { id: 'image', x: 0, y: -50, w: 100, h: 100, rotation: 45 },
            ]}
            hidden={[]}
            selected={['image-loop']}
            onSelect={jest.fn()}
            onProperties={jest.fn()}
            actions={{ duplicate, delete: jest.fn(), transform: jest.fn() }}
        >
            <canvas ref={canvasRef} data-testid="bitmap-canvas" />
        </VectorContextMenu>,
    );
    fireEvent.contextMenu(screen.getByTestId('bitmap-canvas'), {
        clientX: 50,
        clientY: 0,
    });
    expect(screen.getByRole('menuitem', { name: 'Properties' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clone' }));
    expect(duplicate).toHaveBeenCalledTimes(1);
});

test('arrow keys navigate actions and clicking outside dismisses the menu', () => {
    const { canvas } = setup();
    fireEvent.contextMenu(canvas, { clientX: 20, clientY: 0 });
    expect(
        screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Transform', 'Clone', 'Delete', 'Properties']);
    const transform = screen.getByRole('menuitem', { name: 'Transform' });
    expect(transform).toHaveFocus();
    fireEvent.keyDown(transform, { key: 'ArrowUp' });
    const properties = screen.getByRole('menuitem', { name: 'Properties' });
    expect(properties).toHaveFocus();
    expect(properties.previousElementSibling).toHaveAttribute(
        'role',
        'separator',
    );
    fireEvent.keyDown(properties, { key: 'ArrowDown' });
    expect(transform).toHaveFocus();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
