# Browser workflows

Run from `react` with Node 24 (or a supported Node 22/20.19+ release) and Yarn 1:

```sh
yarn install --frozen-lockfile
yarn test:e2e
yarn cy:open
```

Both commands start a separate Vite server at `http://127.0.0.1:5180` and stop it when Cypress exits. The runner rejects an occupied port. Run one Cypress suite at a time; it does not use the development app at port 5174.

To run one spec, or several comma-separated specs:

```sh
yarn test:e2e cypress/e2e/laser-mask-edit.cy.js
yarn test:e2e cypress/e2e/laser-mask-edit.cy.js,cypress/e2e/laser-mask-links.cy.js
```

The equivalent direct runner is `node scripts/e2e.mjs`. Separate performance specs live in `cypress/benchmarks/` and are enabled when explicitly passed to that runner. Benchmarks that inspect compiled workers require `yarn build` first. Read the individual benchmark's setup and assertions before interpreting its results.

## Isolation and assertions

`cy.freshProject()` resets IndexedDB and local storage on the test origin, completes machine setup and starts a new project. By default it seeds flat, ball and V-bit tool slots; tests can request an empty library or different selection behaviour. Fixtures are stored in `fixtures/` and do not require user files.

Shared commands in `support/e2e.js` use the real menus, form fields and canvas camera transform. Geometry and persistence checks read exported `.gcam.json` snapshots; machining checks also inspect toolpath results and downloaded G-code. Controller profiles determine the extension, commonly `.gcode` for grblHAL/Grbl. Use `cy.task('clearDownloads')` before starting a new download assertion so a previous export cannot satisfy it.

Some focused browser specs import calculation modules to compare native image rendering or exercise workers. These supplement the UI workflows; they are not physical machine tests. Unexpected application exceptions fail the workflows.

## Coverage

| Area | Examples |
| --- | --- |
| Milling | Profiles, pockets, engraving, chamfer width/tip offset, V-carving, paired clearing/finishing, tabs, image effects and 3D surface operations |
| Rotary | Profile/model preparation, starter profiles, stock supports, fits, toolpath generation and export |
| Experimental Laser | Vector cuts/fills, raster image modes, image adjustments, masks, bridges, overscan, materials/calibration jobs, operation controls and export |
| Drawing and editing | Shape/text tools, rulers/guides, snapping, selection, transforms, Mirror, patterns, Arrange, repair, simplification, duplicate removal and nesting |
| Layers and tools | Import metadata, visibility/selection, tool catalogue filters and first-install tool setup |
| Persistence and reliability | Project/config exports, reload/recovery, shared image sources, mask links, cancellation and rejection of obsolete results |
| Preview | Cut-depth cues, laser power colours, rendering/fit checks, playback/seek/reset and viewport changes |
| Output and integration | Controller presets, arc output, numeric/motion checks, individual exports and gSender handoff |

Some specs cover saved or deferred compatibility paths, including hidden Rotary Laser behaviour. Their presence does not mean those features are exposed as supported user workflows.

Fixtures include bitmap images, embedded-image SVGs, layered/vector artwork, DXFs, STL/OBJ models and saved projects. The test runner summary is the current source for spec/test totals and skips; do not maintain a duplicate count here.

## CI and limits

[The main CI workflow](../../.github/workflows/ci.yml) calls [Browser workflows](../../.github/workflows/browser-tests.yml), which distributes sorted `e2e/*.cy.js` specs across four shards with fail-fast disabled. Failure artifacts include screenshots, any enabled videos and selected image-comparison reports. Downloads and screenshots are local/generated files, not committed fixtures.

Preview rendering is tested in selected workflows. This does not establish exhaustive stock-removal accuracy, collision safety, every controller/parameter combination, physical Laser readiness or material calibration. Performance cases measure their stated workloads; they are not general speed comparisons with other applications.
