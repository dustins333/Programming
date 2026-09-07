# Handoff: Coach Dashboard — mobile & desktop

## Overview

A redesign of the coach home screen (`app/(coach)/index.js` → `CoachHomeMobile`, and `CoachHomeDesktop`) for the Kova Strength programming app. The two views had drifted apart: information visible on one was missing on the other, and the desktop opened on content nobody used.

The redesign does three things:

1. **Makes the two views say the same thing.** The `In the gym` band now carries the identical four figures on phone and desktop. Every module that appears on one appears on the other, with the same numbers and the same permission gating.
2. **Turns the four tap-through module cards into always-expanded sections.** Previously SPC / Nutrition / Group / Exercise Review were summary cards you tapped to open a detail sheet. Now each is an inline section — a titled header plus its own clickable sub-tiles — modelled on the existing `In the gym` band, which the client explicitly wanted left alone.
3. **Removes desktop content that was answering the wrong question.** The Resume hero ("pick up where you left off") and the four launch cards (Program / Ship / Pay / Run the gym) are gone.

Both views are permission-gated per coach: a coach who can't see SPC gets no SPC section and no SPC quick-pick tiles, and the surrounding layout closes the gap rather than showing a disabled control.

---

## About the design files

The files in `design_files/` are **design references written in HTML**. They are prototypes that show intended layout, colour, type and behaviour — they are **not production code to copy**.

The target codebase is **React Native + Expo Router with NativeWind**, rendering to iOS, Android and web from one tree. The task is to **recreate these designs in that environment**, using its established patterns:

- `lib/theme.js` for `colors`, `fonts`, `radii` — never hardcode a hex that already has a token.
- `components/CoachShell.js` for the app shell (mobile app bar + drawer, desktop sidebar). The designs draw the shell for context; **do not rebuild it**, mount inside it.
- `Ionicons` from `@expo/vector-icons` for all glyphs.
- The existing data hooks (see *Data sources* below) — every number in these designs already has a query behind it. None of it is new backend work.

The HTML prototypes use plain `<div>`/inline styles and `ion-icon` web components purely because that is the prototyping medium. Translate to `View` / `Text` / `Pressable` / `Ionicons`.

## Fidelity

**High-fidelity.** Colours, type, spacing, radii and copy are final and drawn from `lib/theme.js` and the existing components. Recreate pixel-for-pixel using the codebase's tokens and primitives. Two caveats:

- The **phone shells and status bars** in the prototype (rounded 390px frame, "9:41", battery glyphs) are presentation chrome for the mock. Don't build them.
- The **desktop sidebar** in the prototype is a redraw of `CoachShell.js` lines 100–330 for context. Use the real one.

---

## Screens / views

### 1. Mobile coach home — option `4a` (the build)

**File:** `design_files/Kova Coach Mobile Dashboard.dc.html`, section `TURN 4`, wrapper `id="4a"`
**Screenshot:** `screenshots/mobile-dashboard-4a.png`
**Replaces:** `components/coach/CoachHomeMobile.js`
**Purpose:** The coach's first screen. Answers "what needs me today", lets them jump to the four places they go constantly, and gives every module's real numbers without a tap.

Design width 390px (iPhone 14/15 logical width). Content padding `13px` horizontal. Vertical rhythm between blocks: `11px`.

Order, top to bottom:

| # | Block | Notes |
|---|---|---|
| 1 | App bar (existing `CoachShell`) | Hamburger + badge dot, 26px round logo, "Kova Strength" wordmark, bell at right |
| 2 | **Quick pick tile row** (new) | 5 gated tiles, inside the sticky header block |
| 3 | Greeting | Date eyebrow + "Morning, Terra" |
| 4 | Payroll finalize prompt | Existing `components/payroll/FinalizePrompt.js`, conditional |
| 5 | **Find a client** | Moved to the top — was buried lower |
| 6 | **In the gym** | Unchanged from current build. Do not touch. |
| 7 | SPC section | Gated |
| 8 | Nutrition section | Gated |
| 9 | Group section | Always |
| 10 | Library review row | Gated + count > 0 |
| 11 | Documents row | Count > 0 |

Payroll is **not** a card at the bottom any more — it is a quick-pick tile.

---

#### 1.1 Quick pick tile row

**Screenshot:** `screenshots/mobile-quick-pick-bar.png`

Lives **inside the app bar's white container**, below the hamburger row, so it is part of the sticky header and the dashboard scrolls under it.

