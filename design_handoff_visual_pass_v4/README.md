# Handoff: Member Mobile Visual Pass (My Week / My Fitness / My History)

## Overview
Visual-only refinement of the member-facing tabs. **No IA, navigation, data, or functional changes** — this is styling/layout applied on top of the app's existing screens and components (`SessionLogger.js`, program/session tile components, nutrition summary tile, history list).

## About the Design Files
The bundled file (`Kova Mobile App v4.dc.html`) is an **HTML design reference**, not code to copy in. Recreate this styling by restyling the existing React Native + NativeWind components — reuse existing component structure, state, and logic; only change className/style values (colors, spacing, radius, borders, typography) and, where called out below, minor DOM/JSX structure (e.g. the pinned Finalize footer).

## Fidelity
**High-fidelity.** Colors, sizes, radii and spacing below are final.

## Out of scope
**My Nutrition tab is NOT part of this pass** — it will be pulled in from a separate, already-functioning nutrition app later. Don't restyle it from this handoff.

## Design Tokens

**Colors**
- Rust/brand primary: `#a46a57` — buttons, active nav, links, active chip
- Rust dark (text-on-tint): `#8a5140`
- Olive/complete: `#4d6142` — used only as a border color/checkmark, never a fill
- Complete-parent-card border tint: `#dbe8cf`
- Peach "last time" pill bg: `#fdece5`, text `#b23a22`
- Canvas bg: `#faf8f6` · Card bg: `#ffffff`
- Card border (default): `#ece7e1` · Input border: `#d9d4cd`
- Text primary `#44403c` / secondary `#57534e`,`#78716c` / muted `#a8a29e` / description italic `#a8907f`
- Chevron/disabled: `#c9c4bd` / `#d6d3d1`

**Typography:** Protest Strike for page titles/greeting (22–27px, `#a46a57`); Montserrat 400–700 everywhere else. Eyebrow labels: Montserrat 700, 10–11px, uppercase, 0.05–0.06em letter-spacing.

**Shape:** cards 14–20px radius, pills 999px. Card shadow `0 1px 2px rgba(68,64,60,0.03), 0 6px 16px rgba(68,64,60,0.045)`. CTA shadow `0 6px 16px rgba(164,106,87,0.25)`.

## Screens

### My Week
Vertical stack of program cards (Flagship, Look Like You Lift, SPC, Nutrition preview), 14px gap, each 20px-radius white card.

**Program card header:** 8px color dot + program name (16px/700) left; completed-count pill + chevron right. When every session for the week is done, the pill switches to an olive tint with a check glyph (`bg #e9f0e1, text #3f5136, ✓ 1/1`) and the card border tints `#dbe8cf` — a subtle "warm fuzzy," never a full-color tile fill.

**Session tiles — fixed 3-row skeleton, same on every tile regardless of content:**
1. Title ("Session 1"), **centered**, 12.5px/600
2. Description (muscle-group/session nickname if one exists, e.g. "Delts & Glutes"), **centered**, italic, 10.5px, `#a8907f` — blank (not omitted) when there's no name, so the skeleton never shifts
3. Day, **centered**, bottom-pinned, 9.5px/700, uppercase, letter-spaced, `#8a5140` — blank when no day applies (SPC)

Use `display:flex; flex-direction:column; min-height:78px` with the description row set to `flex:1` so the day always lands at the same y-position whether the tile has 2 or 3 siblings, 1 or 2 lines of content.

**Completion state — no checkmark badge.** A completed session tile gets `border: 2px solid #4d6142` (vs. `1px solid #ece7e1`/`#dbe8cf` default) — border weight/color is the only completion signal, no icon, no fill.

**Muscle-group label casing:** normalize to Title Case with `&` (e.g. "Back & Bis", "Delts & Glutes", "Hamstring & Chest", "Glutes", "Chest") — do not ship mixed casing/"and" vs "&" across programs.

**Nutrition preview card:** header "Nutrition" + chevron, then just a 7-day consistency dot strip (olive = logged, rust ring = today, neutral outline = future) — **no calorie numbers, no progress bar, no "not logged" text line.** Nothing calorie-related shows mid-day since nutrition isn't logged until evening.

### My Fitness
**Program chips:** horizontal pill row (Flagship / Look Like You Lift / SPC). Inactive: `border:1.5px solid #a46a57, color:#8a5140`. Active: filled `#a46a57`, white text, shadow. **Vertically + horizontally center the label inside every chip** (`display:flex; align-items:center; justify-content:center`) so the two-line "Look Like You Lift" label matches the one-line chips.

