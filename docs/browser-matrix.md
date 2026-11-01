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