- Container: `flexDirection: row`, `gap: 6`, `paddingHorizontal: 14`, `paddingBottom: 12`, background `white`, `borderBottomWidth: 1`, `borderBottomColor: "#e7e5e4"` (the app bar's own border — one border, not two).
- Each tile: `flex: 1`, `minWidth: 0`, column, `alignItems: center`, `gap: 5`, `paddingVertical: 10`, `paddingHorizontal: 3`, `borderRadius: 12`.
- Measured: 66–68px wide × 59px tall each at 390px. Comfortably past the 44px minimum target.
- Icon 19px, label `fonts.body` 600 / 10px, `numberOfLines={1}`.
- Because tiles are `flex: 1`, a gated-out tile simply disappears and the rest stretch. A nutrition-only coach sees three tiles at ~1/3 width each.

| Tile | Icon | Style | State dot | Destination | Gate |
|---|---|---|---|---|---|
| Athlete | `fitness` | bg `#fdf6f2`, border `#ecd9cf`, ink `colors.primaryDark` | — | Member view / own training | Always |
| Live | `radio` | bg `colors.ink` `#33251f`, ink `#f7f3ee` | `#8fbf7a` when a board is running | SPC live board | `is_admin \|\| can_view_spc` |
| SPC | `clipboard` | bg `white`, border `#e1dad1`, ink `#44403c` | `#b23a22` when anyone is Due now | SPC roster | `is_admin \|\| can_view_spc` |
| Nutrition | `restaurant` | bg `white`, border `#e1dad1`, ink `#44403c` | — | Nutrition list | `is_admin \|\| can_view_nutrition` |
| Payroll | `cash` | bg `white`, border `#e1dad1`, ink `#44403c` | `#b23a22` until hours submitted | Payroll | Always |

- "Athlete" is the label for member view. It is tinted rather than white because it is the coach's own thing, not a client's.
- **Live and SPC are deliberately two tiles.** Live opens the running board; SPC opens the roster. Labelling them "SPC live" and "SPC" side by side read as one duplicated button, hence the split naming.
- State dots: 7px circle, absolutely positioned `top: 6, right: 6`. **Dots, not counts** — this matches the hamburger's existing badge language in `CoachShell.js` (line 396–417), where a dot is used precisely because there's no room for a number and multiple badged rows would make one number ambiguous.

---

#### 1.2 Find a client

Row card, moved from mid-page to directly under the payroll prompt.

- `white` bg, `borderWidth: 1`, `#e1dad1`, `borderRadius: 14`, `padding: 13`.
- Shadow: `0 1px 2px rgba(68,64,60,.05), 0 8px 20px rgba(68,64,60,.05)`.
- `search-outline` 19px in `colors.primary`; label `fonts.body` 600 / 14.5px `colors.text`; `chevron-forward` 16px `#c9c4bd`.

#### 1.3 In the gym — **unchanged**

Ships exactly as it is today. Reproduced in the mock only so surrounding spacing is legible.

- Container `colors.ink` `#33251f`, `borderRadius: 18`, `padding: 14px 12px`, `overflow: hidden`.
- Decorative circle: 132px, `borderRadius: 999`, `rgba(190,172,149,.07)`, positioned `right: -62, top: -74`.
- Eyebrow "IN THE GYM": `fonts.body` 700 / 9.5px, `letterSpacing: 1.1`, `rgba(247,243,238,.5)`.
- 2×2 tile grid, `gap: 8`. Tile: `flex: 1`, centred, `padding: 11px 6px`, `borderRadius: 13`, `rgba(247,243,238,.055)`.
- Figure: `fonts.display` 26px / lh 30, `#f7f3ee`. Caption: `fonts.body` 10.5px, `rgba(247,243,238,.62)`, `letterSpacing: .4`.
- The four figures: **sessions today**, **sessions this week**, **girls in this week**, **girls not in this week**. The last uses accent `#e8a288` for its figure — it's the exception number.

#### 1.4 Module section pattern

Every module (SPC, Nutrition, Group, Library review) uses one header treatment. This is the change that made the page readable — previously each section led with a 10px brand-coloured eyebrow, and with five of them nothing was findable.

**Header**

- Row, `gap: 9`, `alignItems: center`.
- Icon chip: 26×26, `borderRadius: 8`, bg `#f4e7e0`, centred Ionicon 14px in `colors.primaryDark` `#8a5140`.
- Title: `fonts.display` 17px / lh 19, `colors.text` `#2a211c`. Sentence case ("Library review", not "LIBRARY REVIEW").
- Subline: `fonts.body` 10.5px, `colors.muted` `#6f6862`, `marginTop: 1`.
- Right link: `fonts.body` 600 / 11px, `colors.primaryDark`, e.g. "Open SPC ›".
- Divider under header: `paddingBottom: 10`, `marginBottom: 10`, `borderBottomWidth: 1`, `borderBottomColor: "#ece7e1"`. **Group omits the divider** because its own rows already have top borders — two rules would double up.

**Card shell** (all module sections)

- `white`, `borderWidth: 1`, `borderColor: "#e1dad1"`, `borderRadius: 16`, `padding: 12`.
- Shadow `0 1px 2px rgba(68,64,60,.05), 0 8px 20px rgba(68,64,60,.05)`.

**Sub-tile** (the clickable stat tiles inside a section)

- `flex: 1`, `minWidth: 0`, `borderRadius: 10`, `padding: 8`, row `gap: 6`.
- Neutral: bg `#faf8f6`, border `#ebe5de`.
- **Only the urgent tile in each section carries a tint.** Everything was tinted before and nothing stood out; now a fill means "this is the one". Tinted: bg `#fdece5`, border `#f6ddd3`.
- Figure: `fonts.display` 21px / lh 23. Label: `fonts.body` 600 / 10px, `colors.text`.
- Tone lives in the figure colour even on neutral tiles: danger `#b23a22`, warn `#8a5a2e`, good `#4d6142`, plain `#2a211c`.

#### 1.5 SPC section

Gate: `is_admin || can_view_spc`.

- Header: `clipboard` chip, "SPC", subline "74 clients · 4 behind", link "Open SPC ›".
- **Start / stage a session** — the primary action, directly under the header. Copy is "Start / stage a session" per the client's wording (not "Start a live session").
  - bg `#fdf6f2`, border `#f0ddd2`, `borderRadius: 12`, `padding: 11px 12px`, `marginBottom: 9`.
  - 28px round white chip, border `#f0ddd2`, `barbell-outline` 16px `colors.primary`.
  - Title `fonts.body` 700 / 13.5px; subline 10.5px `colors.muted` — "Nothing staged · SPC or LLYL, on the wall".
  - **Running state** (see desktop, and mobile option `1b`): container flips to `colors.ink`, chip to `rgba(247,243,238,.14)`, icon `radio`, title "Board running · 3 clients", subline names who's running it.
- Four sub-tiles in a row, `gap: 6`. These map 1:1 onto `deriveSpcState()` in `lib/programming/spcState.js` — use the code's existing state names:

| Tile | Figure colour | Tint | Meaning |
|---|---|---|---|
| Due now | `#b23a22` | **yes** | Block ended, nothing queued |
| Due soon | `#8a5a2e` | no | In their final week |
| Good to go | `#4d6142` | no | Running or queued |
| No coach | `#2a211c` | no | SPC clients with no assigned coach |

"No coach" is the client's "unassigned": **SPC clients with no assigned coach** — not clients unenrolled from programs.

#### 1.6 Nutrition section

Gate: `is_admin || can_view_nutrition`. Header: `restaurant` chip, "Nutrition", subline "58 active clients".

Three sub-tiles:

| Tile | Figure | Colour | Tint |
|---|---|---|---|
| Logged today | `41` + ` /58` suffix | `#2a211c`, suffix `fonts.body` 600 / 11px `colors.muted` | no |
| Not seen 7d | `9` | `#8a5a2e` | no |
| Check-ins | `12` | `#b23a22` | **yes** |

#### 1.7 Group section

No gate — there is no group permission flag in the codebase.

Per-program rows, **not** aggregate counts. Session counts were dropped here because `In the gym` already shows gym-wide sessions today / this week; repeating them scoped to a program invited the wrong comparison.

- Header has no bottom divider; each row carries `borderTopWidth: 1`, `borderTopColor: "#f4f1ec"`.
- Row: `padding: 9px 0`, `gap: 9`, `alignItems: center`.
- Status dot 7px: danger `#b23a22`, warn `#8a5a2e`, good `#4d6142`.
- Program name `fonts.body` 600 / 12.5px; subline 10.5px `colors.muted` describing block position + publish state.
- Right: days-remaining `fonts.body` 700 / 10.5px in the status colour, then `chevron-forward` 14px.
- Rows shown: Flagship (danger, "Week 4 of 4 · this week unpublished", "5d left"), Better With Age (warn, "Week 2 of 4 · nothing queued after", "16d left"), Barbell Club (good, "Ongoing · all published", "ongoing").

#### 1.8 Library review & Documents rows

Compact single rows, not full sections — on mobile they are usually zero-state.

- Same card shell, `padding: 12`, row `gap: 10`.
- Count pill: `minWidth: 26`, `height: 22`, `paddingHorizontal: 7`, `borderRadius: 999`, bg `colors.primary` `#a46a57`, white `fonts.body` 700 / 11px.
- Title `fonts.body` 600 / 13px; subline 10.5px `colors.muted`.
- Library review gate: `can_view_exercise_library && pendingCount > 0` — appears only if they are a reviewer **and** there's a queue.
- Documents gate: `pendingDocumentCount > 0`.

---

### 2. Mobile — options `1a` / `1b` (density study, kept for reference)

Section `TURN 1`. Two densities of the same content: `1a` four sub-tiles across with labels only; `1b` two across with a caption line under each figure explaining what it means, plus the SPC action in its running state. `1a`'s density was chosen and carried into `4a`. `1b` is worth keeping as the reference for **sub-tile caption copy** and the **running-board treatment**.

### 3. Mobile — options `3a` / `3b` (quick-pick study)

Section `TURN 3`. `3a` labelled pill row that scrolls sideways; `3b` four even tiles. `3b` won and became `4a`'s five-tile row. `3a` is superseded — don't build it.

---

### 4. Desktop coach home — option `2a`

**File:** `design_files/Kova Coach Desktop Dashboard.dc.html`, wrapper `id="2a"`
**Screenshot:** `screenshots/desktop-dashboard.png`
**Replaces:** `components/coach/CoachHomeDesktop.js`
**Purpose:** Same job as mobile at desk width — plus Needs You, which has room to be worked here.

Drawn at 1440px. Sidebar 232px (the real `CoachShell` desktop sidebar). Content area: bg `#f1ece6`, `padding: 26px 36px 40px`, inner column `maxWidth: 1240`, `gap: 16`.

The canvas is deliberately darker than mobile's `#faf8f6`. With this much white card area, a near-white canvas made everything float in one plane.

**Removed from the current desktop — do not port:**

- The **Resume hero** ("pick up where you left off"). It guessed at intent and was usually wrong.
- The four **launch cards** — Program / Ship / Pay / Run the gym. They were a menu duplicating the sidebar.
- The **roster count chips** (Total / Flagship / SPC…). They were the old headline and say nothing the modules don't.

**Layout**

1. **Header row** — `alignItems: flex-end`, `justifyContent: space-between`.
   - Left: date eyebrow (`fonts.body` 700 / 10px, `letterSpacing: 1.4`, `#a8a29e`) + "Good morning, Terra" (`fonts.display` 30px / lh 34, `colors.primary`).
   - Right: **Find a client** search field, 300px, white, border `#e1dad1`, `borderRadius: 11`, `padding: 11px 13px`, `search-outline` 17px + placeholder `fonts.body` 13.5px `#9a9187`. New on desktop — the lookup was phone-only.
2. **Payroll finalize prompt** — full width, same treatment as mobile.
3. **In the gym** — full-width band, `borderRadius: 20`, `padding: 18px 20px`. **The same four figures as mobile**, one row of four `flex: 1` tiles, `gap: 12`, `padding: 16px 18px`, `borderRadius: 14`. Figures `fonts.display` 38px / lh 40; captions 12px. Header row: eyebrow "IN THE GYM" in `#beac95` + right-side note "Week of Sep 1 · every tile opens its list". *The old desktop showed sessions / nutrition / PRs / unread — a different question. That's the main mismatch this fixes.*
4. **Two columns**, `gap: 16`, `alignItems: flex-start`:
   - **Left, `flex: 1.55`, `minWidth: 420`** — SPC, Nutrition, Group. Same section pattern as mobile, wider: card `padding: 16px 18px`, `borderRadius: 16`, header chip 30×30 `borderRadius: 9`, title `fonts.display` 19px / lh 21, sub-tiles `padding: 13px 14px` `borderRadius: 13` with figures at `fonts.display` 30px / lh 32 and a third caption line (`fonts.body` 11px `colors.muted`) that mobile's dense tiles omit.
     - SPC's action row is shown in its **running** state: `colors.ink` bg, `radio` chip, "Board running · 3 clients", plus a ghost button "Stage another" (border `rgba(247,243,238,.28)`, `borderRadius: 9`, `padding: 9px 15px`).
     - Group rows gain a client count (`fonts.body` 11.5px `colors.muted`) and a fixed 56px right-aligned days column.
   - **Right, `flex: 1`, `minWidth: 320`** — Needs You, then Library review, Documents, Payroll.
5. **Needs You** — kept, behaviour unchanged (severity order, verb button, dismiss ×), moved to the right rail. Header is a **dark band** so it reads as the task list rather than a fourth module: bg `colors.ink`, `padding: 14px 18px`, `alert-circle` 19px `#e8a288`, "Needs you" `fonts.display` 19px `#f7f3ee`, count pill `rgba(232,162,136,.18)` bg with `#f0b79f` ink.
   - Rows: `padding: 13px 18px`, `borderTopWidth: 1`, `#f4f1ec`. 7px severity dot, title `fonts.body` 600 / 13px, subline 11.5px `#a8a29e`, verb button (border `#d9d4cd`, `borderRadius: 8`, `padding: 6px 13px`), dismiss ×.
6. **Payroll** — single row card (icon-free): label eyebrow + "Closes Sunday →" on the left, `4 /7 in` figure right, chevron. **Member view is not on desktop** — the sidebar already carries it and it's a phone job.

---

## Interactions & behaviour

- **Everything with a number is a target.** Every sub-tile opens the filtered list behind its figure — SPC "Due now" → SPC roster filtered to due-now, Nutrition "Check-ins" → the review queue, "Not seen 7d" → that cohort. Every `In the gym` tile opens its list. Every Group row opens that program's grid.
- **Quick pick** navigates immediately, no intermediate sheet. That's its whole purpose.
- **No accordions.** Sections are always expanded — this was an explicit decision. There is no collapse state to persist.
- **Pressed state:** existing pattern — `opacity: 0.7` on `Pressable`, or `activeOpacity` where already used. No hover states on mobile; on desktop web, cards may raise shadow on hover but nothing moves.
- **Gating is absence, not disablement.** A gated module or tile is not rendered. Flex siblings reflow.
- **Zero states:** a section whose count is 0 still renders (a coach needs to see "0 due now"), but Library review and Documents rows disappear entirely at 0 — they're notifications, not modules.
- **Loading:** existing `ActivityIndicator` pattern per section; sections resolve independently, so the page doesn't block on the slowest query.
- **Responsive:** mobile is a single 390-relative column, fluid. Desktop's two columns collapse to one below the existing `MOBILE_BREAKPOINT` handling in `CoachShell`; `In the gym`'s four tiles wrap 2×2 as they do on mobile.

## State management

No new client state. The dashboard is a read view over existing queries.

- Permission flags for gating — from the coach profile already loaded by `CoachShell` (`is_admin`, `can_view_spc`, `can_view_nutrition`, `can_view_exercise_library`).
- Dismissals for Needs You rows — existing mechanism, unchanged.
- Everything else is derived server-side or in the existing `lib/programming/*` selectors. **No new tables, no new columns.**

## Data sources (all existing)

| Block | Source |
|---|---|
| In the gym (4 figures) | `lib/programming/gymToday.js` |
| SPC states | `deriveSpcState()` — `lib/programming/spcState.js` |
| SPC live board | `app/(coach)/spc/live.js` state |
| Group per-program rows | `getGroupProgramDashboard()` / `listGroupPrograms()` / `listBlocksForProgram()` — `lib/programming/coachDashboard.js` |
| Needs You | existing launchpad attention items — `lib/programming/launchpad.js` |
| Payroll prompt + counts | `lib/payroll/finalizePrompt.js`, `components/payroll/FinalizePrompt.js` |
| Library review count | `usePendingExerciseReviews` |
| Documents count | `usePendingDocuments` |

The one genuinely new query: **Nutrition's three figures** (logged today / not seen 7d / check-ins waiting) may need a small aggregate if the current nutrition list screen computes them client-side. Check before assuming.

## Design tokens

All from `lib/theme.js` unless noted.

**Colour**

| Token / use | Value |
|---|---|
| `colors.primary` | `#a46a57` |
| `colors.primaryDark` | `#8a5140` |
| `colors.ink` | `#33251f` |
| `colors.text` | `#2a211c` |
| `colors.muted` | `#6f6862` |
| hint / tertiary | `#a8a29e` |
| body text on white | `#44403c` |
| desktop content canvas | `#f1ece6` |
| mobile page bg | `#faf8f6` |
| shell bg | `#f6f1ec` |
| card border | `#e1dad1` |
| shell / app bar border | `#e7e5e4` |
| in-card divider | `#ece7e1` |
| row divider | `#f4f1ec` |
| neutral sub-tile bg / border | `#faf8f6` / `#ebe5de` |
| danger fill / border / ink | `#fdece5` / `#f6ddd3` / `#b23a22` |
| prompt fill / border | `#fdf1ea` / `#e0b6a5` |
| primary tint fill / border | `#fdf6f2` / `#ecd9cf` (`#f0ddd2` on the SPC action) |
| icon chip fill | `#f4e7e0` |
| warn ink | `#8a5a2e` |
| good ink | `#4d6142` |
| running / live dot | `#8fbf7a` |
| accent on ink | `#e8a288` |
| ink-surface text | `#f7f3ee` |
| chevron | `#c9c4bd` |
| ink-surface tile fill | `rgba(247,243,238,.055)` |
| ink-surface caption | `rgba(247,243,238,.62)` |

**Type** — `fonts.display` = Protest Strike (figures, module titles, greetings). `fonts.body` = Montserrat (everything else).

| Role | Size / weight |
|---|---|
| Greeting | display 25 (mobile) / 30 (desktop) |
| Module title | display 17 (mobile) / 19 (desktop) |
| Big figure | display 26 (In the gym mobile) / 38 (desktop) / 21–30 (sub-tiles) |
| Card title | body 600 / 13–14.5 |
| Section subline | body 400 / 10.5–12 |
| Eyebrow | body 700 / 9.5–10, `letterSpacing` 1.1–1.4 |
| Sub-tile label | body 600 / 10–13 |
| Quick-pick label | body 600 / 10 |
| Caption | body 400 / 11 |

**Spacing** — 3 / 6 / 9 / 11 / 13 / 16 / 18 / 20 / 26 / 36. Mobile block gap 11; desktop 16.

**Radii** — 8 (icon chip) / 10 (dense sub-tile) / 11–12 (quick pick, prompt) / 13–14 (sub-tile, row card) / 16 (module card) / 18–20 (In the gym) / 999 (dots, pills, avatars).

**Shadow** — cards: `0 1px 2px rgba(68,64,60,.05), 0 8px 20px rgba(68,64,60,.05)` (desktop uses `0 10px 24px rgba(68,64,60,.055)` for the second layer). Two layers on purpose: the tight one seats the card, the broad one lifts it off the darker canvas.

## Assets

- `design_files/assets/kova-logo.jpg` — copied from `assets/kova-logo.jpg` in the repo. Already present; no new asset needed.
- All glyphs are **Ionicons**, already a dependency via `@expo/vector-icons`. Names used: `menu`, `notifications-outline`, `search-outline`, `alert-circle`, `chevron-forward`, `chevron-down`, `fitness`, `radio`, `clipboard`, `restaurant`, `cash`, `barbell`, `barbell-outline`, `checkmark-done`, `home`, `people-outline`, `chatbubbles-outline`, `school-outline`, `trophy-outline`, `library-outline`, `documents-outline`, `document-text-outline`, `body-outline`, `megaphone-outline`, `calendar-outline`, `videocam-outline`, `settings-outline`, `log-out-outline`, `cellular`, `wifi`, `battery-full` (last three are mock status-bar only).

## Files

```
design_handoff_coach_dashboard/
├── README.md                                   ← this file
├── screenshots/
│   ├── mobile-dashboard-4a.png                 full mobile screen (the build)
│   ├── mobile-quick-pick-bar.png               quick pick row, 3× detail
│   └── desktop-dashboard.png                   full desktop screen incl. sidebar
└── design_files/
    ├── Kova Coach Mobile Dashboard.dc.html     turns 4 / 3 / 1, newest first
    ├── Kova Coach Desktop Dashboard.dc.html    option 2a
    ├── support.js                              prototype runtime — not for production
    └── assets/kova-logo.jpg
```

Open either HTML file directly in a browser. Both carry a Tweaks-driven `role` prop (`admin` / `spc_coach` / `nutrition_coach`) plus `showExerciseReview` / `showDocsReview` booleans, so the permission gating can be exercised without a backend. The logic class at the bottom of each file shows exactly which flag drives which section.

**Build `4a` and `2a`.** Options `1a`, `1b`, `3a`, `3b` are the exploration behind them, kept for reference only.
