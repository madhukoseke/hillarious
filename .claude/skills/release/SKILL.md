---
name: release
description: Cut a new HILLARIOUS version. Picks the semver number, turns the CHANGELOG's Unreleased section into a dated version, stamps the version into tech_debt.md, checks the README, runs the tests, then commits and tags. Use when the user says release, ship, cut or bump a version, or tag.
---

# Release a HILLARIOUS version

Run these steps in order from the repository root. Stop and report if a step fails.

1. **Check the starting point.**
   - Run `git status --short` and `git branch --show-current`. You should be on `main`.
   - If any changes are unrelated to this release, ask before including them.
   - Run `node --test "tests/*.test.mjs"`. Do not release with failing tests.

2. **Pick the version.**
   - Find the previous version with `git describe --tags --abbrev=0` (for example `v1.1.1`).
   - Read the `## [Unreleased]` section of `CHANGELOG.md`. If it is empty or missing, stop and say there is nothing to release.
   - Choose the bump:
     - Only Fixed entries: patch (1.1.1 → 1.1.2).
     - Any new feature or player-visible change: minor (1.1.1 → 1.2.0).
     - Saved records become unreadable, or a mode is removed: major (1.1.1 → 2.0.0).
   - If the user named a version, use theirs.

3. **Update `CHANGELOG.md`.**
   - Rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, using today's date.
   - Above it, add a new empty `## [Unreleased]` heading for the next round of work.
   - At the bottom, add `[X.Y.Z]: https://github.com/madhukoseke/hillarious/compare/vPREV...vX.Y.Z` above the existing version links.
   - Change the `[Unreleased]` link to compare `vX.Y.Z...HEAD`.

4. **Update `tech_debt.md`.** It is local and gitignored; skip this step if it is missing.
   - Replace every `Unreleased` in the Status column and in the "Implemented" table with `vX.Y.Z`.
   - Check that the "Current baseline" facts are still true.

5. **Check `README.md`.** If the release changes player-facing features, controls, commands, or links, update it.

6. **Commit and tag.**
   - Stage only the release files: `git add CHANGELOG.md README.md` plus any code that belongs in the release. Never stage `tech_debt.md`.
   - Commit with the subject `Release X.Y.Z: <short summary>`. In the body, list the main changelog bullets.
   - Tag it: `git tag -a vX.Y.Z -m "HILLARIOUS X.Y.Z: <short summary>"`.

7. **Push, but only if the user asked.**
   - Run `git push origin main` and then `git push origin vX.Y.Z`.
   - If the push is rejected, run `git fetch` and rebase onto `origin/main`. Stash uncommitted work first and restore it afterwards. Never force-push.
   - Pushing to `main` starts the GitHub Actions test run.

8. **Report.** Give the version, the commit and tag, whether it was pushed, and anything left uncommitted.
