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
    - serialization -> model
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
    - serialization -> geometry
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
    - primitives -> parameters
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
    - api -> geometry
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
---

## Layers

| Layer | Paths | Responsibility | Rationale |
|---|---|---|---|
| parameters | core/parameters | every tunable number, default and limit of the generator: the proportion and curve-master data (the curve masters being the fixed teardrop and other outlines drawn by the type designer that the generator only interpolates, scales, rotates and moves), value ranges, fonts with their cuts and features, rounding precision, tolerances, raster sizes and the UI's own constants | a value tuned in one place cannot drift apart from a copy of itself somewhere else in the code, and the owner wants every constant, the surfaces' own included, in this one place so none is scattered through the code, with the surfaces reading theirs through the api's parameter listing |
| geometry | core/geometry | pure calculation: points, angles, arcs, offsets, bounding boxes, rotation and mirroring computed as plain numbers, and the Weight and Contrast axes turned into stroke thicknesses | a formula that takes every number as an argument can be tested with any value and reused by every drawing layer |
| model | core/model | the data structures and the rules that bind them: the spec of a sheet (format, grid, drawing, composition, zones), shape parameters, the drawn outline of a shape's result (its points, segments and arcs, into which shapes convert what primitives produce), the result of a composition, the error type a failure carries, and the spec's validation, its default, the merge of a preset into it and the upgrade of older specs | data outlives the code, so its shape and the law by which it changes have one owner |
| serialization | core/serialization | writing SVG: path data from model's outline structure, layers, embedded fonts, the markup of the specimen sheet and of a shape's breakdown, rounding to fixed precision | the output format is the part most likely to gain a sibling (PDF, animation frames), so nothing that computes may depend on how it is written |
| primitives | core/primitives | the building elements of a shape, each producing one whole closed outline piece as plain numbers from the sizes and curve masters it receives (rectangle with rounded corners, ring, designer curve, inner-corner fillet), where geometry only computes the points, angles, arcs and offsets such a piece is made of | a primitive knows no letter part it serves, so it can later build glyphs as well as pattern shapes, while geometry stays the formulas every drawing layer shares |
| shapes | core/shapes | the shape types of the typeface built from primitives, passing them the curve masters and sizes read from parameters, converting each primitive's plain-number outline into model's outline structure, and each shape's breakdown into its primitives | a shape is the typeface's own concept, and the designer retunes it without touching how sheets are composed |
| composition | core/composition | composing a sheet as numbers: chains of shapes from the seeded variant, placement around zones, text wrapping, and the layout of the specimen sheet and of a shape's primitive breakdown for the shape viewer | composing is a separate design decision from drawing one shape and changes far more often |
| api | core/api | the single gate into the core, which orchestrates and computes nothing: compose a spec and serialise the result, build one shape, build a specimen sheet and a shape's primitive breakdown, hand out model's default spec and model's upgrade of an older one, call model's merge of a preset into a spec (taking the spec and the preset as arguments) followed by model's validation, list types, parameters and fonts, own the signature of the runtime functions the core receives (text measurement, font loading, glyph outlines), and hand failures out as model's error carrying the field at fault and its message, re-exporting that error type with a recogniser for it | the surfaces see one stable set of calls, so the inside of the core can be rearranged without breaking them |
| presets | presets | named starting points as JSON data: formats (A2, IG, web), styles (drawing and composition settings), templates (zones and texts) | a preset is a user's choice among many, unlike parameters, which are the one tuning of the engine |
| cli-commands | cli/commands | the commands that list the types, build a shape, build the specimen sheet and compose a sheet: arguments, reading spec and preset files, writing results, and implementing the api's runtime-function signature where a command composes text zones (text measurement, font loading, glyph outlines), using the browser cli-render provides where measurement needs one | the command line serves agents and the web build, whose files and process are a different runtime from the page |
| cli-render | cli/render | turning a finished SVG into PNG through headless Chromium, and lending that browser to cli-commands for text measurement | the browser binary is an external dependency that fails and changes on its own schedule, so it sits behind one call |
| ui-app | ui/app | the page's composition root and the page's host document: creating the state, the engine, the views and the export, wiring them together, and holding the browser adapters it injects into them (saving the work in the browser), with no other code of its own | wiring in one place keeps every other ui module unaware of who constructs it |
| ui-views | ui/views | everything drawn and clicked, with the page's stylesheet: top bar, popovers, sheet, zones, zone bar, text editor, shape viewer, specimen sheet, passing pointer events to ui-state | the look and the interactions change most often, so they hold no data and compute nothing |
| ui-state | ui/state | the current spec, the selection, the editing rules (pointer position to grid cell, snapping, clamping, hit-testing, paste offset) worked in whole grid cells with the grid read from the api's parameter listing, a new spec from the api's default spec and an older saved one through the api's upgrade, applying presets through the api's merge call, and remembering the work through the save function ui-app supplies | one owner of the edited spec means every view shows the same sheet and nothing edits it behind the others' back |
| ui-engine | ui/engine | running the core: the worker, composing a sheet, building a shape, its breakdown and the specimen sheet, implementing the api's runtime-function signature with the real fonts (text measurement, font loading, glyph outlines), and relaying the api's parameter listing to ui-export | composing is the page's long work, and keeping it in one place keeps the main thread free for input |
| ui-export | ui/export | SVG, PNG and AVIF files and handing them to the viewer to save | file formats and the host's saving rules are a separate concern from editing the sheet |