**Session picker** (rendered when the selected program has >1 session): cards side by side, 16px radius, **just a border state, no checkmark circle**: not-selected-but-done → `border: 2px solid #4d6142`; selected-not-done → `bg #fdf6f2, border: 1.5px solid #a46a57`; default → `1px solid #ece7e1`. Title text centered.

**Selected-session banner:** `bg #fdf6f2, border: 1px solid #f0ddd2`, 14px radius, flex row. Left: eyebrow "SPC · SESSION 2" (10px/700 uppercase `#8a5140`, **must** have `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` + `min-width:0` on its flex parent — it truncates, never wraps into the title below) + title e.g. "Glutes" (15px/700). Right: pill button "View full block ›" (`flex-shrink:0`).

**Exercise history UX (matches what's already built in your app — keep this, don't reinvent it):**
- Above the set rows: clock icon (filled `#a46a57`) + "Last time: 07-16-2026" (13px/700, `#8a5140`)
- Under each set's reps/weight input row: a centered peach pill, `bg #fdece5, color #b23a22`, 999px radius, e.g. "Last: 10 reps @ 65" (or "Last: – reps" when a field wasn't logged last time)
- Below the sets, above Notes: "Last time's note: …" (12px, `#78716c`)
- No separate "Last time" summary panel/text block — the per-set pills + header line replace it entirely.

**Exercise cards:** unchanged fields/logic (collapsed row → expand → per-set inputs → notes → autosave). Visual only: 16px radius, 1px `#ece7e1` border (1.5px `#a46a57` + warm shadow when expanded).

**Finalize button must be pinned**, not scrolling with content. Structure as three stacked regions:
1. Header + chips + exercise list → `flex:1; overflow:auto`
2. Finalize button → sibling, `flex-shrink:0`, `padding:14px 20px`, `background:#faf8f6`, `border-top:1px solid #ece7e1` — always visible above the tab bar
3. Bottom tab bar → unchanged

This requires moving the Finalize button JSX out of the ScrollView into a fixed footer view.

### My History
**⚠️ This is new functionality, not a restyle** — the app currently only has the date-grouped list ("By Day"). Add a **segmented toggle at the top**: "By Day" / "By Workout" (same segmented-control style as the Nutrition tab's Today/Check-in/History switcher — white pill on tinted track).
- **By Day** (existing screen — style only, no logic change): sessions/nutrition entries grouped under "Today", "Yesterday", date headers.
- **By Workout** (net-new): a search field ("Search exercises…") above a flat list of every distinct exercise the client has logged, each row showing the exercise name + "Last done <date> · <reps> reps @ <weight>" pulled from that exercise's most recent set, tap-through to its full history. This needs a new query grouping logged sets by exercise (across sessions/programs) rather than by date — flag for scoping/estimate, it's a new data view, not just new UI.

### Flagship Plan — "View full block"
**Already built in the app** (confirmed against your screenshots) — this handoff only restyles it, no new functionality:
- **List screen:** back breadcrumb "‹ My Fitness", plan title (Protest Strike, `#a46a57`) + date range subtitle. Weeks stack vertically, each with an eyebrow label ("Week 1", "Week 2 · Current" in `#8a5140` for the current week) and a row of session tiles (3 per row, equal width, 14px radius, `min-height: 56px`). Unpublished future weeks: no tiles, just italic muted "Not published yet".
- **Completed session tile:** same border-only signal as My Week — `border: 2px solid #4d6142` instead of the default `1px solid #ece7e1`, plus a small `✓ <date>` line (10px/600, `#4d6142`) under the name. No checkmark icon/badge, no green fill.
- **Session modal:** bottom sheet (`border-radius: 22px 22px 0 0`, slides up over a `rgba(68,64,60,0.35)` scrim). Header is a flex column (title, then a `✓ Completed <date>` row) with `gap: 6px` — not `margin-top` — so a wrapped two-line title never collides with the date line; close **×** button top-right, `flex-shrink: 0`. Exercise list below uses the same collapsed-row card style as My Fitness.

## Nav bar (all tabs)
My Week / My Fitness / My Nutrition / My History, line icons 21px stroke-width 2. Inactive `#b5afa6`. Active: `#8a5140` icon + 700-weight label.

## Assets
No new image assets — icons are inline SVG line icons; swap in equivalents from whatever icon library the app already uses (stroke weight/size/color states matter more than exact glyphs).

## Build order suggestion
1. Restyle My Week, My Fitness (both states), and the Flagship Plan/session modal — pure visual, no logic risk.
2. Build My History's "By Workout" mode — this is the one net-new feature in this pass; scope it separately since it needs a new exercise-grouped data query, not just UI.

## Files
- `Kova Mobile App v4.dc.html` — all mockup screens referenced above (My Week, My Fitness ×2 states, Flagship Plan + modal, My History ×2 states).
