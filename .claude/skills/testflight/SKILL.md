---
name: testflight
description: Build and ship a new TestFlight release for the Kova Strength iOS app via EAS Build + Submit. Use whenever the user asks to push/ship/deploy a build to TestFlight, release a new iOS build, update the app for testers, or otherwise get a fresh build in front of Terra/coaches/clients on their phones — even if they just say "ship this to testflight" or "push an update to the app" without naming EAS specifically.
---

# TestFlight deploy

Two EAS commands, run in order, from this Expo app's project root (`/Users/Dustin/Claude Code/Programming`). This only works in a real interactive terminal — Apple/Expo may prompt for login the first time, and the user needs to be present to answer that. If this session can't reach a real terminal (no interactive stdin), say so and hand the two commands back to the user instead of pretending to run them.

## Before building

1. `git status` — if there are uncommitted changes, ask the user whether to commit first (don't auto-commit; follow the repo's normal git rules). A build should ship from a known, committed state, so a future TestFlight build can always be traced back to a real commit.
2. Default to `ios`/`production` without asking — it's the only platform/profile this repo has wired up for App Store Connect (`eas.json`'s `submit.production.ios.ascAppId`). Only ask if the user's phrasing suggests something else (e.g. an internal/preview build instead of a real TestFlight release).

## Build

```bash
eas build --platform ios --profile production
```

Run this in the foreground, not backgrounded — it's a real cloud build (typically 10-20 minutes), and its output is where any login prompt or real build error will show up. Don't move on until it reports success or failure.

`eas.json`'s `production` profile has `autoIncrement: true`, so the build number bumps itself automatically — no need to hand-edit `app.json` for a routine push. Only bump the `version` string in `app.json` first if this release should read as a new marketing version (e.g. 1.0.0 → 1.0.1) to testers — that's a judgment call, so surface it to the user rather than assuming either way.

If the build fails, stop and report the actual error rather than retrying blindly. Most failures here are either a stale `eas login` session (ask the user to run `eas login` themselves, since it needs their credentials) or a real problem in the code that needs fixing before trying again.

## Submit

Once the build succeeds:

```bash
eas submit --platform ios --profile production --latest
```

`--latest` picks up the build that was just produced, so there's no build ID to hunt down by hand.

## Report back

Tell the user plainly: whether the build succeeded, whether the submit succeeded, and that Apple's own processing (usually a few minutes, sometimes up to an hour) is the last step before it actually shows up under TestFlight — that part happens on Apple's side and isn't something to wait on here. On failure, quote the real error instead of a generic "something went wrong."
