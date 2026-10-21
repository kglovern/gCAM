import { useVisualViewportHeight } from './hooks/useVisualViewportHeight';
/**
 * Purpose: Implementation module for App in the react domain.
 */
import { useState } from 'react';
import { fitSurfaceToStock } from './engine/surface-model';
import type { ViewLoop } from './canvas/types';
import { useConfirmation } from './components/ConfirmDialog';
import { useToasts } from './components/Toasts';
import { useAppKeyboardShortcuts } from './interactions/useAppKeyboardShortcuts';
import { useRotaryState } from './rotary/useRotaryState';
import { useGuideCommands } from './interactions/useGuideCommands';
import { useFileLoading } from './document/useFileLoading';
import { useArrangeCommands } from './interactions/useArrangeCommands';
import { useTransformCommands } from './interactions/useTransformCommands';
import { useCornerCommands } from './interactions/useCornerCommands';
import {
    type ToolpathStackEntry,
    useToolpathStack,
} from './toolpaths/useToolpathStack';
import { useToolpathPresentation } from './toolpaths/useToolpathPresentation';
import { formatLength as formatLengthValue } from './lib/units';
import { IMPORT_START_STATUS } from './lib/import';
import { DEFAULT_JOB_STOCK } from './job/stock';
import { machineProfileById } from './cutting-parameters/machines';
import { snapToGuides } from './lib/guides';
import { useSelectionFrame } from './interactions/useSelectionFrame';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppWorkspace } from './app/AppWorkspace';
import { AppHeader } from './app/AppHeader';
import { AppModalLayer } from './app/AppModalLayer';
import { useAppPreferences } from './app/useAppPreferences';
import { useDrawingWorkspaceState } from './app/useDrawingWorkspaceState';
import { useTransformWorkspaceState } from './app/useTransformWorkspaceState';
import { useArrangeWorkspaceState } from './app/useArrangeWorkspaceState';
import { usePreviewState } from './app/usePreviewState';
import { useVisibleSelection } from './interactions/useVisibleSelection';
import { useDocumentWorkspace } from './document/useDocumentWorkspace';
import type { PlacedBitmapRecord } from './document/useBitmapCommands';
import type { Guide } from './lib/guides';
import { useCadInspector } from './interactions/useCadInspector';
import { useEditorLifecycle } from './app/useEditorLifecycle';
import { createToolbarProps } from './app/createToolbarProps';
import { createWorkspaceModel } from './app/createWorkspaceModel';
import { useDocumentEditingCommands } from './app/useDocumentEditingCommands';

type StackEntry = ToolpathStackEntry;
type PlacedBitmap = PlacedBitmapRecord;

/**
 * gCAM React shell — gSender visual language (robin/blue palette, dark slate
 * chrome, compact panels) with the gCAM workflow: import → select → toolpath
 * stack → combined export for gSender.
 */
