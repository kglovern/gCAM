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
test.each(['fillet', 'chamfer', 'dogbone'] as const)(
    '%s edits the picked corner and dogbone stays armed for repeated edits',
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
            return { ...commands, loops, cornerTool };
        });
        act(() =>
            tool === 'fillet'
                ? result.current.handleFillet()
                : tool === 'dogbone'
                  ? result.current.handleDogbone()
                  : result.current.handleChamfer(),
        );
        act(() => result.current.handleCorner('part', 1));
        if (tool !== 'dogbone') {
            expect(result.current.pendingCorner).toMatchObject({
                tool,
                index: 1,
            });
            expect(pushHistory).not.toHaveBeenCalled();
            act(() => {
                expect(result.current.confirmCorner(2)).toBe(true);
            });
        }
        expect(result.current.loops).toHaveLength(1);
        expect(result.current.loops[0].id).toBe('part');
        expect(pushHistory).toHaveBeenCalledTimes(1);
        expect(result.current.pendingCorner).toBeNull();
        expect(result.current.loops[0].points).not.toEqual(points);
        expect(result.current.loops[0].points).toContainEqual({ x: 0, y: 20 });
        if (tool === 'dogbone') {
            expect(result.current.cornerTool).toBe('dogbone');
            act(() => result.current.handleCorner('part', 0));
            expect(result.current.cornerTool).toBe('dogbone');
            expect(pushHistory).toHaveBeenCalledTimes(2);
            expect(result.current.loops).toHaveLength(1);
        }
    },
);
