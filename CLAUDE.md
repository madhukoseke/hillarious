# HILLARIOUS: project instructions

A single-file browser game. Everything ships in `index.html`. The engine section (everything before `if (HEADLESS || typeof document === 'undefined') return;`) runs headless in the tests and is exported on `window.HILL`. The presentation layer after it is browser-only; the running game is `HILL.game`.

## Commands

- Tests: `node --test "tests/*.test.mjs"` (Node.js 22+; a bare `tests/` directory argument fails on Node 22).
- Port check: `tests/ports.test.mjs` compares every course and ride against `tests/golden/ports.json`. Refactors must pass it unchanged. Only an intended gameplay change may rewrite it (`node tests/golden/update.mjs`), and the commit must say so.
- Cargo: each type is a class plus one entry in `CARGO_TYPES` (engine) and `CARGO_VIEW` (presentation). Do not branch on `cargo.kind` elsewhere.
- Serve: `python3 -m http.server 8765` in this folder, then open http://127.0.0.1:8765/. The Playwright scripts in `tests/playtest/` expect that port.
- Cross-browser: `tests/playtest/cross-browser.mjs` (setup in its header). Record results in `docs/browser-matrix.md`.
- Autopilot demo: `?autopilot=typical` (also `careful`, `fast`, `reckless`). Jump to the cake: `?delivery=2`. Open every order and drill: `?unlock=all`.
- Fast browser checks: set `HILL.game.practiceScale = 4` while riding to run the simulation at 4× speed (`tests/playtest/dispatch-training.js` does this).

## Definition of done for every change

Do all of these in the same piece of work, without being asked:

1. **Tests:** run the suite, and keep it passing. Add a test for every new engine rule, scoring rule, or sanitizer. Export new engine helpers on `HILL` so they can be tested.
2. **Browser check:** when the UI changes, serve the game and check it in a browser, including the console for errors.
3. **CHANGELOG.md:** add plain-language bullets under `## [Unreleased]`, grouped as Added, Changed, Fixed, or Removed. Describe the effect for players first; keep developer-only changes brief. Never edit a released version's entry.
4. **tech_debt.md and kanban.md** (both local only and gitignored, so skip this step if they are missing). `tech_debt.md` is the source of truth, and its section 1 explains the IDs, statuses, and lineage. `kanban.md` is its one-line-per-card board.
   - Every item keeps a permanent ID: `TD-` debt, `F-` work items, `D-` decisions, `I-` ideas, `P` plans. A new item takes the next free ID listed at the top of `tech_debt.md`, which is then bumped. Never renumber or delete an item.
   - When work completes an item, tick it (`- [x]`) and set its status to `Done (Unreleased)`. If only part is done, use `Partly done (Unreleased): <what is left>`. `/release` replaces `Unreleased` with the version number.
   - Work that has no item yet gets a new `F-` item under its release, ticked and `Done (Unreleased)`, with its origin.
   - Record decisions in the Decisions table with a date, and update the items they unblock.
   - Update "Current baseline" facts that changed, such as the test count, routes, and line count.
   - Move the item's card on `kanban.md` (To do → WIP → Completed) and update its date.
   - Never pick up an item marked Done.
5. **README.md:** update it when player-facing features, controls, commands, links, or project structure change.

## Releasing

Use the `/release` skill. Version numbers follow semver: patch for fixes only, minor for new features, major for incompatible save data or a removed mode. Commit and tag locally. Push only when the user asks.

## Constraints

- No runtime network requests or external assets. A test enforces this. Outbound links are allowed only when a player clicks them, and each one must be allow-listed in that test.
- Save data goes through the `Store` class, under `localStorage` keys prefixed `hillarious:`. Keep existing saved records readable.
- Text entered by players is rendered with `textContent`, never `innerHTML`. Profile handles go through `cleanHandle` before they are used in an `href`.
- Keep autopilot timings short (the `this.autopilotName ? ... :` branches), so demos and tests stay fast.
- Do not commit `tech_debt.md` or `kanban.md`.
- The `[Unreleased]` link at the bottom of `CHANGELOG.md` compares the latest tag with `HEAD`. `/release` moves it forward.