export default function App() {
    useVisualViewportHeight();
    const drawing = useDrawingWorkspaceState();
    const transforms = useTransformWorkspaceState();
    const arrange = useArrangeWorkspaceState();
    const previews = usePreviewState();
    const {
        activeTool,
        setActiveTool,
        emptyStateDismissed,
        setEmptyStateDismissed,
        bitmapImportChoice,
        setBitmapImportChoice,
        pendingTraceBitmap,
        setPendingTraceBitmap,
        traceOpen,
        setTraceOpen,
        tabMode,
        setTabMode,
        drawTool,
        setDrawTool,
        drawSides,
        drawPolygonMode,
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
    } = drawing;
    const {
        moveX,
        setMoveX,
        moveY,
        setMoveY,
        rotateDeg,
        setRotateDeg,
        sizeW,
        setSizeW,
        sizeH,
        setSizeH,
        aspectLock,
        setAspectLock,
        transformMode,
        setTransformMode,
        moveAfterCloneRef,
    } = transforms;
    const {
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
    } = arrange;
    const {
        draftPreview,
        setDraftPreview,
        offsetPreview,
        setOffsetPreview,
        booleanPreview,
        setBooleanPreview,
        draftProgress,
        setDraftProgress,
    } = previews;
    const [viewportCommand, setViewportCommand] = useState<{
        type: 'fit' | 'zoomIn' | 'zoomOut';
        token: number;
    }>();
    const [preserveViewToken, setPreserveViewToken] = useState(0);
    const {
        grid,
        setGrid,
        sideTab,
        setSideTab,
        previewControls,
        setPreviewControls,
        configActions,
        setConfigActions,
        darkMode,
        setDarkMode,
        emitArcs,
        setEmitArcs,
        units,
        setUnits,
        machineProfileId,
        setMachineProfileId,
        machineSetupOpen,
        setMachineSetupOpen,
        machineTravelLimits,
        setMachineTravelLimits,
    } = useAppPreferences();
    const formatLength = (valueMm: number, decimals = 2) =>
        formatLengthValue(valueMm, units, decimals);
    const [status, setStatus] = useState(IMPORT_START_STATUS);
    const document = useDocumentWorkspace({
        initialStock: {
            ...DEFAULT_JOB_STOCK,
            widthMm:
                machineTravelLimits.maxXTravelMm ?? DEFAULT_JOB_STOCK.widthMm,
            heightMm:
                machineTravelLimits.maxYTravelMm ?? DEFAULT_JOB_STOCK.heightMm,
        },
        setStatus,
        setDraftPreview,
        setBitmapImportChoice,
        onFitView: () => setViewportCommand({ type: 'fit', token: Date.now() }),
    });
    const {
        bounds,
        setBounds,
        fileName,
        setFileName,
        fileRef,
        projectRef,
        loops,
        setLoops,
        selected,
        setSelected,
        hidden,
        setHidden,
        stack,
        setStack,
        bitmaps,
        setBitmaps,
        guides,
        setGuides,
        stock,
        setStock,
        pushHistory,
        restore,
        undoDocument,
        redoDocument,
        canUndo,
        canRedo,
        newLoopId,
        withIds,
        refreshBounds,
        importVector,
        handleBitmapFile,
        commitBitmapPlacement,
        updateSurfaceSetupOrientation,
        unitImportChoice,
        resolveUnitImport,
        cancelUnitImport,
        surfaceUnitImportChoice,
        resolveSurfaceModelUnits,
        cancelSurfaceModelUnits,
        commitTraced,
        isBitmapFile,
    } = document;
    // Toolpath being edited back in the form (legacy edit flow).
    const [editingId, setEditingId] = useState<string | null>(null);
    const { toasts, showToast, dismiss: dismissToast } = useToasts();
    const { confirm, dialog: confirmDialog } = useConfirmation();
    const { expandedSelectedIds, selectedLoops, offsetSource, booleanLoops } =
        useVisibleSelection(loops, selected, hidden);
    const rotary = useRotaryState();

    const undo = () => {
        if (sideTab === 'rotary') {
            rotary.undo();
            setStatus('Undone.');
            return;
        }
        if (!undoDocument()) return;
        setStatus('Undone.');
    };

    const redo = () => {
        if (sideTab === 'rotary') {
            rotary.redo();
            setStatus('Redone.');
            return;
        }
        if (!redoDocument()) return;
        setStatus('Redone.');
    };

    const { selectionFrame, orientRef } = useSelectionFrame({
        loops,
        selected,
        hidden,
        selectedLoops,
        setMoveX,
        setMoveY,
        setSizeW,
        setSizeH,
        setRotateDeg,
    });

    const {
        handleResult,
        handleUpdateResult,
        rebuildEntryTabs,
        handlePlaceTab,
        handleMoveTab,
        handleDeleteTab,
    } = useToolpathStack({
        stack,
        setStack,
        setSelected,
        pushHistory,
        setStatus,
        setDraftPreview,
        setDraftProgress,
        setEditingId,
        showToast,
    });

    const traceTarget =
        selected.length === 1 ? (selectedLoops()[0]?.bitmapId ?? null) : null;
    const traceBitmap = bitmaps.find((b) => b.id === traceTarget) ?? null;
    const traceSource = pendingTraceBitmap?.entry ?? traceBitmap;
    const traceImg = traceSource?.img ?? null;

    const {
        inspectorPreview,
        inspector: buildInspector,
        show: showInspector,
        canShowProperties,
    } = useCadInspector({
        selected,
        selectedLoops,
        transformMode,
        orientRef,
        newLoopId,
        pushHistory,
        refreshBounds,
        setLoops,
        setSelected,
        setStack,
        setDraftPreview,
        setStatus,
    });

    const [loadingSample, setLoadingSample] = useState(false);
    const { handleFiles, handleLoadSample } = useFileLoading({
        isBitmapFile,
        loadBitmap: handleBitmapFile,
        isSurfaceModelFile: (file) => /\.(stl|obj)$/i.test(file.name),
        loadSurfaceModel: document.handleSurfaceModelFile,
        importVector,
        setStatus,
        setLoadingSample,
    });

    const { handleFillet, handleDogbone, handleCorner, handleChamfer } =
        useCornerCommands<ViewLoop, StackEntry>({
            loops,
            cornerRadius,
            cornerTool,
            selectedLoops,
            withIds,
            formatLength,
            replaceSelection: (items, note) => replaceSelection(items, note),
            pushHistory,
            refreshBounds,
            setLoops,
            setSelected,
            setStack,
            setCornerTool,
            setTransformMode,
            setStatus,
        });

    const {
        applyAbsoluteMove,
        applyAbsoluteRotate,
        applyAbsoluteSize,
        setSizeWLocked,
        setSizeHLocked,
        handleTransformCommit,
    } = useTransformCommands<ViewLoop, StackEntry, PlacedBitmap>({
        selectionFrame,
        selectedLoops,
        moveX,
        moveY,
        rotateDeg,
        sizeW,
        sizeH,
        aspectLock,
        orientRef,
        formatLength,
        pushHistory,
        refreshBounds,
        setLoops,
        setBitmaps,
        setStack,
        setDraftPreview,
        setTransformMode,
        setPreserveViewToken,
        setStatus,
        setRotateDeg,
        setSizeW,
        setSizeH,
    });

    const { startGuidePlacement, placeGuide, handleDeleteGuide } =
        useGuideCommands({
            pushHistory,
            setGuides,
            setGuidePlacement,
            setGuideDraft: drawing.setGuideDraft,
            setStatus,
        });

    const { handleNest, handleBoolean, handleOffset, replaceSelection } =
        useArrangeCommands<ViewLoop, StackEntry>({
            loops,
            selected,
            offsetAmount,
            sheetW,
            sheetH,
            nestBorder,
            nestSpacing,
            selectedLoops,
            expandedSelectedIds,
            withIds,
            formatLength,
            pushHistory,
            refreshBounds,
            setLoops,
            setSelected,
            setStack,
            setDraftPreview,
            setOffsetPreview,
            setStatus,
        });

    const {
        handleExportProject,
        handleImportProject,
        handleTrimAt,
        handleTrimStroke,
        handleCommitLoop,
        handleCommitText,
        handleDeleteLoop,
        handleDeleteSelected,
        handleDuplicateSelected,
        handleGroup,
        handleUngroup,
        canGroup,
        canUngroup,
        handleNewCanvas,
    } = useDocumentEditingCommands({
        document,
        drawing,
        transforms,
        expandedSelectedIds,
        confirm,
        setStatus,
        onFitView: () => setViewportCommand({ type: 'fit', token: Date.now() }),
        setDraftPreview,
        setEmptyStateDismissed,
        setDraftProgress,
        setOffsetPreview,
        setBooleanPreview,
        setEditingId,
        rotaryProject: rotary.snapshotProject(),
        onLoadRotaryProject: (slice) => {
            if (rotary.restoreProject(slice)) {
                setStatus('Loaded rotary setup.');
            }
        },
    });

    const { editingEntry, preview, tabMarkers, gcode, previewToolpaths } =
        useToolpathPresentation({
            stack,
            editingId,
            fileName,
            emitArcs,
            units,
        });

    useEditorLifecycle({
        textAnchor,
        clearTextAnchor: () => setTextAnchor(null),
        loops,
        selected,
        moveAfterCloneRef,
        setTransformMode,
    });

    useAppKeyboardShortcuts({
        hasSelection: selected.length > 0,
        setActiveTool: () => setActiveTool('select'),
        clearTransform: () => setTransformMode(null),
        clearGuidePlacement: () => {
            setGuidePlacement(null);
            drawing.setGuideDraft(null);
        },
        fitViewport: () =>
            setViewportCommand({ type: 'fit', token: Date.now() }),
        undo,
        redo,
        // Rotary owns its keys (SVG editor) and its undo stack: the global
        // 2.5D delete/duplicate must not fire while that tab is focused.
        deleteSelected: sideTab === 'rotary' ? () => {} : handleDeleteSelected,
        duplicateSelected:
            sideTab === 'rotary' ? () => {} : handleDuplicateSelected,
    });

    const toolbarProps = createToolbarProps({
        units,
        drawing,
        transforms,
        arrange,
        loops,
        selected,
        guides,
        offsetSource,
        booleanSource: booleanLoops,
        canUndo,
        canRedo,
        canGroup,
        canUngroup,
        traceAvailable: traceImg !== null,
        darkMode,
        snapToGrid: grid.snap,
        fileRef,
        projectRef,
        setGrid,
        setSideTab,
        setDarkMode,
        setViewportCommand,
        setOffsetPreview,
        setBooleanPreview,
        actions: {
            applyMove: applyAbsoluteMove,
            applyRotate: applyAbsoluteRotate,
            applyScale: applyAbsoluteSize,
            setSizeW: setSizeWLocked,
            setSizeH: setSizeHLocked,
            applyFillet: handleFillet,
            applyChamfer: handleChamfer,
            applyDogbone: handleDogbone,
            applyOffset: handleOffset,
            applyBoolean: handleBoolean,
            applyNest: handleNest,
            addGuide: () => {
                drawing.setDrawTool(null);
                drawing.setActiveTool('select');
                startGuidePlacement();
            },
            deleteGuide: handleDeleteGuide,
            duplicate: handleDuplicateSelected,
            deleteSelected: handleDeleteSelected,
            trace: () => setTraceOpen(true),
            undo,
            redo,
            exportProject: handleExportProject,
            importProject: () => projectRef.current?.click(),
            newCanvas: handleNewCanvas,
            group: handleGroup,
            ungroup: handleUngroup,
        },
    });

    const inspector = buildInspector(units);
    const toolpathRailProps = {
        onStockThickness: (thicknessMm: number) => {
            if (
                !Number.isFinite(thicknessMm) ||
                thicknessMm <= 0 ||
                thicknessMm === stock.thicknessMm
            )
                return;
            pushHistory();
            setStock((current) => ({ ...current, thicknessMm }));
        },
        onFitSurface: (id: string, mode: 'uniform' | 'z') => {
            const bitmap = bitmaps.find((item) => item.id === id);
            if (!bitmap?.surfaceMesh) return;
            const fitted = fitSurfaceToStock(bitmap, stock.thicknessMm, mode);
            pushHistory();
            setBitmaps((current) =>
                current.map((item) => (item.id === id ? fitted : item)),
            );
            if (mode === 'uniform') {
                const ratio = fitted.w / bitmap.w;
                const cx = bitmap.x + bitmap.w / 2;
                const cy = bitmap.y + bitmap.h / 2;
                setLoops((current) =>
                    current.map((loop) =>
                        loop.bitmapId === id
                            ? {
                                  ...loop,
                                  points: loop.points.map((point) => ({
                                      x: cx + (point.x - cx) * ratio,
                                      y: cy + (point.y - cy) * ratio,
                                  })),
                              }
                            : loop,
                    ),
                );
            }
            setStatus(
                mode === 'uniform'
                    ? 'Model scaled in XYZ to fit stock thickness.'
                    : 'Model height scaled to fit stock; XY size preserved.',
            );
        },
        loops,
        selected,
        bitmaps,
        stack,
        gcode,
        fileName,
        units,
        emitArcs,
        machineProfileId,
        machineTravelLimits,
        stock,
        setStock,
        editingId,
        editingEntry,
        tabMode,
        setTabMode,
        setEditingId,
        setStack,
        setSideTab,
        setStatus,
        setDraftPreview,
        setDraftProgress,
        onResult: handleResult,
        onUpdate: handleUpdateResult,
        rebuildEntryTabs,
        confirm,
        showToast,
        onImportFile: () => fileRef.current?.click(),
    };
    const previewWorkspaceProps = {
        toolpaths: previewToolpaths,
        gcode,
        fileName,
        darkMode,
        stock,
        onPreviewControlsChange: setPreviewControls,
    };
    const handleMachineProfileChange = (id: string) => {
        const next = machineProfileById(id);
        const matchesCurrentBed =
            machineTravelLimits.maxXTravelMm !== null &&
            machineTravelLimits.maxYTravelMm !== null &&
            Math.abs(stock.widthMm - machineTravelLimits.maxXTravelMm) <
                0.001 &&
            Math.abs(stock.heightMm - machineTravelLimits.maxYTravelMm) < 0.001;
        if (next && matchesCurrentBed) {
            pushHistory();
            setStock((current) => ({
                ...current,
                widthMm: next.maxXTravelMm,
                heightMm: next.maxYTravelMm,
            }));
        }
        setMachineProfileId(id);
    };
    const handleFirstMachineChoose = (
        id: string,
        limits: typeof machineTravelLimits,
    ) => {
        const matchesCurrentBed =
            machineTravelLimits.maxXTravelMm !== null &&
            machineTravelLimits.maxYTravelMm !== null &&
            Math.abs(stock.widthMm - machineTravelLimits.maxXTravelMm) <
                0.001 &&
            Math.abs(stock.heightMm - machineTravelLimits.maxYTravelMm) < 0.001;
        if (matchesCurrentBed) {
            pushHistory();
            setStock((current) => ({
                ...current,
                widthMm: limits.maxXTravelMm ?? current.widthMm,
                heightMm: limits.maxYTravelMm ?? current.heightMm,
            }));
        }
        setMachineProfileId(id);
        setMachineTravelLimits(limits);
        setMachineSetupOpen(false);
    };
    const configPanelProps = {
        darkMode,
        onDarkModeChange: setDarkMode,
        grid,
        onGridChange: setGrid,
        emitArcs,
        onEmitArcsChange: setEmitArcs,
        units,
        onUnitsChange: setUnits,
        machineProfileId,
        onMachineProfileChange: handleMachineProfileChange,
        machineTravelLimits,
        onMachineTravelLimitsChange: setMachineTravelLimits,
        onActionsChange: setConfigActions,
    };
    const workspaceModel = createWorkspaceModel({
        activeTab: sideTab,
        onTabChange: setSideTab,
        drawing,
        transforms,
        arrange,
        previews,
        document,
        inspectorPreview,
        preview,
        tabMarkers,
        canvasActions: {
            onPlaceTab: handlePlaceTab,
            onMoveTab: handleMoveTab,
            onDeleteTab: handleDeleteTab,
            onPlaceGuide: placeGuide,
            onGuideDraftChange: drawing.setGuideDraft,
            onCancelGuide: () => {
                setGuidePlacement(null);
                drawing.setGuideDraft(null);
            },
            onDeleteGuide: handleDeleteGuide,
            onCommitLoop: handleCommitLoop,
            onPolygonSidesChange: drawing.setDrawSides,
            onPolygonModeChange: drawing.setDrawPolygonMode,
            onTrimAt: handleTrimAt,
            onTrimStroke: handleTrimStroke,
            onCommitText: (at) => setTextAnchor(snapToGuides(at, guides)),
            onTransformCommit: handleTransformCommit,
            onFilletCorner: handleCorner,
            onAdjustStock: () => {
                setSelected([]);
                setSideTab('toolpaths');
            },
            preserveViewToken,
            viewportCommand,
        },
        objectTreeActions: {
            onToggleHidden: (id) => {
                pushHistory();
                setHidden((current) =>
                    current.includes(id)
                        ? current.filter((hiddenId) => hiddenId !== id)
                        : [...current, id],
                );
            },
            onDelete: handleDeleteLoop,
            onGroup: toolbarProps.onGroup,
            onUngroup: toolbarProps.onUngroup,
            canGroup: toolbarProps.canGroup,
            canUngroup: toolbarProps.canUngroup,
            onEdit: showInspector,
            onMove: () => setTransformMode('move'),
            onResize: () => setTransformMode('scale'),
            onClose: () => setTreeOpen(false),
        },
        showEmptyState:
            !loops.length && !emptyStateDismissed && activeTool !== 'draw',
        onNewCanvas: handleNewCanvas,
        onImport: () => fileRef.current?.click(),
        onLoadSample: () => void handleLoadSample(),
        loadingSample,
        status,
        onDropFiles: (files) => void handleFiles(files),
        inspector,
        canShowProperties,
        onShowProperties: showInspector,
        toolpathRailProps,
        previewWorkspaceProps,
        configPanelProps,
        rotaryPanelProps: { units, rotary },
    });

    return (
        <ErrorBoundary>
            <div className="h-screen [height:var(--app-height,100dvh)] w-full overflow-hidden [padding-bottom:env(safe-area-inset-bottom)] [padding-left:env(safe-area-inset-left)] [padding-right:env(safe-area-inset-right)] flex flex-col bg-slate-100 text-slate-900 dark:bg-dark-darker dark:text-slate-200">
                <AppHeader
                    activeTab={sideTab}
                    toolbarProps={toolbarProps}
                    previewControls={previewControls}
                    configActions={configActions}
                />

                <input
                    ref={fileRef}
                    type="file"
                    accept=".dxf,.svg,.png,.jpg,.jpeg,.webp,.bmp,.stl,.obj"
                    className="hidden"
                    aria-label="Import drawing file"
                    onChange={(event) => {
                        void handleFiles(event.currentTarget.files);
                        event.currentTarget.value = '';
                    }}
                />
                <input
                    ref={projectRef}
                    type="file"
                    accept=".gcam,.json,application/json"
                    className="hidden"
                    aria-label="Import project file"
                    onChange={(event) => {
                        void handleImportProject(event.currentTarget.files);
                        event.currentTarget.value = '';
                    }}
                />

                <AppWorkspace model={workspaceModel} />
                <AppModalLayer
                    units={units}
                    machineSetupOpen={machineSetupOpen}
                    machineProfileId={machineProfileId}
                    onChooseMachine={handleFirstMachineChoose}
                    textAnchor={textAnchor}
                    drawText={drawText}
                    drawFont={drawFont}
                    drawTextHeight={drawTextHeight}
                    setDrawText={setDrawText}
                    setDrawFont={setDrawFont}
                    setDrawTextHeight={setDrawTextHeight}
                    onCommitText={handleCommitText}
                    setTextAnchor={setTextAnchor}
                    setStatus={setStatus}
                    toasts={toasts}
                    dismissToast={dismissToast}
                    confirmation={confirmDialog}
                    bitmapImportChoice={bitmapImportChoice}
                    commitBitmapPlacement={commitBitmapPlacement}
                    updateSurfaceSetupOrientation={
                        updateSurfaceSetupOrientation
                    }
                    setBitmapImportChoice={setBitmapImportChoice}
                    setPendingTraceBitmap={setPendingTraceBitmap}
                    traceOpen={traceOpen}
                    setTraceOpen={setTraceOpen}
                    traceSource={traceSource}
                    fileName={fileName}
                    commitTraced={commitTraced}
                    vectorUnitImportChoice={unitImportChoice}
                    resolveVectorUnits={resolveUnitImport}
                    cancelVectorUnits={cancelUnitImport}
                    surfaceUnitImportChoice={surfaceUnitImportChoice}
                    resolveSurfaceModelUnits={resolveSurfaceModelUnits}
                    cancelSurfaceModelUnits={cancelSurfaceModelUnits}
                />
            </div>
        </ErrorBoundary>
    );
}
