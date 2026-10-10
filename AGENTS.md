# Brnos Aires Generator

Generator of graphics from the Brnos Aires typeface components (shapes, compositions, posters). Core + CLI + browser UI.

## Rules

- No AI attribution anywhere: no Co-Authored-By, session links or "Generated with" lines in commits, PRs or code.
- The only author of a commit is a real person, who has the final word. Agents (Claude, GLM or any other) never appear as author or committer; commit as the repository's configured human identity.
- Enforced by `.githooks/commit-msg`, `scripts/bez-ai-podpisu.sh` and the `bez-ai-podpisu` workflow (commit messages, PR titles and descriptions); the hook activates with `git config core.hooksPath .githooks` (also run by `npm install` and `npm test`).
- Zero dependencies. Node 22, ES modules. What the core may touch at runtime is stated in [ARCHITECTURE.md](ARCHITECTURE.md#invariants).
- Run `npm test` before every commit; tests must pass.
- All numeric inputs are integers (no decimals) in the UI.
- Everything works by click. Standard keys on the selected zone (Delete/Backspace, Cmd/Ctrl+C, V, D, Escape) are allowed as an addition, never as the only way.
- Only legs (`noha`, and the pätka foot) are rounded. Arcs are never rounded.
- Every line ends with a teardrop.
- No images committed to the repo (PNG exports and screenshots stay out; fonts in `fonts/` are the only binary assets).

## Layout

- The target layout (layers, their paths and what each holds) is in [ARCHITECTURE.md](ARCHITECTURE.md#layers).
- Browser UI: `node ui/serve.js`, http://localhost:41235/ui/. Design notes: `docs/GENERATOR.md`.

## Architecture

- `ARCHITECTURE.md` is the target shape: layers, allowed and forbidden dependencies, invariants. New code follows it; it is never lowered to match the code.
- Architect modes: `design: democrat` (the existing tree may contest a draft, but only with evidence from outside the tree).
