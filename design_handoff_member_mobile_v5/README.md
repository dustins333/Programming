# Handoff: Member Mobile — Full Tab Pass (v5)

## Overview
A visual and interaction pass across the **entire member-facing mobile experience** of the Kova Strength app: My Week, My Fitness (session overview + logger), My Nutrition (all four tabs), My History, Settings, and every empty/edge state. The brief was: it feels flat, like a spreadsheet moved onto a phone. Nothing about the data model changes — every field, tab, program, metric and column from the live screens survives. What changes is hierarchy, the use of Protest Strike as a real hero voice, and two genuinely new interaction patterns (see **New behavior**).

Surface: member only. Coach web is untouched by this pass.

## About the Design Files
`Kova Member Mobile - Directions.dc.html` is a **design reference built in HTML** — a prototype communicating layout, spacing, color, type and copy precisely. It is **not** React Native code and must not be copied in. Recreate these designs in the existing Expo / React Native + NativeWind environment using the app's own conventions (`lib/theme.js` tokens, `components/SegmentedControl.js`, `StatusBadge.js`, `SessionLogger.js`, `NumericInputAccessory.js`, `WeightCalculator.js`, Ionicons via `@expo/vector-icons`).

Mapping, same as prior handoffs:

| Prototype | React Native / NativeWind |
|---|---|
| `<div>` with flex styles | `<View className="…">` |
| Text elements | `<Text style={{ fontFamily: … }}>` (this app sets font via `style`, not a Tailwind font utility) |
| `<div onClick>` | `<Pressable>` |
| CSS `box-shadow` | `shadowColor/shadowOffset/shadowOpacity/shadowRadius` + `elevation` |
| `conic-gradient` progress ring | `react-native-svg` `<Circle>` with `strokeDasharray`, or an existing ring component if one lands first |
| Tab bar mock (grey squares) | the real `Tabs` navigator in `app/(member)/_layout.js`; squares are icon placeholders only — keep the current Ionicons |
| Photo slots | the existing `components/nutrition/PhotoUpload.js` — **its placeholder graphics stay exactly as built**, only the surrounding card/status treatment is new |

## Fidelity
**High-fidelity** for color, type, spacing, radii and copy. Structural for exact pixel positions on real device widths (mocks are a fixed 390×844 frame) — adapt with flex.

## The approved set

| id | Screen | Route |
|---|---|---|
| `1a` | My Week (home) | `app/(member)/index.js` |
| `3a` | My Fitness — session overview (pre-logging) | `app/(member)/plan.js` |
| `1d` | My Fitness — the logger (focus mode) | `app/(member)/plan.js` + `components/SessionLogger.js` / `ExerciseCard.js` |
| `1g` | My Nutrition — Today | `app/(member)/nutrition/index.js` |
| `4a` | My Nutrition — Weekly | `app/(member)/nutrition/weekly.js` |
| `5a` | My Nutrition — Check-In | `app/(member)/nutrition/checkin.js` |
| `5b` | My Nutrition — Photos | `app/(member)/nutrition/photos.js` |
| `1j` | My History — By Day | `app/(member)/history/index.js` |
| `1k` | My History — Exercises | `app/(member)/history/index.js` (+ `[exerciseId].js`) |
| `6a` | Settings | `app/(member)/settings.js` |
| `7a`, `7b` | Empty / edge states | `app/(member)/index.js` status branches |

Turns 1–3 in the file also hold rejected explorations (`1b`, `1c`, `1e`, `1f`, `1h`, `1i`, `2a`, `3b`). They are kept for context — **do not build them**.

## Design tokens
All from `tailwind.config.js` / `lib/theme.js`. No new colors.

```
Clay / primary        #a46a57   fills, active states, rings in progress
Brand text on white   #8a5140   any brand-colored text under 24px
Mocha / accent        #ad816d
Sand / tertiary       #beac95   eyebrow text on dark surfaces
Olive / complete      #4d6142   done, on target, toggles-on   (bg tint #eef1e7 / #f3f6ef, pill #e9f0e1 text #3f5136)
Ochre / celebrate     #c68a3e   PRs, wins, streak chips        (on dark: #e0b070)
Urgent                #b23a22   (bg #fdece5)   Needs action #8a5a2e (bg #f4ede3)
Data good / bad       #5b7f52 / #c0492e
Canvas                #faf8f6   Card #ffffff   Elevated header #fdfbf8
Ink                   #44403c   secondary #57534e / #78716c   muted #a8a29e   faint #c9c4bd
Card border           #ece7e1   done-tint #dbe8cf   input #d9d4cd   dashed empty #ddd6cd
Dark hero             #33251f   (its own decorative circle rgba(190,172,149,.12))
Segmented track       #f1ece6   inactive label #8a7f76
```

