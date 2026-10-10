---
layers:
  parameters:    ["core/parameters/**"]
  geometry:      ["core/geometry/**"]
  model:         ["core/model/**"]
  serialization: ["core/serialization/**"]
  primitives:    ["core/primitives/**"]
  shapes:        ["core/shapes/**"]
  composition:   ["core/composition/**"]
  api:           ["core/api/**"]
  presets:       ["presets/**"]
  cli-commands:  ["cli/commands/**"]
  cli-render:    ["cli/render/**"]
  ui-app:        ["ui/app/**"]
  ui-views:      ["ui/views/**"]
  ui-state:      ["ui/state/**"]
  ui-engine:     ["ui/engine/**"]
  ui-export:     ["ui/export/**"]

dependencies:
  allow:
    - model -> parameters
    - serialization -> parameters
    - serialization -> geometry
    - serialization -> model
    - primitives -> parameters
    - primitives -> geometry
    - shapes -> parameters
    - shapes -> geometry
    - shapes -> model
    - shapes -> primitives
    - composition -> parameters
    - composition -> geometry
    - composition -> model
    - composition -> shapes
    - api -> parameters
    - api -> geometry
    - api -> model
    - api -> serialization
    - api -> shapes
    - api -> composition
    - cli-commands -> api
    - cli-commands -> presets
    - cli-commands -> cli-render
    - ui-app -> ui-views
    - ui-app -> ui-state
    - ui-app -> ui-engine
    - ui-app -> ui-export
    - ui-views -> api
    - ui-views -> ui-state
    - ui-views -> ui-engine
    - ui-views -> ui-export
    - ui-state -> api
    - ui-state -> presets
    - ui-engine -> api
    - ui-export -> ui-engine
  forbid:
    - parameters -> geometry
    - parameters -> model
    - parameters -> serialization
    - parameters -> primitives
    - parameters -> shapes
    - parameters -> composition
    - parameters -> api
    - parameters -> presets
    - parameters -> cli-commands
    - parameters -> cli-render
    - parameters -> ui-app
    - parameters -> ui-views
    - parameters -> ui-state
    - parameters -> ui-engine
    - parameters -> ui-export
    - geometry -> parameters
    - geometry -> model
    - geometry -> serialization
    - geometry -> primitives
    - geometry -> shapes
    - geometry -> composition
    - geometry -> api
    - geometry -> presets
    - geometry -> cli-commands
    - geometry -> cli-render
    - geometry -> ui-app
    - geometry -> ui-views
    - geometry -> ui-state
    - geometry -> ui-engine
    - geometry -> ui-export
    - model -> geometry
    - model -> serialization
    - model -> primitives
    - model -> shapes
    - model -> composition
    - model -> api
    - model -> presets
    - model -> cli-commands
    - model -> cli-render
    - model -> ui-app
    - model -> ui-views
    - model -> ui-state
    - model -> ui-engine
    - model -> ui-export
    - serialization -> primitives
    - serialization -> shapes
    - serialization -> composition
    - serialization -> api
    - serialization -> presets
    - serialization -> cli-commands
    - serialization -> cli-render
    - serialization -> ui-app
    - serialization -> ui-views
    - serialization -> ui-state
    - serialization -> ui-engine
    - serialization -> ui-export
    - primitives -> model
    - primitives -> serialization
    - primitives -> shapes
    - primitives -> composition
    - primitives -> api
    - primitives -> presets
    - primitives -> cli-commands
    - primitives -> cli-render
    - primitives -> ui-app
    - primitives -> ui-views
    - primitives -> ui-state
    - primitives -> ui-engine
    - primitives -> ui-export
    - shapes -> serialization
    - shapes -> composition
    - shapes -> api
    - shapes -> presets
    - shapes -> cli-commands
    - shapes -> cli-render
    - shapes -> ui-app
    - shapes -> ui-views
    - shapes -> ui-state
    - shapes -> ui-engine
    - shapes -> ui-export
    - composition -> serialization
    - composition -> primitives
    - composition -> api
    - composition -> presets
    - composition -> cli-commands
    - composition -> cli-render
    - composition -> ui-app
    - composition -> ui-views
    - composition -> ui-state
    - composition -> ui-engine
    - composition -> ui-export
    - api -> primitives
    - api -> presets
    - api -> cli-commands
    - api -> cli-render
    - api -> ui-app
    - api -> ui-views
    - api -> ui-state
    - api -> ui-engine
    - api -> ui-export
    - presets -> parameters
    - presets -> geometry
    - presets -> model
    - presets -> serialization
    - presets -> primitives
    - presets -> shapes
    - presets -> composition
    - presets -> api
    - presets -> cli-commands
    - presets -> cli-render
    - presets -> ui-app
    - presets -> ui-views
    - presets -> ui-state
    - presets -> ui-engine
    - presets -> ui-export
    - cli-commands -> parameters
    - cli-commands -> geometry
    - cli-commands -> model
    - cli-commands -> serialization
    - cli-commands -> primitives
    - cli-commands -> shapes
    - cli-commands -> composition
    - cli-commands -> ui-app
    - cli-commands -> ui-views
    - cli-commands -> ui-state
    - cli-commands -> ui-engine
    - cli-commands -> ui-export
    - cli-render -> parameters
    - cli-render -> geometry
    - cli-render -> model
    - cli-render -> serialization
    - cli-render -> primitives
    - cli-render -> shapes
    - cli-render -> composition
    - cli-render -> api
    - cli-render -> presets
    - cli-render -> cli-commands
    - cli-render -> ui-app
    - cli-render -> ui-views
    - cli-render -> ui-state
    - cli-render -> ui-engine
    - cli-render -> ui-export
    - ui-app -> parameters
    - ui-app -> geometry
    - ui-app -> model
    - ui-app -> serialization
    - ui-app -> primitives
    - ui-app -> shapes
    - ui-app -> composition
    - ui-app -> api
    - ui-app -> presets
    - ui-app -> cli-commands
    - ui-app -> cli-render
    - ui-views -> parameters
    - ui-views -> geometry
    - ui-views -> model
    - ui-views -> serialization
    - ui-views -> primitives
    - ui-views -> shapes
    - ui-views -> composition
    - ui-views -> presets
    - ui-views -> cli-commands
    - ui-views -> cli-render
    - ui-views -> ui-app
    - ui-state -> parameters
    - ui-state -> geometry
    - ui-state -> model
    - ui-state -> serialization
    - ui-state -> primitives
    - ui-state -> shapes
    - ui-state -> composition
    - ui-state -> cli-commands
    - ui-state -> cli-render
    - ui-state -> ui-app
    - ui-state -> ui-views
    - ui-state -> ui-engine
    - ui-state -> ui-export
    - ui-engine -> parameters
    - ui-engine -> geometry
    - ui-engine -> model
    - ui-engine -> serialization
    - ui-engine -> primitives
    - ui-engine -> shapes
    - ui-engine -> composition
    - ui-engine -> presets
    - ui-engine -> cli-commands
    - ui-engine -> cli-render
    - ui-engine -> ui-app
    - ui-engine -> ui-views
    - ui-engine -> ui-state
    - ui-engine -> ui-export
    - ui-export -> parameters
    - ui-export -> geometry
    - ui-export -> model
    - ui-export -> serialization
    - ui-export -> primitives
    - ui-export -> shapes
    - ui-export -> composition
    - ui-export -> api
    - ui-export -> presets
    - ui-export -> cli-commands
    - ui-export -> cli-render
    - ui-export -> ui-app
    - ui-export -> ui-views
    - ui-export -> ui-state

