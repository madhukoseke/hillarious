# HILLARIOUS 🚲

**A chaotic little bicycle-delivery game set on the hills of San Francisco.**

Navigate steep streets, dodge traffic and cable cars, deliver your cargo, and see what your customers think of your delivery skills.

HILLARIOUS began as a single-file browser-game experiment at **Claude Community Games** in San Francisco, built with **Claude Code and Claude Opus 5.5**.

## 🎮 Play

**[Play HILLARIOUS online](https://hillarious.pages.dev)**  
*Replace this placeholder with your live Cloudflare Pages URL after deploying.*

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

## 🚀 Run locally

Clone the repository:

```bash
git clone https://github.com/YOUR-USERNAME/hillarious.git
cd hillarious
```

For this self-contained game, you can open `index.html` directly in your browser.

Or serve it locally with Python:

```bash
python3 -m http.server 8000
```

Then visit **http://localhost:8000**.

## 📁 Project structure

```text
hillarious/
├── index.html      # Complete game: HTML, CSS and JavaScript
├── README.md       # Project information
└── .gitignore       # Local files to keep out of Git
```

## ☁️ Deployment: Cloudflare Pages

This is a static HTML game; no framework or build process is required.

1. Push this repository to GitHub.
2. In Cloudflare, go to **Compute → Workers & Pages** and create a **Pages** project connected to the repository.
3. Choose the `main` branch.
4. Use the following build settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | None |
   | Build command | Leave blank (or use `exit 0` if required) |
   | Build output directory | `.` |

5. Deploy and replace the placeholder Play link above with your actual `*.pages.dev` URL.

Future pushes to `main` will trigger new deployments automatically.

## 🛠️ Built with

- HTML, CSS and JavaScript
- Claude Code with Claude Opus 5.5

## 🗺️ What's next?

This started as an experiment and will keep evolving. Possible next steps include more missions, new obstacles, game modes, and a leaderboard.

## 💬 Feedback

Found a bug or have an idea? [Open a GitHub issue](https://github.com/madhukoseke/hillarious/issues).

---

*Inspired by the experience of driving around San Francisco — where the hills already feel like a game on hard mode.*
