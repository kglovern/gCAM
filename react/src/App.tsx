import { resolveLinkedImageMask } from './lib/image-mask';
import { flattenedImageDocument } from './lib/flatten-image-document';
import { PathRepairPanel } from './components/PathRepairPanel';
import { ArrangePanel } from './components/ArrangePanel';
import { PatternPanel } from './components/PatternPanel';
import {
    applyArtworkPattern,
    type PatternSettings,
} from './lib/pattern-artwork';
import {
    assertLayoutSourcesUnchanged,
    type LayoutSource,
} from './lib/arrange-artwork';
import { isOpenShape } from './lib/path-repair';
import { VectorBitmapPanel } from './components/VectorBitmapPanel';
import {
    assertArtworkSourcesUnchanged,
    laserFillShapeIds,
    operationsTouchingShapes,
} from './lib/vector-bitmap-document';
import { createDocumentId } from './lib/ids';
import { SvgRasterImportModal } from './document/SvgRasterImportModal';
import { GeneratorModal } from './draw/GeneratorModal';
import { MandalaModal } from './draw/MandalaModal';
import { useVisualViewportHeight } from './hooks/useVisualViewportHeight';
/**
 * Purpose: Implementation module for App in the react domain.
 */
import { useState, useMemo, useRef, type ComponentProps } from 'react';
import type { ToolpathRail } from './toolpaths/ToolpathRail';
import { fitSurfaceToStock } from './engine/surface-model';
import type { ViewLoop } from './canvas/types';
import { useConfirmation } from './components/ConfirmDialog';
import { useToasts } from './components/Toasts';
import { useAppKeyboardShortcuts } from './interactions/useAppKeyboardShortcuts';
import { useRotaryExport } from './rotary/components/useRotaryExport';
import { useRotaryState } from './rotary/useRotaryState';
import { useGuideCommands } from './interactions/useGuideCommands';
import { useFileLoading } from './document/useFileLoading';
import { useArrangeCommands } from './interactions/useArrangeCommands';
import { useTransformCommands } from './interactions/useTransformCommands';
import { CornerSizeDialog } from './components/CornerSizeDialog';
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
import { UpdateControls } from './platform/updates/UpdateControls';
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
 * gCAM React shell â€” gSender visual language (robin/blue palette, dark slate
 * chrome, compact panels) with the gCAM workflow: import â†’ select â†’ toolpath
 * stack â†’ combined export for gSender.
 */
