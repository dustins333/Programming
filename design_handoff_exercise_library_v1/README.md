# Exercise Library — redesign handoff v1

Two screens, one job: make the library scannable and make adding an exercise feel like one continuous flow instead of a wall of controls.

| Prototype | Replaces |
| --- | --- |
| `Exercise Library Mobile.dc.html` | `app/(coach)/exercises/index.js` + `components/ExerciseFormModal.js` (native) |
| `Exercise Library Web.dc.html` | `app/(coach)/exercises/index.web.js` + `components/ExerciseFormModal.js` (web) |

**Nothing was added and nothing was removed.** Every field, badge, count, warning and action that exists today is still present. What changed is where it lives and in what order you meet it.

---

## 1. What was wrong

**Library display.** The screen opened with its filters, not its content. Mobile stacked a Lifts/Warm-ups segment, a "Show archived" toggle, and eight muscle-group pills — three rows of chrome before the first exercise name. Web was worse: one flex-wrap row held ~20 chips (All + 8 patterns + Warm-up + 8 muscle groups + No video + Never used + Needs review + Archived) separated by hairline dividers, then up to three full-width banner cards stacked vertically. On a 1100px column the chip row wrapped to three lines and the table started below the fold.

**New exercise.** One long modal with no grouping: Type, Name, Parent, Default sets/reps, Measured in, Weight, Muscle group, Movement pattern, Cues, Video — ten controls in a flat vertical run inside a `max-h-[85vh]` scroller, with the muscle-group accordion (8 rows) and the movement-pattern chips (9 chips) in the middle of it. Related fields sat far apart (Default sets/reps was above Measured in, which defines what "reps" even means). Archive lived in the list row, not with the thing being edited.

---

## 2. Library display — what it is now

### Mobile (390×844)

Order: title + `+ New` → count line → **segmented control** (Lifts · N / Warm-ups · N) → search + Filter → list.

- The eight muscle-group pills and "Show archived" moved into the **Filter bottom sheet** — same pattern the SPC roster already uses, so filtering is one consistent gesture across the coach app. Sheet sections: MUSCLE GROUP (All + 8, each with a live count) and LIBRARY (Show archived instead, with count). Footer button reads `Show N exercises`.
- Applied filters echo back as dark dismissable tokens under the search row (`#33251f`, tap to clear) and the Filter button carries a count badge.
- List is a single white card, alphabetical, with sticky-feeling **A–Z letter headers** (`#faf8f6` band). Row: name + badge pills, muscle/pattern line, `↳ under Parent`, cues in italic grey, video play button, chevron. Tapping the row opens the edit form; the video button stops propagation.
- Archived view swaps the chevron for an `Un-archive` pill and disables row-tap.

### Web (1360×860, content column 1040px)

Order: title + search + `+ New exercise` → one control row → doorway cards → table.

The chip wall became three things with three different jobs:

1. **Segmented control** — Lifts · N / Warm-ups · N / Archived · N. This is the view you are in, not a filter.
2. **Two dropdowns** — All patterns, All muscle groups (counts beside each option, active state tinted `#fdf6f2` with a `#a46a57` border on the trigger). Only rendered on the Lifts segment, because neither applies to warm-ups. Options with a zero count are omitted, as today.
3. **NEEDS ATTENTION toggles** — No video / Never used / Needs review, right-aligned, tan-bordered, active state `#33251f`. These are the three curation states worth acting on, kept visually separate from navigation.

**Doorway cards** (review queue / near-duplicates / parents) went from three stacked full-width banners to one row of three equal cards: title, then CTA on its own line. Sub-lines were cut — the title already says the number and the CTA says the destination.

Table columns are unchanged: EXERCISE (2.6) · PATTERN (1.1) · USED (0.7) · VIDEO (0.8) · actions (0.6), with the same USED (`never` / `N×`) and VIDEO (`Linked` / `Missing` / `None`) semantics and the same `NEEDS REVIEW` / `DUPLICATE?` / `REPS ONLY` badges.

---

## 3. New exercise — the flow

Same fields, grouped into four cards in the order a coach actually answers them:

1. **Identity** — Type (Lift/Warm-up) → Name → live duplicate check.
2. **Classification** (lifts only) — Parent → Muscle group → Movement pattern.
3. **How it's logged** (lifts only for the first two) — Measured in → Weight → Default prescription.
4. **Teaching** — Cues → Video link.

Decisions worth keeping:

- **Measured in now sits directly above Default prescription**, and the reps input's label follows it: REPS / TIME (SEC) / DISTANCE (FT). Previously you set the number before saying what the number was.
- **Parent picker is inline**, no nested modal. Mobile: bottom sheet with `+ New parent` at the bottom; web: dropdown panel inside the drawer. Creating a parent selects it immediately (unchanged behaviour, fewer surfaces).
- **Picking a parent still pulls its muscle group and movement pattern down** and shows the "pulled from X — change either below if this variation differs" note; a hand-edit clears the link so a later parent change never clobbers coach input. Same rules as `handleParentChange` today.
- **Duplicate check** stays under the Name field with `Use that one` / `Keep both`, and shows the match's usage + video status.
- **Archive moved into the form**, at the bottom, as a quiet red text action → confirm dialog carrying the usage-count sentence verbatim from `getExerciseUsageCount`. On web the table's `Archive` link opens the same confirm directly.
- **Type switching hides what doesn't apply** (warm-ups drop parent, muscle group, movement pattern, measured-in and weight) — same rules `createExercise` already enforces server-side.
- Save is gated on name + at least one muscle group (lifts), rendered as 45% opacity, with the "Pick at least one muscle group" line appearing only once a name has been typed.