**Type** — Protest Strike (`fonts.display`) for page titles, hero numbers, session names, and the values inside dials/steppers. Montserrat 400/500/600/700 for everything else. Eyebrows: Montserrat 700, 9.5–10px, uppercase, 0.12em.

**Shape** — cards 16–20px, hero 20–26px, pills 999px, inputs 9–14px. Card shadow `0 4px 14px rgba(68,64,60,.045)`; primary CTA `0 6px 16px rgba(164,106,87,.25)`; dark hero `0 10px 26px rgba(51,37,31,.28)`.

**Spacing** — 5 / 8 / 10 / 12 / 14 / 16 / 20 / 24px only.

## House rules established this pass (apply to any new member screen)

1. **Dashed = not logged yet. Solid = logged.** One rule, everywhere: macro dials, weight/sleep tiles, hunger/energy scales, day rows, photo slots, unpublished session stripes.
2. **Progress rings** replace count pills on program cards. Ring fill = completed ÷ target, count in Protest Strike inside. **Olive only when the target is met; clay while in progress.**
3. **Nutrition adherence is measured against days elapsed, not 7.** Wednesday with 3 of 3 logged is `3/3` and olive. Today never counts as a miss until the day is over.
4. **Copy uses `|` as a separator**, never an em-dash. Empty values render as `–`.
5. Olive means good — never use it for a neutral count.
6. Every tappable target ≥44×44pt.
7. The tab bar is **four items** for a full member: My Week | My Fitness | My Nutrition | My History. "Coaching" is staff-only (`isStaff` gate) and must not appear in member mocks. `My Fitness` hides for nutrition-only members (`useHasFitness`), `My Nutrition` hides when not enrolled.
8. Nothing on any screen tells a member she's missing a product she isn't enrolled in.

---

## Screens

### 1a — My Week
**Purpose:** answer "what am I doing today" before anything else.

**Layout, top to bottom (20px screen padding):**
- **Header row:** gear (20px rounded-square, `#78716c` Ionicons `settings-outline`) + "Hi, {name}" (Protest Strike 27px, `#a46a57`); date below, indented past the gear (12px, `#78716c`); Kova logo 34px circle right.
- **Hero card** — `#33251f`, radius 26px, 20px padding, decorative circle bleeding top-right. Eyebrow "{PROGRAM} | SESSION {n}" (9.5px/700, 0.14em, `#beac95`); block-position chip right ("WEEK 3 OF 6", ochre-tinted `rgba(198,138,62,.2)` / `#e0b070`); session name Protest Strike 34px `#f7f3ee`; meta line `rgba(247,243,238,.62)`; CTA row = cream "Start session" (radius 14, 13px padding, `#33251f` text) + 48px outlined chevron square.
  - **Hero precedence:** today's group session if incomplete → else SPC's next incomplete session → else the complete/rest state. No second program is mentioned in the hero; the cards below carry it.
  - The chip is `currentWeekNumber(block.block_start_date, program.block_length_weeks, today)`. No streak — that needs a query that doesn't exist.
- **"YOUR WEEK"** eyebrow, then one card per program (radius 18, 14px 16px padding). Header row: 7px color dot + program name (14.5px/700) + "View full block ›" (11px/700 `#8a5140`) on the left, **progress ring 38px** right (inner 29px white disc, count Protest Strike 12px).
  - Below: one **11px stripe per session**, `gap:8px`, each in a column with its own centered caption underneath (9px/700, 0.06em). Complete = `#4d6142`; upcoming = clay at 30–32% opacity; unpublished = `1.5px dashed #ddd6cd` with caption "NOT PUBLISHED", untappable (toast: "Not published yet — check back soon."). **Each stripe is the tap target for that session's preview** (`SessionPreviewModal`).
  - Completed-week card keeps the `#dbe8cf` border tint.