naming:
  - "a core module names a concept of the typeface or of the sheet (noha, kvapka, reťaz, zóna), never a rendering technology"
---

## Layers

| Layer | Paths | Responsibility | Rationale |
|---|---|---|---|
| parameters | core/parameters | every tunable number, default and limit of the generator: proportions, designer curve masters, value ranges, fonts with their cuts and features, rounding precision, tolerances, raster sizes and the UI's own constants | a value tuned in one place cannot drift apart from a copy of itself somewhere else in the code |
| geometry | core/geometry | pure calculation: points, curves, arcs, bounding boxes, rotation and mirroring, the Weight and Contrast axes turned into stroke thicknesses | a formula that takes every number as an argument can be tested with any value and reused by every drawing layer |
| model | core/model | the data structures: the spec of a sheet (format, grid, drawing, composition, zones), shape parameters, the result of a composition, their validation and the upgrade of older specs | data outlives the code, so its shape and the law by which it changes have one owner |
| serialization | core/serialization | writing SVG: path data, layers, embedded fonts, rounding to fixed precision | the output format is the part most likely to gain a sibling (PDF, animation frames), so nothing that computes may depend on how it is written |
| primitives | core/primitives | the three building elements of a shape: rectangle with rounded corners, ring, designer curve | a primitive is geometry with no idea which letter part it serves, so it can later build glyphs as well as pattern shapes |
| shapes | core/shapes | the shape types of the typeface built from primitives, and each shape's breakdown into its primitives | a shape is the typeface's own concept, and the designer retunes it without touching how sheets are composed |
| composition | core/composition | composing a sheet as numbers: chains of shapes from the seeded variant, placement around zones, text wrapping | composing is a separate design decision from drawing one shape and changes far more often |
| api | core/api | the single gate into the core: compose a spec and serialise the result, build one shape, list types, parameters and fonts | the surfaces see one stable set of calls, so the inside of the core can be rearranged without breaking them |
| presets | presets | named starting points as JSON data: formats (A2, IG, web), styles (drawing and composition settings), templates (zones and texts) | a preset is a user's choice among many, unlike parameters, which are the one tuning of the engine |
| cli-commands | cli/commands | the commands typy, tvar, vzorkovnik and kompozicia: arguments, reading spec and preset files, writing results | the command line serves agents and the web build, whose files and process are a different runtime from the page |
| cli-render | cli/render | turning a finished SVG into PNG through headless Chromium | the browser binary is an external dependency that fails and changes on its own schedule, so it sits behind one call |
| ui-app | ui/app | the page's composition root: creates the state, the engine, the views and the export and wires them together | wiring in one place keeps every other ui module unaware of who constructs it |
| ui-views | ui/views | everything drawn and clicked: top bar, popovers, sheet, zones, zone bar, text editor, shape viewer | the look and the interactions change most often, so they hold no data and compute nothing |
| ui-state | ui/state | the current spec, the selection, applying presets, remembering the work in the browser | one owner of the edited spec means every view shows the same sheet and nothing edits it behind the others' back |
| ui-engine | ui/engine | running the core: the worker, text measurement with the real fonts, loading the fonts | composing is the page's long work, and keeping it in one place keeps the main thread free for input |
| ui-export | ui/export | SVG, PNG and AVIF files and handing them to the viewer to save | file formats and the host's saving rules are a separate concern from editing the sheet |

