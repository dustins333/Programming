# Handoff: SPC Roster Redesign (Mobile, Coach)

## Overview
Redesign of the coach-facing SPC page for phones — the screen a coach opens on their phone at the gym. It replaces `components/coach/SpcRosterMobile.js` (status-grouped card list with coach filter pills) with:

1. A **flat client list** modeled on the all-clients page, with status shown inline on the right of each row.
2. A prominent **"Start live session" button** at the top (replaces the underwhelming "Live session →" text link).
3. **Filters in a bottom sheet** (status + coach, with counts) instead of pill rows; active filters render as removable tokens.
4. **Name / Status sort toggles** above the list (tap to switch, tap again to reverse), with "Status" placed over the status column.
5. A tap-to-open **session preview** — a phone-legible version of the printed SPC sheet (`app/(coach)/spc/print/[blockId].web.js`): warm-ups, main-session lifts with superset letters, week-by-week logged loads with reps, per-week client notes, coach notes, and the client's goal.

Coach jobs served: (a) check the current state of everyone's program; (b) preview a client's session and decide what to write/run today, the way the printed sheet allows at a glance.

## About the Design Files
The files in this bundle are **design references created in HTML** (`SPC Mobile Roster.dc.html` + its `support.js` runtime — open the .dc.html in a browser to interact). They are prototypes showing intended look and behavior, **not production code**. Recreate them in the Programming app's existing environment: Expo / React Native Web, `CoachShell`, `PressFade`, `expo-router`, NativeWind classes where the codebase already uses them, and the tokens in `lib/theme.js`. The prototype's mock data maps onto data the codebase already computes (see State Management).

## Fidelity
**High-fidelity.** Colors, typography, spacing and copy are final intent, built from `lib/theme.js`, `lib/programming/spcStatus.js` and the existing roster/print views. Recreate pixel-perfect with existing components.

## Screens / Views

### 1. Roster (default screen)
Phone canvas: `#faf8f6` (colors.canvas), 18px horizontal padding, column flex.

- **Header row**: "SPC" — Protest Strike 27px `#a46a57`; right-aligned "Templates ›" link — Montserrat 600 12.5px `#8a5140` (→ `/(coach)/spc/templates`).
- **Count line**: 12px `#6f6862` — "10 clients · 4 run out this week" (searched set; run-out = 0 ≤ daysLeft ≤ 7).
- **Start live session button** (→ `/(coach)/spc/live`): full-width, `#33251f` bg, radius 14, padding 14×16. Left: 10px green dot `#8fb473` with a 2.2s pulsing box-shadow ring (`rgba(143,180,115,.6)` → transparent, 8px spread). Title: Montserrat 700 14.5px `#f7f3ee` "Start live session"; sub: 11.5px `#a89a92` "Run the floor from one screen"; right chevron "›" 18px `#a89a92`. Variant (tweak): clay `#a46a57` bg with `#f0d9d0` secondary text.
- **Search + Filter row** (gap 8, margin-top 12): search input flex-1, 40px tall, `#fff` bg, 1px `#e2ddd6` border, radius 10, 13px text `#2a211c`, placeholder `#9a9187` "Search clients". Filter button: same chrome, funnel icon (13px, stroke `#57534e` 1.4), "Filter" 600 12.5px `#44403c`, plus a count badge when filters are active (17px round, `#a46a57` bg, white 700 10.5px).
- **Active filter tokens** (only when set): dark pills `#33251f`, radius 99, 5×11 padding — label 11.5px 600 `#f7f3ee` + "×" `#a89a92`; tapping clears that filter.
- **Sort row** (above the list card, padding 2px 4px 8px): "SORT" eyebrow 700 10px letter-spacing 1.1 `#a8a29e`; "Name" next to it; "Status" pushed right (`margin-left:auto`) so it sits over the status column. Active sort: 700 `#2a211c` with "↓"/"↑" suffix; inactive: 600 `#a8a29e`. Tap inactive → sort by it (asc); tap active → flip direction.
- **List card**: `#fff`, 1px `#ece7e1` border, radius 14, rows divided by 1px `#f4f1ec`.