- **Nutrition card** — same shell. Header: "Nutrition" + "Tap a day to log it" (11px `#78716c`), ring right (`logged/elapsed`). Then the 7-day strip: each day is a **column with 8px 7px padding** (≥44pt target) holding a 22px circle + label. Olive fill = finalized; peach fill `#fdece5` + `1.5px #e6b6a5` = missed; `2px #a46a57` ring on `#fdf6f2` = today; hairline `#e0dad2` = future. Each past/today circle deep-links to that date (`/nutrition?date=…`).

### 3a — My Fitness, session overview
**Purpose:** the landing state for the tab. Read what you're in for, then start. **No inputs on this screen.**

- **Hero is the selector** (`#33251f`, radius 24, `18px 18px 0`): program as a dropdown chip in the eyebrow (`rgba(247,243,238,.12)` pill + ▾) — **one program shows plain text with no ▾ and no sheet**; "View full block ›" (`#e0b070`) + gear right; session name Protest Strike 32px; meta "6 exercises | 18 sets | last done Aug 2".
- **Session tabs sit on the hero's bottom edge**, radius `12px 12px 0 0`: active tab is `#faf8f6` (reads as continuous with the canvas below), inactive is `rgba(247,243,238,.1)` with a ✓ when that session is done, plus the muscle-group nickname in italic beneath each. A single-session program drops the row entirely.
- **Warm-up:** quiet inset list, `#fdfbf8` on `1px #f2ede7`, radius 16, name left / prescription right, 1px `#f4efe9` dividers.
- **MAIN SESSION:** white card, radius 18, one row per exercise: 24px numbered rounded-square (`#f5f1ec`, `#8a5140`), name 13.5px/600, "4 × 8 | rest 0:20" 11px `#a8a29e`, right side = last time's top set (12px/700 `#8a5140`) over its date, or "first time".
- **Pinned CTA** "Start session" (clay, radius 15, 16px padding). Becomes "Resume session" once any set is logged. Tapping any exercise row jumps straight into `1d` at that exercise.

### 1d — My Fitness, the logger
**Purpose:** log a set in two taps, standing at a rack, without a keyboard.

- **Header:** "My Fitness" (Protest Strike 25px) + **session timer** right (white pill, 13px ring glyph + Protest Strike 15px elapsed). Below it the **session banner**: `#fdf6f2` on `1px #f0ddd2`, radius 16 — eyebrow "{PROGRAM} | SESSION {n}" (must `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`, parent `min-width:0`), title 15px/700, then a 6px progress bar (`#f0ddd2` track, `#4d6142` fill) + "1 of 3 done". **No "View full block" here** — mid-session there's nothing to navigate to.
- **Exercise nav row:** 34px ‹ and › circles flanking "EXERCISE 1 OF 3" (11px/700 `#a8a29e`).
- Exercise name Protest Strike 27px; "Target: 3 sets × 10 | rest 20"; "▶ Watch video" and "History + chart" as outlined pills; then the **last-time line**: `#fdece5` block, radius 12, 14px `#b23a22` dot + "Last time 08-08-2026 | 3 × 10 @ 10 lb" (11.5px/700 `#b23a22`).
- **Set rows:**
  - *Logged:* white card, `1px #dbe8cf` + **`4px` olive left border**, values in Protest Strike 21px with unit suffixes in Montserrat, 30px olive ✓ circle right.
  - *Current:* white, `1.5px #a46a57`, warm shadow. "SET n | NOW" eyebrow left, "last: 10 reps @ 10" right. Two stepper groups (REPS, WEIGHT) — `#faf8f6` track radius 14 with 5px padding, **44×44 − and + buttons** (white, radius 12, `#8a5140` glyph), and the value in the middle as a **tappable field** (white, radius 9, `1px #ece7e1`, Protest Strike 22px).
  - *Upcoming:* 0.6 opacity, "10 reps | 65 lb | carried over".
- **Carry-over:** each new set prefills from the set just logged, so a straight 3×10 @ 65 is three taps. The first set of an exercise prefills from last time's matching set.
- **Keyboard accessory bar** (`#f1ece6`, `1px #e0dad2` top): **Calculator** on the left (opens `WeightCalculator`), context label centered, **Done** right. Present only while a field is focused, and **the Calculator item appears only on weight fields in the logger** — never on nutrition.
- **Footer:** "Log set n" (clay, flex:1) + **rest timer button** 96px wide (`#fdf6f2`, `1.5px #f0ddd2`, Protest Strike 17px `#8a5140` over a "REST" label).
  - **Rest never auto-starts.** It defaults to the coach's programmed rest and starts on tap. With no programmed value the button reads "Rest" and opens a duration picker.
  - **Programmed rest needs a coach-side input fix (separate ticket):** store seconds as an integer, always; the builder field is numeric-only with a fixed `sec` suffix so "90s" can't be typed; strip non-digits on paste/blur; quick chips 30 / 60 / 90 / 120; display everywhere as `m:ss`; empty is legal and means "no programmed rest".

