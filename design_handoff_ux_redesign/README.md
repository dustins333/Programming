# Handoff: Kova Strength — Design Pass (Nav Restructure + Visual Polish)

## Overview
This is a design/UX pass on the existing Kova Strength app (Expo Router + NativeWind, native + web from one codebase, repo `dustins333/Programming`). It covers: (1) a brand-alignment visual pass (warm-neutral palette, contrast fixes, touch targets, type scale), (2) three structural proposals (coach dashboard tiles, SPC status badges, builder warm-up/main split), and (3) a navigation rethink — introducing real tab bars for both the coach and member route groups, a unified **Today** tab for members, and a first-class **Nutrition** tab for coaches.

Read this alongside the repo's own `CLAUDE.md`, `build-plan.md`, and `gym-app-spec.md` §10 (brand) — this handoff assumes that context and doesn't repeat the data model or Supabase schema, which are unchanged. **This is a visual/UX layer change only — no data logic, Supabase queries, or RLS should change.**

## About the design files
The files in `designs/` are **HTML/CSS prototypes** (Design Component `.dc.html` files), built to communicate layout, spacing, color, and copy precisely — they are **not** React Native code and must not be copied in verbatim. `div`/CSS in these files map to RN primitives as follows when you implement:

| Prototype | React Native / NativeWind |
|---|---|
| `<div>` with flex styles | `<View className="...">` |
| Text elements | `<Text style={{ fontFamily: ... }}>` (this app sets font via `style`, not a Tailwind font utility — follow that existing pattern) |
| `<div onClick>` | `<Pressable>` |
| CSS `box-shadow` | RN `shadowColor/shadowOffset/shadowOpacity/shadowRadius` + `elevation` (Android) |
| CSS gradient (calorie bar prototype — now removed, see below) | n/a |
| Bottom tab bar mockup | **Expo Router `Tabs` navigator** (see Navigation section — this is a real structural change, not a visual one) |

Screenshot the prototypes if a pixel reference is useful, but implement using this codebase's existing NativeWind + `lib/theme.js` conventions.

