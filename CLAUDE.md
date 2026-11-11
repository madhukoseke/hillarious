# HILLARIOUS: project instructions

A browser game that ships as one offline `index.html`, built from `src/` by `tools/build.mjs` (TD-14). **Edit `src/`, never `index.html`**, then run `npm run build`; the built file is committed, so the game still opens straight from it and the tests read it. The page is `src/index.html` (markup and `<!-- build:* -->` markers) and `src/style.css`. The game script is `src/game/*.js`: slices of one script (not modules), joined in file-name order and named after the section banners inside them (`05-bicycle.js` is section 5). Files up to `11-autopilot-storage.js` are the engine: it ends with `if (HEADLESS || typeof document === 'undefined') return;`, runs headless in the tests, and is exported on `window.HILL`. From `13-input-audio.js` on is the browser-only presentation layer; the running game is `HILL.game`.

## Commands

- Build: `npm ci` once, then `npm run build` after every change under `src/`. `npm run check` (run in CI) fails if `index.html` is not what `src/` builds; `tests/build.test.mjs` checks the same without installs. `three` and `esbuild` are exact-pinned dev dependencies.
- Tests: `node --test "tests/*.test.mjs"` (Node.js 22+; a bare `tests/` directory argument fails on Node 22).
- Port check: `tests/ports.test.mjs` compares every course and ride against `tests/golden/ports.json`. Refactors must pass it unchanged. Only an intended gameplay change may rewrite it (`node tests/golden/update.mjs`), and the commit must say so.
- Cargo: each type is a class plus one entry in `CARGO_TYPES` (engine) and `CARGO_VIEW` (presentation). Do not branch on `cargo.kind` elsewhere.
- Routes: each delivery is one `ROUTE_DATA` entry (path steps, features, objects, customer) built by `buildRoute`; list it in `ROUTES` to put it in the shift. Do not branch on a route id elsewhere.
- Themes: a course's look comes from its `THEMES` entry; add an entry (and a far-skyline builder if needed) rather than branching on a theme id in the renderer.
- Shifts: a shift is a chapter (`CHAPTERS`), not `ROUTES`. Read the current shift's routes from `game.shiftRoutes` and its scores from `chapter.scoresKey`.
- Physics: read gravity and bike constants from the world (`world.phys`, or `bike.P`), never from `PHYS`, `SAG`, or `RIDE_H`, which are Earth's defaults. A new planet adds a `PLANETS` entry.
- Set pieces: prefer writing a route as `pieces: [[kind, params], ...]` from `PIECES`. Inside a piece, a number is an offset from the piece's mark and a string is any position. Add a new piece kind to `PIECES` rather than special-casing a route. `gust` makes an exposed block with wind; `block` takes `lead` to put its mark ahead of (or behind) where it starts.
- Generated routes: `generateRoute(seed, rules)` joins segments from `GEN_SEGMENTS`, each starting and ending on level ground, with a design time measured from the typical rider. A new segment needs its time measured, and must pass the fairness check over all seeds (`FAIRNESS_SEEDS=2000 node --test tests/fairness.test.mjs`). Changing the generator changes every seed's route, so the recorded plans in `tests/generator.test.mjs` must be updated on purpose.
- Daily Dispatch: the local date gives the seed (`dailySeed`), and the seed gives the route, cargo, and remix (`dailySpec`, `DAILY_REMIXES`). Changing any of these changes every player's daily route; the recorded seed in `tests/daily.test.mjs` guards it. A new remix must keep par in 35–50 and pass the fairness check over the first 2,000 days.
- Serve: `python3 -m http.server 8765` in this folder, then open http://127.0.0.1:8765/. The Playwright scripts in `tests/playtest/` expect that port.
- Cross-browser: `tests/playtest/cross-browser.mjs` (setup in its header). Record results in `docs/browser-matrix.md`.
- Autopilot demo: `?autopilot=typical` (also `careful`, `fast`, `reckless`). Jump to the cake: `?delivery=2`. Open every order and drill: `?unlock=all`.
- Crash replays: `?replay=off` turns them off; autopilot demos skip them unless `?replay=on`. They re-run the world from `world.inputLog`, so anything that changes a ride must go through `World.step`'s input; never change a world from outside it.
- Fast browser checks: set `HILL.game.practiceScale = 4` while riding to run the simulation at 4× speed (`tests/playtest/dispatch-training.js` does this).

## Definition of done for every change

Do all of these in the same piece of work, without being asked:

1. **Tests:** run `npm run build`, then the suite, and keep it passing. Commit the rebuilt `index.html` with its `src/` changes. Add a test for every new engine rule, scoring rule, or sanitizer. Export new engine helpers on `HILL` so they can be tested.
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

- `index.html` is generated: never edit it by hand. Change `src/` and rebuild.
- No runtime network requests or external assets. A test enforces this on the built `index.html`, so anything `src/` pulls in (such as three.js) is inlined at build time. Outbound links are allowed only when a player clicks them, and each one must be allow-listed in that test.
- Save data goes through the `Store` class, under `localStorage` keys prefixed `hillarious:`. Keep existing saved records readable.
- Text entered by players is rendered with `textContent`, never `innerHTML`. Profile handles go through `cleanHandle` before they are used in an `href`.
- Keep autopilot timings short (the `this.autopilotName ? ... :` branches), so demos and tests stay fast.
- Do not commit `tech_debt.md` or `kanban.md`.
- The `[Unreleased]` link at the bottom of `CHANGELOG.md` compares the latest tag with `HEAD`. `/release` moves it forward.
