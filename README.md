# HILLARIOUS 🚲

**A chaotic little bicycle-delivery game set on the hills of San Francisco.**

Navigate steep streets, dodge traffic and cable cars, deliver your cargo, and see what your customers think of your delivery skills.

HILLARIOUS began as a single-file browser-game experiment at **Claude Community Games** in San Francisco, built with **Claude Code and Claude Opus 5.5**.

## 🎮 Play

**[Play HILLARIOUS online](https://hillarious.pages.dev)**  

No installation or account required. Open the link in a modern browser.

## ✨ Features

- Bicycle physics inspired by San Francisco's steep hills
- Delivery missions, obstacles, and playful customer feedback
- **Daily Dispatch:** a new route every day, the same for everyone, with one scored ride, unlimited practice, and a streak
- Split times at every checkpoint against your best run
- A spoiler-free Daily Dispatch share card: copy the text, post it, or save a picture of your review
- A Dispatch board to pick single deliveries, which unlock one by one, each with three goals to master
- Courier Academy: six training drills graded by Pat from HR, plus Free Ride from any checkpoint and The Test Hill sandbox
- Cable cars, traffic, and recognizable SF-inspired scenery
- Sound effects and a lightweight arcade feel
- Slow-motion crash replays: see what went wrong, or press hop to skip (off with reduced motion, or add `?replay=off`)
- Keyboard, touch, and gamepad controls, with on-screen labels that match the device you use
- A local high-score board with optional X and LinkedIn handles, plus one-click "Share your shift" posts
- Separate music and effects volume
- **One `index.html` file** — no framework or build step needed

## 🕹️ How to play

1. Open the [live game](https://hillarious.pages.dev), or run it locally using the steps below.
2. Select **START SHIFT** for all three deliveries and the HR review, or **DISPATCH** to pick one delivery. Delivering one unlocks the next.
3. Complete deliveries while navigating the hills and traffic.
4. To practise, open **TRAINING**: work through the drills, or choose **FREE RIDE** to start anywhere with nothing saved. Receipts also offer **Practice this spot** for the stretch that cost you most.

Add `?unlock=all` to the URL to open every order and drill (handy for demos), or `?daily=2026-11-20` to play another day's Daily Dispatch.

> **Tip:** Start on a desktop browser for the easiest keyboard experience. Mobile and gamepad behavior may vary by browser/device.

## Run locally

Clone the repository:

```bash
git clone https://github.com/madhukoseke/hillarious.git
cd hillarious
```

For this self-contained game, you can open `index.html` directly in your browser.

## Tests

The headless simulation and scoring tests need Node.js 22 or later and no other installs:

```bash
node --test "tests/*.test.mjs"
```

They also run on every push to `main` through GitHub Actions. `tests/playtest/` holds browser playtest scripts for Playwright; they expect the game served at `http://127.0.0.1:8765/`. `dispatch-training.js` walks Dispatch, a drill, Free Ride, and The Test Hill from a fresh profile. `crash-replay.mjs`, `daily.mjs`, `splits.mjs`, and `review-cards.mjs` run on a controlled clock and check crash replays and every delivery's review card.

`tests/playtest/cross-browser.mjs` opens Dispatch, Training, and Free Ride, then plays a shift on Chromium, Firefox, and WebKit at desktop and phone sizes. It takes an optional URL argument; setup steps are at the top of the file. Results and the real-device checklist live in [docs/browser-matrix.md](docs/browser-matrix.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## What's next?

This started as an experiment and will keep evolving. Possible next steps include more missions, new obstacles, game modes, and a leaderboard.

## Feedback

Found a bug or have an idea? [Open a GitHub issue](https://github.com/madhukoseke/hillarious/issues).

---

*Inspired by the experience of driving around San Francisco where the hills already feel like a game on hard mode.*
