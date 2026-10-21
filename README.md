# gCAM

gCAM is a exploration of CAM workflows - to become a CAM app at some point

**Live app:** [petervanderwalt.github.io/gCAM](https://petervanderwalt.github.io/gCAM/)

## Development

Use Node 24, Node 22, or Node 20.19+.

```powershell
cd react
yarn
yarn dev
```

### Checks and tests

Run these commands from `react`:

| Tool | Purpose | Commands |
| --- | --- | --- |
| Biome | Linting and consistent code formatting | `yarn lint`, `yarn format:check` |
| Jest | Unit and component tests in adjacent `*.test.*` files | `yarn test --runInBand`, `yarn test:watch` |
| Cypress | Browser workflows using real UI interactions and imported fixtures | `yarn test:e2e`, `yarn cy:open` |
| TypeScript / Vite | Type checking and production build | `yarn check-types`, `yarn build` |

Use `yarn format` to apply formatting or `yarn lint:fix` to apply Biome's safe
lint fixes and formatting. Review the changes before committing. Rules and
exclusions live in `react/biome.json`; Jest configuration is in
`react/jest.config.cjs`.

Cypress starts an isolated server on port 5180 and stops it when the runner
exits. It covers image tracing and effects, STL/OBJ machining, vector operations,
drawing and snapping, editing, grouping/nesting, Config, and fresh tool-library
setup. Fixtures are included. Simulation is excluded. See the
[Cypress workflow guide](react/cypress/README.md) for details and individual-spec
commands.

GitHub Actions runs Jest, types, Biome and the build in
[Quality](.github/workflows/quality.yml), and Cypress in
[Browser tests](.github/workflows/browser-tests.yml), on pull requests and pushes
to `main`. Browser tests can also be started manually; failed runs upload
screenshots and any generated videos.

## Structure

This map reflects tracked application and test files. Bundled fonts, tool catalogue assets, tracing internals and browser fixtures are grouped for readability. `*.test.*` files test their adjacent feature.

```text
gCAM/
├── .github/
│   └── workflows/
│       ├── browser-tests.yml               Cypress browser workflow tests
│       ├── deploy-pages.yml                Builds and deploys the React app to GitHub Pages
│       └── quality.yml                     PR quality gate: test, types, lint, format, build
├── react/                                  The Vite + React application
│   ├── assets/
│   │   ├── logo.svg                        Source logo asset
│   │   └── Toolpaths.svg                   Source toolpath artwork asset
│   ├── cypress/                            Browser regression workflows and deterministic fixtures
│   │   ├── e2e/                            Browser workflow specifications
│   │   │   ├── drawing-config.cy.js        Drawing, snaps and Config persistence workflows
│   │   │   ├── editing.cy.js               Selection, transforms, grouping, nesting and geometry workflows
│   │   │   ├── tool-library.cy.js          Fresh-install cutter setup and persistence workflow
│   │   │   └── toolpaths.cy.js             Image, vector and STL/OBJ machining workflows
│   │   ├── fixtures/                       PNG, SVG and closed STL/OBJ relief fixtures; reset page
│   │   ├── support/                        Shared Cypress UI commands and export assertions
│   │   │   └── e2e.js                      Isolated project setup, canvas actions and machining checks
│   │   └── README.md                       Browser coverage, fixtures and runner guide
│   ├── docs/
│   │   ├── adaptive-cutting-parameters.md
│   │   └── architecture.md                 Boundary rules and architecture decisions
│   ├── public/                             Files copied unchanged into the built site
│   │   ├── assets/
│   │   │   ├── fonts/                      Bundled text fonts and their OFL licence files
│   │   │   └── operations/                 Operation icons
│   │   │       ├── chamfer.png
│   │   │       ├── countersink.svg
│   │   │       ├── engrave.png
│   │   │       ├── inside.png
│   │   │       ├── outside.png
│   │   │       ├── pocket.png
│   │   │       ├── surface-clear.svg
│   │   │       ├── surface-finish.svg
│   │   │       ├── surface-waterline.svg
│   │   │       ├── texture-fill.png
│   │   │       └── vcarve.png
│   │   ├── library/
│   │   │   └── tools/                      Bundled cutter catalogue assets
│   │   │       └── sienci/                 Sienci tool catalogue JSON and product images
│   │   ├── samples/
│   │   │   └── TicTacToe.dxf               Sample drawing used by onboarding
│   │   └── vendor/
│   │       └── cam-cpp/                    Prebuilt CAM WebAssembly module and JavaScript loader
│   │           ├── CREDITS.md
│   │           ├── web-cam-cpp.js
│   │           └── web-cam-cpp.wasm
│   ├── scripts/                            Development and test runners
│   │   └── e2e.mjs                         Starts isolated Vite server, runs Cypress and shuts down
│   ├── src/                                Authored application source
│   │   ├── app/                            Application composition, lifecycle, and modal boundary
│   │   │   ├── AppHeader.tsx               Header/menu presentation
│   │   │   ├── AppModalLayer.tsx           Chooses application-level modal content
│   │   │   ├── AppWorkspace.tsx            Places header, workspace, panels, and overlays
│   │   │   ├── createToolbarProps.ts       Builds toolbar props from workspace state
│   │   │   ├── createWorkspaceModel.ts
│   │   │   ├── EditorWorkspace.tsx         Main editor layout and panel composition
│   │   │   ├── ErrorBoundary.tsx           Recovers from a rendering exception
│   │   │   ├── MachineSetupModal.test.tsx  Adjacent feature regression tests
│   │   │   ├── MachineSetupModal.tsx       First-run machine selection
│   │   │   ├── ModalLayer.tsx              Reusable modal shell/portal layer
│   │   │   ├── useAppPreferences.ts        Persists UI preferences such as theme/units
│   │   │   ├── useArrangeWorkspaceState.ts  Wires arrange commands into the workspace
│   │   │   ├── useDocumentEditingCommands.ts
│   │   │   ├── useDrawingWorkspaceState.ts  Wires drawing commands and state into the workspace
│   │   │   ├── useEditorLifecycle.ts       Coordinates startup, autosave, and cleanup
│   │   │   ├── usePreviewState.ts          Owns G-code/cut-preview visibility and state
│   │   │   └── useTransformWorkspaceState.ts
│   │   ├── cam/                            CAM operation generation and G-code emission
│   │   │   ├── gcode/                      G-code program building blocks
│   │   │   │   ├── contours.js             Contour-to-motion emission
│   │   │   │   ├── format.js               Numeric/word formatting helpers
│   │   │   │   ├── program.js              Program headers, moves, and final assembly
│   │   │   │   └── program.test.js         Adjacent feature regression tests
│   │   │   ├── geometry/                   Reusable, pure document geometry helpers
│   │   │   │   └── polygons.js             CAM-specific polygon clipping/normalisation
│   │   │   ├── operations/                 Operation icons
│   │   │   │   ├── contract.js             Shared operation input/output contract
│   │   │   │   ├── engrave.js              Centreline engraving paths
│   │   │   │   ├── pocket.js               Interior clearing paths
│   │   │   │   ├── profile.js              Inside/outside/contour cut paths
│   │   │   │   ├── raster.js               Bitmap, laser, halftone, and V-bit raster paths
│   │   │   │   ├── registry.js             Operation dispatch registry
│   │   │   │   ├── registry.test.js        Registry coverage
│   │   │   │   ├── texture.js              Texture-fill operation paths
│   │   │   │   └── vcarve.js               V-carve calculation adapter
│   │   │   ├── cam-ops.js                  CAM orchestration and public operation entry points
│   │   │   ├── cam-ops.test.ts             CAM orchestration coverage
│   │   │   ├── gcode-validation.js         Validates emitted G-code safety/structure
│   │   │   ├── gcode-validation.test.js    Adjacent feature regression tests
│   │   │   ├── tabs.js                     Adds/removes holding tabs from toolpaths
│   │   │   ├── tabs.test.js                Tab geometry coverage
│   │   │   ├── texture-fill.js             Voronoi/crosshatch texture path generation
│   │   │   ├── texture-fill.test.js        Texture path regression coverage
│   │   │   └── texturePreview.js           Lightweight texture preview geometry
│   │   ├── canvas/                         2D CAD scene, camera, painting, and pointer interactions
│   │   │   ├── pointer/                    Focused input-mode handlers
│   │   │   │   ├── CanvasPointerController.test.tsx  Adjacent feature regression tests
│   │   │   │   ├── CanvasPointerController.tsx
│   │   │   │   ├── draw.ts                 Draw gesture handling
│   │   │   │   ├── guides.test.ts          Guide helper coverage
│   │   │   │   ├── guides.ts               Construction guide model/helpers
│   │   │   │   ├── helpers.ts              Shared pointer coordinate/gesture helpers
│   │   │   │   ├── keyboard.ts             Canvas keyboard shortcuts
│   │   │   │   ├── selection.test.ts       Adjacent feature regression tests
│   │   │   │   ├── selection.ts            Select/marquee handling
│   │   │   │   ├── tabs.ts                 Document-level tab helpers
│   │   │   │   ├── transform.ts            Document geometry transformations
│   │   │   │   ├── trim.ts                 Vector trim/split algorithms
│   │   │   │   └── types.ts                Toolbar contracts
│   │   │   ├── toolbar/                    Canvas toolbar subcomponents
│   │   │   │   ├── styles.ts               Shared toolbar class/style helpers
│   │   │   │   ├── ToolbarCommands.test.tsx  Adjacent feature regression tests
│   │   │   │   ├── ToolbarCommands.tsx     Command buttons
│   │   │   │   ├── ToolbarControls.tsx     Inline control widgets
│   │   │   │   ├── ToolbarForms.tsx        Draw/transform input forms
│   │   │   │   ├── ToolbarMenus.test.tsx   Adjacent feature regression tests
│   │   │   │   ├── ToolbarMenus.tsx        Toolbar menus
│   │   │   │   └── types.ts                Toolbar contracts
│   │   │   ├── camera.ts                   Coordinate conversion, zoom, pan, and fit helpers
│   │   │   ├── CanvasHud.test.tsx          Adjacent feature regression tests
│   │   │   ├── CanvasHud.tsx               Canvas-only heads-up UI
│   │   │   ├── CanvasStage.tsx             Canvas host and scene lifecycle
│   │   │   ├── CanvasStage.types.ts        CanvasStage public prop/type definitions
│   │   │   ├── CanvasToolbar.tsx           Toolbar placement on the canvas
│   │   │   ├── CanvasViewport.tsx          Scroll/zoom viewport and camera coordination
│   │   │   ├── EmptyCanvasPrompt.tsx       Empty-document import/draw prompt
│   │   │   ├── paintInteractionOverlays.ts
│   │   │   ├── pointerState.test.ts        Pointer state coverage
│   │   │   ├── pointerState.ts             Pointer gesture state machine
│   │   │   ├── primitives.ts               Canvas primitive drawing helpers
│   │   │   ├── rulers.ts                   Shared ruler calculations
│   │   │   ├── sceneRenderer.test.ts       Scene render regression coverage
│   │   │   ├── sceneRenderer.ts            Draws document geometry and toolpath previews
│   │   │   ├── selectionGeometry.test.ts   Adjacent feature regression tests
│   │   │   ├── selectionGeometry.ts        Selection bounds/handles geometry
│   │   │   ├── stageViewState.ts           Derived viewport/view state
│   │   │   ├── tabInteraction.test.ts      Tab interaction coverage
│   │   │   ├── tabInteraction.ts           Tab placement/removal interaction logic
│   │   │   ├── theme.ts                    Canvas colour/theme mapping
│   │   │   ├── transformInteraction.ts     Drag/resize/rotate interaction math
│   │   │   ├── transformOverlay.ts         Renders transform handles and guides
│   │   │   ├── types.ts                    Toolbar contracts
│   │   │   └── useCanvasViewportCommands.ts
│   │   ├── components/                     Reusable presentational UI, not domain implementation
│   │   │   ├── AppToolbars.tsx             Application toolbar composition
│   │   │   ├── CadInspector.test.tsx       Adjacent feature regression tests
│   │   │   ├── CadInspector.tsx            Selected-object inspector UI
│   │   │   ├── ConfigPanel.test.tsx        Adjacent feature regression tests
│   │   │   ├── ConfigPanel.tsx             Job/machine configuration panel
│   │   │   ├── ConfirmDialog.tsx           Reusable confirmation dialog
│   │   │   ├── CutPreview3DView.tsx        React host for cut preview
│   │   │   ├── EditMenu.tsx                Edit command menu
│   │   │   ├── GcodePreview.tsx            G-code output panel
│   │   │   ├── GcodeViewer3DView.tsx       React host for 3D toolpath viewer
│   │   │   ├── ObjectTree.tsx              Document object tree
│   │   │   ├── Sidebar.tsx                 Shared sidebar layout
│   │   │   ├── Toasts.tsx                  Notification presentation
│   │   │   ├── TraceModal.tsx              Bitmap trace settings and confirmation UI
│   │   │   └── UnitInput.tsx               Unit-aware numeric input with editable drafts
│   │   ├── cutting-parameters/             Machine, material and cutter based cutting recommendations
│   │   │   ├── machines.test.ts            Adjacent feature regression tests
│   │   │   ├── machines.ts                 Machine profiles and capability limits
│   │   │   ├── recipes.ts                  Material cutting recipe data
│   │   │   ├── recommend.test.ts           Adjacent feature regression tests
│   │   │   ├── recommend.ts                Calculates cutting recommendations
│   │   │   ├── types.test.ts               Adjacent feature regression tests
│   │   │   └── types.ts                    Cutting recommendation contracts
│   │   ├── document/                       Project state, files, import, history, and persistence
│   │   │   ├── BitmapImportModal.test.tsx  Adjacent feature regression tests
│   │   │   ├── BitmapImportModal.tsx       Selects raster import mode: bitmap or trace
│   │   │   ├── projectFile.ts              Versioned .gcam.json project serialization/migration
│   │   │   ├── SurfaceUnitsModal.test.tsx  Adjacent feature regression tests
│   │   │   ├── SurfaceUnitsModal.tsx       STL/OBJ units and model placement setup
│   │   │   ├── useBitmapCommands.ts        Bitmap placement, tracing, and asset commands
│   │   │   ├── useDocumentPersistence.ts
│   │   │   ├── useDocumentState.ts         Canonical document/history React state
│   │   │   ├── useDocumentWorkspace.ts
│   │   │   ├── useFileLoading.ts           Loads DXF/SVG/bitmap/project files
│   │   │   ├── useNewCanvasCommand.ts      Creates/resets a new drawing document
│   │   │   ├── useProjectFileCommands.ts
│   │   │   ├── useVectorImport.ts          Converts imported SVG/DXF into document geometry
│   │   │   ├── VectorUnitsModal.test.tsx   Adjacent feature regression tests
│   │   │   └── VectorUnitsModal.tsx        Vector import units confirmation
│   │   ├── draw/                           New shape/text construction
│   │   │   ├── geometry.test.ts            Shape geometry coverage
│   │   │   ├── geometry.ts                 Creates rectangles, circles, polygons, and lines
│   │   │   ├── textGeometry.test.ts        Text geometry coverage
│   │   │   ├── textGeometry.ts             Converts text into stroke/vector geometry
│   │   │   ├── TextPlacementModal.tsx      Text entry and placement UI
│   │   │   └── useDrawCommands.ts          React commands for all drawing tools
│   │   ├── engine/                         Workers, render integrations, parsing, and low-level adapters
│   │   │   ├── fonts/                      Bundled text fonts and their OFL licence files
│   │   │   │   └── stroke-glyphs.js        Stroke glyph data for CAD text
│   │   │   ├── gcode-viewer-3d/
│   │   │   │   └── sprites.js              G-code viewer sprite assets/helpers
│   │   │   ├── potrace-js/                 Vendored bitmap tracing implementation
│   │   │   ├── preview-3d/                 Internal pieces of the Three.js cut preview
│   │   │   │   ├── camera-controls.js
│   │   │   │   ├── cutter-envelope.js      Cutter shape and envelope calculations
│   │   │   │   ├── cutter-envelope.test.js  Adjacent feature regression tests
│   │   │   │   ├── math.js                 Preview vector/math helpers
│   │   │   │   ├── origin-overlay.js
│   │   │   │   ├── playback-mesh.js        Animated toolpath mesh construction
│   │   │   │   ├── sample-decimation.js    Preview sampling reduction
│   │   │   │   ├── sample-decimation.test.js  Adjacent feature regression tests
│   │   │   │   ├── scene-projection.js
│   │   │   │   ├── surface-texture.js      Cut-surface texture generation
│   │   │   │   └── worker-input.js         Preview worker payload construction
│   │   │   ├── cad-font.js                 CAD stroke-font loading adapter
│   │   │   ├── cam-worker-client.ts        Main-thread CAM worker client
│   │   │   ├── cam-worker-protocol.ts      Typed request/response worker contract
│   │   │   ├── cam-worker.ts               Background CAM worker entry point
│   │   │   ├── clipper_unminified.js       Vendored polygon clipping implementation
│   │   │   ├── clipper-shim.js             Local compatibility wrapper for Clipper
│   │   │   ├── constants.js                Engine-wide constants
│   │   │   ├── cut-preview-3d-worker.js
│   │   │   ├── cut-preview-3d.js           Three.js cut preview controller
│   │   │   ├── cxf.js                      CXF stroke-font parsing
│   │   │   ├── cxf.test.ts                 Adjacent feature regression tests
│   │   │   ├── dxf.js                      DXF parsing/import adapter
│   │   │   ├── gcode-viewer-3d.js          Three.js G-code viewer controller
│   │   │   ├── gcode-viewer-worker.js      Background G-code viewer calculation
│   │   │   ├── google-font-catalog.js      Bundled font catalogue metadata
│   │   │   ├── mesh-stock-simulator.ts     Mesh-based stock-removal simulation
│   │   │   ├── opentype.module.js          Vendored OpenType parser module
│   │   │   ├── parse.test.ts               Import/parser integration coverage
│   │   │   ├── paths.js                    Path conversion/normalisation helpers
│   │   │   ├── surface-cam-cancel.ts       Surface calculation cancellation helpers
│   │   │   ├── surface-cam-gpu-utils.ts    Shared surface GPU utilities
│   │   │   ├── surface-cam-runner.test.ts  Adjacent feature regression tests
│   │   │   ├── surface-cam-runner.ts       Coordinates surface toolpath generation
│   │   │   ├── surface-cam-webgpu.test.ts  Adjacent feature regression tests
│   │   │   ├── surface-cam-webgpu.ts       WebGPU surface machining implementation
│   │   │   ├── surface-cam-webgpu.worker.ts  WebGPU surface machining worker
│   │   │   ├── surface-cam.test.ts         Adjacent feature regression tests
│   │   │   ├── surface-cam.ts              3D surface machining strategies
│   │   │   ├── surface-model.test.ts       Adjacent feature regression tests
│   │   │   ├── surface-model.ts            Mesh placement, top alignment and stock-fit scaling
│   │   │   ├── surface-raster-webgpu.test.ts  Adjacent feature regression tests
│   │   │   ├── surface-raster-webgpu.worker.ts  WebGPU mesh raster worker
│   │   │   ├── surface-raster.worker.ts    CPU mesh raster worker
│   │   │   ├── svg.js                      SVG parsing/export helpers
│   │   │   ├── vcarve-worker.js            Worker for V-carve calculation
│   │   │   └── vcarve.js                   V-carve calculation adapter
│   │   ├── geometry/                       Reusable, pure document geometry helpers
│   │   │   ├── bounds.js                   Bounds/intersection utilities
│   │   │   ├── loops.js                    Closed-loop construction and traversal
│   │   │   ├── matrix.js                   2D matrix operations
│   │   │   ├── primitives.js               Basic point/line/arc helpers
│   │   │   ├── segments.js                 Segment splitting/intersection helpers
│   │   │   ├── splines.js                  Spline evaluation/conversion helpers
│   │   │   └── transforms.js               Geometry transform utilities
│   │   ├── hooks/
│   │   │   ├── useDarkMode.test.tsx        Adjacent feature regression tests
│   │   │   └── useDarkMode.ts              Theme preference React hook
│   │   ├── interactions/                   Selection, inspector, transform, trim, arrange commands
│   │   │   ├── inspectorGeometry.test.ts   Adjacent feature regression tests
│   │   │   ├── inspectorGeometry.ts        Inspector dimension/position calculations
│   │   │   ├── useAppKeyboardShortcuts.ts
│   │   │   ├── useArrangeCommands.ts       Align, distribute, order, and grouping commands
│   │   │   ├── useCadInspector.ts          Inspector state and edit commands
│   │   │   ├── useCornerCommands.ts        Corner rounding/chamfer commands
│   │   │   ├── useGuideCommands.ts         Guide creation/edit commands
│   │   │   ├── useInspectorCommands.ts     Object-property editing commands
│   │   │   ├── useSelectionCommands.ts     Selection and deletion commands
│   │   │   ├── useSelectionFrame.ts        Selection-frame state for the canvas
│   │   │   ├── useTransformCommands.ts     Move/scale/rotate/flip commands
│   │   │   ├── useTrimCommands.ts          Vector trimming commands
│   │   │   └── useVisibleSelection.ts      Derived visible selection state
│   │   ├── job/                            Shared job stock model and setup UI
│   │   │   ├── JobStockSetup.test.tsx      Adjacent feature regression tests
│   │   │   ├── JobStockSetup.tsx           Job-level dimensions, thickness and material controls
│   │   │   └── stock.ts                    Job stock defaults, normalization and geometry helpers
│   │   ├── lib/                            Shared document utilities and pure feature algorithms
│   │   │   ├── assets.ts                   IndexedDB bitmap asset cache
│   │   │   ├── autosave.ts                 Local document autosave helpers
│   │   │   ├── bitmap.test.ts              Bitmap utility coverage
│   │   │   ├── bitmap.ts                   Bitmap decode, sampling, and placement helpers
│   │   │   ├── corners.test.ts             Corner algorithm coverage
│   │   │   ├── corners.ts                  Corner round/chamfer algorithms
│   │   │   ├── engine.ts                   Engine adapter facade
│   │   │   ├── groups.test.ts              Group operations coverage
│   │   │   ├── groups.ts                   Group/ungroup operations
│   │   │   ├── guides.test.ts              Guide helper coverage
│   │   │   ├── guides.ts                   Construction guide model/helpers
│   │   │   ├── history.test.ts             History coverage
│   │   │   ├── history.ts                  Undo/redo history model
│   │   │   ├── ids.ts                      Stable document ID generation
│   │   │   ├── import.test.ts              Import helper coverage
│   │   │   ├── import.ts                   Import normalisation helpers
│   │   │   ├── library.test.ts             Library adapter coverage
│   │   │   ├── library.ts                  Legacy/public library data adapter
│   │   │   ├── nest.test.ts                Nesting coverage
│   │   │   ├── nest.ts                     Part nesting algorithm
│   │   │   ├── project.test.ts             Project model coverage
│   │   │   ├── project.ts                  Project domain types/defaults
│   │   │   ├── rulers.test.ts              Ruler coverage
│   │   │   ├── tabs.test.ts                Tab helper coverage
│   │   │   ├── tabs.ts                     Document-level tab helpers
│   │   │   ├── trace.test.ts               Trace coverage
│   │   │   ├── trace.ts                    Bitmap-to-vector tracing facade
│   │   │   ├── transform.test.ts           Transform coverage
│   │   │   ├── transform.ts                Document geometry transformations
│   │   │   ├── trim.test.ts                Trim coverage
│   │   │   ├── trim.ts                     Vector trim/split algorithms
│   │   │   ├── units.test.ts               Unit conversion coverage
│   │   │   ├── units.ts                    Canonical mm conversion and display-unit helpers
│   │   │   ├── useStableCallback.test.tsx  Adjacent feature regression tests
│   │   │   └── useStableCallback.ts        Stable callback identity with current implementation
│   │   ├── test-stubs/                     Browser/Three.js substitutions for Jest
│   │   │   ├── file.ts                     File API stub
│   │   │   └── orbit-controls.ts           Three.js OrbitControls stub
│   │   ├── toolpaths/                      Toolpath form state, operation picker, and output UI
│   │   │   ├── CuttingFields.tsx           Common cutting depth/feed/plunge fields
│   │   │   ├── CuttingRecipeFields.test.tsx  Adjacent feature regression tests
│   │   │   ├── CuttingRecipeFields.tsx     Recommended cutting parameters and overrides
│   │   │   ├── operationCatalog.test.ts    Adjacent feature regression tests
│   │   │   ├── operationCatalog.ts         UI metadata for each toolpath operation
│   │   │   ├── OutputWorkspace.tsx         G-code and 3D preview workspace
│   │   │   ├── RasterLaserFields.tsx       Laser-raster and halftone settings
│   │   │   ├── SurfaceCamFields.tsx        3D strategy, boundary, margin and stock-fit controls
│   │   │   ├── TextureFields.tsx           Voronoi/crosshatch texture settings
│   │   │   ├── ToolpathEmptyState.tsx      No-operation guidance
│   │   │   ├── ToolpathFormAlerts.tsx      Form validation/warnings
│   │   │   ├── ToolpathOperationPicker.tsx
│   │   │   ├── ToolpathPanel.tsx           Main toolpath editor and preview coordinator
│   │   │   ├── ToolpathRail.test.tsx       Adjacent feature regression tests
│   │   │   ├── ToolpathRail.tsx            Existing-operation navigation rail
│   │   │   ├── toolpathRequest.test.ts     Toolpath request coverage
│   │   │   ├── toolpathRequest.ts          Translates form data into CAM requests
│   │   │   ├── ToolpathSubmitControls.test.tsx  Adjacent feature regression tests
│   │   │   ├── ToolpathSubmitControls.tsx
│   │   │   ├── ToolSelectionFields.tsx     Tool picker and cutter details
│   │   │   ├── ToolSlotSelector.test.tsx   Adjacent feature regression tests
│   │   │   ├── ToolSlotSelector.tsx        Tool slot selection UI
│   │   │   ├── useToolpathPresentation.ts
│   │   │   ├── useToolpathStack.test.ts    Adjacent feature regression tests
│   │   │   ├── useToolpathStack.ts         Operation list, draft, create, and update state
│   │   │   └── VBitRasterFields.tsx        V-bit raster/heightmap settings
│   │   ├── tools/                          Cutter library model and management UI
│   │   │   ├── ImagePicker.tsx             Tool image selection UI
│   │   │   ├── library.test.ts             Library adapter coverage
│   │   │   ├── library.ts                  Legacy/public library data adapter
│   │   │   ├── toolCatalog.ts              Tool catalogue lookup/filter utilities
│   │   │   ├── ToolCatalogSelect.tsx       Tool catalogue selection control
│   │   │   ├── ToolLibraryModal.tsx        Add/edit/manage tool library modal
│   │   │   └── ToolSlotRow.tsx             One selectable tool-slot row
│   │   ├── App.tsx                         Thin application controller and domain composition root
│   │   ├── engine.test.ts                  End-to-end engine integration coverage
│   │   ├── index.css                       Global styles, CSS variables, and Tailwind layers
│   │   ├── main.tsx                        React bootstrap: mounts App into the Vite document
│   │   ├── vite-env.d.ts                   Vite TypeScript declarations
│   │   └── zzparse.test.tsx                Parsing/render regression coverage
│   ├── .gitignore                          Ignores React build/cache/dependency output
│   ├── babel.config.cjs                    Babel configuration used by Jest
│   ├── biome.json                          Formatting/lint rules and vendor exclusions
│   ├── checkfile.js                        Small local file-check helper
│   ├── cypress.config.cjs                  Cypress browser runner configuration and download tasks
│   ├── index.html                          Vite HTML entry document
│   ├── jest.config.cjs                     Jest test environment and transform setup
│   ├── jest.setup.cjs                      Shared Jest DOM matchers/setup
│   ├── package.json                        Scripts, runtime dependencies, and tool versions
│   ├── postcss.config.cjs                  PostCSS/Tailwind processing configuration
│   ├── tailwind.config.ts                  Tailwind theme/content configuration
│   ├── tsconfig.json                       Browser TypeScript compiler configuration
│   ├── tsconfig.node.json                  Node/Vite TypeScript compiler configuration
│   ├── vite.config.ts                      Vite dev/build configuration and Pages base path
│   └── yarn.lock                           Locked dependency graph
├── .gitattributes                          LF line endings for the React project
├── .gitignore                              Ignores React build/cache/dependency output
└── README.md                               This repository map and development guide
```

See [`react/docs/architecture.md`](react/docs/architecture.md) for the concise
boundary rules used during implementation and review.
See [`react/docs/adaptive-cutting-parameters.md`](react/docs/adaptive-cutting-parameters.md)
for the proposed machine, material, and cutter based cutting-parameter system.

## Test coverage

### Cypress browser workflows

The four specs contain 44 tests. Each starts with isolated browser storage and
uses UI controls, imported fixtures and downloaded project/G-code files to
check results. Unexpected application exceptions fail the tests.

#### Images and machining — `toolpaths.cy.js` (20 tests)

| Test | What it checks |
| --- | --- |
| Bitmap tracing | Imports the contrast PNG, converts it to vectors, checks that the bitmap is replaced and traced paths are selected, then generates an Engrave toolpath. |
| Laser Raster, Wavy, Halftone (one test each) | Retains the imported bitmap and generates and exports the chosen image operation. |
| Outside, Inside, Pocket, Engrave, Chamfer, V-Carve, V-Bit Countersink, Texture Fill, Laser Cut (one test each) | Selects fixture geometry, creates the operation and downloads G-code. |
| Crosshatch texture | Generates and exports the crosshatch variant of Texture Fill. |
| STL / OBJ → 3D Surface Clear (one test per format) | Confirms millimetre units and retained mesh data, uses a rectangular machining boundary with margin, then generates and exports clearing paths. |
| STL / OBJ → 3D Surface Finish (one test per format) | Fits a 10 mm relief into 5 mm stock using Z-only scaling; checks that XY size stays unchanged and Z scale becomes 0.5, then exports finishing paths. |
| STL / OBJ → 3D Waterline Finish (one test per format) | Fits the relief into 5 mm stock using uniform XYZ scaling; checks the reduced XY size, then exports waterline paths. |

Every machining test checks for a saved toolpath with a nonempty preview,
G-code motion commands and program termination, and no `NaN`, `Infinity` or
`undefined` values. Mesh tests also check cutting Z against the stock bottom
and the expected top/finishing-allowance limit.

#### Drawing and Config — `drawing-config.cy.js` (9 tests)

| Test | What it checks |
| --- | --- |
| Rectangle grid snapping | Clicks near grid intersections and checks the exported rectangle corners land on the grid. |
| Endpoint, midpoint and guide snapping | Adds a guide and draws lines near existing endpoints, edge midpoints and the guide; checks the resulting coordinates. |
| Circle, Polygon, Arc, Bezier, Polyline (one test each) | Draws each shape through the canvas and checks that exported geometry exists with finite coordinates. |
| Vector text | Places text through the drawing controls and checks that text geometry is present and selected. |
| Configuration | Changes units, grid style, machine profile and toast duration; checks the exported Config file, then reloads and checks units, grid and machine persistence. |

#### Editing and geometry — `editing.cy.js` (14 tests)

| Test | What it checks |
| --- | --- |
| Selection | Plain clicks replace selection, Ctrl-clicks toggle membership, and clicking empty space clears selection. |
| Group, ungroup and nest | Checks shared group identity and its removal, then nests selected parts within a 100 × 100 mm sheet without overlapping bounding boxes. |
| Zoom, fit and history | Checks zoom-in/out scale changes, invokes Fit View, then checks object counts after clone, confirmed delete, undo and redo. |
| Numeric position and size | Applies X, Y, width and height through shape properties and checks exported bounds. |
| Drag move and marquee | Checks the translated shape position and the number of objects selected by a drag box. |
| Union, difference, intersection, XOR (one test each) | Applies each Boolean to overlapping rectangles and checks the resulting total area. |
| Trim | Removes the segment between crossing vectors and checks that the remaining horizontal segments have the expected total length. |
| Offset | Applies a 2 mm outward offset and checks the resulting bounds. |
| Fillet | Rounds a clicked corner and checks object count, added curve points and the resulting area. |
| Chamfer | Applies a 2 mm chamfer and checks the rectangle's resulting area. |
| Dogbone | Adds relief at a clicked corner and checks the added object and its geometry. |

#### First-install tools — `tool-library.cy.js` (1 test)

Starts with no configured cutters, follows **Set up your tools**, and creates
flat, ball and 60-degree V-bit entries. Checks the saved tool types, reloads the
app, and verifies that all three cutters remain available in the tool selector.

Fixtures include a contrast PNG, SVG shapes/overlaps/crossing lines, and matching
closed 20 × 20 × 10 mm STL and OBJ pyramid reliefs. See the
[Cypress workflow guide](react/cypress/README.md) for fixture and runner details.
Simulation is excluded; these checks do not validate stock-removal rendering or
every machining parameter combination.

### Jest unit and component tests

Jest tests live beside the feature they check as `*.test.*` files. They provide
more focused coverage than the browser workflows:

| Area | Coverage |
| --- | --- |
| Imports and models | Vector/bitmap/model import helpers, parser behavior, tracing, units dialogs, surface-model placement and scaling. |
| Drawing and canvas | Drawing/text geometry, selection geometry and pointer behavior, guides, rulers, tabs, toolbar commands/menus and canvas rendering helpers. |
| Document editing | Transformations, trim, corners, grouping, nesting, undo/redo history, project defaults and unit conversion. |
| CAM and G-code | Operation registry and geometry, Boolean regressions, texture fill, tabs, surface strategies/runners and G-code generation/validation. |
| Job and tools | Job stock controls, tool-library data and selectors, operation availability, toolpath requests/stack/submission, and cutting recommendations based on cutter, material and machine. |
| Application UI | Config and inspector components, machine setup, bitmap/vector import choices, theme behavior and shared callback behavior. |

Use `yarn test --runInBand` for the suite, `yarn test:watch` during development,
or pass a file path to run a focused test, for example:

```sh
yarn test --runInBand src/lib/trim.test.ts
```

Biome checks code style and lint rules; TypeScript checks types. These complement
the behavioral tests above and run alongside them in the quality workflow.
