/**
 * Purpose: React hook that owns the DrawingWorkspaceState workflow.
 */
import { useState } from 'react';
import type { BitmapImportChoice } from '../document/useBitmapCommands';
import type { DrawTool } from '../draw/geometry';
import type { ViewLoop } from '../canvas/types';
import type { GuideDraft } from '../lib/guides';

/** UI-only state for drawing, bitmap import and canvas mode selection. */
export function useDrawingWorkspaceState() {
    const [activeTool, setActiveTool] = useState<
        'select' | 'draw' | 'trim' | 'preview'
    >('select');
    const [emptyStateDismissed, setEmptyStateDismissed] = useState(false);
    const [bitmapImportChoice, setBitmapImportChoice] =
        useState<BitmapImportChoice<ViewLoop> | null>(null);
    const [traceOpen, setTraceOpen] = useState(false);
    const [tabMode, setTabMode] = useState(false);
    const [drawTool, setDrawTool] = useState<DrawTool>(null);
    const [drawSides, setDrawSides] = useState(6);
    const [drawPolygonMode, setDrawPolygonMode] = useState<
        'inscribed' | 'circumscribed'
    >('inscribed');
    const [drawText, setDrawText] = useState('TEXT');
    const [drawTextHeight, setDrawTextHeight] = useState(20);
    const [drawFont, setDrawFont] = useState('single-line');
    const [textAnchor, setTextAnchor] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [treeOpen, setTreeOpen] = useState(false);
    const [guidePlacement, setGuidePlacement] = useState<'edge' | null>(null);
    const [guideDraft, setGuideDraft] = useState<GuideDraft | null>(null);

    return {
        activeTool,
        setActiveTool,
        emptyStateDismissed,
        setEmptyStateDismissed,
        bitmapImportChoice,
        setBitmapImportChoice,
        traceOpen,
        setTraceOpen,
        tabMode,
        setTabMode,
        drawTool,
        setDrawTool,
        drawSides,
        setDrawSides,
        drawPolygonMode,
        setDrawPolygonMode,
        drawText,
        setDrawText,
        drawTextHeight,
        setDrawTextHeight,
        drawFont,
        setDrawFont,
        textAnchor,
        setTextAnchor,
        treeOpen,
        setTreeOpen,
        guidePlacement,
        setGuidePlacement,
        guideDraft,
        setGuideDraft,
    };
}
