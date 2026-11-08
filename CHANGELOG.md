# Changelog

All notable changes to HILLARIOUS are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Style is its own score: each receipt shows the style points you earned (near misses, clean landings, big air) and your best on that route, with NEW BEST when you beat it. Tips still depend only on the delivery.

### Changed
- The final review's Style row shows the shift's style points, and counts big air alongside clean landings and near misses.

### Fixed
- On landscape phones, the final review's verdict stamp stays on screen while the save form is in view, down to 740×360.
- The review card's "Most trouble" line no longer breaks the review after the cargo refactor, and it says "% petals" for the bouquet instead of "% latte".
- The bouquet now sheds pink petals when it loses petals, instead of coffee droplets that never appeared.
- After a cake or bouquet crash, the rack and basket are empty while the cargo flies, instead of showing a coffee cup.
- In Free Ride, a cake on Nob Hill or Telegraph Hill says "m to the cake drop" instead of "latte drop".
- SKIP on the final review shows one "not saved" message instead of two.
- A gamepad or the arrow keys can reach the music and effects sliders: move onto them, nudge them left or right, and move off with up or down. Confirming on a slider does nothing, so it can't start a ride by accident.
- On landscape phones, the keyboard legend no longer covers the title's Press SPACE line and volume sliders. How to play still lists the controls.

### Developer
- Themes: `THEMES` describes each neighbourhood's backdrop (skyline and ridge layers, horizon, water, hills, parallax, sailboats, ridge cable car), and `MID_LAYERS` the ridge layers. The renderer reads the table instead of branching on `theme === 'russian'`. Telegraph Hill has its own entry, matching Nob Hill's look for now.
- Chapters: `CHAPTERS` groups routes into shifts, each with its own place name for the share text and its own high-score key. San Francisco keeps `shifts`, so saved scores carry over; `?chapter=` picks one. `ROUTES` stays the list of every route for unlocks, Dispatch, and Free Ride.
- Physics per world: each world takes its physics from `course.planet` through `PLANETS` and `physicsFor` (Earth by default), and the bike, cargo, obstacles, and bodies read it from there. `PHYS`, `SAG`, and `RIDE_H` remain Earth's values. Unblocks Mars and weather.
- Port check: `tests/golden/ports.json` records how every course builds and plays, including every cargo on every route and a timed ride on The Test Hill; courses come from `ROUTES` and `DRILLS`. Course data must match exactly and rides within 1e-4, since physics floats can differ between machines. Rewrite it with `node tests/golden/update.mjs` only for an intended gameplay change.
- One cargo interface: `CARGO_TYPES` (engine) and `CARGO_VIEW` (drawing, sounds, HUD) replace every cargo-type branch. A new cargo adds its class and one entry in each table.
- Fairness check: `tests/fairness.test.mjs` runs all four riders on every route and drill in `ROUTES` and `DRILLS`.
- Set pieces: every route is a list of pieces (`plateau`, `block`, `stairs`, `crossing`, `gust`, `lip`, `finish` in `PIECES`). Each piece reports its length, grades, difficulty, and hazards; the port check confirms all three routes are unchanged. Telegraph Hill uses two new pieces: `gust`, an exposed block where the wind blows, and `lip`, a raised lip mid-block.
- Routes as data: Nob Hill, Russian Hill, and Telegraph Hill are `ROUTE_DATA` entries built by `buildRoute`, with positions written as a named mark plus offsets (`"blockB+44"`). The port check confirms they build and play exactly as before.

## [1.4.0] - 2026-11-07

### Added
- A third delivery, THE BOUQUET, from Telegraph Hill. Ruth's fragile bouquet sheds petals in an exposed downhill gust and when it lands roughly or crashes. Unbreakable cargo keeps every petal.
- Three goals for The Bouquet: deliver at least 90% of the petals, lose under 5% to the gust, and beat par with no crashes. Its receipt has its own star lines.
- The Bouquet has its own lines: Ruth reacts to lost petals, and the rider jokes about pothole damage.
- The Bouquet is on the Dispatch board after Russian Hill, and START SHIFT now runs all three deliveries.
- Telegraph Hill has a landmark on its route, Pioneer Park.
- The Bouquet's route is longer, about 45 seconds for a typical ride, with two pedestrians on the way down to Ruth's door.
- A safe way down on The Bouquet: hop up to the Napier Lane boardwalk at the top of the hill. It keeps you out of the gust and above the lip and pothole, but its narrow boards hold you to a slower pace. It keeps nearly every petal, but beating par takes the road.
- Free Ride's cargo row offers BOUQUET, and the title's best line shows your best bouquet run.
- The title screen shows the high scores: gold, silver, and bronze medals for the top three, then numbers, with X and LinkedIn icons that open each player's profile. Short landscape phones show the three medal rows.

### Changed
- `?delivery=3` starts the shift at The Bouquet, the way `?delivery=2` starts the cake.
- The high-score board keeps your five best shifts instead of three, and the final review uses the same medal list.
- The progress bar says "to the bouquet drop" on the new delivery.
- Gusts on The Bouquet's route no longer shed petals at low speed, so a careful rider keeps more petals than a fast one.
- Best-tip and high-score records now carry a format version (`v: 1`). Older records still read as before.

### Fixed
- The HR review and the screen reader now say "Bouquet" for bouquet runs instead of "Latte" or "Coffee".
- The save-your-score form on the final review is more compact on landscape phones, so less of the review needs scrolling to reach it.
- Corrupt or half-written best-tip records are ignored instead of breaking the receipt or Dispatch board.
- High-score rows no longer run the time into the X handle ("2:07.9@name").

## [1.3.0] - 2026-11-01