Presentation differs by platform on purpose: mobile is a **full-screen push** (`‹ Library` back, sticky Cancel/Save footer) because a 390px modal has no room for a ten-field form; web is a **460px right drawer** so the library stays visible behind it — the coach is usually adding an exercise *because* of something they just saw in the table.

---

## 4. Visual spec

Everything below is already in `lib/theme.js` unless noted.

| Token | Value | Use |
| --- | --- | --- |
| primary | `#a46a57` | Buttons, active chips, display headings |
| primaryOnWhite | `#8a5140` | Brand-coloured text, links, CTAs |
| espresso | `#33251f` | Filter tokens, active attention toggles, sheet footer button |
| canvas | `#faf8f6` | Page + letter-header bands |
| card border | `#ece7e1` | Cards, table outline, header rules |
| row rule | `#f4f1ec` | Between rows |
| input border | `#e2ddd6` | Inputs, dropdown triggers |
| chip border | `#d9d4cd` | Inactive chips |
| segment track | `#efe9e2` | Segmented control background |
| body | `#2a211c` | Names, primary text |
| muted | `#6f6862` | Sublines carrying information |
| hint | `#a8a29e` | Eyebrows, decorative/disabled |
| tan wash | `#fdf6f2` / border `#f0ddd2`–`#eddcd2` | Doorways, duplicate banner, review note |
| needs review | bg `#f5ede4` / text `#8a5140` | Pending badge |
| duplicate | bg `#fdece5` / text `#b23a22` | Duplicate badge |
| reps only | bg `#eef1e7` / text `#4d6142` | Bodyweight badge |
| video linked | `#4d6142` | Linked |
| video missing | `#b23a22` (used > 0) / `#c9c4bd` (never used) | Missing / None |

Type: Protest Strike for the page title (mobile 24, web 27) and dialog titles (19–21). Montserrat elsewhere — eyebrows 10/700/1.1px tracking uppercase, row names 13.5–14/600–700, sublines 11–12, inputs 12.5–14, buttons 12.5–13/700.

Geometry: cards 12–14px radius, inputs and dropdowns 9–10px, chips and tokens 99px, sheets 18px top corners. Mobile page padding 18px, web content padding 36px. Rows 11–13px vertical padding. Web drawer 460px with a `-16px 0 40px rgba(42,33,28,0.18)` shadow; sheet and drawer scrims `rgba(42,33,28,0.4)`.

Touch targets on mobile: rows ≥ 44px tall, sheet options 11px vertical padding on 13.5px text, buttons 40–42px.

---

## 5. Data — no new fields

Every value shown maps to something that already exists:

| UI | Source |
| --- | --- |
| List, counts, segments | `listExercises({ includeArchived: true })` |
| USED column, duplicate meta, archive confirm | `listExerciseUsageCounts()` / `getExerciseUsageCount(id)` |
| Muscle sections + labels | `MUSCLE_GROUPS`, `MUSCLE_SUB_GROUPS`, `parentMuscleGroup`, `muscleGroupLabel` |
| Pattern chips | `MOVEMENT_PATTERNS` |
| Reps label | `REP_UNITS` / `repUnitHeader` |
| Parent field + `↳ under X` | `listExerciseParents()`, `createExerciseParent()` |
| Duplicate check | `findLikelyDuplicates` (form) / `findDuplicateCandidates` + `listMergeDismissals` (table badge) |
| Needs review, doorway | `approved_at`, `isLibraryReviewer(profile)`, `countPendingExercises()` |
| Save | `createExercise` / `updateExercise` (unchanged signatures) |
| Archive / restore | `setExerciseActive(id, bool)` |

The prototypes hold a local seed array in place of these calls; swap in the real hooks and the render logic is 1:1.

---

## 6. Notes for the build

- The `EQUIPMENT` column stays out, for the same reason as the current code: there is no equipment field on `programming.exercises`.
- The A–Z headers on mobile are a tweakable (`listGrouping`) — set it to `Flat list` if you'd rather not ship them.
- `coachIsReviewer` is a tweakable on both files so you can see the reviewer and non-reviewer states (review-queue doorway, "goes into the library straight away" note).
- Mobile deliberately drops three explanatory sub-lines the current form carries (parent hint, pre-fill note, review note) — reviewed and cut as filler on a small screen. Web keeps the parent hint and the review note.
- Web table exercise names are `white-space: nowrap` with no ellipsis; at 429px the longest current name is comfortable. If the library grows names past that, add `overflow:hidden; text-overflow:ellipsis` back to that span only.
- The near-duplicate detection in the prototype is a simplified normalise-and-contains check for demo purposes; ship the real `exerciseMerge` helpers.

---

## 7. What's in this bundle

Both prototype files plus `support.js` are included — open either `.dc.html` in a browser to click through the real thing.

| Screenshot | State |
| --- | --- |
| `01-web-library.png` | Coach web, Lifts view, default |
| `02-web-filters.png` | Muscle-group dropdown open |
| `03-web-new-drawer.png` | New-exercise drawer, empty |
| `04-web-duplicate.png` | Drawer with live duplicate warning + Legs section expanded |
| `05-mobile-library.png` | Mobile library, Lifts, A–Z headers |
| `06-mobile-filters.png` | Filter bottom sheet |
| `07-mobile-form.png` | New-exercise screen |
| `08-mobile-parent.png` | Parent-movement sheet |
