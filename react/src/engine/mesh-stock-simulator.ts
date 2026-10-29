import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { JobStock } from '../job/stock';
import { previewWorkerToolpaths } from './preview-3d/worker-input.js';
import { buildMovementVerticesFromLines } from '@sienci/gviewer';

const STOCK_SURFACE_COLOR = 0xc99b6b;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
type SimulationData = {
    bounds: Bounds;
    grid: Float32Array;
    sampleData: Float32Array;
    sampleKinds: Uint8Array;
    columns: number;
    rows: number;
    cellX: number;
    cellY: number;
    stockThickness: number;
    material: string;
};

type PreviewToolpath = {
    operation: string;
    cutterType: string;
    toolDiameter: number;
    cutDepth: number;
    passDepths: number[];
    previewContours: { x: number; y: number }[][];
    motionPaths: { points: { x: number; y: number; z?: number }[] }[];
};

export type PreviewMemoryStats = {
    cpuBytes: number;
    gpuBytes: number;
    jsHeapBytes: number | null;
    gridCells: number;
};

/** Three.js stock mesh with worker-built cutter-envelope height data. */
export class MeshStockSimulator {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 10000);
    private readonly controls: OrbitControls;
    private worker: Worker;
    private readonly root = new THREE.Group();
    private readonly detailedGroup = new THREE.Group();
    private readonly navigationGuide = new THREE.Group();
    private readonly tool = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0c4a6e }),
    );
    private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null =
        null;
    private shell: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null =
        null;
    private boundary: THREE.Group | null = null;
    private heightTexture: THREE.DataTexture | null = null;
    private stockGrid: THREE.LineSegments<
        THREE.BufferGeometry,
        THREE.LineBasicMaterial
    > | null = null;
    private vectorProfileCuts: THREE.Mesh<
        THREE.BufferGeometry,
        THREE.Material
    > | null = null;
    private previewToolpaths: PreviewToolpath[] = [];
    private gcode = '';
    private cutWalls: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null =
        null;
    private gcodeOverlay = new THREE.Group();
    private data: SimulationData | null = null;
    private playGrid: Float32Array | null = null;
    private playIndex = 0;
    private animation: number | null = null;
    private renderFrame: number | null = null;
    private surfaceLodStep = 1;
    private version = 0;
    onPlaybackChange: ((state: { running: boolean }) => void) | null = null;
    onStockFitChange: ((state: { exceeds: boolean }) => void) | null = null;

    constructor(
        private readonly canvas: HTMLCanvasElement,
        private readonly status: HTMLElement,
    ) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.scene.background = new THREE.Color(0xe8edf2);
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x55606e, 2.6));
        const key = new THREE.DirectionalLight(0xffffff, 3.2);
        key.position.set(180, -220, 360);
        key.castShadow = true;
        this.root.add(this.detailedGroup);
        this.scene.add(key, this.root, this.gcodeOverlay);
        this.tool.visible = false;
        this.scene.add(this.tool);
        this.camera.up.set(0, 0, 1);
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = false;
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        this.controls.enablePan = true;
        this.controls.target.set(0, 0, 0);
        // Coalesce high-frequency pointer events to one draw per display frame.
        // The heightmap and mesh are untouched by camera-only changes.
        this.controls.addEventListener('change', () => this.queueRender());
        this.worker = this.createWorker();
        this.resize();
        this.render();
    }

    setTheme(dark: boolean) {
        this.scene.background = new THREE.Color(dark ? 0x18212c : 0xe8edf2);
        this.render();
    }

    /** Report owned preview buffers plus estimated WebGL copies and canvas color buffer. */
    getMemoryStats(): PreviewMemoryStats {
        const geometries = new Set<THREE.BufferGeometry>();
        const addGeometries = (object: THREE.Object3D) =>
            object.traverse((child) => {
                const mesh = child as THREE.Mesh;
                if (mesh.geometry instanceof THREE.BufferGeometry)
                    geometries.add(mesh.geometry);
            });
        addGeometries(this.scene);
        let geometryBytes = 0;
        for (const geometry of geometries) {
            for (const attribute of Object.values(geometry.attributes)) {
                const value = attribute as THREE.BufferAttribute;
                const interleaved =
                    attribute as THREE.InterleavedBufferAttribute;
                const array = value.array ?? interleaved.data?.array;
                if (array && ArrayBuffer.isView(array))
                    geometryBytes += array.byteLength;
            }
            const index = geometry.index;
            if (index?.array) geometryBytes += index.array.byteLength;
        }

        const gridBytes = this.data?.grid.byteLength ?? 0;
        const sampleBytes =
            (this.data?.sampleData.byteLength ?? 0) +
            (this.data?.sampleKinds.byteLength ?? 0);
        const playbackBytes = this.playGrid?.byteLength ?? 0;
        const canvasSize = this.renderer.getDrawingBufferSize(
            new THREE.Vector2(),
        );
        const canvasBytes = Math.ceil(canvasSize.x * canvasSize.y * 4);
        const memory = (
            performance as Performance & {
                memory?: { usedJSHeapSize?: number };
            }
        ).memory;
        return {
            cpuBytes: gridBytes + sampleBytes + playbackBytes + geometryBytes,
            gpuBytes: gridBytes + geometryBytes + canvasBytes,
            jsHeapBytes:
                typeof memory?.usedJSHeapSize === 'number'
                    ? memory.usedJSHeapSize
                    : null,
            gridCells: this.data ? this.data.columns * this.data.rows : 0,
        };
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.renderer.setSize(rect.width, rect.height, false);
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.render();
    }

    build(toolpaths: Record<string, unknown>[], stock: JobStock) {
        this.stop();
        // A superseded V-carve can be very dense. Terminating its dedicated
        // worker guarantees a new preview request is never queued behind it.
        this.worker.terminate();
        this.worker = this.createWorker();
        this.data = null;
        this.onStockFitChange?.({ exceeds: false });
        this.clearMesh();
        const version = ++this.version;
        this.status.textContent = 'Building mesh stock simulation…';
        const sourceToolpaths = previewWorkerToolpaths(
            toolpaths,
        ) as PreviewToolpath[];
        // Stock and toolpaths share the configured work-origin coordinate frame.
        // Never translate an imported drawing merely to make it fit the board;
        // the preview must expose an out-of-stock programmed move.
        this.previewToolpaths = sourceToolpaths;
        this.renderGcodeOverlay();
        this.worker.postMessage({
            type: 'build',
            version,
            toolpaths: this.previewToolpaths,
            stock,
        });
    }

    setGcodeOverlay(gcode: string) {
        this.gcode = gcode;
        this.renderGcodeOverlay();
    }

    /** Render every programmed move in the same machine frame as stock. */
    private renderGcodeOverlay() {
        for (const child of this.gcodeOverlay.children) {
            if (child instanceof THREE.LineSegments) {
                child.geometry.dispose();
                child.material.dispose();
            }
        }
        this.gcodeOverlay.clear();
        if (!this.gcode.trim()) return;
        const movements = buildMovementVerticesFromLines(
            this.gcode.split(/\r?\n/),
        );
        const add = (
            positions: Float32Array,
            color: number,
            opacity: number,
        ) => {
            if (!positions.length) return;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute(
                'position',
                new THREE.BufferAttribute(new Float32Array(positions), 3),
            );
            const material = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity,
                depthTest: false,
            });
            const lines = new THREE.LineSegments(geometry, material);
            lines.renderOrder = 2;
            this.gcodeOverlay.add(lines);
        };
        // The overlay is only for alignment verification. Keep it quiet so it
        // does not read as another machined surface or overpower the stock.
        add(movements.rapid, 0xc27a23, 0.18);
        add(movements.cutting, 0x253243, 0.68);
        this.render();
    }

    private previewBounds(toolpaths: PreviewToolpath[]) {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        const include = (point: { x: number; y: number }) => {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        };
        for (const toolpath of toolpaths) {
            for (const contour of toolpath.previewContours)
                for (const point of contour) include(point);
            for (const path of toolpath.motionPaths)
                for (const point of path.points) include(point);
        }
        return { minX, minY, maxX, maxY };
    }

    setGcodeVisible(visible: boolean) {
        this.gcodeOverlay.visible = visible;
        this.render();
    }

    setStockVisible(visible: boolean) {
        this.root.visible = visible;
        if (!visible) this.tool.visible = false;
        this.render();
    }

    resetCamera(top = false) {
        if (!this.data) return;
        const { bounds, stockThickness } = this.data;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const size = Math.max(width, height, stockThickness);
        const center = new THREE.Vector3(
            (bounds.minX + bounds.maxX) / 2,
            (bounds.minY + bounds.maxY) / 2,
            -stockThickness * 0.28,
        );
        this.controls.target.copy(center);
        this.camera.position
            .copy(center)
            .add(
                top
                    ? new THREE.Vector3(0, 0, size * 1.8)
                    : new THREE.Vector3(size * 0.95, -size * 1.18, size * 0.88),
            );
        this.camera.lookAt(center);
        this.controls.update();
        this.render();
    }

    resetPlayback() {
        if (!this.data || !this.mesh) return;
        this.stop();
        this.playIndex = 0;
        this.playGrid = new Float32Array(this.data.grid.length);
        this.applyGrid(this.playGrid);
        this.removeCutWalls();
        this.tool.visible = false;
        this.status.textContent = 'Ready to simulate.';
    }

    setPlaybackSpeed(_speed: number) {}

    togglePlayback() {
        if (!this.data) return;
        if (this.animation) this.stop();
        else this.play();
    }

    replay() {
        this.resetPlayback();
        this.play();
    }

    dispose() {
        this.stop();
        if (this.renderFrame !== null) cancelAnimationFrame(this.renderFrame);
        this.renderFrame = null;
        this.worker.terminate();
        this.clearMesh();
        this.controls.dispose();
        this.renderer.dispose();
    }

    private onWorker(message: any) {
        if (!message || message.version !== this.version) return;
        if (message.type === 'progress') {
            this.status.textContent = `Building mesh: ${message.progress}%`;
            return;
        }
        if (message.type === 'empty') {
            this.status.textContent =
                'Add a toolpath to simulate stock removal.';
            return;
        }
        if (message.type === 'error') {
            this.status.textContent =
                message.message || '3D simulation failed.';
            return;
        }
        if (message.type !== 'complete') return;
        this.data = {
            ...message,
            grid: new Float32Array(message.grid),
            sampleData: new Float32Array(message.sampleData),
            sampleKinds: new Uint8Array(message.sampleKinds),
            stockThickness: Number(message.maxDepth) || 1,
        };
        this.createMesh();
        const data = this.data;
        if (!data) return;
        const preview = this.previewBounds(this.previewToolpaths);
        const exceeds = this.previewExceedsStock(preview, data);
        this.onStockFitChange?.({ exceeds });
        const jobWidth = preview.maxX - preview.minX;
        const jobHeight = preview.maxY - preview.minY;
        this.status.textContent = exceeds
            ? `Mesh ready — job footprint ${jobWidth.toFixed(1)} × ${jobHeight.toFixed(1)} mm exceeds the ${(data.bounds.maxX - data.bounds.minX).toFixed(1)} × ${(data.bounds.maxY - data.bounds.minY).toFixed(1)} mm stock; only the overlap is shown.`
            : `Mesh ready — ${data.columns.toLocaleString()} × ${data.rows.toLocaleString()} surface samples.`;
        this.resetCamera(false);
    }

    /** Flag the actual programmed job envelope, including the largest cutter radius. */
    private previewExceedsStock(preview: Bounds, data: SimulationData) {
        if (!Number.isFinite(preview.minX)) return false;
        const radius = Math.max(
            0,
            ...this.previewToolpaths.map(
                (toolpath) => toolpath.toolDiameter / 2,
            ),
        );
        const { bounds } = data;
        return (
            preview.minX - radius < bounds.minX ||
            preview.maxX + radius > bounds.maxX ||
            preview.minY - radius < bounds.minY ||
            preview.maxY + radius > bounds.maxY
        );
    }

    private createMesh() {
        if (!this.data) return;
        this.clearMesh();
        const {
            columns,
            rows,
            bounds,
            cellX,
            cellY,
            grid,
            stockThickness,
            material,
        } = this.data;
        const geometry = this.createHeightfieldGeometry(columns, rows);
        this.heightTexture = new THREE.DataTexture(
            grid,
            columns,
            rows,
            THREE.RedFormat,
            THREE.FloatType,
        );
        this.heightTexture.minFilter = THREE.NearestFilter;
        this.heightTexture.magFilter = THREE.NearestFilter;
        this.heightTexture.needsUpdate = true;
        this.mesh = new THREE.Mesh(
            geometry,
            this.createHeightfieldMaterial(
                material,
                bounds,
                cellX,
                cellY,
                stockThickness,
            ),
        );
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.detailedGroup.add(this.mesh);
        this.shell = new THREE.Mesh(
            this.createStockShell(grid),
            this.stockMaterial(material, false),
        );
        this.shell.receiveShadow = true;
        this.detailedGroup.add(this.shell);
        this.boundary = this.createBoundaryWalls();
        this.detailedGroup.add(this.boundary);
        this.stockGrid = this.createStockGrid();
        this.detailedGroup.add(this.stockGrid);
        // Camera changes only redraw this same GPU mesh. Stock simulation is
        // rebuilt by the worker only when stock or committed toolpaths change.
        this.detailedGroup.visible = true;
        // The GPU surface is the source of truth for stock removal. Profile
        // walls will be added as a single boundary mesh; do not overlay one
        // quad per path segment here, as overlapping segment faces shimmer.
        // The height-field already contains the cutter envelope. Overlaying a
        // quad at every neighbouring grid-height change made flat profile cuts
        // look like a row of dark, triangular teeth. Keep the clean surface
        // mesh until contour-derived walls are available.
    }

    private clearMesh() {
        if (this.heightTexture) {
            this.heightTexture.dispose();
            this.heightTexture = null;
        }
        if (this.vectorProfileCuts) {
            this.root.remove(this.vectorProfileCuts);
            this.vectorProfileCuts.geometry.dispose();
            this.vectorProfileCuts.material.dispose();
            this.vectorProfileCuts = null;
        }
        if (this.stockGrid) {
            this.root.remove(this.stockGrid);
            this.stockGrid.geometry.dispose();
            this.stockGrid.material.dispose();
            this.stockGrid = null;
        }
        this.root.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            child.geometry.dispose();
            child.material.dispose();
        });
        this.root.clear();
        this.detailedGroup.clear();
        this.root.add(this.detailedGroup);
        this.mesh = null;
        this.shell = null;
        this.boundary = null;
        this.cutWalls = null;
    }

    /** Sparse, unfilled stock surface used during camera motion as a clean spatial cue. */
    private createNavigationGuide(data: SimulationData) {
        const { bounds, columns, rows, grid, stockThickness } = data;
        const stride = Math.max(1, Math.ceil(Math.max(columns, rows) / 56));
        const positions: number[] = [];
        const xAt = (column: number) =>
            bounds.minX + ((bounds.maxX - bounds.minX) * column) / columns;
        const yAt = (row: number) =>
            bounds.minY + ((bounds.maxY - bounds.minY) * row) / rows;
        const zAt = (column: number, row: number) =>
            grid[row * columns + column] +
            Math.max(0.03, stockThickness * 0.001);
        const addSegment = (
            x1: number,
            y1: number,
            z1: number,
            x2: number,
            y2: number,
            z2: number,
        ) => positions.push(x1, y1, z1, x2, y2, z2);

        for (let row = 0; row < rows; row += stride) {
            const nextRow = Math.min(row + stride, rows - 1);
            for (let column = 0; column < columns - 1; column += stride) {
                const nextColumn = Math.min(column + stride, columns - 1);
                addSegment(
                    xAt(column),
                    yAt(row),
                    zAt(column, row),
                    xAt(nextColumn),
                    yAt(row),
                    zAt(nextColumn, row),
                );
            }
        }
        for (let column = 0; column < columns; column += stride) {
            const nextColumn = Math.min(column + stride, columns - 1);
            for (let row = 0; row < rows - 1; row += stride) {
                const nextRow = Math.min(row + stride, rows - 1);
                addSegment(
                    xAt(column),
                    yAt(row),
                    zAt(column, row),
                    xAt(column),
                    yAt(nextRow),
                    zAt(column, nextRow),
                );
            }
        }

        // Stock perimeter stays smooth and makes the material bounds legible while moving.
        const baseZ = 0.02;
        const topLeft = [bounds.minX, bounds.minY, baseZ] as const;
        const topRight = [bounds.maxX, bounds.minY, baseZ] as const;
        const bottomRight = [bounds.maxX, bounds.maxY, baseZ] as const;
        const bottomLeft = [bounds.minX, bounds.maxY, baseZ] as const;
        addSegment(...topLeft, ...topRight);
        addSegment(...topRight, ...bottomRight);
        addSegment(...bottomRight, ...bottomLeft);
        addSegment(...bottomLeft, ...topLeft);
        for (const [x, y] of [
            [bounds.minX, bounds.minY],
            [bounds.maxX, bounds.minY],
            [bounds.maxX, bounds.maxY],
            [bounds.minX, bounds.maxY],
        ])
            addSegment(x, y, baseZ, x, y, -stockThickness);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
        );
        const material = new THREE.LineBasicMaterial({
            color: 0x6c7b8d,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
        });
        this.navigationGuide.add(new THREE.LineSegments(geometry, material));
    }

    /** Stock-sized XY grid: it is a dimensional reference, never an infinite scene grid. */
    private createStockGrid() {
        const geometry = new THREE.BufferGeometry();
        if (!this.data)
            return new THREE.LineSegments(
                geometry,
                new THREE.LineBasicMaterial(),
            );
        const { bounds, stockThickness } = this.data;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        const target = Math.max(width, height) / 12;
        const magnitude = 10 ** Math.floor(Math.log10(Math.max(target, 0.1)));
        const step =
            [1, 2, 5, 10]
                .map((unit) => unit * magnitude)
                .find((candidate) => candidate >= target) ?? target;
        const z = Math.min(0.02, stockThickness * 0.002);
        const positions: number[] = [];
        for (let x = bounds.minX; x <= bounds.maxX + step * 0.01; x += step)
            positions.push(x, bounds.minY, z, x, bounds.maxY, z);
        for (let y = bounds.minY; y <= bounds.maxY + step * 0.01; y += step)
            positions.push(bounds.minX, y, z, bounds.maxX, y, z);
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
        );
        return new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({
                color: 0x4b5563,
                transparent: true,
                opacity: 0.26,
                depthWrite: false,
            }),
        );
    }

    /**
     * Exact vector cutter envelope for flat profile cuts. The heightfield is
     * still used for V/ball relief, but a profile's floor and vertical faces
     * are swept from its source contour, so they do not inherit raster steps.
     */
    private createVectorProfileCuts(material: string) {
        const positions: number[] = [];
        const indices: number[] = [];
        const addQuad = (
            a: number[],
            b: number[],
            c: number[],
            d: number[],
        ) => {
            const index = positions.length / 3;
            positions.push(...a, ...b, ...c, ...d);
            indices.push(
                index,
                index + 1,
                index + 2,
                index,
                index + 2,
                index + 3,
            );
        };
        const addDisc = (
            point: { x: number; y: number },
            radius: number,
            depth: number,
        ) => {
            const center = positions.length / 3;
            positions.push(point.x, point.y, depth + 0.003);
            const segments = 16;
            for (let index = 0; index < segments; index += 1) {
                const angle = (index / segments) * Math.PI * 2;
                positions.push(
                    point.x + Math.cos(angle) * radius,
                    point.y + Math.sin(angle) * radius,
                    depth + 0.003,
                );
            }
            for (let index = 0; index < segments; index += 1)
                indices.push(
                    center,
                    center + 1 + index,
                    center + 1 + ((index + 1) % segments),
                );
        };
        for (const toolpath of this.previewToolpaths) {
            if (
                !toolpath.operation.startsWith('profile-') ||
                toolpath.cutterType !== 'flat'
            )
                continue;
            const depth = Math.min(
                -Math.abs(toolpath.cutDepth || 0),
                ...toolpath.passDepths.filter((value) => value < 0),
            );
            if (!Number.isFinite(depth) || depth >= 0) continue;
            const radius = Math.max(0.05, toolpath.toolDiameter / 2);
            for (const contour of toolpath.previewContours) {
                for (let index = 1; index < contour.length; index += 1) {
                    const a = contour[index - 1],
                        b = contour[index];
                    const dx = b.x - a.x,
                        dy = b.y - a.y;
                    const length = Math.hypot(dx, dy);
                    if (length < 1e-7) continue;
                    const nx = (-dy / length) * radius,
                        ny = (dx / length) * radius;
                    const al = [a.x + nx, a.y + ny, depth + 0.003];
                    const ar = [a.x - nx, a.y - ny, depth + 0.003];
                    const bl = [b.x + nx, b.y + ny, depth + 0.003];
                    const br = [b.x - nx, b.y - ny, depth + 0.003];
                    // Cut floor plus both vertical cutter-envelope faces.
                    addQuad(al, bl, br, ar);
                    addQuad([al[0], al[1], 0], [bl[0], bl[1], 0], bl, al);
                    addQuad([br[0], br[1], 0], [ar[0], ar[1], 0], ar, br);
                }
                for (const point of contour) addDisc(point, radius, depth);
            }
        }
        if (!positions.length) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return new THREE.Mesh(
            geometry,
            new THREE.MeshPhongMaterial({
                color: this.sideColor(),
                shininess: 14,
                specular: 0x161616,
                side: THREE.DoubleSide,
            }),
        );
    }

    private applyGrid(grid: Float32Array) {
        if (!this.data || !this.mesh) return;
        if (this.heightTexture) {
            (this.heightTexture.image as { data: Float32Array }).data = grid;
            this.heightTexture.needsUpdate = true;
            this.render();
            return;
        }
        const positions = this.mesh.geometry.getAttribute(
            'position',
        ) as THREE.BufferAttribute;
        const colors = this.mesh.geometry.getAttribute('color') as
            | THREE.BufferAttribute
            | undefined;
        for (let i = 0; i < grid.length; i += 1) {
            positions.setZ(i, grid[i]);
            const column = i % this.data.columns;
            const row = Math.floor(i / this.data.columns);
            if (colors)
                this.writeSurfaceColor(
                    colors.array as Float32Array,
                    i,
                    this.data.bounds.minX + column * this.data.cellX,
                    this.data.bounds.minY + row * this.data.cellY,
                    grid[i],
                    this.data.stockThickness,
                    this.data.material,
                );
        }
        positions.needsUpdate = true;
        if (colors) colors.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
        this.render();
    }

    /**
     * Cell quads: each cell has one sampled height instead of
     * sharing corners with four neighbours. This prevents a cut cell from
     * pulling adjacent stock down into a false sloped hole.
     */
    private createHeightfieldGeometry(columns: number, rows: number) {
        const geometry = new THREE.InstancedBufferGeometry();
        const cellColumns = Math.max(1, columns);
        const positions = new Float32Array(cellColumns * 4 * 3);
        const indices = new Uint32Array(cellColumns * 6);
        for (let column = 0; column < cellColumns; column += 1) {
            const vertex = column * 4;
            positions.set(
                [column, 0, 0, column, 1, 0, column, 0, 1, column, 1, 1],
                vertex * 3,
            );
            indices.set(
                [
                    vertex,
                    vertex + 2,
                    vertex + 1,
                    vertex + 1,
                    vertex + 2,
                    vertex + 3,
                ],
                column * 6,
            );
        }
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.instanceCount = Math.max(1, rows);
        if (this.data) {
            const { bounds, stockThickness } = this.data;
            geometry.boundingBox = new THREE.Box3(
                new THREE.Vector3(bounds.minX, bounds.minY, -stockThickness),
                new THREE.Vector3(bounds.maxX, bounds.maxY, 0),
            );
            geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(
                new THREE.Sphere(),
            );
        }
        return geometry;
    }

    private createHeightfieldMaterial(
        _material: string,
        bounds: Bounds,
        cellX: number,
        cellY: number,
        stockThickness: number,
    ) {
        const heightfield = this.heightTexture;
        const lodStep = { value: 1 };
        const meshMaterial = new THREE.MeshPhongMaterial({
            color: STOCK_SURFACE_COLOR,
            shininess: 14,
            specular: 0x161616,
            side: THREE.DoubleSide,
        });
        // Preserve Three's lit Phong pipeline while patching only the
        // heightfield displacement and its sampled surface normal.
        meshMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uHeightfield = { value: heightfield };
            shader.uniforms.uOrigin = {
                value: new THREE.Vector2(bounds.minX, bounds.minY),
            };
            shader.uniforms.uCell = { value: new THREE.Vector2(cellX, cellY) };
            shader.uniforms.uBottom = { value: -stockThickness };
            shader.uniforms.uLodStep = lodStep;
            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    uniform sampler2D uHeightfield;
                    uniform vec2 uOrigin;
                    uniform vec2 uCell;
                    uniform float uBottom;
                    uniform int uLodStep;
                    varying vec3 vStockNormal;
                    varying float vStockHeight;`,
                )
                .replace(
                    '#include <begin_vertex>',
                    `
                    ivec2 size = textureSize(uHeightfield, 0);
                    int step = max(uLodStep, 1);
                    int column = min(int(position.x + .5) * step, size.x - 1);
                    int row = min(gl_InstanceID * step, size.y - 1);
                    int spanX = max(1, min(step, size.x - column));
                    int spanY = max(1, min(step, size.y - row));
                    ivec2 cell = ivec2(column, row);
                    int right = column + spanX - 1;
                    int far = row + spanY - 1;
                    int middleX = column + spanX / 2;
                    int middleY = row + spanY / 2;
                    float surfaceHeight = min(min(texelFetch(uHeightfield, cell, 0).r,
                                                  texelFetch(uHeightfield, ivec2(right, row), 0).r),
                                              min(texelFetch(uHeightfield, ivec2(column, far), 0).r,
                                                  min(texelFetch(uHeightfield, ivec2(right, far), 0).r,
                                                      texelFetch(uHeightfield, ivec2(middleX, middleY), 0).r)));
                    vStockHeight = surfaceHeight;
                    vec3 displaced = vec3(
                        uOrigin.x + (float(column) + position.y * float(spanX)) * uCell.x,
                        uOrigin.y + (float(row) + position.z * float(spanY)) * uCell.y,
                        surfaceHeight
                    );
                    vec3 transformed = displaced;
                    ivec2 lastCell = size - ivec2(1);
                    ivec2 stride = ivec2(step);
                    float hL = texelFetch(uHeightfield, clamp(cell - ivec2(stride.x, 0), ivec2(0), lastCell), 0).r;
                    float hR = texelFetch(uHeightfield, clamp(cell + ivec2(stride.x, 0), ivec2(0), lastCell), 0).r;
                    float hD = texelFetch(uHeightfield, clamp(cell - ivec2(0, stride.y), ivec2(0), lastCell), 0).r;
                    float hU = texelFetch(uHeightfield, clamp(cell + ivec2(0, stride.y), ivec2(0), lastCell), 0).r;
                    vec3 stockNormal = normalize(vec3(-(hR - hL) / (2.0 * uCell.x), -(hU - hD) / (2.0 * uCell.y), 1.0));
                    vStockNormal = normalize(normalMatrix * stockNormal);
                `,
                );
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    uniform sampler2D uHeightfield;
                    uniform float uBottom;
                    varying vec3 vStockNormal;
                    varying float vStockHeight;`,
                )
                .replace(
                    '#include <clipping_planes_fragment>',
                    `#include <clipping_planes_fragment>
                    if (vStockHeight <= uBottom + 0.00001) discard;`,
                )
                .replace(
                    '#include <normal_fragment_maps>',
                    `#include <normal_fragment_maps>
                    normal = normalize(gl_FrontFacing ? vStockNormal : -vStockNormal);`,
                );
        };
        meshMaterial.customProgramCacheKey = () => 'heightfield-phong-v2';
        meshMaterial.userData.lodStepUniform = lodStep;
        return meshMaterial;
    }

    private play() {
        if (!this.data || !this.playGrid) this.resetPlayback();
        if (!this.data || !this.playGrid) return;
        this.onPlaybackChange?.({ running: true });
        const frame = () => {
            if (!this.data || !this.playGrid) return;
            const total = this.data.sampleData.length / 6;
            const end = Math.min(
                total,
                this.playIndex + Math.max(4, Math.ceil(total / 480)),
            );
            for (; this.playIndex < end; this.playIndex += 1)
                this.stamp(this.playIndex);
            this.applyGrid(this.playGrid);
            this.status.textContent = `Simulating cut ${Math.round((this.playIndex / total) * 100)}%`;
            if (this.playIndex < total)
                this.animation = requestAnimationFrame(frame);
            else {
                this.animation = null;
                this.tool.visible = false;
                this.onPlaybackChange?.({ running: false });
            }
        };
        this.animation = requestAnimationFrame(frame);
    }

    private stamp(index: number) {
        if (!this.data || !this.playGrid) return;
        const {
            sampleData,
            sampleKinds,
            bounds,
            columns,
            rows,
            cellX,
            cellY,
            stockThickness,
        } = this.data;
        const o = index * 6,
            x = sampleData[o],
            y = sampleData[o + 1],
            z = sampleData[o + 2],
            cutter = sampleData[o + 3],
            trochoid = sampleData[o + 4],
            angle = sampleData[o + 5];
        const vbit = sampleKinds[index] === 1,
            ball = sampleKinds[index] === 2;
        const radius = vbit
            ? Math.max(
                  -z * Math.tan((angle * Math.PI) / 360),
                  Math.max(cellX, cellY) * 0.7,
              )
            : cutter / 2 + trochoid;
        const minC = Math.max(
                0,
                Math.floor((x - radius - bounds.minX) / cellX),
            ),
            maxC = Math.min(
                columns - 1,
                Math.ceil((x + radius - bounds.minX) / cellX),
            );
        const minR = Math.max(
                0,
                Math.floor((y - radius - bounds.minY) / cellY),
            ),
            maxR = Math.min(
                rows - 1,
                Math.ceil((y + radius - bounds.minY) / cellY),
            );
        for (let row = minR; row <= maxR; row += 1)
            for (let col = minC; col <= maxC; col += 1) {
                const radial = Math.hypot(
                    bounds.minX + (col + 0.5) * cellX - x,
                    bounds.minY + (row + 0.5) * cellY - y,
                );
                if (radial > radius) continue;
                const cut = vbit
                    ? Math.min(
                          0,
                          z + radial / Math.tan((angle * Math.PI) / 360),
                      )
                    : ball
                      ? Math.min(
                            0,
                            z +
                                cutter / 2 -
                                Math.sqrt(
                                    Math.max(
                                        0,
                                        (cutter * cutter) / 4 - radial * radial,
                                    ),
                                ),
                        )
                      : z;
                this.playGrid[row * columns + col] = Math.max(
                    -stockThickness,
                    Math.min(this.playGrid[row * columns + col], cut),
                );
            }
        this.tool.position.set(x, y, z);
        this.tool.scale.setScalar(Math.max(cutter / 2, 0.5));
        this.tool.visible = true;
    }

    private stop() {
        if (this.animation) cancelAnimationFrame(this.animation);
        this.animation = null;
        this.onPlaybackChange?.({ running: false });
    }

    private render() {
        this.controls.update();
        this.queueRender();
    }

    /** Draw one frame per display refresh and choose GPU-only mesh LOD. */
    private queueRender() {
        if (this.renderFrame !== null) return;
        this.renderFrame = requestAnimationFrame(() => {
            this.renderFrame = null;
            this.updateSurfaceLod();
            this.renderer.render(this.scene, this.camera);
        });
    }

    /** Keep the worker-built heightfield fixed; skip sub-pixel cells on the GPU. */
    private updateSurfaceLod() {
        if (!this.data || !this.mesh) return;
        const pixelHeight = Math.max(
            1,
            this.renderer.getSize(new THREE.Vector2()).y,
        );
        const distance = this.camera.position.distanceTo(this.controls.target);
        const worldHeight =
            2 *
            distance *
            Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
        const cellPixels =
            (Math.min(this.data.cellX, this.data.cellY) * pixelHeight) /
            Math.max(worldHeight, 1e-6);
        const desiredStep = Math.min(
            16,
            Math.max(1, Math.ceil(1.25 / Math.max(cellPixels, 1e-6))),
        );
        const step = 2 ** Math.ceil(Math.log2(desiredStep));
        if (step === this.surfaceLodStep) return;
        this.surfaceLodStep = step;
        const geometry = this.mesh.geometry as THREE.InstancedBufferGeometry;
        const columns = Math.ceil(this.data.columns / step);
        geometry.setDrawRange(0, columns * 6);
        geometry.instanceCount = Math.ceil(this.data.rows / step);
        const material = this.mesh.material as THREE.MeshPhongMaterial;
        const lodStep = material.userData.lodStepUniform as
            | { value: number }
            | undefined;
        if (lodStep) lodStep.value = step;
    }

    private createWorker() {
        const worker = new Worker(
            new URL('./cut-preview-3d-worker.js', import.meta.url),
            { type: 'module' },
        );
        worker.onmessage = ({ data }) => this.onWorker(data);
        return worker;
    }

    private stockMaterial(_material: string, vertexColors: boolean) {
        return new THREE.MeshPhongMaterial({
            color: vertexColors ? STOCK_SURFACE_COLOR : this.sideColor(),
            shininess: 14,
            specular: 0x161616,
            side: THREE.DoubleSide,
        });
    }

    private stockSurfaceMaterial(_material: string) {
        return new THREE.MeshPhongMaterial({
            color: STOCK_SURFACE_COLOR,
            shininess: 14,
            specular: 0x161616,
            side: THREE.DoubleSide,
        });
    }

    private sideColor() {
        return new THREE.Color(STOCK_SURFACE_COLOR).multiplyScalar(0.58);
    }

    private writeSurfaceColor(
        target: Float32Array,
        index: number,
        _x: number,
        _y: number,
        _z: number,
        _thickness: number,
        _material: string,
    ) {
        target[index * 3] = 1;
        target[index * 3 + 1] = 1;
        target[index * 3 + 2] = 1;
    }

    /** Stock underside; all outside and cut walls are GPU heightfield edges. */
    private createStockShell(_grid: Float32Array) {
        if (!this.data) return new THREE.BufferGeometry();
        const { bounds, stockThickness } = this.data;
        const positions: number[] = [];
        const indices: number[] = [];
        const quad = (a: number[], b: number[], c: number[], d: number[]) => {
            const i = positions.length / 3;
            positions.push(...a, ...b, ...c, ...d);
            indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
        };
        const bottom = -stockThickness;
        quad(
            [bounds.minX, bounds.minY, bottom],
            [bounds.maxX, bounds.minY, bottom],
            [bounds.maxX, bounds.maxY, bottom],
            [bounds.minX, bounds.maxY, bottom],
        );
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    }

    /**
     * Row-strip wall pass. Every interior cell edge is sampled
     * by the GPU from the same height texture as the top sheet, so profile
     * walls are continuous without building millions of CPU triangles.
     */
    private createBoundaryWalls() {
        const group = new THREE.Group();
        if (!this.data || !this.heightTexture) return group;
        const { columns, rows } = this.data;
        const vertical = new THREE.Mesh(
            this.createWallStripGeometry(columns + 1, rows),
            this.createWallMaterial(true),
        );
        const horizontal = new THREE.Mesh(
            this.createWallStripGeometry(columns, rows + 1),
            this.createWallMaterial(false),
        );
        vertical.frustumCulled = false;
        horizontal.frustumCulled = false;
        group.add(vertical, horizontal);
        return group;
    }

    private createWallStripGeometry(edgesPerRow: number, instances: number) {
        const geometry = new THREE.InstancedBufferGeometry();
        const positions = new Float32Array(edgesPerRow * 12);
        const indices = new Uint32Array(edgesPerRow * 6);
        for (let edge = 0; edge < edgesPerRow; edge += 1) {
            const vertex = edge * 4;
            positions.set(
                [edge, 0, 0, edge, 1, 0, edge, 1, 1, edge, 0, 1],
                vertex * 3,
            );
            indices.set(
                [
                    vertex,
                    vertex + 1,
                    vertex + 2,
                    vertex,
                    vertex + 2,
                    vertex + 3,
                ],
                edge * 6,
            );
        }
        geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3),
        );
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.instanceCount = instances;
        if (this.data) {
            const { bounds, stockThickness } = this.data;
            geometry.boundingBox = new THREE.Box3(
                new THREE.Vector3(bounds.minX, bounds.minY, -stockThickness),
                new THREE.Vector3(bounds.maxX, bounds.maxY, 0),
            );
            geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(
                new THREE.Sphere(),
            );
        }
        return geometry;
    }

    private createWallMaterial(vertical: boolean) {
        if (!this.data || !this.heightTexture)
            return new THREE.MeshPhongMaterial({ color: STOCK_SURFACE_COLOR });
        const { bounds, cellX, cellY, stockThickness, columns, rows } =
            this.data;
        return new THREE.ShaderMaterial({
            uniforms: {
                uHeightfield: { value: this.heightTexture },
                uBottom: { value: -stockThickness },
                uOrigin: { value: new THREE.Vector2(bounds.minX, bounds.minY) },
                uCell: { value: new THREE.Vector2(cellX, cellY) },
                uColumns: { value: columns },
                uRows: { value: rows },
                uVertical: { value: vertical ? 1 : 0 },
                uColor: { value: this.sideColor() },
            },
            glslVersion: THREE.GLSL3,
            vertexShader: `
                uniform sampler2D uHeightfield;
                uniform float uBottom;
                uniform vec2 uOrigin;
                uniform vec2 uCell;
                uniform int uColumns;
                uniform int uRows;
                uniform float uVertical;
                out vec3 vWorldNormal;
                out float vWallHeight;
                float cellHeight(ivec2 cell) {
                    if (cell.x < 0 || cell.y < 0 || cell.x >= uColumns || cell.y >= uRows) return uBottom;
                    return texelFetch(uHeightfield, cell, 0).r;
                }
                bool edgeIsStep(float hNear, float hFar, float hNearBeyond, float hFarBeyond) {
                    float dCenter = hFar - hNear;
                    if (dCenter == 0.0) return false;
                    float dNear = hNear - hNearBeyond;
                    float dFar = hFarBeyond - hFar;
                    bool slope = (dNear * dCenter > 0.0 && abs(dCenter) <= 4.0 * abs(dNear)) || (dFar * dCenter > 0.0 && abs(dCenter) <= 4.0 * abs(dFar));
                    return !slope || min(hNear, hFar) <= uBottom + .000001;
                }
                void main() {
                    int edgeColumn = int(position.x + .5);
                    int edgeRow = gl_InstanceID;
                    vec3 start = vec3(uOrigin.x + float(edgeColumn) * uCell.x, uOrigin.y + float(edgeRow) * uCell.y, 0.0);
                    vec3 along;
                    vec3 perpendicular;
                    ivec2 nearCell;
                    ivec2 farCell;
                    ivec2 step;
                    if (uVertical > .5) {
                        along = vec3(0.0, uCell.y, 0.0);
                        perpendicular = vec3(1.0, 0.0, 0.0);
                        nearCell = ivec2(edgeColumn - 1, edgeRow);
                        farCell = ivec2(edgeColumn, edgeRow);
                        step = ivec2(1, 0);
                    } else {
                        along = vec3(uCell.x, 0.0, 0.0);
                        perpendicular = vec3(0.0, 1.0, 0.0);
                        nearCell = ivec2(edgeColumn, edgeRow - 1);
                        farCell = ivec2(edgeColumn, edgeRow);
                        step = ivec2(0, 1);
                    }
                    float hNear = cellHeight(nearCell);
                    float hFar = cellHeight(farCell);
                    float top = max(hNear, hFar);
                    float bottom = max(min(hNear, hFar), uBottom);
                    if (!edgeIsStep(hNear, hFar, cellHeight(nearCell - step), cellHeight(farCell + step))) top = bottom;
                    vec3 world = start + along * position.y;
                    world.z = mix(bottom, top, position.z);
                    float direction = hNear >= hFar ? 1.0 : -1.0;
                    vWorldNormal = normalize(direction * perpendicular);
                    vWallHeight = top - bottom;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                in vec3 vWorldNormal;
                in float vWallHeight;
                out vec4 outColor;
                void main() {
                    if (vWallHeight < .0001) discard;
                    vec3 lightDirection = normalize(vec3(.35, -.45, .82));
                    float diffuse = max(dot(normalize(vWorldNormal), lightDirection), 0.0);
                    outColor = vec4(uColor * (.58 + diffuse * .42), 1.0);
                }
            `,
            side: THREE.DoubleSide,
        });
    }

    /** Add only sharp pocket boundaries; smooth V-bit and ball-nose slopes stay faceted by the surface itself. */
    private createCutWalls(
        grid: Float32Array | null = this.data?.grid ?? null,
    ) {
        this.removeCutWalls();
        if (!this.data || !grid) return;
        const { columns, rows, bounds, cellX, cellY, stockThickness } =
            this.data;
        const threshold = Math.max(cellX, cellY) * 1.35;
        const positions: number[] = [];
        const indices: number[] = [];
        const wall = (a: number[], b: number[]) => {
            if (Math.abs(a[2] - b[2]) < threshold) return;
            const i = positions.length / 3;
            positions.push(
                ...a,
                ...b,
                b[0],
                b[1],
                Math.min(a[2], b[2]),
                a[0],
                a[1],
                Math.min(a[2], b[2]),
            );
            indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
        };
        for (let row = 0; row < rows; row += 1)
            for (let col = 0; col < columns; col += 1) {
                const i = row * columns + col,
                    x = bounds.minX + col * cellX,
                    y = bounds.minY + row * cellY;
                if (col + 1 < columns)
                    wall([x, y, grid[i]], [x + cellX, y, grid[i + 1]]);
                if (row + 1 < rows)
                    wall([x, y, grid[i]], [x, y + cellY, grid[i + columns]]);
            }
        if (!positions.length) return;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        this.cutWalls = new THREE.Mesh(
            geometry,
            new THREE.MeshPhongMaterial({
                color: this.sideColor(),
                shininess: 14,
                specular: 0x161616,
                side: THREE.DoubleSide,
            }),
        );
        this.root.add(this.cutWalls);
    }

    private removeCutWalls() {
        if (!this.cutWalls) return;
        this.root.remove(this.cutWalls);
        this.cutWalls.geometry.dispose();
        this.cutWalls.material.dispose();
        this.cutWalls = null;
    }
}
