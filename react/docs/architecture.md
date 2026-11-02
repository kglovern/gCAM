# gCAM architecture


## Boundaries

- `App.tsx` is the application controller: it wires typed domain hooks and
  passes a finished workspace model to `app/AppWorkspace.tsx`. It must not own
  drawing, import, persistence, geometry, or CAM implementation.
- `app/` contains application composition, lifecycle, preference, and modal
  boundaries.
- `document/` owns project state, history, import/export, bitmap placement,
  and persistence.
- `canvas/` owns the 2D scene, viewport interaction, camera, rulers, and
  canvas-only feedback painters.
- `draw/` owns shape/text construction; `interactions/` owns selection,
  transforms, trimming, guide, and arrange commands.
- `toolpaths/` owns CAM form/UI state. `tools/` owns the cutter library UI.
- `cam/` owns operation contracts, operation modules, toolpath generation,
  texture geometry, tabs, and G-code emission.
- `gcode/` owns controller output profiles/templates, export coordination,
  and program timing/playback preparation. `cam/gcode/` contains the lower-level
  motion/program emitters.
- `rotary/` owns rotary stock, profile/model preparation, CAM and preview.
- `layers/` owns layer identity, import metadata and layer controls.
- `platform/` owns browser/native file delivery, startup and updates;
  `integrations/` owns gSender handoff. Native shells and the file bridge live
  outside the React app in `packaging/`.
- `geometry/` owns reusable pure geometry primitives. `engine/` owns workers,
  rendering integrations, font loading, and low-level calculation adapters.
- `components/` holds reusable presentational controls only; they request
  commands and do not implement geometry or emit G-code.
- `engine/cam-worker-protocol.ts` is the single browser-worker contract.
  Requests and responses are discriminated and stale responses are ignored.

## Persistence

Portable `.gcam.json` exports choose the lowest envelope version needed:

- v2 stores the snapshot with inline bitmap data URLs.
- v3 stores shared bitmap data URLs once in `bitmapSources`, with each bitmap
  referring to its source index.
- v4 uses that source table and preserves live image-mask links.

Version 1 and legacy CamCanvas envelopes remain importable. Older readers must
reject versions they cannot preserve. Bitmap source files are also cached in
IndexedDB by asset ID; portable exports contain their source data and do not
depend on that local cache. Raster previews are compacted on save and restored
from validated laser paths on load. See `lib/project.ts` for the format contract.

## Quality gate

`.github/workflows/ci.yml` coordinates pull requests, main pushes, version tags
and manual builds. Quality includes Jest, TypeScript, Biome, the production
build and native shell/startup/file-bridge tests. Four Cypress shards exercise
browser workflows. Desktop builds run alongside those checks; tablet builds
wait for quality and browser success. Pages deployment and draft release
assembly have their own event conditions and depend on the build matrix.

Third-party CAM/vendor code is explicitly excluded from authored-source
formatting and lint checks. Automated preview/export checks do not establish
physical machining safety or calibrated Laser settings.

## Navigation rule

Place new behavior in the narrowest domain above. A file may coordinate its
domain, but reusable calculation, painting, worker, and command behavior must
be extracted into a named sibling module before it becomes a second concern.
