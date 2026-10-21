# Rotary (Vortex) workflow

Fourth sidebar tab (`Rotary`, Cylinder icon). No 2.5D canvas, rail, or
simulation renders here — only this module, with Setup/Shape/Toolpaths stages. Machine settings use the global `ConfigPanel`.

## Workspace

- **Setup**: stock, grip and cutter selection using the shared tool library.
- **Shape**: draw a profile or import an STL. Point dimensions stay beside the
  graph; its SVG coordinates follow the rendered surface for accurate picking.
- **Toolpaths**: operations, optional square/pommel sections, checks and G-code
  preview. Generate and export stay in the persistent footer.

Landscape tablets show controls beside the part preview; portrait tablets stack
preview above controls. Only the control pane scrolls. Stage panels stay mounted
so drafts and view settings survive navigation. Machine settings remain in the
shared Config tab.

The 3D preview preserves its camera during edits and provides Fit part. Length
and feed inputs use the application's selected units; geometry remains in mm.
Export is enabled only for a generated job matching the current project settings,
with no blocking checks. Changes require regeneration.

UI composition is split into setup, shape, toolpaths, field groups, viewport,
settings history and export modules. The pure engine stays independent of React.

## Modes

- **Conversational**: drawn envelope IS the part, tooltip cuts at Z = r.
- **STL**: mesh IS the surface; ballnose tooltip comp (exact on flats,
  tangent on slopes). Editing any point drops back to Conversational.

## Engine (`engine/`, pure TS, tested)

- `profileModel` — Bezier points (corner/smooth/sym), sampling,
  shorten-only handle repair, exact de Casteljau node insertion.
- `toolpath` — XZA rough (spiral peel per level-run), finish (helical
  zigzag 270° or indexed 0°), groove/part/facing. A oscillates within one
  turn; every entry retracts to Z-safe; pommel ranges are keep-out.
- `gcode` — Vortex A-axis GRBL post (`.gcode`, not `.nc`): T1/G17/G21/G90,
  Z-zero at cylinder axis, A0 sync, A-range stamp, M5/M2.
- `checks` — stock/travel limits, grip, tailstock rule, tool fit, pommels.
- `stl` — binary+ASCII parse, silhouette, RDP fit, viewer baking.

Motion rules enforced by `toolpath.test.ts`: no chord-cutting feeds, feed
A-steps ≤ 90°, long rapids only at safe height, tooltip above envelope,
A ≤ 360°, pommel exclusion.

## Tooling

Tool rack reads the shared gCAM library (`loadSlots(localStorage)`);
diameter/type seed the rotary tool, feeds stay rotary-specific (router +
A-axis needs its own numbers, tuned via gSender override).

## Shared infrastructure (not duplicated)

- **Undo**: history stacks run on `lib/history.ts`, the same snapshot-stack
  utility as the 2.5D document. `useRotaryState` is lifted to `App`, so
  Ctrl+Z / Ctrl+Shift+Z / toolbar buttons dispatch to rotary while its tab
  is focused (2.5D delete/duplicate stay gated out).
- **Project files**: `.gcam.json` carries an opaque `rotary` slice
  (validated by `isRotaryProjectSlice`; mesh re-links by key). The
  top-menu Export/Import covers rotary — no separate JSON buttons.