## Boundaries

- `parameters -> *`: the tuning of the engine takes nothing from any other layer, so a value changes in exactly one place and every layer above sees the change.
- `geometry -> *`: a formula receives every number as an argument, so it is tested with any value and no tuning change can break it.
- `model -> *`: the data structures take only their defaults and limits from parameters, so a spec is validated with no drawing, file or page loaded.
- `serialization -> *`: writing receives finished values in model structures, so the output format changes without touching how shapes are drawn or placed.
- `primitives -> *`: a primitive receives its sizes as arguments and knows no concept of the typeface, so it stays reusable for glyphs.
- `shapes -> *`: a shape is drawn from the arguments its caller passes (size, rotation, joined ends), so it can be drawn without a sheet, a file or a page.
- `composition -> *` except `composition -> primitives` / `composition -> serialization`: composition receives everything from a runtime as functions in the options of its call (text measurement, glyph outlines), so it runs unchanged in Node, the page and a worker.
- `composition -> primitives` / `api -> primitives`: primitives are reached through the shape that holds them, so retuning a shape never moves anything on a sheet.
- `composition -> serialization`: composition returns numbers in a model structure and the api hands them to serialization, so placement is tested on numbers and the output format can be swapped.
- `api -> *` except `api -> primitives`: the gate never knows which surface calls it and reads no files, so presets reach it from the surface as part of the spec.
- `presets -> *`: a preset is data, applied by merging it into a spec that model then validates, so adding one needs no code.
- `cli-commands -> *`: the command line reaches the core only through the api and shares nothing with the page, so either surface can be replaced alone.
- `cli-render -> *`: the renderer receives a finished SVG and returns PNG bytes, so a different rasteriser replaces it without touching the commands.
- `ui-app -> *`: the composition root wires the ui layers and leaves the core to them, so it holds no logic of its own to test.
- `ui-views -> *`: views read the state, ask the engine and the export, and reach the core's lists through the api, so they never edit data behind the state's back.
- `ui-state -> *`: the state holds data only and leaves composing to the engine and drawing to the views, so it is tested without a DOM.
- `ui-engine -> *`: the engine receives a spec and returns a result, so it knows no view and no state and serves the export and the sheet alike.
- `ui-export -> *`: the export asks the engine for the composition, so the saved file is the same sheet as the one on screen.