### 1g — My Nutrition, Today
**Purpose:** the once-a-day evening log. **Never a running all-day calorie meter** — this app logs totals once.

- Title + "NOT LOGGED YET" badge (`#fdece5` / `#b23a22`), date under the title, then the 4-tab segmented control (track `#f1ece6`, active = white pill + `0 1px 3px rgba(68,64,60,.08)`).
- **Macro card** (radius 22): eyebrow "TODAY'S MACROS" + "tap to enter" (replaced by "{n} cal derived" once all four are in). Four **62px dials**: filled = `conic-gradient({color} 0 {pct}%, #f0ece6 0)` with a 48px white inner disc and the value in Protest Strike 16px; **empty = `2px dashed #ddd6cd` ring with a `–`**. Label + "of {goal} g" beneath. Tapping a dial opens the numeric keyboard for that macro.
- **Weight / Sleep tiles:** two cards, Protest Strike 24px value + unit; weight shows "▼ 1.2 vs last week" in olive; **unlogged tile is dashed with `–`**.
- **Steps / Hunger / Energy rows** in one white card, 1px `#f4efe9` dividers: steps value in a bordered box (dashed when empty); hunger and energy are five 26px rounded squares, `#a46a57` selected, `#f5f1ec` unselected, **dashed outlines when nothing is picked**.
- Autosave line, then pinned "Finalize day".

### 4a — My Nutrition, Weekly
**Purpose:** how was my week, then which day went sideways. Replaces the side-scrolling grid entirely.

- Title, tabs, then the **averages band** (`#33251f`, radius 20, 16px padding): eyebrow "THIS WEEK | AVERAGES" + logged-count chip ("3 OF 7 LOGGED", ochre) — that chip is the caveat qualifying every number in the band. Four stats in Protest Strike 24px `#f7f3ee` with single-line 8.5px labels: **WEIGHT, STEPS, SLEEP, 8-WK LB** (the last in `#e0b070`).
- **Macro average card:** eyebrow "MACRO AVERAGE VS GOAL" + "week average", then a **2×2 grid** of label / `value / goal` / 8px bar (`#f0ece6` track; fill `#5b7f52` on target, `#c68a3e` near, `#c0492e` off — same ±10% band as the current table cells).
- **Week stepper:** 36px ‹ and › circles flanking the 7 day chips. The arrows move the whole screen a week at a time — band, macro averages and day list together. Forward disables on the current week; the band header switches from "This week" to the date range in history. **This replaces the "Prior weeks" list, which is deleted.**
- **Day chips:** flex:1 columns, radius 14, 8px vertical padding — weekday (9.5px/700) over date (12.5px/700) over a 6px dot (olive logged / `#f0ddd2` missed / clay ring today). Selected chip is clay-filled; today is `#fdf6f2` with a `1.5px #a46a57` border. Tapping scrolls to that day's row and expands it.
- **DAY BY DAY rows:** collapsed row = weekday + one meta line, with the **four macro bars** (5px wide, height = share of goal, fixed order P · C · F · Fi, same colour band) and a ▾; **unlogged rows are dashed with hollow bars**. Expanded row (`1.5px #a46a57`, warm shadow) **mirrors the Today entry screen exactly**: same four dials in one row, same weight/sleep tiles, same steps/hunger/energy rows — read-only. Tapping an unlogged day opens that date's entry form.
- The expanded card must fit above the tab bar without scrolling — that constraint drove the condensed spacing; keep it.

### 5a — My Nutrition, Check-In
Task model unchanged: photos and the question form are two gates; **Finalize stays disabled until both are satisfied** (or photos are explicitly skipped with a reason).

