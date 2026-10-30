# Browser and device matrix

Record one row per browser or device run. Automated runs come from `tests/playtest/cross-browser.mjs`; real-device runs follow the checklist below.

## Automated runs

Each run starts a shift as a player (the intro must wait for input), rides, then plays a full autopilot shift to the final review.

| Date | Version | Browser | Size | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-30 | 1.2.0 (pre-release) | Chromium 141 | Desktop 1280×720, keyboard | Pass | No console or page errors. Tips $5.04 / $4.85. |
| 2026-10-30 | 1.2.0 (pre-release) | Chromium 141 | Landscape phone 844×390, touch | Pass | Touch labels shown. Final card scrolls; Save and Play Again reachable. |
| 2026-10-30 | 1.2.0 (pre-release) | Firefox 142 | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-10-30 | 1.2.0 (pre-release) | Firefox 142 | Landscape phone 844×390, touch | Pass | No errors. |
| 2026-10-30 | 1.2.0 (pre-release) | WebKit 26 (Safari engine) | Desktop 1280×720, keyboard | Pass | No errors. Same tips as Chromium. |
| 2026-10-30 | 1.2.0 (pre-release) | WebKit 26 (Safari engine) | Landscape phone 844×390, touch | Pass | Final card scrolls; Save and Play Again reachable. |

All six runs produced identical tips, so the simulation is deterministic across engines.

### Open cosmetic issues

- On the landscape phone layout, the verdict stamp (for example ACCEPTABLE) is not visible on the final review in Chromium and WebKit. It shows on desktop. Cause not yet confirmed; the stamp is positioned above the verdict box and may be clipped by the scrolling card.

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
