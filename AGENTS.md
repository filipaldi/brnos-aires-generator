# Brnos Aires Generator

Generator of graphics from the Brnos Aires typeface components (shapes, compositions, posters). Core + CLI + browser UI.

## Rules

- No AI attribution anywhere: no Co-Authored-By, session links or "Generated with" lines in commits, PRs or code.
- The only author of a commit is a real person, who has the final word. Agents (Claude, GLM or any other) never appear as author or committer; commit as the repository's configured human identity.
- Enforced by `.githooks/commit-msg`, `scripts/bez-ai-podpisu.sh` and the `bez-ai-podpisu` workflow (commit messages, PR titles and descriptions); the hook activates with `git config core.hooksPath .githooks` (also run by `npm install` and `npm test`).
- Zero dependencies. Node 22, ES modules. The core (`core/`) must stay browser-safe (no Node APIs).
- Run `npm test` before every commit; tests must pass.
- All numeric inputs are integers (no decimals) in the UI.
- No keyboard shortcuts in the UI; everything works by click.
- Only legs (`noha`, and the pätka foot) are rounded. Arcs are never rounded.
- Every line ends with a teardrop.
- No images committed to the repo (PNG exports and screenshots stay out; fonts in `fonts/` are the only binary assets).

## Layout

- `core/` shapes, primitives, compositions; `cli.js` CLI; `ui/` browser UI (`node ui/serve.js`, http://localhost:41235/ui/); `docs/GENERATOR.md` design notes.