- **Week band** (`#33251f`): "WEEK OF {date}" + "1 OF 2 DONE" chip, "Your check-in" in Protest Strike 26px, one supporting line.
- **Task rows:** done = `#f3f6ef` on **`2px #4d6142`** with an olive ✓ circle; open = white on `1px #ece7e1` with a hollow 26px ring. Title 14.5px/600, subtitle carries state ("Submitted | front, side, back", "6 questions | 2 answered", "Skipped — {reason}").
- **"I can't provide photos this week"** stays a link directly under the task, not buried in the upload sheet. It opens the reason modal.
- **Reopened-week card** keeps its own container: `#fdf6f2` on `1.5px #b23a22`, title + "Week of … | complete by …", its own two task rows, its own Finalize.
- Pinned "Finalize check-in", 0.45 opacity while blocked. Submitted state (not drawn): the olive card with "Submitted {date} ✓" plus the Zoom scheduler button when the answers trigger booking.

### 5b — My Nutrition, Photos
- **Status card:** due-and-missing = `#fdf6f2` on `1.5px #b23a22`, "Photos due this week. Side and back still needed"; satisfied = white with the olive "This week's photos are in ✓"; not due = neutral. The old "Last uploads" line is **removed** — the slots below already show it.
- **ADD TODAY'S PHOTOS:** three equal slots, 150px tall, radius 16. Filled = the photo with an olive "FRONT ✓" chip top-left. Empty = `1.5px dashed #e0b6a5` on `#fdf1ea` with a 34px white "+" circle and the angle label. **Keep `PhotoUpload`'s existing placeholder graphics as-is** — only this framing is new.
- Clay "Upload {n} photo" button.
- **COMPARE:** Front / Side / Back pill toggle in the section header, then two panes — each a date picker row (white, radius 12, ▾) over a 190px photo frame, with that day's weight centered below in Protest Strike 17px.
- Known bug carried over, not fixed here: Photo Compare currently renders a raw Supabase error instead of the photos.

### 1j — My History, By Day
- Segmented "By Day / Exercises" (2 items), then **two stat tiles**: "142 LOGGED SESSIONS" (clay) and "12 WEEK STREAK" (olive). The label must say **logged** sessions — members must not confuse this with attendance from the gym management system.
- **Timeline spine:** 2px `#ece7e1` vertical rule with 16px canvas-filled nodes; day headings ("TODAY" clay, others `#a8a29e`) sit on the nodes.
- Entry rows (radius 16): 26px leading circle — olive ✓ for a session, `#f5f1ec` diamond for a nutrition day — title 13.5px/600 + meta 11px.
- **PR entry** is the one ochre moment: `#fdf8ef` on `1px #f0e0c4`, `#c68a3e` ★ circle, "New best | Hip Thrust 185 lb" (13.5px/700 `#8a5a2e`) + "up 25 lb since June 14".
  - **PR rule (locked):** an exercise needs **3 logged sessions** before it's PR-eligible. After that, any increase is a PR. No margin threshold, no rate limiting. There is deliberately **no PR counter tile** — early on, everything would be a PR.

### 1k — My History, Exercises
- Search field, then a **"BIGGEST JUMP THIS BLOCK"** dark card: exercise name in Protest Strike 22px, "+25 LB" in `#e0b070`, and a 7-bar trend (rising opacity, latest bar solid ochre) with start/end dates.
- Then one card per exercise: name + "Last done {date} | {reps} reps @ {weight}", best on the right (Protest Strike 19px olive over "BEST LB"), and a 7-bar sparkline in clay tints. Rows with no history yet collapse to a plain chevron row.
- This needs the new exercise-grouped query flagged in the v4 handoff (logged sets grouped by exercise across sessions/programs) — scope it as data work, not UI.

### 6a — Settings
Reached from My Week's gear; hidden route, not a fifth tab.
- "‹ Back", "Settings" (Protest Strike 25px), then cards (radius 16, `1px #ece7e1`, `0 3px 10px rgba(68,64,60,.05)`) with 10px/600 uppercase `#a8a29e` titles.
- **Account:** Email row (value beneath the label) + "Change ›"; Password row + "Change ›"; the inline change form is a bordered input + clay Save, expanding in place (no modal, no route).
- **Notifications:** three toggle rows with descriptions — Daily log reminder, Weekly check-in available, Coach messages. **Toggles are the real RN control: 51×31 track, 27px thumb with `0 1px 3px rgba(42,33,28,.2)`, olive `#4d6142` on / `#e7e5e4` off.**
- "Sign out" outlined button.
- **Danger zone:** `#fdece5` on `1px #f5c9b8`, one warning line, `#c0492e` "Delete account". **Needs a real type-to-confirm step before shipping.**
- **Removed:** the "About / Assigned coach" card — an assigned coach only exists for nutrition clients and isn't a setting. The Messaging card stays gated on `messagingOn`.