## Boundaries

- `parameters -> *`: parameters cannot ask any layer for a value, so it holds only raw values and every derived quantity (a stroke thickness from Weight, a size from the format) is computed by geometry or by the layer that uses it.
- `geometry -> *`: a formula cannot read a tuning value, a curve master or a model structure, so its caller (primitives, shapes, composition) reads them and passes them in as arguments, and shapes convert the plain numbers that come back into model's outline structure.
- `model -> *`: the data structures take only their defaults and limits from parameters, so a spec is validated with no drawing, file or page loaded.
- `serialization -> *`: writing receives finished values in model structures, a drawn outline as model's outline of points, segments and arcs, every coordinate already computed by the layers that draw and place, and rounding a number to fixed precision is formatting rather than geometry, so the output format changes without touching how shapes are drawn or placed.
- `primitives -> *`: a primitive receives its sizes and the curve masters as arguments from the shape that uses it, which reads them from parameters, and knows no concept of the typeface, so it stays reusable for glyphs.
- `shapes -> *`: a shape is drawn from the arguments its caller passes (size, rotation, joined ends), so it can be drawn without a sheet, a file or a page.
- `composition -> *` except `composition -> primitives` / `composition -> serialization` / `composition -> api` / `composition -> presets`: composition receives everything from a runtime as functions in the options of its call (text measurement, glyph outlines), with the signature the api owns, implemented by the surface that composes (cli-commands in the command line, ui-engine in the page), so it runs unchanged in Node, the page and a worker.
- `composition -> api`: the api calls composition with a normalised spec and receives its result, so composition never calls back into the gate and the calls stay one-way.
- `composition -> presets`: a preset is already merged into the spec by the api's merge call before composing starts, so composition reads one spec and never knows which preset produced it.
- `composition -> primitives` / `api -> primitives`: primitives are reached through the shape that holds them, so retuning a shape never moves anything on a sheet.
- `composition -> serialization`: composition returns numbers in a model structure and the api hands them to serialization, so placement is tested on numbers and the output format can be swapped.
- `api -> *` except `api -> primitives`: the gate orchestrates and neither computes nor knows its caller, so every calculation (geometry) is done by the shapes and composition it calls, every rule of the spec (default, merge, upgrade, validation) by model, it reads no files, and presets reach it from the surface as an argument of its merge call.
- `presets -> *`: a preset is data, applied by model's merge rule, which the api calls with the spec and the preset as arguments and follows with model's validation, so adding one needs no code.
- `cli-commands -> *`: the command line reaches the core only through the api, recognises a core failure by the api's re-exported error type and recogniser, which carry the field at fault and its message, and shares nothing with the page, so either surface can be replaced alone.
- `cli-render -> *`: the renderer receives a finished SVG and returns PNG bytes, and lends its browser to the commands without knowing what they measure, so a different rasteriser replaces it without touching the commands.
- `ui-app -> *`: the composition root reaches the core only through the ui layers it wires, so its own code is the wiring and the browser adapters it injects, and everything that computes lands in those layers.
- `ui-views -> *` except `ui-views -> presets` / `ui-views -> cli-commands` / `ui-views -> cli-render` / `ui-views -> ui-app`: views reach the core only through the api's listing calls (types, parameters, fonts), take their tunables from the parameter listing, pass pointer events to ui-state, whose editing rules turn them into whole grid cells, and leave composing to ui-engine, so the look changes without touching how a sheet is computed.
- `ui-views -> presets`: a view asks ui-state to apply a preset and reads the list of presets from it, so a preset reaches the edited spec only through the api's merge call that ui-state makes.
- `ui-views -> cli-commands` / `ui-views -> cli-render`: the command line runs in a different runtime with files and processes, so the page takes nothing from it and either surface can be replaced alone.
- `ui-views -> ui-app`: ui-app constructs the views and hands them the state, the engine and the export, so a view receives its collaborators and never imports the root that wires it.
- `ui-state -> *`: the state holds data only, takes its tunables from the api's parameter listing, a new spec from the api's default spec and an older saved one through the api's upgrade, saves through the function ui-app injects, and leaves composing to the engine and drawing to the views, so it is tested without a DOM.
- `ui-engine -> *`: the engine receives a spec and returns a result, or a failure it recognises by the api's re-exported error type and recogniser with the field at fault and its message, so it knows no view, no state and no model and serves the export and the sheet alike.
- `ui-export -> *`: the export asks the engine for the composition and receives from it the api's parameter listing the engine relays, so the saved file is the same sheet as the one on screen and its raster sizes are the tuned ones.

