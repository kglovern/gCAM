import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { jest } from '@jest/globals';
import { useCornerCommands } from './useCornerCommands';

const points = [
    { x: 0, y: 0 },
    { x: 20, y: 0 },
    { x: 20, y: 20 },
    { x: 0, y: 20 },
    { x: 0, y: 0 },
];
test.each(['fillet', 'chamfer'] as const)(
    '%s waits for a picked corner and size before changing geometry',
    (tool) => {
        const pushHistory = jest.fn();
        const { result } = renderHook(() => {
            const [loops, setLoops] = useState([{ id: 'part', points }]);
            const [cornerTool, setCornerTool] = useState<
                'fillet' | 'chamfer' | 'dogbone' | null
            >(null);
            const [cornerRadius, setCornerRadius] = useState(3);
            const commands = useCornerCommands({
                loops,
                setLoops,
                cornerTool,
                setCornerTool,
                cornerRadius,
                setCornerRadius,
                selectedLoops: () => loops,
                withIds: (items) =>
                    items.map((item) => ({ id: 'new', ...item })),
                formatLength: String,
                replaceSelection: jest.fn(),
                pushHistory,
                refreshBounds: jest.fn(),
                setSelected: jest.fn(),
                setStack: jest.fn(),
                setTransformMode: jest.fn(),
                setStatus: jest.fn(),
            });
            return { ...commands, loops };
        });
        act(() =>
            tool === 'fillet'
                ? result.current.handleFillet()
                : result.current.handleChamfer(),
        );
        act(() => result.current.handleCorner('part', 1));
        expect(result.current.pendingCorner).toMatchObject({ tool, index: 1 });
        expect(pushHistory).not.toHaveBeenCalled();
        act(() => {
            expect(result.current.confirmCorner(2)).toBe(true);
        });
        expect(pushHistory).toHaveBeenCalledTimes(1);
        expect(result.current.pendingCorner).toBeNull();
        expect(result.current.loops[0].points).not.toEqual(points);
        expect(result.current.loops[0].points).toContainEqual({ x: 0, y: 20 });
    },
);
