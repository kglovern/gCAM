/**
 * Purpose: React hook that owns the ArrangeWorkspaceState workflow.
 */
import { useState } from 'react';

/** Controls shared by offset, nesting and corner operations. */
export function useArrangeWorkspaceState() {
    const [offsetAmount, setOffsetAmount] = useState(3);
    const [sheetW, setSheetW] = useState(300);
    const [sheetH, setSheetH] = useState(300);
    const [nestBorder, setNestBorder] = useState(5);
    const [nestSpacing, setNestSpacing] = useState(5);
    const [cornerRadius, setCornerRadius] = useState(3);
    const [cornerTool, setCornerTool] = useState<
        'fillet' | 'chamfer' | 'dogbone' | null
    >(null);
    return {
        offsetAmount,
        setOffsetAmount,
        sheetW,
        setSheetW,
        sheetH,
        setSheetH,
        nestBorder,
        setNestBorder,
        nestSpacing,
        setNestSpacing,
        cornerRadius,
        setCornerRadius,
        cornerTool,
        setCornerTool,
    };
}
