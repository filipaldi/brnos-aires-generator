---
layers:
  zaklad:     ["core/zaklad/**"]
  primitivy:  ["core/primitives/**"]
  tvary:      ["core/shapes/**"]
  kompozicia: ["core/kompozicia/**"]
  cli:        ["cli/**"]
  ui:         ["ui/**"]

dependencies:
  allow:
    - primitivy -> zaklad
    - tvary -> primitivy
    - tvary -> zaklad
    - kompozicia -> tvary
    - kompozicia -> zaklad
    - cli -> kompozicia
    - cli -> tvary
    - cli -> zaklad
    - ui -> kompozicia
    - ui -> tvary
    - ui -> zaklad
  forbid:
    - zaklad -> primitivy
    - zaklad -> tvary
    - zaklad -> kompozicia
    - zaklad -> cli
    - zaklad -> ui
    - primitivy -> tvary
    - primitivy -> kompozicia
    - primitivy -> cli
    - primitivy -> ui
    - tvary -> kompozicia
    - tvary -> cli
    - tvary -> ui
    - kompozicia -> primitivy
    - kompozicia -> cli
    - kompozicia -> ui
    - cli -> primitivy
    - cli -> ui
    - ui -> primitivy
    - ui -> cli

naming:
  - "a module of the core names a design concept of the typeface (noha, kvapka, reťaz), never a rendering technology"
---

## Layers

| Layer | Paths | Responsibility | Rationale |
|---|---|---|---|
| zaklad | core/zaklad | the shared vocabulary of the core: geometry and path serialisation, the axes computed from Weight and Contrast, reading proporcie.json, the core's error type | every other part of the core speaks these words, so they sit below all of them and depend on nothing |
| primitivy | core/primitives | the three building elements of a shape (obdĺžnik, prstenec, krivka) and their corner rounding | a primitive is geometry with no idea which letter part it serves, so a new shape never changes it |
| tvary | core/shapes | the shape types of the typeface, each built from primitives, and each shape's breakdown into its primitives | a shape is the typeface's own concept, and the designer tunes it without touching how sheets are composed |
| kompozicia | core/kompozicia | the spec of a sheet: validating it, upgrading older specs, placing chains of shapes around zones from the seeded variant, setting text, assembling the layered SVG | composing a sheet is a separate design decision from drawing one shape, and it changes far more often |
| cli | cli | the command line for agents and the web build: reading spec files, writing SVG, rendering PNG through headless Chromium | the filesystem, the process and the browser binary are a different runtime from the page, held at one edge |
| ui | ui | the browser surface for the type designer: the canvas, zones edited by mouse, the shape viewer, text measurement with the real fonts, the worker that composes off the main thread, export | the page owns the DOM, fonts, storage and the main thread, which no other layer may assume exists |

## Boundaries

- `zaklad -> primitivy` / `zaklad -> tvary` / `zaklad -> kompozicia` / `zaklad -> cli` / `zaklad -> ui`: the shared vocabulary holds only what every layer above already agrees on, so a concept that needs a shape or a sheet lives in the layer that owns that shape or sheet.
- `primitivy -> tvary` / `primitivy -> kompozicia` / `tvary -> kompozicia`: a lower part of the core receives what it needs from above as parameters of the call (size, rotation, which ends are joined), so the dependency points down and a shape can be drawn without a sheet.
- `primitivy -> cli` / `primitivy -> ui` / `tvary -> cli` / `tvary -> ui` / `kompozicia -> cli` / `kompozicia -> ui`: the core runs unchanged in Node, in the page and in a worker, so anything it needs from a runtime arrives as a function the surface passes in (text measurement, glyph outlines).
- `kompozicia -> primitivy`: a sheet places shapes, and the primitives inside a shape are reached through that shape, so retuning a shape never moves anything on a sheet.
- `cli -> primitivy` / `ui -> primitivy`: a surface that shows the primitives of a shape asks the shape for its breakdown, so the two surfaces stay unaware of how a shape is assembled (Facade).
- `cli -> ui` / `ui -> cli`: the two surfaces share everything through the core and the spec format, so either can be replaced without the other noticing.

## Invariants

- The core (zaklad, primitivy, tvary, kompozicia) touches no runtime: no DOM, no Node API, no filesystem, no network, no clock and no `Math.random`.
- What the core needs from a runtime arrives as a function in the options of the call that needs it, passed by the surface that composes.
- A surface reaches the core only through the public entry `core/index.js`, which re-exports what the surfaces may use (Facade).
- The composition root of each surface is its entry module: `ui/ui.js` for the page, the CLI's main module for the command line.
- The core runs synchronously on the caller's thread.
- In the page, composing a sheet runs in a Web Worker and the main thread only handles input and drawing; the main thread composes only when no worker can start.
- A failure leaves the core as its own error type, carrying a Slovak message that names the field at fault.
- The page shows a core failure as a message on the sheet; the CLI prints it to stderr and exits non-zero.
- The spec of a sheet (the JSON a surface hands to `komponuj`) is owned by kompozicia, which validates and upgrades it once at entry, so its inner modules receive only the normalised spec.
- A spec shape changes only together with the upgrade of the older shape, so every saved spec keeps opening.
- The spec format and the CLI are the generator's only public interface; the web build and any other consumer use them and never import the core.
- proporcie.json is the single source of tunable numbers, read only through zaklad.
- The same spec and variant produce byte-identical SVG.
- A new shape type is warranted when a form cannot be made by joining the existing types, and it is built from primitives only.
- A new primitive is warranted only when the designer draws a new curve; a combination of existing primitives is a shape.
- Inside kompozicia, only the SVG assembly writes markup, and placement works on numbers alone.

## Enforcement

- This file states the target shape; where the code differs, the code is what moves.
- Machine-checked: nothing yet; `architect` reads Python only, so the `forbid` edges of this JavaScript repository wait for a boundary test of its own in `test/`.
- Reviewer judgement: every `forbid` edge until that test exists, `naming`, every `## Invariants` line and every Responsibility and Rationale cell, which is most of the words in this file.
- Not claimed: `test/**`, `scripts/**`, `priklady/**`, `fonts/**`, `docs/**`, the JSON data files at the root and the development server and smoke test, which belong under `scripts/`.
