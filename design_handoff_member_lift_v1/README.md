# Member lift tracking — redesign handoff (v1)

Scope: the member's session-logging surface on **My Fitness**. Recommended direction is **9a**; 9b is the same model drawn without card chrome, kept for reference. Both live in `Kova Member Mobile - Directions.dc.html`, turn 9.

Source read before designing: `components/ExerciseCard.js`, `components/SessionLogger.js`, `components/SessionFocusModal.js`, `components/SessionHeroBar.js`, `app/(member)/plan.js`.

---

## What goes away

| Removed | Why | Where it lives now |
|---|---|---|
| Per-set **Log set** button | Read as a required extra step; autosave already persisted everything | A set counts as logged once reps + weight both have values (olive fill) |
| ± **steppers** on reps/weight | People believed they *had* to use them instead of typing | Tap the box, type. Box is the whole control |
| **SessionFocusModal** (full-screen one-lift overlay) | Looking ahead meant leaving your logging spot | Everything is one scrolling page |
| Session **stopwatch** in the hero | Nobody used it; it competed with rest | Gone. Rest timer is the only timer |
| Red **"Last time"** band (`PILL_BG` / `PILL_TEXT`) | Read as a warning | One grey line in the lift header: `Last time Aug 5 · 3 × 10 @ 135` |
| Notes **placeholder** copy | Prefilled prompt looked like content | Blank field |
| **✓** on the Finalize button | Ditto on the nutrition Finalize — drop the glyph only, no other change | `Finalize workout` / `Workout finalized`, no checkmark |
| **History** link on the card | One button too many | The lift **title** is the tap target (chevron after the name) → history + chart |
| **Video** link | Ditto | Small ▶ glyph beside the lift title |
| Docked **Finalize** bar | Requested: they should scroll to it | Sits in the flow after the last lift |

## What the screen does now (9a)

- **Warm-up** is one collapsed row (`Warm-up · 5 moves`) with a chevron. Everything else opens expanded when My Fitness loads.
- **A lift collapses only when its checkbox is ticked** → one line, `Logged 3 × 8 @ 185`, green check, chevron to reopen and correct a number. Nothing collapses on its own.
- **Sets are full-width rows**: `SET n | reps | lb`, `REPS`/`LB` headers said once per lift. Logged rows go olive-tinted; the current row's reps box carries the terracotta border; upcoming rows show last time's numbers as grey ghost values.
- **+ at the end of the set row** adds a set beyond what the coach programmed.
- **Plate calculator** rides the active weight box — small keypad mark on its right edge. No keyboard accessory bar needed (that path was iOS-only and broke on the web PWA).
- **Note field** is an empty box on the card's bottom row, beside the timer.
- **Rest timer** is the stopwatch button bottom-right of each card, with the programmed rest length under it (`1:30`).

## Rest timer behaviour (this is the part with real backend/nav implications)

- Started only on tap. Never auto-starts.
- Once running it **pins to the top of the screen**, above the page header, dark (`#33251f`), showing remaining time, the lift name, a progress bar, and Cancel.
- It **lives above the tab content, not inside My Fitness** — it stays on My Week, Nutrition, History, Settings. Tapping it returns to that exercise.
- On expiry it turns **olive (`#4d6142`), reads "Rest done" with the lift and set**, holds a few seconds, then clears itself. Cancel kills it immediately.
- Implementation note: it must be owned by a provider above the tab navigator (not `ExerciseCard`'s local `RestButton` state), or it dies on unmount — the old behaviour of disappearing when you left the card is exactly what this replaces.

## Screens

| File | What it shows |
|---|---|
| `9a-1-session-open.png` | Session top: warm-up collapsed, lift 1 checked and collapsed, lift 2 open and mid-log, lift 3 waiting |
| `9a-2-end-of-session.png` | Scrolled to the end: rest running and pinned, two collapsed lifts, superset, Finalize in the flow |
| `9a-3-timer-on-my-week.png` | Timer finished — olive "Rest done" bar riding on the real My Week screen |
| `9b-1-hairline-list.png` | Alternate: no card chrome, hairline rules, three lifts per screen |
| `9b-2-rest-pinned.png` | Alternate, mid-session with rest pinned |

## Still open

- Nutrition Finalize: drop the `✓` in `app/(member)/nutrition/index.js` (line ~757). No other change.
- Whether a finished lift should also collapse in 9b (only 9a draws it).
- Superset cards keep the dashed terracotta container and shared numbering (5a/5b) — unchanged from today.
