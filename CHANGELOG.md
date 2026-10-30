# Changelog

All notable changes to HILLARIOUS are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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

[1.1.0]: https://github.com/madhukoseke/hillarious/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/madhukoseke/hillarious/releases/tag/v1.0.0
