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
- Cable cars, traffic, and recognizable SF-inspired scenery
- Sound effects and a lightweight arcade feel
- Keyboard controls, plus touch and gamepad support in the latest build
- **One `index.html` file** — no framework or build step needed

## 🕹️ How to play

1. Open the [live game](https://hillarious.pages.dev), or run it locally using the steps below.
2. Select **Play** and check the in-game controls.
3. Complete deliveries while navigating the hills and traffic.

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

They also run on every push to `main` through GitHub Actions. `tests/playtest/` holds browser playtest scripts for Playwright; they expect the game served at `http://127.0.0.1:8765/`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## What's next?

This started as an experiment and will keep evolving. Possible next steps include more missions, new obstacles, game modes, and a leaderboard.

## Feedback

Found a bug or have an idea? [Open a GitHub issue](https://github.com/madhukoseke/hillarious/issues).

---

*Inspired by the experience of driving around San Francisco where the hills already feel like a game on hard mode.*