### 7a / 7b — Empty and edge states
Copy stays as the source has it, except the unassigned branch (see below).

- **Already trained today's pair** (`7a`): the hero keeps its slot but goes `#efeae4` on `1.5px dashed #ddd6cd`, centered — "TODAY" eyebrow, "Session 1 complete" (Protest Strike 30px, `#4d6142`), "Session 2 opens Wednesday." Sibling state, same card: week complete ("Training complete | 3 of 3 this week, back Monday"). There is no scheduled rest day — sessions are day-paired, so this state is always "already did this one" or "done for the week".
- **Unpublished session** (`7a`): dashed stripe + "NOT PUBLISHED" caption, untappable.
- **No active block** (`7a`): plain card, program name + "No active {program} block right now."
- **Nutrition-only member** (`7b`): three tabs, no My Fitness. Hero becomes "TONIGHT'S LOG / Not logged yet / Weight, macros, steps, sleep." with a "Log today" CTA and a logged-count chip. **No empty program slots and no line implying missing training.**
- **Unassigned** (`7b`): `#efeae4` dashed card — **"Welcome to Kova" (Protest Strike 26px, clay) / "Your coach is building your program. Check back soon."** This replaces "You're not assigned to a program yet — check with your coach", which read as though the gym had dropped her.
- **First paint** (`7b`): card-shaped skeletons — `#f0ece6` pills for the title and stripes, `#f5f1ec` circle for the ring. Replaces the bare `ActivityIndicator`.
- **Per-program load failure** (`7b`): `#fdf6f2` on `1.5px #b23a22`, "Something went wrong loading {program}", the error message, and a "Try again" button — the current build shows red text with no retry affordance on this branch.

## Interactions & behavior
- **Navigation:** program card chevron → `/(member)/plan?program={id}`; "View full block ›" → `/(member)/plan-block?programId={id}`; a session stripe → `SessionPreviewModal`; a nutrition day circle → `/(member)/nutrition?date={iso}`; gear → `/(member)/settings`; exercise row in `3a` → the logger at that exercise.
- **Logger:** value tap → numeric keyboard + accessory bar (Calculator on weight only); steppers ± ; "Log set n" commits and advances, prefilling the next set; rest timer starts only on tap.
- **Weekly:** ‹ › step the week; a day chip scrolls-and-expands its row; one row expanded at a time.
- **Check-in:** each task row opens its existing bottom sheet (`PopupModal`); Finalize disabled until `canFinalize`; the reopened card submits independently.
- All existing autosave, toast, retry and `useFocusEffect` reload behavior is unchanged.

## State management
No new global state. Everything added is local: expanded day (`string | null`) and selected week offset (`number`) on Weekly; current exercise index and per-set draft values in the logger (already there); expanded inline form (`'email' | 'password' | null`) in Settings. All data comes from existing queries — `listMyAssignments`, `getCurrentBlock`, `listWorkoutsForWeek`, `listGroupCompletionsForWorkouts`, `getCompletedSpcWorkoutIdsForWeek`, `listLogsForDateRange`, `listLogs`, `getCurrentTarget`, `summarizeWeek`, `listDayTimeline`, `listLoggedExercises`, `getClientQuestions`, `getCheckinForWeek`, `listAllPhotos`, `updateOwnNotificationPrefs`.

**Two things need new data work, scope separately:**
1. `1k`'s exercise-grouped history and "biggest jump this block" (already flagged in the v4 handoff).
2. PR detection — best-per-exercise with the 3-session eligibility gate.

## Assets
No new image or icon assets. Icons stay Ionicons at their current sizes; the grey squares in the mocks are placeholders for them. Kova logo is the existing `assets/kova-logo.jpg`. Photo placeholders are `PhotoUpload`'s existing graphics — unchanged.

## Files
- `Kova Member Mobile - Directions.dc.html` — every screen above, plus the rejected explorations from turns 1–3. Open it in a browser; each option is labelled with the id used in this README.
- `screenshots/` — one capture per **approved** screen, named by id (`01-1a-my-week.png` … `12-7b-edge-states-nutrition-only.png`). Rejected explorations are deliberately not captured.
