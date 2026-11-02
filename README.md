# gCAM

gCAM is a browser-based CAM application focused on approachable drawing and toolpath workflows for CNC users.

**Live app:** [petervanderwalt.github.io/gCAM](https://petervanderwalt.github.io/gCAM/)

## Workspaces

- **Milling:** profiles, pockets, engraving, V-carving, chamfers, image effects and 3D surface machining. Includes optional V-carve clearing and approximate cut-depth shading.
- **Rotary:** profile and STL workflows, starter profiles, stock supports and rotary toolpath preview.
- **Laser (experimental):** vector cuts, filled engraving and bitmap raster engraving, image processing/masks, material recipes, calibration jobs and power previews. Laser operation naming, ordering, duplication, output switches and bulk settings are currently separate from Milling's operation list.

Drawing tools include text, guides, transforms, Mirror, rectangular/circular patterns, Arrange, path repair, simplification, duplicate removal and iterative nesting. Generators such as Mandala and Clock are grouped under **Draw > Plugins**; a plugin SDK is not implemented.

Controller output presets and editable command blocks live in **Config > G-code Output**, with grblHAL as the default. See the [output guide](react/docs/gcode-output.md) for the supported settings and limits.

Laser support is physically untested and requires setup-specific calibration. Cut-depth shading is an approximate visual aid, not collision verification or a stock-removal guarantee. gSender or another host handles machine control, framing and job execution; tool changes remain a host/firmware responsibility.

## Development

Use Node 24 and Yarn 1.22.22, as used by CI. Node 22 and Node 20.19+ within the 20.x series are also supported by the application package.

```sh
corepack enable
cd react
yarn install --frozen-lockfile
yarn dev
```

The development server uses port **5174**. Production output goes to `dist-gcam-react/` at the repository root.

Run these checks from `react`:

| Command | Purpose |
| --- | --- |
| `yarn test --runInBand` | Jest unit and component tests |
| `yarn test:watch` | Watch unit tests during development |
| `yarn check-types` | TypeScript checks |
| `yarn lint` | Biome lint checks |
| `yarn format:check` | Biome formatting checks |
| `yarn build` | Type checking and production Vite build |
| `yarn test:e2e` | Cypress browser workflows on an isolated server |
| `yarn cy:open` | Interactive Cypress runner |

Use `yarn format` to apply formatting, or `yarn lint:fix` for safe lint fixes and formatting. Review the resulting changes. Rules and vendor exclusions are in `react/biome.json`.

Tests generally sit beside the source as `*.test.*`. Run a focused unit test with, for example:

```sh
yarn test --runInBand src/lib/image-mask.test.ts
```

Cypress starts its own server on **5180**, clears storage on that test origin and shuts the server down afterward. Run one Cypress suite at a time. A focused browser command is:

```sh
yarn test:e2e cypress/e2e/laser-mask-edit.cy.js
```

See the [browser workflow guide](react/cypress/README.md) for fixtures, additional commands and coverage limits.

## Repository structure

This is a directory map, not an exhaustive file inventory. Tests live next to their features unless noted otherwise.

```text
gCAM/
├── .github/workflows/       Main CI and reusable quality, browser, native and Pages jobs
├── packaging/
│   ├── desktop/            Electron shell, installers and smoke tests
│   ├── mobile/             Cordova Android/iPad shells and configuration
│   ├── plugins/            Native file-bridge plugin and tests
│   ├── resources/          Packaging assets
│   └── scripts/            Staging, startup, versioning and release helpers
├── react/
│   ├── assets/             Source artwork
│   ├── build/              Vite build integrations
│   ├── cypress/
│   │   ├── e2e/            Browser regression workflows
│   │   ├── benchmarks/     Explicitly invoked browser benchmarks
│   │   ├── fixtures/       Deterministic artwork, images, models and projects
│   │   └── support/        UI commands and export assertions
│   ├── docs/               Architecture, output settings and design/research notes
│   ├── public/             Bundled fonts, icons, tool catalogues, models and vendor WASM
│   ├── scripts/            Development/test runners
│   └── src/
│       ├── app/            Application composition, preferences, lifecycle and workspace layout
│       ├── cam/            CAM calculations, operation modules and G-code generation
│       ├── canvas/         2D painting, camera, rulers, selection, gestures and toolbar
│       ├── components/     Shared controls and editor panels
│       ├── cutting-parameters/  Machine/material/cutter recommendation models
│       ├── document/       Project state, history, imports and bitmap placement
│       ├── draw/           Shape/text construction and generators
│       ├── engine/         Workers, parser/calculation adapters, fonts and rendering integrations
│       ├── gcode/          Controller profiles, command templates, export and timed previews
│       ├── geometry/       Shared geometry primitives and contour helpers
│       ├── hooks/          Shared React hooks
│       ├── integrations/   gSender handoff
│       ├── interactions/   Drawing-edit commands, transforms, guides and nesting orchestration
│       ├── job/            Stock setup and bounds
│       ├── layers/         Layer model, metadata and controls
│       ├── lib/            Shared document/artwork utilities and project serialization
│       ├── platform/       Browser/native file delivery, startup, updates and assets
│       ├── rotary/         Rotary stock, profiles, models, CAM and preview
│       ├── styles/         Workspace styles
│       ├── test-stubs/     Test-only dependency substitutes
│       ├── toolpaths/      Operation forms, drafts, stack, rebuilding and preview presentation
│       ├── tools/          Cutter catalogue and user tool library
│       ├── App.tsx         Application controller and command wiring
│       └── main.tsx        React entry point
├── Example Files/          Example design files
├── library/                Repository library assets
└── README.md
```

`node_modules/`, `.cache/`, `dist-gcam-react/`, Cypress downloads/screenshots and native staging/build folders are generated or local working files, not application source.

## Tests and CI

Browser workflows cover Milling, Rotary and experimental Laser; vector/bitmap/model imports; drawing/editing; grouped holes; nesting; layers; configuration; tool libraries; persistence; cancellation; and downloaded project/G-code results. Some workflows also exercise preview rendering, power colours, playback, fitting and viewport changes. These checks do not establish physical machining safety, calibration or exhaustive stock-removal accuracy.

Avoid relying on fixed test counts in documentation: specs and adjacent unit tests are added with features. The current run summary is the source for pass/fail totals and skips.

[Build and test](.github/workflows/ci.yml) is the GitHub Actions entry point for pull requests, pushes to `main`, version tags and manual runs. It calls:

- [Quality](.github/workflows/quality.yml): Jest, types, Biome, production build, native shell/startup/file-bridge tests and native source checks.
- [Browser workflows](.github/workflows/browser-tests.yml): four Cypress shards, with screenshots and diagnostic reports uploaded on failure.
- [Desktop installers](.github/workflows/native-desktop.yml): Windows x64, Linux x64 and macOS arm64 builds and desktop smoke tests.
- [Tablet builds](.github/workflows/native-mobile.yml): Android and iOS simulator builds after quality/browser checks. Signed builds require the configured credentials and workflow options.

Pages deployment on `main` waits for the checks and native builds. Version tags must pass version/ancestry validation and the build matrix before CI assembles a **draft** GitHub release. Review and publish that draft separately. A successful build is not a physical hardware test.

## Further documentation

- [Architecture and persistence](react/docs/architecture.md)
- [G-code output settings](react/docs/gcode-output.md)
- [Rotary workflow](react/src/rotary/README.md)
- [Browser workflow guide](react/cypress/README.md)
- [Native builds](packaging/BUILDING.md)
- [Release procedure](packaging/RELEASING.md)
- [Cutting-parameter design notes](react/docs/adaptive-cutting-parameters.md)
- [Parametric CAD research](react/docs/parametric-cad-research.md)
