import { act, renderHook } from '@testing-library/react';
import { useInspectorVisibility } from './useInspectorVisibility';
import { mockMediaQuery } from '../test-stubs/media-query';

let media: ReturnType<typeof mockMediaQuery>;
afterEach(() => media.restore());
test('touch selection highlights without properties; explicit open, close and reselection work', () => {
    media = mockMediaQuery(true);
    const { result, rerender } = renderHook(
        ({ id }) => useInspectorVisibility(id),
        { initialProps: { id: 'a' as string | null } },
    );
    expect(result.current.visible).toBe(false);
    act(() => result.current.open());
    expect(result.current.visible).toBe(true);
    act(() => result.current.close());
    expect(result.current.visible).toBe(false);
    act(() => result.current.open());
    expect(result.current.visible).toBe(true);
    rerender({ id: null });
    rerender({ id: 'a' });
    expect(result.current.visible).toBe(false);
});
test('desktop retains auto-open and responds to input/layout changes', () => {
    media = mockMediaQuery(false);
    const { result, rerender } = renderHook(
        ({ id }) => useInspectorVisibility(id),
        { initialProps: { id: 'a' } },
    );
    expect(result.current.visible).toBe(true);
    act(() => result.current.close());
    expect(result.current.visible).toBe(false);
    rerender({ id: 'b' });
    expect(result.current.visible).toBe(true);
    act(() => media.change(true));
    expect(result.current.visible).toBe(false);
});