## Invariants

- Every tunable number, default and limit lives in parameters.
- A numeric literal outside parameters is only a mathematical identity.
- A ui layer takes its tunables from the api's parameter listing, which ui-export reaches through ui-engine.
- The core (parameters, geometry, model, serialization, primitives, shapes, composition, api) touches no runtime: no DOM, no Node API, no filesystem, no network, no clock and no `Math.random`.
- What the core needs from a runtime arrives as a function in the options of the call that needs it, passed by the surface that composes.
- The composition root of the page is ui-app; the composition root of the command line is the entry module of cli-commands.
- The core runs synchronously on the caller's thread.
- In the page, composing a sheet runs through ui-engine in a Web Worker it owns.
- The main thread of the page composes, through ui-engine, only when no worker can start.
- A failure leaves the core through the api as model's error type, which the api re-exports with a recogniser so a surface tells it apart without importing model.
- A core error carries a message in the product's language that names the field at fault.
- The page shows a core failure as a message on the sheet.
- The command line prints a core failure to stderr and exits non-zero.
- A runtime failure outside the core (a missing Chromium or Playwright in cli-render, a font that does not load, a save refused in ui-export) reaches the entry of its surface (the entry module of cli-commands, or ui-app) as a message and never prevents the SVG from being written or shown.
- The spec's shape, its validation, its default, the merge of a preset into it and the upgrade of older specs are owned by model, and the api only calls them behind the gate.
- The api owns the signature of the runtime functions the core receives (text measurement, font loading, glyph outlines), and cli-commands and ui-engine each implement it.
- The api validates and upgrades a spec once, at its entry, so composition receives only a normalised spec.
- A spec shape changes only together with the upgrade of the older shape, so every saved spec and every preset keeps opening.
- A preset holds only fields the spec knows.
- A preset is applied only through the api's merge call, which runs model's merge rule on the spec and the preset and ends with model's validation.
- The spec format and the command line are the only interface a consumer outside the generator uses.
- A consumer outside the generator, such as the web build in another repository, never imports the core.
- Only serialization writes markup.
- serialization rounds every number it writes to the precision set in parameters.
- The same spec, variant and text measurer produce byte-identical SVG.
- A new shape type is warranted when a form cannot be made by joining the existing types, and it is built from primitives only.
- A new primitive is warranted only when the designer draws a new closed outline piece.
- A new composition module is warranted only by a new placement rule the designer states; a variation of an existing rule is a value in parameters or a field of the spec.
- A new ui-views module is warranted when the page gains an element of its own on screen; a change of look or interaction of an existing element stays in that element's module.
- The edited spec in the page changes only through ui-state.
- Saving the work in the browser reaches ui-state as a function injected by ui-app, so ui-state is tested without a DOM.
- ui-views calls only the api's listing calls (types, parameters, fonts) and leaves building and composing to ui-engine.
- A module of api imports another api module only through that module's top-level entry, in one direction, with no cycle.
- A module of composition imports another composition module only through that module's top-level entry, in one direction, with no cycle.
- A module of ui-views imports another ui-views module only through that module's top-level entry, in one direction, with no cycle.
- A module in parameters, geometry, model, primitives, shapes, composition or api names a concept of the typeface or of the sheet, never a rendering technology.
- serialization naming its output format (SVG) is no breach of the naming rule, because that format is the concept serialization owns.

## Enforcement

- This file states the target shape; where the code differs, the code is what moves, so today's flat files (the core modules, the entry scripts, the page modules and the data, host document and stylesheet beside them) move into the layer homes during migration and no glob widens to reach them.
- Machine-checked: `test/hranice.test.js` reads the block above, fails when allow and forbid do not name every ordered pair of distinct layers exactly once or name an unknown layer, and fails on every relative import (static, `export ... from` or `import()` of a string) from one layer home into another along a `forbid` edge; files outside every layer glob are skipped until they move, and the numeric-literal invariant still waits for a test of its own in `test/`.
- Out of scope: the numeric-literal invariants apply to code, so the lengths and colours of the page's stylesheet are not claimed by them.
- Reviewer judgement: every `forbid` edge until those tests exist, every `## Invariants` line and every Responsibility and Rationale cell, which is most of the words in this file.
- Not claimed: `test/**`, `scripts/**`, `priklady/**`, `fonts/**` and `docs/**`, the tooling `.github/**`, `.githooks/**` and `package.json`, plus the development server and the smoke test, which belong under `scripts/`.
- Agent-facing sibling: [AGENTS.md](AGENTS.md) owns the working rules, commits and the design rules of the graphics; this file owns the layers, dependencies and invariants, and AGENTS.md links here for them.