**Row anatomy** (padding 13×14, gap 11, whole row tappable → `/(coach)/spc/{userId}` client preview):
- Avatar 36px circle, bg = status tone bg, initials 700 12px in status tone text color.
- Middle (flex-1, truncate): name 700 14px `#2a211c`; sub 11.5px `#6f6862` — "Terra · 2×/wk · Block 3, wk 3 of 4" (paused: "Dustin · paused"; no block: "… · no block yet").
- Right (fixed, right-aligned, nowrap): status dot 7px + short label 600 11px in tone text color; below it days-left 10.5px — "3d left" `#a8a29e`, or "ended 2d ago" in `#b23a22`. Tweak variant: tinted uppercase badge (tone bg/text, 700 9.5px, ls 0.5, radius 99, 4×9 padding) instead of dot+label.

**Status short labels** (full labels stay in the filter sheet): new_program_asap → "Program ASAP", needs_printed → "Needs printed", coming_up_next_week → "Up next week", printed_ready → "Ready", paused → "Paused".

**Sorting**: Name = alphabetical. Status = `STATUS_ORDER` urgency order, tiebreak by daysLeft asc, then name. Direction flips on re-tap.

### 2. Filter sheet (bottom sheet over roster)
Backdrop `rgba(42,33,28,0.4)`, tap closes. Sheet: `#fff`, top radius 18, padding 10 20 26, max-height 70%, grabber 36×4 `#e0dbd4`.
- "STATUS" eyebrow + "Clear all" link (600 12px `#8a5140`).
- Status options: "All statuses" + the 5 full labels in `STATUS_ORDER`. Each row (11px vertical padding, 1px `#f4f1ec` divider): 8px tone-colored dot, label 13.5px (700 when selected, else 500) `#2a211c`, count 12px `#a8a29e`, "✓" 700 `#8a5140` when selected. Counts are computed against the searched set.
- "COACH" section: All coaches + one row per coach, same anatomy minus the dot.
- Footer button: `#33251f`, radius 10, 12px vertical padding — "Show N clients" 700 13px `#f7f3ee` (live count), closes the sheet. Selections apply immediately.

### 3. Session preview (full-screen over roster, per client)
Replaces squinting at the printed sheet. Header (padding 16×18, bottom border `#ece7e1`):
- "‹ SPC" back link 600 12.5px `#8a5140`; right: status badge (tone bg/text, uppercase 700 9.5px, nowrap).
- Client name — Protest Strike 24px `#2a211c`.
- Meta line 12px `#6f6862`: "Block 5 · Week 3 of 4 · ends Aug 30 · Coach Dustin".
- **Goal flag**: full-width banner, `#fdf6f2` bg, 1px `#f0ddd2` border, radius 9, padding 7×11 — flag icon (12px stroke `#8a5140`), "GOAL" 700 9.5px ls 0.8 `#b08968`, goal text 600 12px `#44403c` (wraps). Source: the shared `ClientGoalCard` goal.
- **Session segmented control**: track `#efe9e2` radius 10 padding 3; one segment per session_number; active segment `#fff`, radius 8, shadow `0 1px 3px rgba(42,33,28,0.12)`, 700 12.5px `#2a211c`; inactive `#78716c`.