### Added
- Dispatch board: pick a single delivery from your courier phone. Orders unlock in order, so delivering The $9 Latte unlocks The Wedding Cake. Each card shows your best tip, time, and cargo, plus goal stars. A teaser card shows a delivery that is still to come. Single orders keep your best tips but never go on the shift high scores. Routes you delivered before this version stay unlocked.
- Three goals per delivery, shown as stars on the receipt and the Dispatch board. Nob Hill: deliver 90% of the latte, land the big Powell lip level, beat par with no crashes. Russian Hill: deliver 90% of the cake, clear the Larkin ramp without crashing, beat par with no crashes. Meet all three to master the route.
- Courier Academy: six short training drills (Pedal & Brake, Hop School, Lip Service, Stair Master, Ding Ding, Final Exam), unlocked one after another. Pat from HR texts the brief and stamps each run PROBATIONARY, CERTIFIED, or DISTINGUISHED. Pass the Final Exam to become a Certified Courier.
- Free Ride: ride any unlocked hill, or The Test Hill, from any checkpoint. The Test Hill is an always-open sandbox that loops back to the top with fresh cargo. Carry a latte or a cake, and switch on unbreakable cargo, traffic, slow motion (0.5×), or a physics overlay that shows speed, slosh, and where you will land. Nothing in Free Ride is saved.
- Practice this spot: receipts name the stretch that cost you the most and open Free Ride just before it.
- Arrow keys and the gamepad d-pad move between menu buttons; Enter or A presses the one in focus.
- `?unlock=all` opens every order and drill, for demos and testing.
- Tests for the route list, unlocks, saved progress, goals, drills, practice spots, and the seven new courses (77 tests in total). A Dispatch & Training playtest (`tests/playtest/dispatch-training.js`), and the cross-browser check now opens Dispatch, Training, and Free Ride on each engine.

### Changed
- The title screen has START SHIFT, DISPATCH, and TRAINING. How to Play is now a small button next to Sound. A full shift is still one press away.
- On laptop-height screens the receipt opens into two columns, so its buttons never need scrolling.

## [1.2.0] - 2026-10-30

### Changed
- The order intro and the receipt now wait for you. Continue with the button, Enter, Space, a tap, or gamepad A. The 12-second countdown is gone; autopilot demos still advance on their own.
- Controls are shown for the device you are using. The title strip, How to Play, ride hints, and pause help switch between keyboard keys, touch buttons, and gamepad buttons as soon as you use one.

### Added
- Bigger cargo losses now say what caused them, for example "-12% latte · Rough landing". Causes are a hard brake, a rough landing, a pothole, a bump, or a bumpy ride.
- A "LEVEL OUT!" warning, with your lean controls, appears when the bike is tilted steeply in the air before a landing.
- How to Play has a two-thumb tip on touch screens.
- "Share your shift" on the final review opens a ready-made post on X or LinkedIn with your tips, stars, and crashes. Nothing is sent unless you click and post.
- Separate Music and Effects volume sliders on the title and pause screens, saved between visits. Moving a slider while muted turns sound back on.
- Cross-browser check (`tests/playtest/cross-browser.mjs`) and a browser and device matrix (`docs/browser-matrix.md`). The game passes on Chromium, Firefox, and WebKit at desktop and phone sizes; real-device checks are still to do.
- Project instructions for Claude Code (`CLAUDE.md`). Every change now updates the changelog, the README when needed, and the local tech-debt list.
- A `/release` skill that turns the Unreleased section into a version, then commits and tags it.

## [1.1.1] - 2026-10-30

### Fixed
- Critical speech lines, such as the cable car's "DING DING!", were dropped when they had to wait behind one of the longer 1.1.0 bubbles. They now show for up to 2.5 seconds after the bubble ahead of them ends.

### Added
- The headless test suite (`tests/`) and the landmark data it checks (`data/`) are now in the repository. Run them with `node --test "tests/*.test.mjs"` on Node.js 22 or later.
- New tests for text read time, queued-line expiry, and profile handle cleaning (48 tests in total).
- A GitHub Actions workflow runs the tests on every push to `main` and on pull requests.

### Changed
- The no-external-dependencies test now allows the X and LinkedIn profile links on the high-score board, because they load only when a player clicks them.
- README: Tests and Changelog sections were added.

## [1.1.0] - 2026-10-30

### Added
- High-score entry on the final review screen: a required name, plus optional X and LinkedIn handles.
- Top-3 shift leaderboard on the final screen, with links to each player's X and LinkedIn.
- Saved profile: the last name and handles are pre-filled on the next shift.

### Changed
- The order intro countdown is 12 seconds (was 6). START DELIVERY still skips it.
- The receipt screen advances after 12 seconds (was 8 to 9).
- Speech bubbles and customer texts stay on screen for a time based on their length (about 50 ms per character, 3.2 to 6.5 seconds).
- Captions, the recovery line, and control hints stay on screen longer.
- README: live game link and GitHub links updated.

### Fixed
- Keyboard shortcuts no longer capture keystrokes while a name field has focus.
- Saving a high score no longer lets a second click start a new delivery. The form is disabled after saving, not hidden, so the buttons do not move under the pointer.

## [1.0.0] - 2026-10-29

### Added
- First release: two deliveries (a latte on Nob Hill and a wedding cake on Russian Hill), receipts, and an employee performance review.
- Local records for the best tip per delivery and the top 3 shifts.
- Keyboard, touch, and gamepad controls.
- A single offline `index.html` with no build step.

[Unreleased]: https://github.com/madhukoseke/hillarious/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/madhukoseke/hillarious/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/madhukoseke/hillarious/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/madhukoseke/hillarious/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/madhukoseke/hillarious/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/madhukoseke/hillarious/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/madhukoseke/hillarious/releases/tag/v1.0.0