## Fidelity
**High-fidelity for color, spacing, and type. Structural/directional for layout** — the split-screen builder, card shapes, and chip patterns are final; exact pixel positions on native (vs. the web mockup's fixed 402px frame) should adapt to RN's flex layout and real device widths.

## The single biggest structural change: real tab navigation
Today, `app/(coach)/_layout.js` and `app/(member)/_layout.js` are both just auth-gated `<Slot />` — there is no tab bar. Coach Home (`app/(coach)/index.js`) is a vertical list of `<Link>` text elements; Member Home (`app/(member)/index.js`) has two plain text links at the bottom ("Look ahead", "History", "Nutrition"). This handoff replaces both with an Expo Router **`Tabs`** layout:

**Member tabs:** `Today` (new — see below) · `Plan` (existing `plan.js`, unchanged) · `Nutrition` (existing `nutrition/index.js` becomes the tab root, unchanged internals) · `History` (existing `history/index.js`, unchanged)

**Coach tabs:** `Home` (new overview, replaces the current link-list `index.js`) · `Clients` (existing, unchanged) · `Programs` (new grouping tab — houses Group Blocks + SPC as a segmented control or nested stack, since both are "program building") · `Nutrition` (existing `nutrition/index.js` promoted from a link to a full tab root, gets the new roster-dashboard UI) · `More` (Exercise Library + Settings, in a simple list — these don't need top-level tab real estate)

Implementation notes:
- Use `expo-router`'s `(tabs)` file-based convention or a `Tabs` from `expo-router` in each `_layout.js` — whichever matches how this app already structures route groups (it currently uses plain groups + `Slot`, so introducing `Tabs` is new to the codebase; keep the existing auth-gate `Redirect` logic wrapping the `Tabs`, same as today's `Redirect`-before-`Slot` pattern).
- Tab bar icons: the prototypes use plain colored squares as icon placeholders — swap in a real icon set already available to Expo (`@expo/vector-icons`) rather than adding a new dependency.
- **Member Home's current content (session card with input fields + Log buttons, per-exercise logging) does not disappear** — it moves. The Today tab becomes read-only preview; the actual set-by-set logging UI (currently in `app/(member)/index.js` via `LogResultRow`) should live one tap away — e.g. behind Today's "Start session" button, either reusing `plan.js`'s session-detail pattern or a new `app/(member)/session.js` route. Decide the exact route during implementation; the design intent is just "Today never contains an input field."
- Same logic for nutrition: the daily log **form** (weight/macros/steps/sleep inputs, autosave, Finalize) stays exactly as built in `app/(member)/nutrition/index.js` — that becomes the **Nutrition tab's** root, not Today's.

## Design tokens

**Colors** — replace default Tailwind `neutral-*` with `stone-*` (Tailwind's warm-gray scale) everywhere; it reads as "earthy" instead of "clinical" and requires no new palette:
```
Primary:        #a46a57  (buttons, active tab icon/dot, filled backgrounds)
Primary-on-white text: #8a5140  (use this, NOT #a46a57, for any brand-colored TEXT on a white/light background — #a46a57 text on white is ~3.9:1, under WCAG AA's 4.5:1; #8a5140 clears it. Reserve #a46a57 for large display headings ≥24px, filled backgrounds, icons, borders.)
Accent:         #ad816d  (chips, tallies, decorative — not text-on-white)
Tertiary:       #beac95  (subtle fills/icons at low opacity, e.g. rgba equivalent or opacity: 0.35-0.5)
Ink (primary text):   stone-700 #44403c
Ink muted (secondary): stone-500 #78716c (body/help text — passes AA on white)
Ink faint (labels/meta): stone-400 #a8a29e (use ONLY for non-essential meta text at 12px+; do not use for anything that must pass body-text AA — prefer stone-500 if in doubt)
Border:         stone-200 #e7e5e4 / stone-100-ish #f0ebe6 (softer, for nested/inset rows)
Surface tint:   #faf7f4 (warm off-white for secondary/inset panels — e.g. warm-up list, dashboard tiles — vs pure white cards for primary content)
```
Status colors (reused across SPC roster and coach Nutrition dashboard — same 5-status pattern applied to both domains):
```
Urgent/due:     bg #fdece5  text #b23a22   (🚨 New Program ASAP, Check-in due)
Needs action:   bg #f4ede3  text #8a5a2e   (🖨️ Needs Printed, Needs target)
On track/ready: bg #eef1e7  text #4d6142   (✅ Printed & Ready, On track)
Paused/neutral: bg #f1efed  text #78716c   (⏸️ Paused)
```

**Typography** — Montserrat + Protest Strike (already wired via `@expo-google-fonts/*`, see `app/_layout.js`):
```
Screen title:        Protest Strike, 26px, color primary (#a46a57) — use consistently for every screen's H1 (today several screens use Montserrat SemiBold instead — standardize on Protest Strike)
Section label:        Montserrat SemiBold, 12-13px, uppercase, letter-spacing ~0.04em, color stone-400/500
Card title / body strong: Montserrat SemiBold, 14-15px, ink
Body:                  Montserrat Regular, 13-14px, ink-muted
Meta/caption:          Montserrat Regular/Medium, 11-12px, ink-faint
Eyebrow (card label, e.g. "TODAY'S SESSION"): Montserrat SemiBold, 11px, uppercase, #8a5140
```

**Spacing/radius:**
```
Card radius: 14-16px · Chip/pill radius: 999px (full) · Small control radius: 8-10px
Card padding: 16px · Screen padding: 20-24px
Gap rhythm: 8 / 10 / 12 / 14 / 20 / 24px (pick from this set, don't invent new values)
Card shadow (use sparingly, primary cards only): shadowOffset {0,4} shadowOpacity 0.05-0.06 shadowRadius 12, plus a hairline shadowOffset {0,1} opacity 0.04 radius 2 for crispness
```

**Touch targets:** every tappable element ≥44×44pt. Filter/status pills: `py-2.5` minimum (not the current `py-1.5`). Icon-only buttons (✕ remove, ▶ video) need `hitSlop` of at least 8-10pt on all sides plus an `accessibilityLabel` — see the accessibility notes below.

## Screens

### 1. Coach Home (`app/(coach)/index.js` — rebuild)
**Purpose:** attention-first overview, not a destination list.
**Layout:** greeting header (Protest Strike, name + role + date) → "Needs your attention" section: stacked alert cards (urgent styling for SPC-due-soon, neutral styling for check-ins-to-review), each with a leading icon swatch, title, subtitle, trailing `›` chevron → "This week" row: 3 equal-width stat tiles (Flagship/SPC/Nutrition client counts — pull from existing roster queries, this is workload reporting per gym-app-spec §2, nice-to-have not new logic) → "More" section: simple bordered list (Exercise Library, Settings).
**Data:** SPC due-soon count from `lib/programming/spcDashboard.js`'s existing `getSpcRoster`/`checkAndAutoDraft`; check-ins-to-review count from `lib/nutrition/checkin.js`. No new backend logic — this is existing data surfaced differently.
**Copy:** "Welcome, {name}" / "{role} · {weekday}, {month} {day}" / "Needs your attention" / "This week".

### 2. Coach Nutrition dashboard (`app/(coach)/nutrition/index.js` — rebuild, becomes tab root)
**Purpose:** the roster-style dashboard this module needs — was previously just a link.
**Layout:** title "Nutrition" + subtitle (active client count) → horizontal scroll filter chip row (All / Check-in due / Needs target / On track / Paused, status-colored per the tokens above) → flat list of client cards: name + status badge top row, one-line meta underneath (last logged date, current targets, or adherence %).
**Data:** existing `lib/nutrition/dashboard.js` + `lib/nutrition/clients.js` — this dashboard is a richer read of data that likely already has query support; confirm against `lib/nutrition/dashboard.js`'s actual return shape before building the card fields.

### 3. Member Today (`app/(member)/index.js` — rebuild as Today tab root)
**Purpose:** one daily landing spot combining workout (3x/week, day-routed) and nutrition (every day) — status only, zero inline logging.
**Layout, top to bottom:**
- Greeting header (Protest Strike "Hi, {name}" + weekday/date)
- **Session preview card** (only if a session exists today — see states below): eyebrow "TODAY'S SESSION", program+week+session title, optional "+ SPC today" pill (Hybrid clients) top-right, warm-up as one line of muted text, main-session exercises as a read-only inset list (name left, "sets×reps · tempo" right, alternating row tint), single full-width filled "Start session" button at the bottom — **no per-exercise input fields or Log buttons here**.
- **Hybrid-only: SPC session teaser card** — same eyebrow pattern, "{n} exercises" meta, "View SPC session ↓" link-style row, no inputs.
- **Nutrition status card** — two states:
  - *Logged:* eyebrow + green "✓ Logged" badge top-right; two stat tiles below (current weight + week-over-week change with ▲/▼, and "% of calorie target, avg 7d")
  - *Not logged:* dashed warm-tinted card, "Not logged" badge, one line "You haven't logged anything today yet.", single "Log today" button — navigates to the Nutrition tab, does not log inline.
- **Rest-day state** (no session today, per `sessionNumberForDate` returning null): dashed card, muted icon swatch, "Rest day" + "No session scheduled — back Monday"; nutrition card still renders below in whichever of the two states above applies — nutrition status is independent of training day.
- **Unassigned/error/not-published states:** keep the existing plain-text messaging already in `app/(member)/index.js`'s `state.status` branches (unassigned/no_block/not_published/error) — just restyle to match (ink-muted body text, no card needed for these).

### 4. Member Nutrition tab (`app/(member)/nutrition/index.js` — restyle only, logic unchanged)
**Purpose:** the actual daily-log form, weekly check-in, history — unchanged functionality, becomes tab root instead of link destination.
**Layout:** title "Nutrition" → segmented control (Today / Check-in / History) replacing the current plain `<Link>` row at the bottom — Today is the existing form (target summary card, weight/macro/steps/sleep fields, autosave status text, Finalize button); Check-in and History are the existing `checkin.js`/`history.js` screens, now reached via the segmented control instead of a text link.
**No calorie progress bar / meal-by-meal logging** — this app logs once-daily macro totals, not individual meals; don't build a running "cal logged today" meter, it misrepresents how the data model works.

### 5. Structural proposals (see `Kova Structural Proposals.dc.html`)
- **SPC roster rows** (`app/(coach)/spc/index.js`): replace the current plain-text status string with the status-badge pattern above, left-accent-border + tinted background on due-soon/urgent rows only.
- **Builder warm-up/main split** (`[workoutId].web.js` × 2 native+web pairs): warm-up section gets the muted `#faf7f4` inset-list treatment (no per-row border, just a divider line between rows); main-session keeps the current bordered-row treatment so it reads as the primary, editable content.

## Interactions & states
- Tab bar: standard Expo Router tab press/active-state; active tab icon uses filled `#a46a57` swatch + `#8a5140` label (not `#a46a57` — contrast, see tokens).
- Session card states: has-session / rest-day / unassigned / not-published / error — all listed above, reuse `app/(member)/index.js`'s existing `state.status` state machine, just re-skin each branch.
- Nutrition card states: logged-today / not-logged-today — derive from whether `getLogForDate` (already in `lib/nutrition/dailyLog.js`) returned a `finalized_at` or any populated fields for today; this is a read of existing data, no new query needed.
- Icon-only buttons (✕ remove exercise/warmup, ▶ video): add `hitSlop={{top:10,bottom:10,left:10,right:10}}` and `accessibilityLabel` — no visual change, pure a11y/touch-target fix.

## Accessibility (carry through from the critique pass)
- Every interactive element ≥44×44pt touch target.
- Use `#8a5140` (not `#a46a57`) for brand-colored text on light backgrounds under 18px.
- `stone-500`/`stone-600` minimum for any body/help text (not `stone-400`, which fails AA contrast at normal text sizes).
- Icon-only buttons need `accessibilityLabel`.
- Form fields (nutrition log) should associate visible labels via `accessibilityLabel` matching the visible `<Text>` label, since RN Web doesn't auto-associate a sibling `<Text>` with a `<TextInput>`.
- Verify focus-visible styling isn't suppressed on web `Pressable`s — add an explicit focus ring if the current build has none (check in a real browser, not just click-through).

## Going forward — style rules for any new page in this app
1. **Never use Tailwind's default `neutral-*`.** Use `stone-*` for all borders/neutral text/backgrounds.
2. **Screen H1 = Protest Strike, 26px, `#a46a57`.** Section labels = Montserrat SemiBold, 12-13px, uppercase, muted stone.
3. **Brand-colored text on white/light backgrounds = `#8a5140`, never `#a46a57`.** `#a46a57` is for fills, icons, borders, and large (≥24px) headings only.
4. **Status is always a colored pill/badge with a text label**, never color alone — reuse the 5-color status system (urgent/needs-action/on-track/paused + a neutral "default") for any future roster/status list, don't invent new status colors per screen.
5. **Cards:** 14-16px radius, 16px padding, white background for primary content, `#faf7f4` for secondary/inset content (warm-up lists, dashboard tiles) — use a soft shadow only on primary cards, not on inset/nested rows.
6. **Every tappable element ≥44×44pt**, icon-only buttons get `hitSlop` + `accessibilityLabel`.
7. **A "Today"-type landing screen shows status, not input.** If you're building a new "at a glance" screen, keep logging/editing one tap away from the overview.
8. **Spacing/radius only from the defined scale** (see Design Tokens above) — don't introduce new arbitrary px values.

## Assets
No new image/icon assets — reuses existing `@expo-google-fonts/montserrat` + `@expo-google-fonts/protest-strike`. Tab bar icons should come from `@expo/vector-icons` (already an Expo-ecosystem default, not a new dependency) rather than the placeholder colored squares in the prototypes.

## Files
- `designs/Kova Structural Proposals.dc.html` — web split-screen builder + SPC roster + coach dashboard proposals
- `designs/Kova Mobile Screens v2.dc.html` — final mobile IA: Coach Home, Coach Nutrition dashboard, Member Today (ready/rest-day states), Member Nutrition tab, all inside an iOS device frame