## Invariants

- Every tunable number, default and limit lives in parameters; a numeric literal elsewhere is only a mathematical identity such as 0, 1, 2 or π.
- The core (parameters, geometry, model, serialization, primitives, shapes, composition, api) touches no runtime: no DOM, no Node API, no filesystem, no network, no clock and no `Math.random`.
- What the core needs from a runtime arrives as a function in the options of the call that needs it, passed by the surface that composes.
- A surface reaches the core only through the api.
- The composition root of the page is ui-app; the composition root of the command line is the entry module of cli-commands.
- The core runs synchronously on the caller's thread.
- In the page, composing a sheet runs in a Web Worker owned by ui-engine; the main thread composes only when no worker can start.
- A failure leaves the core as the model's error type, carrying a Slovak message that names the field at fault.
- The page shows a core failure as a message on the sheet; the command line prints it to stderr and exits non-zero.
- The spec is owned by model, which validates it and upgrades older shapes once at the api's entry, so composition receives only a normalised spec.
- A spec shape changes only together with the upgrade of the older shape, so every saved spec and every preset keeps opening.
- A preset holds only fields the spec knows, and applying one is a merge followed by model's validation.
- The spec format and the command line are the generator's only public interface; the web build and any other consumer use them and never import the core.
- Only serialization writes markup, and it rounds every number to the precision set in parameters.
- The same spec and variant produce byte-identical SVG.
- A new shape type is warranted when a form cannot be made by joining the existing types, and it is built from primitives only.
- A new primitive is warranted only when the designer draws a new curve.
- The edited spec in the page changes only through ui-state.

## Enforcement

- This file states the target shape; where the code differs, the code is what moves.
- Machine-checked: nothing yet; `architect` reads Python only, so the `forbid` edges of this JavaScript repository and the numeric-literal invariant wait for boundary tests of their own in `test/`.
- Reviewer judgement: every `forbid` edge until those tests exist, `naming`, every `## Invariants` line and every Responsibility and Rationale cell, which is most of the words in this file.
- Not claimed: `test/**`, `scripts/**`, `priklady/**`, `fonts/**` and `docs/**`, plus the development server and the smoke test, which belong under `scripts/`.
