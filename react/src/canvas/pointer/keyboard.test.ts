import { jest } from '@jest/globals';
import { handleCanvasKeyDown } from './keyboard';

test('Delete removes the selected guide from the canvas', () => {
    const onDeleteGuide = jest.fn();
    const forceTick = jest.fn();
    const preventDefault = jest.fn();
    const selectedGuideRef = { current: 'guide-1' };
    const event = {
        key: 'Delete',
        preventDefault,
    } as unknown as React.KeyboardEvent<HTMLCanvasElement>;

    handleCanvasKeyDown(event, {
        viewRef: {
            current: {
                guidePlacement: null,
                guideDraft: null,
                transformMode: null,
                drawTool: null,
            },
        },
        clicksRef: { current: [] },
        cursorRef: { current: null },
        draftRef: { current: null },
        pendingAnchorRef: { current: null },
        selectedGuideRef,
        selectedTabRef: { current: null },
        transformDragRef: { current: null },
        onDeleteTab: jest.fn(),
        onDeleteGuide,
        onCancelGuide: jest.fn(),
        onGuideDraftChange: jest.fn(),
        onTransformCommit: jest.fn(),
        onCommitLoop: jest.fn(),
        forceTick,
    });

    expect(onDeleteGuide).toHaveBeenCalledWith('guide-1');
    expect(selectedGuideRef.current).toBeNull();
    expect(preventDefault).toHaveBeenCalled();
    expect(forceTick).toHaveBeenCalled();
});
