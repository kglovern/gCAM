/**
 * Purpose: Implementation module for ToolpathPanel in the react domain.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_MACHINE_PROFILE,
    machineProfileById,
} from '../cutting-parameters/machines';
import { recommendCuttingParameters } from '../cutting-parameters/recommend';
import { MATERIAL_RECIPES } from '../cutting-parameters/recipes';
import type {
    MachineTravelLimits,
    MaterialId,
    RotaryOperation,
} from '../cutting-parameters/types';
import type { ViewLoop } from '../canvas/types';
import {
    buildToolpathGcode,
    buildToolpathGcodeAsync,
    buildSurfaceToolpathResult,
    type Operation,
    type PlacedTab,
    type ProfileArgs,
    type RasterBitmap,
    type ToolpathResult,
} from '../lib/engine';
import { imageDataOf } from '../lib/bitmap';
import { UnitInput } from '../components/UnitInput';
import { isConfigured, loadSlots, type ToolSlot } from '../tools/library';
import { displayValue, type UnitSystem } from '../lib/units';
import { operationsForSelection } from './operationCatalog';
import { ToolpathOperationPicker } from './ToolpathOperationPicker';
import { TextureFields } from './TextureFields';
import { CuttingFields } from './CuttingFields';
import { RasterLaserFields } from './RasterLaserFields';
import { VBitRasterFields } from './VBitRasterFields';
import { ToolSelectionFields } from './ToolSelectionFields';
import { ToolpathFormAlerts } from './ToolpathFormAlerts';
import { ToolpathSubmitControls } from './ToolpathSubmitControls';
import { ToolpathEmptyState } from './ToolpathEmptyState';
import { CuttingRecipeFields } from './CuttingRecipeFields';
import type { JobStock } from '../job/stock';
import { generateSurfaceCamPaths } from '../engine/surface-cam-runner';
import { transformStoredSurfaceMesh } from '../engine/surface-model';
import { SurfaceCamFields } from './SurfaceCamFields';
import { getPaths, traceCanvas } from '../engine/potrace-js/index.js';
import { flattenTracedPaths } from '../lib/trace';

type DraftContour = { x: number; y: number }[] & {
    _intensity?: number;
    _solidPreview?: boolean;
};

function canvasDraftContours(
    contours: { x: number; y: number }[][],
    solid: boolean,
): DraftContour[] {
    if (!solid) return contours;
    return contours.map((points) =>
        Object.assign([...points], {
            _intensity: (points as DraftContour)._intensity,
            _solidPreview: true,
        }),
    );
}

/** Trace the transparent footprint of an STL heightmap into a movable profile contour. */
function surfaceFootprintLoops(bitmap: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    img?: HTMLImageElement;
}): ViewLoop[] {
    if (!bitmap.img || bitmap.w <= 0 || bitmap.h <= 0)
        throw new Error(
            'Could not trace the STL footprint. Re-import the model and try again.',
        );
    const width = bitmap.img.naturalWidth;
    const height = bitmap.img.naturalHeight;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    if (!sourceContext)
        throw new Error('Canvas is unavailable for tracing the STL footprint.');
    sourceContext.drawImage(bitmap.img, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const covered = pixels.data[i + 3] >= 32;
        const value = covered ? 0 : 255;
        pixels.data[i] = value;
        pixels.data[i + 1] = value;
        pixels.data[i + 2] = value;
        pixels.data[i + 3] = 255;
    }
    sourceContext.putImageData(pixels, 0, 0);
    const pixelLoops = flattenTracedPaths(
        getPaths(traceCanvas(source, { turdsize: 4, opttolerance: 0.15 })),
    );
    const radians = ((bitmap.rotation ?? 0) * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const centerX = bitmap.x + bitmap.w / 2;
    const centerY = bitmap.y + bitmap.h / 2;
    const loops = pixelLoops.map((points, index) => ({
        id: `${bitmap.id}-profile-${index}`,
        points: points.map((point) => {
            const x = bitmap.x + (point.x / width) * bitmap.w;
            const y = bitmap.y + bitmap.h - (point.y / height) * bitmap.h;
            const dx = x - centerX;
            const dy = y - centerY;
            return {
                x: centerX + dx * cosine - dy * sine,
                y: centerY + dx * sine + dy * cosine,
            };
        }),
    }));
    if (!loops.length)
        throw new Error('No STL footprint was found to profile.');
    return loops;
}

export const ToolpathPanel = memo(function ToolpathPanel({
    loops,
    selected,
    bitmaps,
    submitLabel,
    onResult,
    defaultArcs = true,
    onDraftPreview,
    onDraftProgress,
    editEntry = null,
    onUpdate,
    onCancelEdit,
    units = 'metric',
    machineProfileId = 'longmill-router',
    machineTravelLimits,
    stock,
    onStockThickness,
    onFitSurface,
}: {
    loops: ViewLoop[];
    selected: string[];
    bitmaps: {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        img?: HTMLImageElement;
        surfaceMesh?: import('../engine/surface-model').StoredSurfaceMesh;
        surfaceMachinableTopDown?: boolean;
    }[];
    submitLabel: string;
    onResult: (r: ToolpathResult, args: ProfileArgs) => void;
    defaultArcs?: boolean;
    onDraftPreview?: (contours: { x: number; y: number }[][] | null) => void;
    onDraftProgress?: (
        progress: { percent: number; label: string } | null,
    ) => void;
    editEntry?: {
        id: string;
        args: ProfileArgs;
        loops: ViewLoop[];
    } | null;
    onUpdate?: (id: string, r: ToolpathResult, args: ProfileArgs) => void;
    onCancelEdit?: () => void;
    units?: UnitSystem;
    machineProfileId?: string;
    machineTravelLimits: MachineTravelLimits;
    stock: JobStock;
    onStockThickness?: (value: number) => void;
    onFitSurface?: (id: string, mode: 'uniform' | 'z') => void;
}) {
    const [operation, setOperation] = useState<Operation>('profile-outside');
    const [toolDiameter, setToolDiameter] = useState(6);
    const [cutDepth, setCutDepth] = useState(stock.thicknessMm);
    const [countersinkHeadDiameter, setCountersinkHeadDiameter] = useState(8);
    const [autoCutDepth, setAutoCutDepth] = useState(true);
    const [trochoid, setTrochoid] = useState(false);
    const [engagement, setEngagement] = useState(10);
    const [helicalEntry, setHelicalEntry] = useState(false);
    const [laserFeed, setLaserFeed] = useState(3000);
    const [laserPower, setLaserPower] = useState(1000);
    const [laserSpot, setLaserSpot] = useState(0.2);
    const [laserGamma, setLaserGamma] = useState(1);
    const [laserOverscan, setLaserOverscan] = useState(2);
    const [wavySpacing, setWavySpacing] = useState(2);
    const [wavyShallow, setWavyShallow] = useState(0);
    const [wavyDeep, setWavyDeep] = useState(3);
    const [halftoneRes, setHalftoneRes] = useState(50);
    const [halftoneInvert, setHalftoneInvert] = useState(false);
    const [textureSpacing, setTextureSpacing] = useState(5);
    const [crosshatchAngle, setCrosshatchAngle] = useState(45);
    const [textureType, setTextureType] = useState<'voronoi' | 'crosshatch'>(
        'voronoi',
    );
    const [feedRate, setFeedRate] = useState(1800);
    const [plungeRate, setPlungeRate] = useState(600);
    const [spindle, setSpindle] = useState(18000);
    const [safeZ, setSafeZ] = useState(6);
    const [passDepth, setPassDepth] = useState(3);
    const [manualCuttingParams, setManualCuttingParams] = useState(false);
    const material: MaterialId = stock.material;
    const [arcs, setArcs] = useState(defaultArcs);
    const [toolNumber, setToolNumber] = useState(1);
    const [overlap, setOverlap] = useState(40);
    const [tabWidth, setTabWidth] = useState(9);
    const [tabHeight, setTabHeight] = useState(9);
    const [surfaceResolution, setSurfaceResolution] = useState(0.25);
    const [surfaceStepover, setSurfaceStepover] = useState(1.2);
    const [surfaceStepdown, setSurfaceStepdown] = useState(1.5);
    const [surfaceAllowance, setSurfaceAllowance] = useState(0.35);
    const [surfaceBoundary, setSurfaceBoundary] = useState(0);
    const [surfaceBoundaryMode, setSurfaceBoundaryMode] = useState<
        'model' | 'rectangle'
    >('model');
    const [autoTabHeight, setAutoTabHeight] = useState(true);
    const [laserSMin, setLaserSMin] = useState(0);
    const [laserSMax, setLaserSMax] = useState(1000);
    const [wavyFeed, setWavyFeed] = useState(1800);
    const [slots, setSlots] = useState<ToolSlot[]>(() =>
        typeof window === 'undefined' ? [] : loadSlots(window.localStorage),
    );
    const [slotNum, setSlotNum] = useState(1);
    const [toolLibOpen, setToolLibOpen] = useState(false);
    const [toolLibSlot, setToolLibSlot] = useState<number | null>(null);
    const surfaceAbortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setArcs(defaultArcs);
    }, [defaultArcs]);

    const applySlot = (slot: ToolSlot) => {
        if (slot.cuttingDiameterMm != null)
            setToolDiameter(slot.cuttingDiameterMm);
        setToolNumber(slot.slot);
    };
    const activeSlot = slots.find((s) => s.slot === slotNum) ?? null;
    const machine =
        machineProfileById(machineProfileId) ?? DEFAULT_MACHINE_PROFILE;
    const recipeOperation: RotaryOperation | null =
        operation === 'surface-clear' ||
        operation === 'surface-finish' ||
        operation === 'surface-waterline' ||
        operation === 'wavy-raster' ||
        operation === 'halftone' ||
        operation === 'chamfer' ||
        operation === 'countersink'
            ? 'engrave'
            : operation === 'laser-cut' || operation === 'laser-raster'
              ? null
              : operation;
    const recommendation = (() => {
        if (!activeSlot || !recipeOperation) return null;
        if (!(activeSlot.cuttingDiameterMm && activeSlot.flutes)) return null;
        try {
            return recommendCuttingParameters({
                material,
                machine,
                operation: recipeOperation,
                stockDepthMm: stock.thicknessMm,
                cutter: {
                    toolType: activeSlot.toolType,
                    diameterMm: activeSlot.cuttingDiameterMm,
                    flutes: activeSlot.flutes,
                    cuttingLengthMm: activeSlot.cuttingLengthMm,
                    cutterMaterial: activeSlot.cutterMaterial ?? undefined,
                    fluteAngleDeg: activeSlot.fluteAngleDeg,
                },
            });
        } catch {
            return null;
        }
    })();
    const cutterAngle = activeSlot?.fluteAngleDeg ?? 90;
    const NEEDS_VBIT: Operation[] = [
        'vcarve',
        'countersink',
        'texture-fill',
        'chamfer',
        'wavy-raster',
        'halftone',
    ];
    const vbitMismatch =
        NEEDS_VBIT.includes(operation) && activeSlot?.toolType !== 'v-bit';
    const LASER_OPS: Operation[] = ['laser-cut', 'laser-raster'];
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState(
        loops.length ? 'Vectors ready.' : 'Import vectors first.',
    );
    // In edit mode the entry's own source loops drive it instead.
    const byId = new Map(loops.map((l) => [l.id, l]));
    const selectedLoops = selected.flatMap((id) =>
        byId.has(id) ? [byId.get(id)!] : [],
    );
    const selectionHasVector = selectedLoops.some((loop) => !loop.bitmapId);
    const selectionHasBitmap = selectedLoops.some((loop) =>
        Boolean(loop.bitmapId),
    );
    const surfaceSourceLoops = editEntry ? editEntry.loops : selectedLoops;
    const selectedSurfaceModel = surfaceSourceLoops
        .map((loop) =>
            bitmaps.find(
                (bitmap) => bitmap.id === loop.bitmapId && bitmap.surfaceMesh,
            ),
        )
        .find((bitmap) => Boolean(bitmap));
    const selectedSurfaceBitmap = editEntry
        ? selectedSurfaceModel
        : selectedLoops.length === 1
          ? selectedSurfaceModel
          : undefined;
    const placedSurfaceMesh = useMemo(
        () =>
            selectedSurfaceBitmap
                ? transformStoredSurfaceMesh(selectedSurfaceBitmap)
                : null,
        [selectedSurfaceBitmap],
    );
    const surfaceHeight = placedSurfaceMesh
        ? -placedSurfaceMesh.bounds.minZ
        : 0;
    useEffect(() => {
        if (selectedSurfaceBitmap && !busy)
            setStatus(
                '3D setup updated. Add a toolpath to calculate cutter compensation.',
            );
        // Clear obsolete generation errors when the model or stock changes.
        // Busy changes alone must retain the current build status.
    }, [
        selectedSurfaceBitmap,
        stock.thicknessMm,
        stock.widthMm,
        stock.heightMm,
    ]);
    // Mixed marquee selections operate on the vector geometry only. A 3D
    // model is machined individually, never combined with selected vectors.
    const active = editEntry
        ? editEntry.loops
        : selected.length > 0
          ? selectionHasVector && selectionHasBitmap
              ? selectedLoops.filter((loop) => !loop.bitmapId)
              : selectedLoops
          : loops;

    // Load a created toolpath back into the form for editing (legacy parity).
    const editId = editEntry?.id ?? null;
    useEffect(() => {
        if (!editEntry) {
            setAutoCutDepth(true);
            setCutDepth(stock.thicknessMm);
            setManualCuttingParams(false);
            return;
        }
        const a = editEntry.args as ProfileArgs & Record<string, unknown>;
        const num = (v: unknown, fallback: number) =>
            typeof v === 'number' && Number.isFinite(v) ? v : fallback;
        setOperation(a.operation);
        setToolDiameter(num(a.toolDiameter, 6));
        setCutDepth(num(a.cutDepth, stock.thicknessMm));
        setCountersinkHeadDiameter(num(a.countersinkHeadDiameterMm, 8));
        setAutoCutDepth(false);
        setTrochoid(Boolean(a.trochoidEnabled));
        setHelicalEntry(Boolean(a.helicalEntryEnabled));
        setEngagement(num(a.trochoidEngagementPercent, 10));
        setLaserFeed(num(a.laserFeed, 3000));
        setLaserPower(num(a.laserPower, 1000));
        setLaserSpot(num(a.laserSpot, 0.2));
        setLaserSMin(num(a.laserSMin, 0));
        setLaserSMax(num(a.laserSMax, 1000));
        setLaserGamma(num(a.laserGamma, 1));
        setLaserOverscan(num(a.laserOverscan, 2));
        setWavySpacing(num(a.wavySpot, 2));
        setWavyShallow(num(a.wavyMinDepth, 0));
        setWavyDeep(num(a.wavyMaxDepth, 3));
        setWavyFeed(num(a.wavyFeed, 1800));
        setHalftoneRes(num(a.halftoneResolution, 50));
        setHalftoneInvert(Boolean(a.halftoneInvert));
        setTextureSpacing(num(a.textureSpacing, 5));
        setCrosshatchAngle(num(a.crosshatchAngle, 45));
        setTextureType(
            a.textureType === 'crosshatch' ? 'crosshatch' : 'voronoi',
        );
        setFeedRate(num(a.feedRate, 1800));
        setPlungeRate(num(a.plungeRate, 600));
        setSpindle(num(a.spindle, 18000));
        setManualCuttingParams(true);
        setSafeZ(num(a.safeZ, 6));
        setPassDepth(num(a.passDepth, num(a.cutDepth, stock.thicknessMm)));
        setArcs(a.arcs !== false);
        setToolNumber(Math.max(1, Math.round(num(a.toolNumber, 1))));
        setOverlap(num(a.overlapPercent, 40));
        setTabWidth(num(a.tabWidth, 9));
        setTabHeight(num(a.tabHeight, 9));
        setAutoTabHeight(false);
        setSurfaceResolution(num(a.surfaceResolutionMm, 0.25));
        setSurfaceStepover(num(a.surfaceStepoverMm, 1.2));
        setSurfaceStepdown(num(a.surfaceStepdownMm, 1.5));
        setSurfaceAllowance(num(a.surfaceStockToLeaveMm, 0.35));
        setSurfaceBoundary(num(a.surfaceBoundaryMm, 0));
        setSurfaceBoundaryMode(a.surfaceBoundaryMode ?? 'model');
        const slot = slots.find(
            (s) => s.slot === Math.max(1, Math.round(num(a.toolNumber, 1))),
        );
        if (slot) setSlotNum(slot.slot);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editId]);

    useEffect(() => {
        if (autoCutDepth) setCutDepth(stock.thicknessMm);
    }, [stock.thicknessMm, autoCutDepth]);

    // Only offer operations that fit the selection: bitmap ops need a
    // placed bitmap, vector ops need vector geometry.
    const hasBitmap = active.some((l) => l.bitmapId);
    const hasVector = active.some((l) => !l.bitmapId);
    const surfaceOperation =
        operation === 'surface-clear' ||
        operation === 'surface-finish' ||
        operation === 'surface-waterline';
    const effectiveFeedRate = manualCuttingParams
        ? feedRate
        : (recommendation?.feedMmMin ?? feedRate);
    const effectivePlungeRate = manualCuttingParams
        ? plungeRate
        : (recommendation?.plungeMmMin ?? plungeRate);
    const effectiveSpindle = manualCuttingParams
        ? spindle
        : (recommendation?.rpm ?? spindle);
    const effectivePassDepth = manualCuttingParams
        ? surfaceOperation
            ? surfaceStepdown
            : passDepth
        : (recommendation?.passDepthMm ?? passDepth);
    const isSurfaceLibraryTool = (slot: ToolSlot) =>
        isConfigured(slot) && Boolean(slot.libraryToolId);
    const compatibleSurfaceTools = slots.filter(
        (slot) =>
            isSurfaceLibraryTool(slot) &&
            (operation === 'surface-clear'
                ? slot.toolType === 'flat'
                : slot.toolType === 'ball' || slot.toolType === 'ballnose'),
    );
    const surfaceToolMismatch =
        surfaceOperation &&
        (!activeSlot ||
            !isSurfaceLibraryTool(activeSlot) ||
            (operation === 'surface-clear'
                ? activeSlot.toolType !== 'flat'
                : activeSlot.toolType !== 'ball' &&
                  activeSlot.toolType !== 'ballnose'));
    const cancelSurfaceGeneration = () => {
        surfaceAbortControllerRef.current?.abort();
        setStatus('Cancelling 3D CAM generation…');
    };
    useEffect(() => {
        const controller = surfaceAbortControllerRef.current;
        return () => {
            if (
                controller &&
                surfaceAbortControllerRef.current === controller
            ) {
                controller.abort();
                surfaceAbortControllerRef.current = null;
            }
        };
    }, [
        operation,
        selectedSurfaceBitmap?.id,
        slotNum,
        surfaceResolution,
        surfaceStepover,
        surfaceStepdown,
        surfaceAllowance,
        surfaceBoundary,
        surfaceBoundaryMode,
        selectedSurfaceBitmap,
        safeZ,
        stock.widthMm,
        stock.heightMm,
        stock.thicknessMm,
        machineTravelLimits,
    ]);
    useEffect(
        () => () => {
            surfaceAbortControllerRef.current?.abort();
            surfaceAbortControllerRef.current = null;
        },
        [],
    );
    const visibleOps = operationsForSelection({
        hasBitmap,
        hasVector,
        hasSurfaceModel: Boolean(selectedSurfaceModel),
        surfaceModelSelectedAlone: Boolean(selectedSurfaceBitmap),
    });
    useEffect(() => {
        if (!visibleOps.some((op) => op.value === operation)) {
            setOperation(visibleOps[0]?.value ?? 'profile-outside');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasBitmap, hasVector, selectedSurfaceBitmap?.id]);

    const resolveRasterBitmap = (): RasterBitmap => {
        const loop = active.find((l) => l.bitmapId);
        const entry = loop && bitmaps.find((b) => b.id === loop.bitmapId);
        if (!entry?.img)
            throw new Error('Select an imported bitmap for Laser Raster.');
        return {
            imageData: imageDataOf(entry.img),
            bounds: {
                minX: entry.x,
                minY: entry.y,
                maxX: entry.x + entry.w,
                maxY: entry.y + entry.h,
            },
        };
    };

    // Legacy auto tab height: follows half the cut depth until edited.
    useEffect(() => {
        if (autoTabHeight) setTabHeight(Math.max(0.1, cutDepth / 2));
    }, [cutDepth, autoTabHeight]);

    const buildArgs = () => {
        let bitmap: RasterBitmap | undefined;
        if (
            operation === 'laser-raster' ||
            operation === 'wavy-raster' ||
            operation === 'halftone'
        ) {
            bitmap = resolveRasterBitmap();
        }
        // Editing preserves the entry's existing tabs.
        const tabs = editEntry
            ? (((editEntry.args as ProfileArgs).tabs as PlacedTab[]) ?? [])
            : [];
        return {
            loops:
                operation === 'profile-outside' && selectedSurfaceBitmap
                    ? surfaceFootprintLoops(selectedSurfaceBitmap)
                    : active,
            operation,
            toolDiameter,
            cutDepth:
                operation === 'countersink'
                    ? countersinkHeadDiameter /
                      2 /
                      Math.tan((cutterAngle * Math.PI) / 360)
                    : cutDepth,
            countersinkHeadDiameterMm: countersinkHeadDiameter,
            cutterAngle,
            cutterType: activeSlot?.toolType ?? 'flat',
            laserFeed,
            laserPower,
            laserSpot,
            laserSMin,
            laserSMax,
            laserGamma,
            laserOverscan,
            wavySpot: wavySpacing,
            wavyMinDepth: wavyShallow,
            wavyMaxDepth: wavyDeep,
            wavyFeed,
            halftoneResolution: halftoneRes,
            halftoneInvert,
            textureType,
            material,
            stockThicknessMm: stock.thicknessMm,
            machineProfileId,
            textureSpacing,
            crosshatchAngle,
            bitmap,
            trochoidEnabled:
                trochoid &&
                (operation === 'profile-outside' ||
                    operation === 'profile-inside' ||
                    operation === 'pocket'),
            trochoidEngagementPercent: engagement,
            helicalEntryEnabled:
                helicalEntry &&
                (operation === 'profile-outside' ||
                    operation === 'profile-inside' ||
                    operation === 'pocket'),
            feedRate: effectiveFeedRate,
            plungeRate: effectivePlungeRate,
            spindle: effectiveSpindle,
            safeZ,
            passDepth:
                operation === 'countersink'
                    ? countersinkHeadDiameter /
                      2 /
                      Math.tan((cutterAngle * Math.PI) / 360)
                    : operation === 'texture-fill'
                      ? cutDepth
                      : effectivePassDepth,
            libraryToolId: activeSlot?.libraryToolId ?? undefined,
            libraryToolName: activeSlot?.name || undefined,
            surfaceBitmapId: selectedSurfaceBitmap?.id,
            surfaceResolutionMm: surfaceResolution,
            surfaceStepoverMm: surfaceStepover,
            surfaceStepdownMm: surfaceStepdown,
            surfaceStockToLeaveMm: surfaceAllowance,
            surfaceBoundaryMm: surfaceBoundary,
            surfaceBoundaryMode,
            arcs: defaultArcs,
            overlapPercent: overlap,
            tabWidth,
            tabHeight,
            toolNumber,
            tabs,
            fileName: 'gcam',
        };
    };

    const handleGenerate = () => {
        // Laser ops don't use endmills; mill ops need a configured slot.
        if (!LASER_OPS.includes(operation)) {
            if (!activeSlot || !isConfigured(activeSlot)) {
                setStatus(
                    'Set up and select an endmill slot before creating a toolpath.',
                );
                return;
            }
            if (vbitMismatch) {
                setStatus(
                    `${operation === 'countersink' ? 'V-Bit Countersink' : operation === 'chamfer' ? 'Chamfer' : operation === 'vcarve' ? 'V-Carve' : operation === 'texture-fill' ? 'Texture Fill' : operation === 'wavy-raster' ? 'Wavy' : 'Halftone'} requires a V-bit — pick one from your tool rack.`,
                );
                return;
            }
        }
        setBusy(true);
        setStatus('Building toolpath…');
        let args: ReturnType<typeof buildArgs>;
        try {
            args = buildArgs();
        } catch (e) {
            setStatus(e instanceof Error ? e.message : 'Raster needs a bitmap');
            setBusy(false);
            return;
        }
        if (operation === 'countersink' && args.cutDepth > stock.thicknessMm) {
            setStatus(
                `That V-bit countersink needs ${args.cutDepth.toFixed(2)} mm depth, deeper than the ${stock.thicknessMm.toFixed(2)} mm stock. Use a smaller head diameter or a wider-angle V-bit.`,
            );
            setBusy(false);
            return;
        }
        if (surfaceOperation) {
            if (surfaceToolMismatch || !activeSlot || !selectedSurfaceBitmap) {
                setStatus(
                    surfaceToolMismatch
                        ? operation === 'surface-clear'
                            ? '3D clearing needs a configured flat-bottom endmill selected from the tool library.'
                            : operation === 'surface-waterline'
                              ? '3D waterline finishing needs a configured ball endmill selected from the tool library.'
                              : '3D finishing needs a configured ball endmill selected from the tool library.'
                        : 'Select an imported 3D model heightmap before creating a surface toolpath.',
                );
                setBusy(false);
                return;
            }
            if (selectedSurfaceBitmap.surfaceMachinableTopDown === false) {
                setStatus(
                    'Choose and apply a machining setup direction with a valid upward-facing surface before generating 3D CAM.',
                );
                setBusy(false);
                return;
            }
            const mesh = transformStoredSurfaceMesh(selectedSurfaceBitmap);
            if (!mesh) {
                setStatus(
                    'The selected 3D model data is missing or invalid. Re-import the model.',
                );
                setBusy(false);
                return;
            }
            const cutterRadius = activeSlot.cuttingDiameterMm! / 2;
            if (
                mesh.bounds.minX - cutterRadius - surfaceBoundary < 0 ||
                mesh.bounds.minY - cutterRadius - surfaceBoundary < 0 ||
                mesh.bounds.maxX + cutterRadius + surfaceBoundary >
                    stock.widthMm ||
                mesh.bounds.maxY + cutterRadius + surfaceBoundary >
                    stock.heightMm
            ) {
                setStatus(
                    `The 3D model, cutter, and boundary overrun (${surfaceBoundary} mm) do not fit inside the job stock with safe edge clearance. Reduce the boundary, move or resize the model, or use larger stock.`,
                );
                setBusy(false);
                return;
            }
            if (mesh.bounds.minZ < -stock.thicknessMm - 1e-5) {
                setStatus(
                    'The 3D model extends below the job stock thickness. Increase stock thickness or resize the model.',
                );
                setBusy(false);
                return;
            }
            const cutter = activeSlot.toolType;
            if (operation === 'surface-clear' && cutter !== 'flat') {
                setStatus(
                    '3D clearing requires a flat-bottom endmill from the tool library.',
                );
                setBusy(false);
                return;
            }
            if (
                operation !== 'surface-clear' &&
                cutter !== 'ball' &&
                cutter !== 'ballnose'
            ) {
                setStatus(
                    operation === 'surface-waterline'
                        ? '3D waterline finishing requires a ball endmill from the tool library.'
                        : '3D finishing requires a ball endmill from the tool library.',
                );
                setBusy(false);
                return;
            }
            setStatus('Rasterizing 3D model and building surface paths…');
            const controller = new AbortController();
            surfaceAbortControllerRef.current?.abort();
            surfaceAbortControllerRef.current = controller;
            void generateSurfaceCamPaths(
                mesh,
                {
                    strategy: operation,
                    cutter: cutter as 'flat' | 'ball' | 'ballnose',
                    toolDiameterMm: activeSlot.cuttingDiameterMm!,
                    stepoverMm: surfaceStepover,
                    stepdownMm: surfaceStepdown,
                    stockToLeaveMm:
                        operation === 'surface-clear' ? surfaceAllowance : 0,
                    boundaryMm:
                        operation === 'surface-waterline' &&
                        surfaceBoundaryMode === 'model'
                            ? 0
                            : surfaceBoundary,
                    boundaryMode: surfaceBoundaryMode,
                    safeZMm: safeZ,
                    stockTopZMm: 0,
                    travelLimits: machineTravelLimits,
                    stock: {
                        widthMm: stock.widthMm,
                        heightMm: stock.heightMm,
                        thicknessMm: stock.thicknessMm,
                    },
                    resolutionMm: surfaceResolution,
                },
                (progress) => onDraftProgress?.(progress),
                controller.signal,
            )
                .then((generated) => {
                    if (controller.signal.aborted) return;
                    const result = buildSurfaceToolpathResult({
                        operation,
                        paths: generated.paths,
                        toolDiameter: activeSlot.cuttingDiameterMm!,
                        cutterType: cutter,
                        libraryToolId: activeSlot.libraryToolId ?? undefined,
                        libraryToolName: activeSlot.name || undefined,
                        toolNumber: activeSlot.slot,
                        feedRate: effectiveFeedRate,
                        plungeRate: effectivePlungeRate,
                        spindle: effectiveSpindle,
                        safeZ,
                        stepdown: surfaceStepdown,
                        stockToLeave:
                            operation === 'surface-clear'
                                ? surfaceAllowance
                                : 0,
                        surfaceBitmapId: selectedSurfaceBitmap.id,
                        fileName: 'gcam',
                    });
                    if (editEntry && onUpdate)
                        onUpdate(editEntry.id, result, args);
                    else onResult(result, args);
                    setStatus(
                        `${result.label} — ${generated.paths.length} paths, ${result.gcode.split('\n').length} G-code lines (${generated.rasterBackend.toUpperCase()} mesh raster, ${generated.computeBackend.toUpperCase()} cutter compensation).`,
                    );
                })
                .catch((error: unknown) => {
                    if (controller.signal.aborted) return;
                    setStatus(
                        error instanceof Error
                            ? error.message
                            : 'WebGPU surface CAM failed.',
                    );
                })
                .finally(() => {
                    if (surfaceAbortControllerRef.current === controller)
                        surfaceAbortControllerRef.current = null;
                    onDraftProgress?.(null);
                    setBusy(false);
                });
            return;
        }
        buildToolpathGcode(args).then(
            (result) => {
                if (editEntry && onUpdate) {
                    onUpdate(editEntry.id, result, args);
                } else {
                    onResult(result, args);
                }
                setStatus(
                    `${result.label} — ${result.gcode.split('\n').length} lines.`,
                );
                setBusy(false);
            },
            (e) => {
                setStatus(e instanceof Error ? e.message : 'Engine error');
                setBusy(false);
            },
        );
    };

    // Live dashed draft preview (camcanvas draftToolpath): rebuild the
    // current form debounced in the CAM worker with progress, so the
    // canvas previews before committing. Falls back to a sync build if
    // the worker is unavailable. Unlike commit, the draft uses the live
    // form values directly so a preview renders even before a tool slot
    // is configured.
    const draftToken = useRef(0);
    const draftCallbacksRef = useRef({ onDraftPreview, onDraftProgress });
    draftCallbacksRef.current = { onDraftPreview, onDraftProgress };
    useEffect(
        () => () => {
            // The panel unmounts when the user clears the canvas selection.
            // Invalidate any in-flight worker response so it cannot restore
            // the now-stale draft after the rail has been reset.
            draftToken.current += 1;
            draftCallbacksRef.current.onDraftPreview?.(null);
            draftCallbacksRef.current.onDraftProgress?.(null);
        },
        [],
    );
    const [draftError, setDraftError] = useState<string | null>(null);
    const solidDraftPreview =
        operation === 'laser-raster' ||
        (operation === 'texture-fill' && textureType === 'crosshatch');
    useEffect(() => {
        if (!onDraftPreview && !onDraftProgress) return;
        if (surfaceOperation) {
            onDraftPreview?.(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        if (selected.length === 0 || !active.length) {
            onDraftPreview?.(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        if (vbitMismatch) {
            // Don't fire the worker with a tool that can't run this
            // operation — the amber alert above already tells the user to
            // pick a V-bit. Firing anyway only surfaces a cryptic engine
            // error for a condition we can detect locally.
            onDraftPreview?.(null);
            onDraftProgress?.(null);
            setDraftError(null);
            return;
        }
        const token = ++draftToken.current;
        // CAMCanvas shows the worker badge as soon as a draft job starts.
        // Set this before the debounce so a real long-running operation is
        // visible for its whole run rather than only after a later callback.
        onDraftProgress?.({ percent: 4, label: 'Calculating toolpath' });
        const timer = window.setTimeout(() => {
            let args: ReturnType<typeof buildArgs>;
            try {
                args = buildArgs();
            } catch (e) {
                if (token === draftToken.current) {
                    onDraftPreview?.(null);
                    onDraftProgress?.(null);
                    setDraftError(
                        e instanceof Error ? e.message : 'Preview unavailable',
                    );
                }
                return;
            }
            const report = (percent: number, label: string) => {
                if (token !== draftToken.current) return;
                const numericPercent = Number(percent);
                const safePercent = Number.isFinite(numericPercent)
                    ? Math.min(100, Math.max(0, numericPercent))
                    : 0;
                onDraftProgress?.({
                    percent: safePercent,
                    label: label || 'Calculating toolpath',
                });
            };
            report(4, 'Calculating toolpath');
            // Race the worker against a timeout so a hung worker still
            // falls back to the sync build instead of stalling the preview.
            const raced = new Promise<ToolpathResult>((resolve, reject) => {
                const timer = window.setTimeout(
                    () => reject(new Error('Preview timed out')),
                    20000,
                );
                buildToolpathGcodeAsync({
                    ...args,
                    tabs: [],
                    onProgress: report,
                }).then(
                    (result) => {
                        window.clearTimeout(timer);
                        resolve(result);
                    },
                    (e) => {
                        window.clearTimeout(timer);
                        reject(e);
                    },
                );
            });
            raced.then(
                (result) => {
                    if (token !== draftToken.current) return;
                    onDraftPreview?.(
                        canvasDraftContours(
                            [
                                ...result.previewContours,
                                ...(result.trochoidPreviewContours ?? []),
                            ],
                            solidDraftPreview,
                        ),
                    );
                    onDraftProgress?.(null);
                    setDraftError(null);
                },
                (workerError) => {
                    // Worker fallback: sync main-thread build. Keep the
                    // pill up (indeterminate) so the wait is visible.
                    if (token !== draftToken.current) return;
                    report(4, 'Calculating toolpath');
                    buildToolpathGcode({ ...args, tabs: [] }).then(
                        (result) => {
                            if (token === draftToken.current) {
                                onDraftPreview?.(
                                    canvasDraftContours(
                                        [
                                            ...result.previewContours,
                                            ...(result.trochoidPreviewContours ??
                                                []),
                                        ],
                                        solidDraftPreview,
                                    ),
                                );
                                onDraftProgress?.(null);
                                setDraftError(null);
                            }
                        },
                        (e) => {
                            if (token === draftToken.current) {
                                onDraftPreview?.(null);
                                setDraftError(
                                    e instanceof Error
                                        ? e.message
                                        : workerError instanceof Error
                                          ? workerError.message
                                          : 'Preview unavailable',
                                );
                            }
                        },
                    );
                },
            );
        }, 400);
        return () => {
            window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        operation,
        surfaceOperation,
        surfaceResolution,
        surfaceStepover,
        surfaceStepdown,
        surfaceAllowance,
        vbitMismatch,
        toolDiameter,
        cutDepth,
        cutterAngle,
        trochoid,
        engagement,
        laserFeed,
        laserPower,
        laserSpot,
        laserSMin,
        laserSMax,
        laserGamma,
        wavySpacing,
        wavyShallow,
        wavyDeep,
        wavyFeed,
        halftoneRes,
        halftoneInvert,
        textureType,
        textureSpacing,
        crosshatchAngle,
        material,
        machineProfileId,
        solidDraftPreview,
        feedRate,
        plungeRate,
        spindle,
        manualCuttingParams,
        safeZ,
        passDepth,
        arcs,
        overlap,
        tabWidth,
        tabHeight,
        toolNumber,
        slotNum,
        slots,
        selected,
        loops,
        bitmaps,
    ]);

    if (!editEntry && (selected.length === 0 || active.length === 0)) {
        return <ToolpathEmptyState />;
    }

    return (
        <div className="toolpath-form p-3 space-y-3 text-sm">
            <section className="toolpath-form-operation space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Operation
                </h3>
                <ToolpathOperationPicker
                    operation={operation}
                    operations={visibleOps}
                    onChange={setOperation}
                />
            </section>
            <ToolpathFormAlerts
                operation={operation}
                vbitMismatch={vbitMismatch}
                draftError={draftError}
            />
            <section className="toolpath-form-tool space-y-2 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Tool selection
                </h3>
                <ToolSelectionFields
                    slots={surfaceOperation ? compatibleSurfaceTools : slots}
                    hasAnyConfiguredTool={slots.some(isConfigured)}
                    slotNum={slotNum}
                    units={units}
                    libraryOpen={toolLibOpen}
                    librarySlot={toolLibSlot}
                    onOpenLibrary={() => setToolLibOpen(true)}
                    onSetupTools={() => {
                        const firstEmptySlot = slots.find(
                            (tool) => !isConfigured(tool),
                        );
                        const setupSlot = firstEmptySlot?.slot ?? null;
                        if (setupSlot != null) setSlotNum(setupSlot);
                        setToolLibSlot(setupSlot);
                        setToolLibOpen(true);
                    }}
                    onSelectSlot={(slotNumber) => {
                        setSlotNum(slotNumber);
                        const slot = slots.find(
                            (item) => item.slot === slotNumber,
                        );
                        if (slot && isConfigured(slot)) {
                            applySlot(slot);
                        } else {
                            setToolLibSlot(slotNumber);
                            setToolLibOpen(true);
                        }
                    }}
                    onCloseLibrary={() => {
                        setToolLibOpen(false);
                        setToolLibSlot(null);
                        if (typeof window !== 'undefined')
                            setSlots(loadSlots(window.localStorage));
                    }}
                    onConfiguredSlot={applySlot}
                />
            </section>
            <section className="toolpath-form-settings space-y-3 rounded-lg border border-slate-200 bg-white/60 p-2.5 dark:border-robin-900 dark:bg-dark-lighter/50">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Toolpath settings
                </h3>
                {recipeOperation && (
                    <CuttingRecipeFields
                        recommendation={recommendation}
                        units={units}
                        manual={manualCuttingParams}
                        onManualChange={setManualCuttingParams}
                        feedRate={feedRate}
                        onFeedRateChange={setFeedRate}
                        plungeRate={plungeRate}
                        onPlungeRateChange={setPlungeRate}
                        spindle={spindle}
                        onSpindleChange={setSpindle}
                        maxDepth={
                            surfaceOperation ? surfaceStepdown : passDepth
                        }
                        maxDepthLabel={
                            surfaceOperation
                                ? 'Surface stepdown'
                                : 'Max depth per pass'
                        }
                        onMaxDepthChange={
                            surfaceOperation ? setSurfaceStepdown : setPassDepth
                        }
                    />
                )}
                {!LASER_OPS.includes(operation) &&
                    !surfaceOperation &&
                    operation !== 'countersink' && (
                        <label className="block space-y-1">
                            <span className="text-slate-500 dark:text-slate-400">
                                Cut depth ({units === 'imperial' ? 'in' : 'mm'})
                            </span>
                            <UnitInput
                                units={units}
                                stepMm={0.1}
                                minMm={0.1}
                                valueMm={cutDepth}
                                onChangeMm={(value) => {
                                    setCutDepth(value);
                                    setAutoCutDepth(false);
                                }}
                                className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                            />
                        </label>
                    )}
                {operation === 'countersink' && (
                    <label className="block space-y-1">
                        <span className="text-slate-500 dark:text-slate-400">
                            Screw head diameter (
                            {units === 'imperial' ? 'in' : 'mm'})
                        </span>
                        <UnitInput
                            units={units}
                            stepMm={0.1}
                            minMm={0.5}
                            valueMm={countersinkHeadDiameter}
                            onChangeMm={setCountersinkHeadDiameter}
                            className="w-full rounded bg-slate-100 dark:bg-dark-lighter border border-slate-300 dark:border-robin-900 px-2 py-1 text-slate-900 dark:text-white"
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Single plunge depth:{' '}
                            {(
                                countersinkHeadDiameter /
                                2 /
                                Math.tan((cutterAngle * Math.PI) / 360)
                            ).toFixed(2)}{' '}
                            mm, calculated from the selected V-bit angle.
                        </span>
                    </label>
                )}
                {!surfaceOperation && (
                    <CuttingFields
                        operation={operation}
                        units={units}
                        overlap={overlap}
                        onOverlapChange={setOverlap}
                        trochoid={trochoid}
                        onTrochoidChange={setTrochoid}
                        engagement={engagement}
                        onEngagementChange={setEngagement}
                        helicalEntry={helicalEntry}
                        onHelicalEntryChange={setHelicalEntry}
                        tabWidth={tabWidth}
                        onTabWidthChange={setTabWidth}
                        tabHeight={tabHeight}
                        onTabHeightChange={(value) => {
                            setTabHeight(value);
                            setAutoTabHeight(
                                Math.abs(value - Math.max(0.1, cutDepth / 2)) <
                                    0.0001,
                            );
                        }}
                    />
                )}
                {surfaceOperation && (
                    <section
                        className={`space-y-2 rounded-lg border p-3 ${surfaceHeight > stock.thicknessMm + 0.001 ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30' : 'border-slate-300 dark:border-robin-900'}`}
                    >
                        <h3 className="text-sm font-semibold">
                            Model placement
                        </h3>
                        <p className="text-xs">
                            Model height: {displayValue(surfaceHeight, units)}{' '}
                            {units === 'imperial' ? 'in' : 'mm'}. Top aligned to
                            stock top (Z=0); stock extends below zero.
                        </p>
                        {surfaceHeight > stock.thicknessMm + 0.001 && (
                            <p
                                role="alert"
                                className="text-sm font-semibold text-amber-800 dark:text-amber-200"
                            >
                                Model is taller than the stock. Correct the
                                stock thickness or fit the model before adding a
                                toolpath.
                            </p>
                        )}
                        <label className="block text-xs">
                            Job stock thickness
                            <UnitInput
                                units={units}
                                disabled={busy || !onStockThickness}
                                minMm={0.1}
                                valueMm={stock.thicknessMm}
                                onChangeMm={(value) =>
                                    onStockThickness?.(value)
                                }
                                className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:bg-dark"
                            />
                        </label>
                        {selectedSurfaceBitmap && onFitSurface && (
                            <div className="flex flex-col gap-2">
                                <button
                                    type="button"
                                    disabled={busy || !surfaceHeight}
                                    onClick={() =>
                                        onFitSurface(
                                            selectedSurfaceBitmap.id,
                                            'uniform',
                                        )
                                    }
                                    className="rounded border border-slate-400 px-2 py-2 text-xs disabled:opacity-50"
                                >
                                    Fit to stock — scale XYZ together
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || !surfaceHeight}
                                    onClick={() =>
                                        onFitSurface(
                                            selectedSurfaceBitmap.id,
                                            'z',
                                        )
                                    }
                                    className="rounded border border-slate-400 px-2 py-2 text-xs disabled:opacity-50"
                                >
                                    Fit to stock — scale Z only
                                </button>
                                <p className="text-[11px] text-slate-500">
                                    XYZ preserves proportions and changes the
                                    footprint. Z only keeps the footprint and
                                    changes the relief height.
                                </p>
                            </div>
                        )}
                    </section>
                )}
                {surfaceOperation && (
                    <SurfaceCamFields
                        operation={operation}
                        units={units}
                        resolution={surfaceResolution}
                        stepover={surfaceStepover}
                        stepdown={surfaceStepdown}
                        allowance={surfaceAllowance}
                        boundary={surfaceBoundary}
                        boundaryMode={surfaceBoundaryMode}
                        onBoundaryMode={setSurfaceBoundaryMode}
                        onResolution={setSurfaceResolution}
                        onStepover={setSurfaceStepover}
                        onStepdown={setSurfaceStepdown}
                        onAllowance={setSurfaceAllowance}
                        onBoundary={setSurfaceBoundary}
                        hasModel={Boolean(selectedSurfaceBitmap)}
                        toolReady={!surfaceToolMismatch}
                    />
                )}
                <VBitRasterFields
                    operation={operation}
                    units={units}
                    halftoneResolution={halftoneRes}
                    onHalftoneResolutionChange={setHalftoneRes}
                    halftoneInvert={halftoneInvert}
                    onHalftoneInvertChange={setHalftoneInvert}
                    wavySpacing={wavySpacing}
                    onWavySpacingChange={setWavySpacing}
                    wavyFeed={wavyFeed}
                    onWavyFeedChange={setWavyFeed}
                    wavyShallow={wavyShallow}
                    onWavyShallowChange={setWavyShallow}
                    wavyDeep={wavyDeep}
                    onWavyDeepChange={setWavyDeep}
                />
                {operation === 'texture-fill' && (
                    <TextureFields
                        units={units}
                        textureType={textureType}
                        textureSpacing={textureSpacing}
                        crosshatchAngle={crosshatchAngle}
                        onTypeChange={setTextureType}
                        onSpacingChange={setTextureSpacing}
                        onCrosshatchAngleChange={setCrosshatchAngle}
                    />
                )}
                <RasterLaserFields
                    operation={operation}
                    units={units}
                    laserFeed={laserFeed}
                    onLaserFeedChange={setLaserFeed}
                    laserPower={laserPower}
                    onLaserPowerChange={setLaserPower}
                    laserSpot={laserSpot}
                    onLaserSpotChange={setLaserSpot}
                    laserGamma={laserGamma}
                    onLaserGammaChange={setLaserGamma}
                    laserSMin={laserSMin}
                    onLaserSMinChange={setLaserSMin}
                    laserSMax={laserSMax}
                    onLaserSMaxChange={setLaserSMax}
                    laserOverscan={laserOverscan}
                    onLaserOverscanChange={setLaserOverscan}
                />
                <ToolpathSubmitControls
                    busy={busy}
                    hasActiveGeometry={
                        active.length > 0 &&
                        (!surfaceOperation ||
                            surfaceHeight <= stock.thicknessMm + 1e-5)
                    }
                    editEntry={editEntry !== null}
                    submitLabel={submitLabel}
                    selectedCount={selected.length}
                    status={status}
                    onGenerate={handleGenerate}
                    onCancelBuild={
                        surfaceAbortControllerRef.current
                            ? cancelSurfaceGeneration
                            : undefined
                    }
                    onCancelEdit={onCancelEdit}
                />
            </section>
        </div>
    );
});