export default function App() {
    useVisualViewportHeight();
    const svgImageRef = useRef<HTMLInputElement>(null);
    const [svgRasterFile, setSvgRasterFile] = useState<File | null>(null);
    const [mandalaAnchor, setMandalaAnchor] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [bitmapSource, setBitmapSource] = useState<{
        shapes: import('./canvas/types').ViewLoop[];
        fillIds: string[];
    } | null>(null);
    const [repairKind, setRepairKind] = useState<
        'join' | 'duplicates' | 'simplify'
    >('join');
    const [repairSource, setRepairSource] = useState<ViewLoop[] | null>(null);
    const [layoutSource, setLayoutSource] = useState<LayoutSource | null>(null);
    const [patternSource, setPatternSource] = useState<{
        shapes: ViewLoop[];
        kind: PatternSettings['kind'];
    } | null>(null);
    const [generator, setGenerator] = useState<'clock' | null>(null);
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
        configActions,
        setConfigActions,
        darkMode,
        setDarkMode,
        emitArcs,
        setEmitArcs,
        outputSettings,
        setOutputSettings,
        units,
        setUnits,
        machineProfileId,
        setMachineProfileId,
        machineSetupOpen,
        setMachineSetupOpen,
        machineTravelLimits,
        setMachineTravelLimits,
        multipleSelection,
        setMultipleSelection,
    } = useAppPreferences();
    const formatLength = (valueMm: number, decimals = 2) =>
        formatLengthValue(valueMm, units, decimals);
    const [status, setStatus] = useState(IMPORT_START_STATUS);
    const defaultStock = {
        ...DEFAULT_JOB_STOCK,
        widthMm: machineTravelLimits.maxXTravelMm ?? DEFAULT_JOB_STOCK.widthMm,
        heightMm:
            machineTravelLimits.maxYTravelMm ?? DEFAULT_JOB_STOCK.heightMm,
    };
    const document = useDocumentWorkspace({
        initialStock: defaultStock,
        laserWorkspace: sideTab === 'laser',
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
    const rotary = useRotaryState(outputSettings);
    const rotaryOutput = useRotaryExport(rotary);
    const [newRotaryProject] = useState(() => rotary.snapshotProject());
    const [simulationSource, setSimulationSource] = useState<
        'toolpaths' | 'rotary' | 'laser'
    >('toolpaths');

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

    const traceSelection = selectedLoops();
    const traceTarget =
        selected.length === 1 &&
        traceSelection.length === 1 &&
        expandedSelectedIds().length === 1
            ? (traceSelection[0].bitmapId ?? null)
            : null;
    const traceBitmap = bitmaps.find((b) => b.id === traceTarget) ?? null;
    const traceSource = traceBitmap;
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
        cancelPendingImport: cancelUnitImport,
        isBitmapFile,
        loadBitmap: handleBitmapFile,
        isSurfaceModelFile: (file) => /\.(stl|obj)$/i.test(file.name),
        loadSurfaceModel: document.handleSurfaceModelFile,
        importVector,
        setStatus,
        setLoadingSample,
    });

    const {
        handleFillet,
        handleDogbone,
        handleCorner,
        handleChamfer,
        pendingCorner,
        confirmCorner,
        cancelCorner,
    } = useCornerCommands<ViewLoop, StackEntry>({
        loops,
        cornerRadius,
        setCornerRadius: arrange.setCornerRadius,
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

    const {
        handleNest,
        handleBoolean,
        handleOffset,
        replaceSelection,
        nestProgress,
        nestPreview,
        nestAttempt,
        stopNest,
        cancelNest,
    } = useArrangeCommands<ViewLoop, StackEntry>({
        loops,
        selected,
        offsetAmount,
        sheetW,
        sheetH,
        nestBorder,
        nestSpacing,
        nestRotation: arrange.nestRotation,
        stockOrigin: stock.origin,
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
        defaultStock,
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
        outputUnits: units,
        onLoadOutputUnits: setUnits,
        outputSettings,
        onLoadOutputSettings: (settings) => {
            setOutputSettings(settings);
            setEmitArcs(settings.arcs);
        },
        onLoadRotaryProject: (slice) => {
            if (rotary.restoreProject(slice)) {
                setStatus('Loaded rotary setup.');
            }
        },
    });

    const laserWorkspace =
        sideTab === 'laser' ||
        (sideTab === 'preview' && simulationSource === 'laser');
    const workspaceStack = useMemo(
        () =>
            stack.filter(
                (entry) =>
                    String(entry.args.operation).startsWith('laser-') ===
                    laserWorkspace,
            ),
        [stack, laserWorkspace],
    );
    const {
        editingEntry,
        preview,
        tabMarkers,
        gcode,
        gcodeError,
        gcodeBusy,
        previewToolpaths,
    } = useToolpathPresentation({
        stockThicknessMm: stock.thicknessMm,
        maskLoops: loops,
        maskBitmaps: bitmaps,
        outputSettings,
        stack: workspaceStack,
        laserRotary: laserWorkspace ? stock.laserRotary : undefined,
        editingId,
        fileName,
        emitArcs,
        units,
    });

    useEditorLifecycle({
        textAnchor,
        clearTextAnchor: () => setTextAnchor(null),
        loops,
        moveAfterCloneRef,
        setTransformMode,
    });

    useAppKeyboardShortcuts({
        hasSelection: selected.length > 0,
        canNudge:
            sideTab !== 'rotary' &&
            activeTool === 'select' &&
            (!transformMode || transformMode === 'move') &&
            !guidePlacement,
        nudgeStep: units === 'imperial' ? 0.254 : 1,
        nudgeSelected: (dx, dy) =>
            handleTransformCommit({ type: 'move', dx, dy }, true),
        setActiveTool: () => {
            setActiveTool('select');
            setDrawTool(null);
        },
        clearTransform: () => {
            setTransformMode(null);
            setCornerTool(null);
        },
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

    const baseToolbarProps = createToolbarProps({
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
        traceAvailable: traceImg !== null && !traceSource?.surfaceMesh,
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

    const patternIds = new Set(expandedSelectedIds());
    const patternShapes = loops.filter((s) => patternIds.has(s.id));
    const changeImageMask = (id: string, ids?: string[]) => {
        const bitmap = bitmaps.find((b) => b.id === id);
        if (!bitmap || bitmap.surfaceMesh)
            throw new Error('Select a bitmap image.');
        if (ids?.length)
            resolveLinkedImageMask({ ...bitmap, maskSourceIds: ids }, loops);
        if (
            JSON.stringify(bitmap.maskSourceIds ?? []) ===
            JSON.stringify(ids ?? [])
        )
            return;
        const sources = loops.filter((l) => l.bitmapId === id),
            affected = new Set(operationsTouchingShapes(stack, sources));
        pushHistory();
        setBitmaps((current) =>
            current.map((b) =>
                b.id === id
                    ? {
                          ...b,
                          maskSourceIds: ids?.length ? [...ids] : undefined,
                      }
                    : b,
            ),
        );
        setStack((current) => current.filter((e) => !affected.has(e)));
        if (!ids?.length) setSelected(sources.map((l) => l.id));
        setEditingId(null);
        setDraftPreview([]);
        setStatus(
            ids?.length ? 'Image masked to shapes.' : 'Image mask released.',
        );
    };
    const imageSelections = booleanLoops.filter((l) => l.bitmapId);
    const selectedMaskImages =
        imageSelections.length === 0 && booleanLoops.length
            ? bitmaps.filter(
                  (b) =>
                      b.maskSourceIds?.length &&
                      booleanLoops.every((l) =>
                          b.maskSourceIds?.includes(l.id),
                      ),
              )
            : [];
    const editingImageId = !booleanLoops.length
        ? (
              editingEntry?.args.loops.find((l) => (l as ViewLoop).bitmapId) as
                  | ViewLoop
                  | undefined
          )?.bitmapId
        : undefined;
    const maskImage =
        imageSelections.length === 1
            ? bitmaps.find(
                  (b) => b.id === imageSelections[0].bitmapId && !b.surfaceMesh,
              )
            : selectedMaskImages.length === 1
              ? selectedMaskImages[0]
              : bitmaps.find((b) => b.id === editingImageId && !b.surfaceMesh);
    const maskShapeIds = booleanLoops
        .filter((l) => !l.bitmapId)
        .map((l) => l.id);
    let canMaskImage = false;
    if (maskImage && imageSelections.length === 1 && maskShapeIds.length) {
        try {
            resolveLinkedImageMask(
                { ...maskImage, maskSourceIds: maskShapeIds },
                loops,
            );
            canMaskImage = true;
        } catch {
            /* Only closed, supported shapes can mask an image. */
        }
    }
    const toolbarProps = {
        ...baseToolbarProps,
        ...(laserWorkspace
            ? {
                  canMaskImage,
                  hasImageMask: Boolean(maskImage?.maskSourceIds?.length),
                  onMaskImage: () => {
                      if (!maskImage || !canMaskImage) return;
                      try {
                          changeImageMask(maskImage.id, maskShapeIds);
                          baseToolbarProps.onSelectMode();
                          setSelected(imageSelections.map((l) => l.id));
                      } catch (e) {
                          setStatus((e as Error).message);
                      }
                  },
                  onEditMaskedImage: () => {
                      setSelected(
                          loops
                              .filter((l) => l.bitmapId === maskImage?.id)
                              .map((l) => l.id),
                      );
                      baseToolbarProps.onTransformMode('transform');
                      setStatus(
                          'Move, rotate or resize the image inside its mask.',
                      );
                  },
                  onEditMaskShapes: () => {
                      setSelected(maskImage?.maskSourceIds ?? []);
                      baseToolbarProps.onTransformMode('transform');
                      setStatus(
                          'Move, rotate or resize the mask shapes on the drawing.',
                      );
                  },
                  onReleaseImageMask: () => {
                      if (maskImage) changeImageMask(maskImage.id);
                  },
              }
            : {}),
        canPattern:
            patternShapes.length > 0 && patternShapes.every((s) => !s.bitmapId),
        onPattern: (kind: PatternSettings['kind']) => {
            baseToolbarProps.onSelectMode();
            setRepairSource(null);
            setBitmapSource(null);
            setLayoutSource(null);
            const shapes = patternShapes;
            if (!shapes.length || shapes.some((s) => s.bitmapId)) {
                setStatus('Select drawing shapes without images or 3D models.');
                return;
            }
            setPatternSource({
                shapes: JSON.parse(JSON.stringify(shapes)),
                kind,
            });
        },
        canArrange:
            new Set(
                booleanLoops.map((s) =>
                    s.groupId ? `group:${s.groupId}` : `shape:${s.id}`,
                ),
            ).size >= 2,
        onArrange: () => {
            setPatternSource(null);
            baseToolbarProps.onSelectMode();
            setRepairSource(null);
            setBitmapSource(null);
            const groups = new Set(
                    booleanLoops.flatMap((s) => (s.groupId ? [s.groupId] : [])),
                ),
                ids = new Set(booleanLoops.map((s) => s.id));
            const shapes = loops.filter(
                (s) => ids.has(s.id) || (s.groupId && groups.has(s.groupId)),
            );
            const bitmapIds = new Set(
                shapes.flatMap((s) => (s.bitmapId ? [s.bitmapId] : [])),
            );
            setLayoutSource(
                JSON.parse(
                    JSON.stringify({
                        shapes,
                        order: selected,
                        bitmaps: bitmaps
                            .filter((b) => bitmapIds.has(b.id))
                            .map(({ id, x, y, w, h, rotation, dataUrl }) => ({
                                id,
                                x,
                                y,
                                w,
                                h,
                                rotation,
                                dataUrl,
                            })),
                    }),
                ),
            );
        },
        onSelectOpenShapes: () => {
            const ids = loops
                .filter(
                    (loop) => !hidden.includes(loop.id) && isOpenShape(loop),
                )
                .map((loop) => loop.id);
            setSelected(ids);
            setStatus(`${ids.length} open shapes selected.`);
        },
        onDeleteDuplicates: () => {
            setPatternSource(null);
            setLayoutSource(null);
            baseToolbarProps.onSelectMode();
            setBitmapSource(null);
            setRepairKind('duplicates');
            const hiddenIds = new Set(hidden);
            setRepairSource(
                JSON.parse(
                    JSON.stringify(
                        loops.filter((loop) => !hiddenIds.has(loop.id)),
                    ),
                ),
            );
        },
        onRepairPaths: () => {
            setPatternSource(null);
            setLayoutSource(null);
            setRepairKind('join');
            baseToolbarProps.onSelectMode();
            setBitmapSource(null);
            setRepairSource(
                JSON.parse(
                    JSON.stringify(
                        booleanLoops.filter((loop) => !loop.bitmapId),
                    ),
                ),
            );
        },
        onSimplifyPaths: () => {
            setPatternSource(null);
            setLayoutSource(null);
            setRepairKind('simplify');
            baseToolbarProps.onSelectMode();
            setBitmapSource(null);
            setRepairSource(
                JSON.parse(
                    JSON.stringify(
                        booleanLoops.filter((loop) => !loop.bitmapId),
                    ),
                ),
            );
        },
        canRepairPaths: booleanLoops.some(isOpenShape),
        canConvertToBitmap:
            booleanLoops.length > 0 &&
            booleanLoops.every((loop) => !loop.bitmapId),
        onConvertToBitmap: laserWorkspace
            ? () => {
                  baseToolbarProps.onSelectMode();
                  setLayoutSource(null);
                  setPatternSource(null);
                  setRepairSource(null);
                  const shapes = JSON.parse(
                      JSON.stringify(booleanLoops),
                  ) as typeof booleanLoops;
                  setBitmapSource({
                      shapes,
                      fillIds: laserFillShapeIds(stack, shapes),
                  });
              }
            : undefined,
        onImportSvgImage: laserWorkspace
            ? () => svgImageRef.current?.click()
            : undefined,
        onDrawTool: (
            tool: Parameters<typeof baseToolbarProps.onDrawTool>[0],
        ) => {
            if (tool === 'clock') {
                arrange.setCornerTool(null);
                setGuidePlacement(null);
                setTransformMode(null);
                setDrawTool(null);
                setActiveTool('select');
                setGenerator(tool);
            } else {
                baseToolbarProps.onDrawTool(tool);
                if (tool === 'slot')
                    setStatus(
                        'Slot: pick the first end centre, second end centre, then width.',
                    );
                if (tool === 'ellipse')
                    setStatus(
                        'Ellipse: pick the centre, then set width and height.',
                    );
                if (tool === 'rounded-rectangle')
                    setStatus(
                        'Rounded rectangle: pick opposite corners; set the radius on the drawing.',
                    );
            }
        },
    };
    const inspector = buildInspector(units);
    const toolpathRailProps: ComponentProps<typeof ToolpathRail> = {
        onMaskLink: changeImageMask,
        onFlattenImage: (commit) => {
            const next = flattenedImageDocument(
                { loops, bitmaps, stack },
                commit,
                createDocumentId('bitmap'),
            );
            pushHistory();
            setLoops(next.loops);
            setBitmaps(next.bitmaps);
            setStack(next.stack);
            setSelected(next.selected);
            setEditingId(null);
            setDraftPreview([]);
            document.refreshBounds(next.loops);
            setStatus(
                `Flattened image region. ${next.removed} affected toolpath${next.removed === 1 ? '' : 's'} removed.`,
            );
        },
        outputSettings,
        gcodeError,
        gcodeBusy,
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
        stack: workspaceStack,
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
        setStack: (update) => {
            pushHistory();
            setStack((current) => {
                const visible = current.filter(
                    (entry) =>
                        String(entry.args.operation).startsWith('laser-') ===
                        laserWorkspace,
                );
                const next =
                    typeof update === 'function' ? update(visible) : update;
                return [
                    ...current.filter(
                        (entry) =>
                            String(entry.args.operation).startsWith(
                                'laser-',
                            ) !== laserWorkspace,
                    ),
                    ...next,
                ];
            });
        },
        setSideTab: (tab) =>
            setSideTab(tab === 'toolpaths' && laserWorkspace ? 'laser' : tab),
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
        outputSettings,
        units,
        machineTravelLimits,
        toolpaths: previewToolpaths,
        laserMax: outputSettings.laserMax,
        laserRotary: laserWorkspace ? stock.laserRotary : undefined,
        gcode,
        fileName,
        darkMode,
        stock,
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
        preferredUnits: typeof units,
    ) => {
        setUnits(preferredUnits);
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
        multipleSelection,
        onMultipleSelectionChange: setMultipleSelection,
        outputSettings,
        onOutputSettingsChange: setOutputSettings,
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
        artworkReview: Boolean(
            patternSource || layoutSource || repairSource || bitmapSource,
        ),
        nestPreview,
        nestAttempt,
        nesting: nestProgress
            ? { progress: nestProgress, onStop: stopNest, onCancel: cancelNest }
            : null,
        activeTab: sideTab,
        onTabChange: (tab) => {
            if (tab === 'toolpaths' || tab === 'rotary' || tab === 'laser')
                setSimulationSource(tab);
            setEditingId(null);
            setTabMode(false);
            setDraftPreview([]);
            setDraftProgress(null);
            setSideTab(tab);
        },
        simulationSource,
        drawing,
        transforms,
        arrange,
        previews,
        document,
        inspectorPreview,
        preview,
        tabMarkers,
        canvasActions: {
            onShowProperties: () => {
                setTransformMode(null);
                showInspector();
            },
            contextActions: {
                shortcuts: [
                    ...(toolbarProps.canGroup
                        ? [
                              {
                                  label: 'Group',
                                  run: () => toolbarProps.onGroup?.(),
                              },
                          ]
                        : []),
                    ...(toolbarProps.canUngroup
                        ? [
                              {
                                  label: 'Ungroup',
                                  run: () => toolbarProps.onUngroup?.(),
                              },
                          ]
                        : []),
                    ...(toolbarProps.canPattern
                        ? [
                              {
                                  label: 'Mirror…',
                                  run: () => toolbarProps.onPattern('mirror'),
                              },
                              {
                                  label: 'Fillet…',
                                  run: toolbarProps.onApplyFillet,
                              },
                              {
                                  label: 'Chamfer…',
                                  run: () => toolbarProps.onApplyChamfer?.(),
                              },
                              {
                                  label: 'Trim',
                                  run: () => toolbarProps.onTrim?.(),
                              },
                          ]
                        : []),
                    ...(toolbarProps.canArrange
                        ? [
                              {
                                  label: 'Arrange…',
                                  run: () => toolbarProps.onArrange?.(),
                              },
                          ]
                        : []),
                    ...(toolbarProps.canMaskImage
                        ? [
                              {
                                  label: 'Mask image to shapes',
                                  run: () => toolbarProps.onMaskImage?.(),
                              },
                          ]
                        : []),
                    ...(toolbarProps.hasImageMask
                        ? [
                              {
                                  label: 'Edit image inside mask',
                                  run: () => toolbarProps.onEditMaskedImage?.(),
                              },
                              {
                                  label: 'Edit mask shapes',
                                  run: () => toolbarProps.onEditMaskShapes?.(),
                              },
                              {
                                  label: 'Release image mask',
                                  run: () =>
                                      toolbarProps.onReleaseImageMask?.(),
                              },
                          ]
                        : []),
                ],
                trace: () => setTraceOpen(true),
                canTrace: traceImg !== null && !traceSource?.surfaceMesh,
                duplicate: handleDuplicateSelected,
                delete: handleDeleteSelected,
                transform: (mode) => {
                    setDrawTool(null);
                    setActiveTool('select');
                    arrange.setCornerTool(null);
                    setTransformMode(mode);
                },
            },
            onPlaceTab: handlePlaceTab,
            onMoveTab: handleMoveTab,
            onDeleteTab: handleDeleteTab,
            onPlaceGuide: placeGuide,
            onGuideDraftChange: (draft) => {
                if (draft) setGuidePlacement('edge');
                drawing.setGuideDraft(draft);
            },
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
            onCommitMandala: (at) => {
                setDrawTool(null);
                setActiveTool('select');
                setMandalaAnchor(snapToGuides(at, guides));
            },
            onTransformCommit: handleTransformCommit,
            onFilletCorner: handleCorner,
            onAdjustStock: () => {
                setSelected([]);
                setSideTab(laserWorkspace ? 'laser' : 'toolpaths');
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
        rotaryPanelProps: {
            output: rotaryOutput,
            units,
            rotary,
            darkMode,
            onPreview: () => {
                setSimulationSource('rotary');
                setSideTab('preview');
            },
            material: stock.material,
            machineProfileId,
            onMaterialChange: (material) =>
                setStock((previous) => ({ ...previous, material })),
        },
    });

    return (
        <ErrorBoundary>
            {patternSource && (
                <PatternPanel
                    key={patternSource.kind}
                    shapes={patternSource.shapes}
                    initialKind={patternSource.kind}
                    units={units}
                    onPreview={setOffsetPreview}
                    onClose={() => setPatternSource(null)}
                    onApply={(result) => {
                        const next = applyArtworkPattern(
                            loops,
                            patternSource.shapes,
                            result,
                            () => createDocumentId('shape'),
                        );
                        pushHistory();
                        setLoops(next.loops);
                        setSelected(next.selected);
                        if (next.changedSources.length)
                            setStack((current) => {
                                const affected = new Set(
                                    operationsTouchingShapes(
                                        current,
                                        next.changedSources,
                                    ),
                                );
                                return current.filter((e) => !affected.has(e));
                            });
                        setEditingId(null);
                        setDraftPreview([]);
                        setDraftProgress(null);
                        refreshBounds(next.loops);
                        setPatternSource(null);
                        setStatus(
                            result.replace
                                ? 'Mirrored selection.'
                                : `Added ${next.selected.length} shapes.`,
                        );
                    }}
                />
            )}
            {layoutSource && (
                <ArrangePanel
                    source={layoutSource}
                    stack={stack}
                    onClose={() => setLayoutSource(null)}
                    onPreview={setOffsetPreview}
                    onApply={(result) => {
                        assertLayoutSourcesUnchanged(
                            loops,
                            bitmaps,
                            layoutSource,
                        );
                        const updated = new Map(
                                result.shapes.map((s) => [s.id, s]),
                            ),
                            images = new Map(
                                result.bitmaps.map((b) => [b.id, b]),
                            );
                        const next = loops.map((s) => updated.get(s.id) ?? s);
                        const changed = new Set(result.changedIds);
                        const old = layoutSource.shapes.filter((s) =>
                            changed.has(s.id),
                        );
                        pushHistory();
                        setLoops(next);
                        setBitmaps((current) =>
                            current.map((b) => {
                                const moved = images.get(b.id);
                                return moved &&
                                    (moved.x !== b.x || moved.y !== b.y)
                                    ? { ...b, x: moved.x, y: moved.y }
                                    : b;
                            }),
                        );
                        setStack((current) => {
                            const affected = new Set(
                                operationsTouchingShapes(current, old),
                            );
                            return current.filter((e) => !affected.has(e));
                        });
                        setEditingId(null);
                        setDraftPreview([]);
                        setDraftProgress(null);
                        refreshBounds(next);
                        setLayoutSource(null);
                        setStatus(
                            `Arranged ${result.movedUnits} shapes or groups.`,
                        );
                    }}
                />
            )}
            {repairSource && (
                <PathRepairPanel
                    key={repairKind}
                    shapes={repairSource}
                    initialMode={repairKind}
                    stack={stack}
                    units={units}
                    onClose={() => setRepairSource(null)}
                    onPreview={setOffsetPreview}
                    onApply={(result) => {
                        assertArtworkSourcesUnchanged(loops, repairSource);
                        const sources = new Set(repairSource.map((s) => s.id)),
                            updated = new Map(
                                result.shapes.map((s) => [s.id, s]),
                            );
                        const next = loops.flatMap((loop) =>
                            sources.has(loop.id)
                                ? updated.has(loop.id)
                                    ? [updated.get(loop.id)!]
                                    : []
                                : [loop],
                        );
                        const changed = new Set(result.changedIds),
                            old = repairSource.filter((s) => changed.has(s.id));
                        pushHistory();
                        setLoops(next);
                        setSelected(
                            result.duplicates
                                ? result.duplicateKeepIds
                                : result.shapes.map((s) => s.id),
                        );
                        setStack((current) => {
                            const affected = new Set(
                                operationsTouchingShapes(current, old),
                            );
                            return current.filter(
                                (entry) => !affected.has(entry),
                            );
                        });
                        setDraftPreview([]);
                        refreshBounds(next);
                        setRepairSource(null);
                        setStatus(
                            repairKind === 'simplify'
                                ? `Simplified ${result.changedIds.length} shapes: ${result.pointsBefore} to ${result.pointsAfter} points.`
                                : result.duplicates
                                  ? `Removed ${result.duplicates} duplicate shapes.`
                                  : `${result.joined} joins; ${result.closed} shapes closed; ${result.remaining} open shapes remain.`,
                        );
                    }}
                />
            )}

            {bitmapSource && (
                <VectorBitmapPanel
                    shapes={bitmapSource.shapes}
                    fillIds={bitmapSource.fillIds}
                    onClose={() => setBitmapSource(null)}
                    onCommit={({ dataUrl, img, plan }, keep) => {
                        assertArtworkSourcesUnchanged(
                            loops,
                            bitmapSource.shapes,
                        );
                        const id = createDocumentId('bitmap');
                        const { minX: x, minY: y, maxX, maxY } = plan.bounds;
                        const added = document
                            .withIds([
                                {
                                    points: [
                                        { x, y },
                                        { x: maxX, y },
                                        { x: maxX, y: maxY },
                                        { x, y: maxY },
                                        { x, y },
                                    ],
                                },
                            ])
                            .map((loop) => ({ ...loop, bitmapId: id }));
                        const ids = new Set(
                            bitmapSource.shapes.map((shape) => shape.id),
                        );
                        const next = [
                            ...(keep
                                ? loops
                                : loops.filter((loop) => !ids.has(loop.id))),
                            ...added,
                        ];
                        pushHistory();
                        setBitmaps((current) => [
                            ...current,
                            {
                                id,
                                x,
                                y,
                                w: plan.widthMm,
                                h: plan.heightMm,
                                dataUrl,
                                img,
                            },
                        ]);
                        setLoops(next);
                        setSelected(added.map((loop) => loop.id));
                        if (!keep)
                            setStack((current) => {
                                const affected = new Set(
                                    operationsTouchingShapes(
                                        current,
                                        bitmapSource.shapes,
                                    ),
                                );
                                return current.filter(
                                    (entry) => !affected.has(entry),
                                );
                            });
                        refreshBounds(next);
                        setBitmapSource(null);
                        setStatus('Artwork converted to bitmap.');
                    }}
                />
            )}

            {generator && (
                <GeneratorModal
                    kind={generator}
                    units={units}
                    onClose={() => setGenerator(null)}
                    onAdd={(raw) => {
                        document.pushHistory();
                        const groupId = document.newLoopId();
                        const added = document.withIds(raw).map((loop) => ({
                            ...loop,
                            ...(generator === 'clock' ? { groupId } : {}),
                        }));
                        const next = [...loops, ...added];
                        setLoops(next);
                        setSelected(added.map((loop) => loop.id));
                        document.refreshBounds(next);
                        setViewportCommand({ type: 'fit', token: Date.now() });
                        setGenerator(null);
                    }}
                />
            )}
            {mandalaAnchor && (
                <MandalaModal
                    units={units}
                    onClose={() => setMandalaAnchor(null)}
                    onAdd={(raw) => {
                        document.pushHistory();
                        const groupId = document.newLoopId();
                        const added = document
                            .withIds(
                                raw.map((loop) => ({
                                    points: loop.points.map((p) => ({
                                        x: p.x + mandalaAnchor.x,
                                        y: p.y + mandalaAnchor.y,
                                    })),
                                })),
                            )
                            .map((loop) => ({ ...loop, groupId }));
                        const next = [...loops, ...added];
                        setLoops(next);
                        setSelected(added.map((loop) => loop.id));
                        document.refreshBounds(next);
                        setMandalaAnchor(null);
                    }}
                />
            )}

            <div className="h-screen [height:var(--app-height,100dvh)] w-full overflow-hidden [padding-bottom:env(safe-area-inset-bottom)] [padding-left:env(safe-area-inset-left)] [padding-right:env(safe-area-inset-right)] flex flex-col bg-slate-100 text-slate-900 dark:bg-dark-darker dark:text-slate-200">
                <UpdateControls notice />
                <AppHeader
                    activeTab={sideTab}
                    rotary={rotary}
                    toolbarProps={
                        sideTab === 'rotary'
                            ? {
                                  ...toolbarProps,
                                  onNewCanvas: async () => {
                                      if (
                                          await confirm({
                                              title: 'New rotary project?',
                                              message:
                                                  'Reset the rotary setup? You can undo this change.',
                                              confirmLabel: 'New project',
                                          })
                                      )
                                          rotary.restoreProject(
                                              newRotaryProject,
                                          );
                                  },
                              }
                            : toolbarProps
                    }
                    configActions={configActions}
                />

                <input
                    ref={svgImageRef}
                    type="file"
                    accept=".svg,image/svg+xml"
                    aria-label="Import SVG as image"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        if (file) {
                            cancelUnitImport();
                            setSvgRasterFile(file);
                        }
                        event.currentTarget.value = '';
                    }}
                />
                {svgRasterFile && (
                    <SvgRasterImportModal
                        key={svgRasterFile.name + svgRasterFile.lastModified}
                        file={svgRasterFile}
                        onImport={handleBitmapFile}
                        onClose={() => setSvgRasterFile(null)}
                    />
                )}
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
                    confirmation={
                        <>
                            {confirmDialog}
                            {pendingCorner && (
                                <CornerSizeDialog
                                    tool={pendingCorner.tool}
                                    initialSize={cornerRadius}
                                    units={units}
                                    onApply={confirmCorner}
                                    onCancel={cancelCorner}
                                />
                            )}
                        </>
                    }
                    bitmapImportChoice={bitmapImportChoice}
                    commitBitmapPlacement={commitBitmapPlacement}
                    updateSurfaceSetupOrientation={
                        updateSurfaceSetupOrientation
                    }
                    setBitmapImportChoice={setBitmapImportChoice}
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
