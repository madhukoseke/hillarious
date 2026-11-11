# Browser and device matrix

Record one row per browser or device run. Automated runs come from `tests/playtest/cross-browser.mjs`; real-device runs follow the checklist below.

## Automated runs

Each run starts a shift as a player (the intro must wait for input), rides, then plays a full autopilot shift to the final review. Since the Dispatch & Training work, each run also opens Dispatch (checking the locks), Training, and Free Ride, and starts a free ride.

| Date | Version | Browser | Size | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-30 | 1.2.0 | Chromium 141 | Desktop 1280×720, keyboard | Pass | No console or page errors. Tips $5.04 / $4.85. |
| 2026-10-30 | 1.2.0 | Chromium 141 | Landscape phone 844×390, touch | Pass | Touch labels shown. Final card scrolls; Save and Play Again reachable. |
| 2026-10-30 | 1.2.0 | Firefox 142 | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-10-30 | 1.2.0 | Firefox 142 | Landscape phone 844×390, touch | Pass | No errors. |
| 2026-10-30 | 1.2.0 | WebKit 26 (Safari engine) | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-10-30 | 1.2.0 | WebKit 26 (Safari engine) | Landscape phone 844×390, touch | Pass | Final card scrolls; Save and Play Again reachable. |
| 2026-10-31 | Unreleased | Chromium 141 | Desktop 1280×720, keyboard | Pass | Dispatch shows the cake locked; drills listed; free ride starts. No console or page errors. Tips $5.04 / $4.85. |
| 2026-10-31 | Unreleased | Chromium 141 | Landscape phone 844×390, touch | Pass | Dispatch, Training, and Free Ride fit without scrolling. The two-column receipt scrolls by about 12 px; its buttons stay visible. |
| 2026-10-31 | Unreleased | Firefox 142 | Desktop 1280×720, keyboard | Pass | New screens open; no errors. Same tips as Chromium. |
| 2026-10-31 | Unreleased | Firefox 142 | Landscape phone 844×390, touch | Pass | New screens open; no errors. |
| 2026-10-31 | Unreleased | WebKit 26 (Safari engine) | Desktop 1280×720, keyboard | Pass | New screens open; no errors. Same tips as Chromium. |
| 2026-10-31 | Unreleased | WebKit 26 (Safari engine) | Landscape phone 844×390, touch | Pass | New screens open; no errors. |
| 2026-11-07 | 1.4.0 | Chromium 141 | Desktop 1280×720, keyboard | Pass | Three-delivery shift to the final review in 154 s; no console or page errors. Tips $5.04 / $4.85 / $4.70. |
| 2026-11-07 | 1.4.0 | Chromium 141 | Landscape phone 844×390, touch | Pass | Pass; touch labels shown. Save form and share links ready. |
| 2026-11-07 | 1.4.0 | Firefox 142 | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-11-07 | 1.4.0 | Firefox 142 | Landscape phone 844×390, touch | Pass | No errors. Same tips as Chromium. |
| 2026-11-07 | 1.4.0 | WebKit 26 (Safari engine) | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-11-07 | 1.4.0 | WebKit 26 (Safari engine) | Landscape phone 844×390, touch | Pass | No errors. Same tips as Chromium. |
| 2026-11-08 | 1.5.0 | Chromium 141 | Desktop 1280×720, keyboard | Pass | Three-delivery shift to the final review in 154 s; no console or page errors. Tips $5.04 / $4.85 / $4.70. |
| 2026-11-08 | 1.5.0 | Chromium 141 | Landscape phone 844×390, touch | Pass | Touch labels shown. Save form and share links ready. Same tips. |
| 2026-11-08 | 1.5.0 | Firefox 142 | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-11-08 | 1.5.0 | Firefox 142 | Landscape phone 844×390, clicks | Pass | No errors; same tips. Run with clicks instead of taps: in a freshly launched Playwright Firefox, a touch tap fires touchstart and touchend but never a click, on 1.4.0 as well as 1.5.0, so the tap version timed out. Touch on real Android Firefox is still a TD-07 device check. |
| 2026-11-08 | 1.5.0 | WebKit 26 (Safari engine) | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-11-08 | 1.5.0 | WebKit 26 (Safari engine) | Landscape phone 844×390, touch | Pass | No errors. Same tips as Chromium. |
| 2026-11-11 | 1.6.0 | Chromium 141 | Desktop 1280×720, keyboard | Pass | Shift to the final review in 154 s; no console or page errors. Tips $5.04 / $4.85 / $4.70. Daily route hash `ea1c0bca`, par 43. Records clips as WebM (VP9). |
| 2026-11-11 | 1.6.0 | Chromium 141 | Landscape phone 844×390, touch | Pass | Touch labels shown; same tips and daily hash. |
| 2026-11-11 | 1.6.0 | Firefox 142 | Desktop 1280×720, keyboard | Pass | No errors; same tips and daily hash. Records clips as WebM (VP8). |
| 2026-11-11 | 1.6.0 | Firefox 142 | Landscape phone 844×390, clicks | Pass | No errors; same tips and daily hash. The script clicks in Firefox (Playwright's Firefox fires no click for a tap). |
| 2026-11-11 | 1.6.0 | WebKit 26 (Safari engine) | Desktop 1280×720, keyboard | Pass | No errors; same tips and daily hash. Playwright's WebKit records WebM (VP9); real Safari may pick MP4, still to check on a device. |
| 2026-11-11 | 1.6.0 | WebKit 26 (Safari engine) | Landscape phone 844×390, touch | Pass | No errors; same tips and daily hash. |

All six runs produced identical tips, so the simulation is deterministic across engines.

### Open cosmetic issues

- Landscape phone (844×390): the verdict stamp is visible when the review opens. The card still scrolls to reach the save form, so the stamp leaves the screen as you scroll. The save form is now compact (overflow 376 → 201 px). Not yet re-run in the cross-browser script; re-check on real devices.

## Real-device checklist

Automated browsers cannot stand in for real touch screens, Safari on iOS, or physical controllers. For each device, run the steps and add a row below.

1. Open https://hillarious.pages.dev (or the local server).
2. Title screen: the control strip and the "Press … to ride" prompt match the device you are using.
3. How to Play: keycaps match the device. On touch, the two-thumb tip appears.
4. Start a shift. The intro waits until you press, tap, or press A.
5. Ride the latte delivery: hold pedal, hop a pothole, brake hard once, take the big lip. Hints show your device's controls. Cargo-loss pops name a cause.
6. Pause, change the Music and Effects sliders, resume, restart the delivery, and mute and unmute.
7. Switch away from the tab or app and back: the game pauses.
8. Finish both deliveries. On the final review, save a name with an X handle, then open Post on X and Post on LinkedIn.

| Date | Device | OS and browser | Input | Result | Issues |
| --- | --- | --- | --- | --- | --- |
| | iPhone | iOS Safari | Touch | Not yet run | |
| | Android phone | Chrome | Touch | Not yet run | |
| | Desktop | Chrome or Safari | Xbox or PlayStation controller | Not yet run | |