Scrollable body (padding 16 18 26):
- **Warm up card**: white card (1px `#ece7e1`, radius 12, padding 14×15), "WARM UP" eyebrow; rows: number 700 11px `#a8a29e`, name 600 13px `#2a211c` (truncates), rx right-aligned 12px `#6f6862` nowrap ("2 × 5/side").
- **"MAIN SESSION · WEEK 3 OF 4"** eyebrow, then one card per lift:
  - Letter badge 30×30, 1.5px `#e0dbd4` border, radius 8 — superset letter (A, B, C1/C2…) 700 12px `#8a5140`. Same labeling as the print sheet (`liftLabelsFor`).
  - Name 700 13.5px `#2a211c`; prescription 11.5px `#6f6862` — "4 × 5 · rest 2:30".
  - Right: selected week's load — Protest Strike 19px `#4d6142`; caption 10px `#a8a29e` nowrap — "wk 1 · 5 reps" (or "wk 3 · not logged").
  - **Week chips row** (gap 6, margin-top 11; equal flex): one chip per week of the block. Chip: label 9px 600 `#a8a29e` ("W1", current week = "NOW"), value 12.5px — logged shows "260 × 5" (load × reps). States: *selected* — bg `#e3ead9`, border `#4d6142`, text 700 `#4d6142`; *logged, unselected* — white bg, 1px `#ece7e1`, 600 `#57534e`; *not logged* — transparent, 1px dashed `#d6d1ca`, "—" `#a8a29e`.
  - **Chips are a week picker, global to the session**: tapping a logged chip selects that week across all lift cards — every big number, reps caption and note swap to that week. Default selection = most recent logged week. Unlogged chips are inert.
  - **Client note** (when that week's log has one): top border `#f4f1ec`, italic 11.5px `#57534e` — ""Depth felt way better…"" + "— client, wk 2" in `#a8a29e`.
- **Coach notes card**: `#fdf6f2` bg, 1px `#f0ddd2`, radius 12 — "COACH NOTES" eyebrow `#b08968`, body 12.5px `#44403c` lh 1.5. Source: `spc_clients.notes_goals_feedback`.
- **Footer actions** (gap 9): "Print sheet" ghost (white, 1px `#d9d4cd`, radius 10, 600 13px `#44403c` — opens `/spc/print/{blockId}?session={n}` in a new tab, existing behavior) and "Open client page" primary (`#a46a57`, 700 13px white — → `/(coach)/spc/{userId}`).

## Interactions & Behavior
- Row tap → session preview (prototype overlays; in-app this can be a route, e.g. `/(coach)/spc/preview/{userId}`, or keep the overlay pattern).
- Preview opens on Session 1 with the most recent **logged** week selected.
- Week chip tap → set selected week (session-wide); session tab tap → switch session (week selection persists).
- Filter sheet selections apply immediately; "Show N clients" just dismisses. "Clear all" resets both filters.
- Search filters by name (case-insensitive substring); counts in the count line and sheet respect search.
- Sort toggles as described; default Name ↓.
- Pulse animation on the live dot: `box-shadow 0 0 0 0 rgba(143,180,115,.6)` → `0 0 0 8px` transparent, 2.2s infinite.
- All text that can collide is `white-space: nowrap` (status labels, warm-up rx, week captions, badges); names/sublines truncate with ellipsis.

## State Management
- `search: string`, `statusFilter: status|null`, `coachFilter: coachId|null`, `sheetOpen: bool`, `sort: "name"|"status"`, `dir: 1|-1`, `preview: userId|null`, `sessionIdx: number`, `selectedWeek: number|null` (null = latest logged).
- Roster data: `getSpcRoster()` / `getSpcRosterDetail()` (`lib/programming/spcDashboard.js`, `lib/programming/spcRoster.js`) already provide name, coach, sessionsPerWeek, status, current block, week number, daysLeft.
- Preview data: same sources as the print view — `listSpcWorkoutsForBlock`, `listSpcWarmups`, `listSpcWorkoutExercises`, plus logged loads/reps/notes per week from session logs (`getSpcBlockDetail` / `exerciseStats` patterns). Reps shown on chips are the logged top-set reps; notes are the per-exercise log notes already surfaced on the client page's Notes rail.

## Design Tokens (lib/theme.js + spcStatus.js)
- Brand: primary `#a46a57`, primaryOnWhite `#8a5140`, canvas `#faf8f6`, muted `#6f6862`, hint `#9a9187`; espresso surfaces `#33251f`; ink `#2a211c`.
- Card border `#ece7e1`; row divider `#f4f1ec`; input border `#e2ddd6`.
- Status tones (bg/text): urgent `#fdece5`/`#b23a22`; needsAction `#fdf3e3`/`#8a6320`; onTrack `#e3ead9`/`#4d6142`; paused `#f1efec`/`#78716c`.
- Logged-green `#4d6142`; goal/notes tint `#fdf6f2` with `#f0ddd2` border and `#b08968` eyebrow.
- Type: Montserrat 400/500/600/700 + Protest Strike (display). Radii: 8/9/10/12/14/99. Eyebrows: 700, 10px, letter-spacing 1.1, `#a8a29e`.

## Assets
No image assets. Two inline SVG icons (funnel, flag) — replace with Ionicons equivalents (`filter-outline`, `flag-outline`) already used in the codebase.

## Files
- `SPC Mobile Roster.dc.html` — the interactive prototype (roster, filter sheet, session preview). Open in a browser; `support.js` must sit beside it.
- `screenshots/01…06` — roster sorted by name, sorted by status, filter sheet, session preview (default week), week 1 selected, session 2.

## Tweakable variants in the prototype
- `rowStatusStyle`: "Dot + label" (default) vs "Tinted badge" for the row's right column.
- `liveButton`: "Espresso" (default) vs "Clay" for the live-session button.
