# Handoff: Coach Web App — Visual Pass + Group Programs IA Merge (v1)

## Overview
Covers four coach-side web screens: **Dashboard (Coach Home)**, **Clients list**, **Client detail**, **Group Programs**. Dashboard and Clients/Client-detail are primarily a visual restyle with a few new functional pieces (status snapshot, filters, pagination). Group Programs is a **structural change**: it merges the existing "Block sessions" page into the Group Programs calendar and replaces any drag-and-drop copy concept with a click-to-select copy flow. Read the "Group Programs" section carefully — it's the one with real logic changes.

## About the design file
`Kova Web App.dc.html` is an **HTML design reference**, not code to copy in. Recreate this styling/structure by editing the existing React (web) coach components — reuse existing routing, data fetching, and component structure; only change className/style values and, where called out below, DOM structure or page composition.

## Fidelity
High-fidelity on color/spacing/type. Copy/microcopy is illustrative — wire to real data per the field notes below.

## Design Tokens (shared with the member mobile app — reuse, don't reinvent)
- Rust/brand primary `#a46a57` — primary buttons, active tab/nav, links, active toggle fill
- Rust dark (text-on-tint) `#8a5140`
- Olive/complete `#4d6142` — positive/complete state only, border or text, rarely a fill; light tint bg `#eef1e7`, light tint border `#dbe8cf`
- Peach/alert `#fdece5` bg, `#b23a22` text — "needs attention" pills, flags, at-risk states
- Tan/pending `#f4ede3` bg, `#8a5a2e` text — mid-priority / "needs printed" style states
- Neutral pill `#f1efed` bg, `#a8a29e` / `#78716c` text — zero-count / inactive states
- Canvas bg `#faf8f6` · Card bg `#ffffff` · Card border `#ece7e1` · Input border `#d9d4cd`
- Text: primary `#44403c`, secondary `#57534e`/`#78716c`, muted `#a8a29e`, disabled/chevron `#c9c4bd`/`#d6d3d1`
- Description/italic tone `#a8907f`

**Typography:** Protest Strike for page titles (22–27px, `#a46a57`); Montserrat 400–700 everywhere else. Eyebrow labels: Montserrat 700, 10–11px, uppercase, 0.05–0.06em letter-spacing.

**Shape:** cards 14–16px radius, pills 999px. Card shadow `0 1px 2px rgba(68,64,60,0.03), 0 6px 16px rgba(68,64,60,0.045)`. CTA shadow `0 6px 16px rgba(164,106,87,0.25)`.

## Screens

### Coach Home (Dashboard)
Visual-only restyle of the existing panels, plus it now surfaces the Nutrition/SPC/Group-Programs status data that already exists elsewhere (SPC dashboard, Nutrition dashboard) as compact summary cards — no new backend queries, just a second read of data already fetched for those pages.

- **Needs your attention**: peach-tinted rows (`bg #fdece5, border #f0d4c9`), bold rust-brown title + gray subtitle, chevron. Unchanged trigger logic — just the visual treatment.
- **Roster**: 3-column stat grid, `#faf7f4` tile bg.
  **⚠️ New functionality**: every Roster stat tile is clickable and must navigate to `/clients` with that tile's filter pre-applied (e.g. clicking "SPC" opens Clients filtered to `program=SPC`; clicking "Total clients" clears all filters). This depends on the Clients-list filter dropdown below existing and accepting a query param / initial-filter prop.
- **Nutrition / SPC / Group Programs status cards**: 3-column row below Roster. Each is a condensed version of that program's own dashboard status breakdown (status label + neutral/tan/peach/olive count pill depending on urgency). Clicking the card header chevron should route to that program's full page. These are read-only summaries — no new state.

### Clients (list)
- Search field, plus **new** "All programs ▾" and "Flags ▾" filter dropdowns and a "Sort: Name ▾" control — needed because the roster is 100+, not 2. Filters should be combinable (e.g. program=SPC AND flags=has-flag) and reflected in the URL so the Dashboard roster-tile links (above) work by deep-linking into a pre-set filter state.
- Each row: avatar, name, email, a "N flag" peach pill **only when flags > 0** (omit entirely otherwise, don't show "0 flags"), and program tag pills (olive-tinted, one per enrolled program; "Unassigned" neutral pill when enrolled in nothing).
- **Pagination footer** — real pagination (page N of M + prev/next), not infinite scroll, per the 100+ client scale.

### Client detail
- Header unchanged (back breadcrumb, avatar, name, email).
- **New: Snapshot panel** at the top of the page, one card, two columns:
  - Left: "Current block" — program name + "Week X of Y" + a slim olive progress bar (`fill #4d6142` on `track #f1efed`). Pull from whichever program is the client's primary/active block; if a client has multiple active group programs, show the one furthest along / most recently active, or stack multiple rows if that's cleaner in the real data model — flag this edge case to design if it comes up often.
  - Right: "Flags" — peach pill + one-line description per flag. Two flag types shown as examples: **missed session** (no log for an expected session this week) and **injury/note flag** (most recent note tagged as an injury/limitation, with the date). Show nothing here (collapse the card to just the block-progress side, or hide the panel) when a client has zero flags — don't render an empty "Flags" heading.
- **Group programs section — restructured**, each program is its own card:
  - Row 1: enrolled toggle (olive when on) + program name + "View current block ›" link, all in one line — this is unchanged behavior, just restyled.
  - Row 2 (**only rendered when enrolled/toggle is on**): a visually distinct sub-row (`bg #faf8f6`, inset padding) labeled "Frequency" with the existing 1x/2x/3x segmented control. This is the split the earlier version didn't have — enrollment state and frequency setting no longer look like one control, they're stacked with a label between them. No logic change, purely making the existing "sessions per week" selector visually subordinate to (and dependent on) the enrolled toggle.
- SPC / Nutrition cards: unchanged fields, restyled to the same card system (status pill top-right, toggle + label, link at bottom).

### Group Programs — ⚠️ structural change, not just a restyle
**Delete the separate "Block sessions" page/route.** The Group Programs calendar view becomes the single place to both see and edit a block — there is no reason for two screens showing the same weeks. Clicking a session tile (in any week, including empty ones) should open the exact same session editor that "Block sessions" used to link to (drag-and-drop builder or session detail — whichever is currently wired to that page's tiles); just point that same interaction at the Group Programs calendar tiles instead of building a second entry point.

- **Tab row**: program tabs (Flagship/BWA/LLYL) as pill buttons, active = filled rust, inactive = rust outline. "+ New group type" stays a dashed-outline pill at the end of the row. "[Program] settings" gear button sits at the far right of the *tab* row (not floated separately elsewhere on the page).
- **Calendar**: two-column layout — a narrow label column (`Current week`/`Next week`/`3 weeks out`… + date range, muted gray, no card chrome) next to the 3-session-wide tile grid for that week. Current week's tiles get the olive "complete-family" treatment (`border: 2px solid #4d6142, bg #f5f8f1`) so it visually anchors the page — future/empty weeks stay plain white/gray so the eye lands on "now" first.
- **Empty week tiles**: dashed-eligible, muted italic "Empty" — this is a target for the copy flow below (see it become "Click to paste here" mid-copy).
- **The 6-week-out horizon stays exactly as before** (all 6 rows visible, no pagination) — the last row keeps the existing "Nothing scheduled yet → Start new block" empty state for programming further out; there's still no separate page for that, it's just the 6th row.

**⚠️ New functionality — copy flow (replaces any drag-and-drop plan):**
1. Every populated session tile gets a small ⧉ icon button, top-right corner.
2. Clicking ⧉ enters "copying" mode: that tile gets a rust border/tint and a "· copying" label suffix; **every other tile on the page** (any week, any session, populated or empty) becomes a click target — populated tiles get a dashed rust outline, empty tiles show "Click to paste here" in place of "Empty".
3. Clicking any number of those target tiles toggles them selected (filled rust outline + a small rust checkmark badge, top-right). Multi-select — a coach programming the same session into 4 future weeks should be able to select all 4 before confirming.
4. A **sticky bottom confirm bar** appears the moment copy-mode starts: `Copying [Session name · Week] — N tile(s) selected` on the left, `Cancel` / `Copy to N tile(s)` buttons on the right. This is a plain copy (exercise list, sets/reps as authored) into each selected tile's existing content — it should prompt to confirm overwrite if a selected target tile is non-empty, since this silently discards whatever was there.
5. Copying **does not** create any kind of live link between source and targets — after copy, each tile is independently editable; changing one later never affects the others.
6. Clicking ⧉ again (or Cancel) exits copy mode with no changes.

### SPC dashboard
**Structural change: flat sortable list is now the default view**, not the status-grouped list. Add a "Grouped / All clients" segmented toggle (top-left, near the filters) — "All clients" is the default. The 5 status tiles (New Program ASAP / Needs Printed / Coming Up Next Week / Printed & Ready / Paused) stay visible in both views and now double as **filter chips**: clicking one filters the All-clients list to that status (shown with an olive ring + "· filtering" on the active tile) — clicking again clears it. Add a "Sort: Block ends ▾" dropdown (also sort by Name, Status, Coach). The flat list row is a real grid with column headers (Client / Status / Freq. / Block ends / Coach) so values align under labels instead of clustering at the row's end — reuse this grid pattern, don't revert to a flex row with fixed pixel widths.

### SPC client detail
- **Unified profile card** replaces the previous disconnected Status/Coach/Sessions boxes: one card, Status pills on top (full row, pill-style, olive-filled = active), then a divider, then Assigned Coach (dropdown) and Sessions/week side by side. Sessions/week is now the same **segmented 1x/2x/3x/4x control** used in Group Programs' frequency selector — replace the old +/- stepper.
- **Notes**: unchanged textarea + Save. **No status-change/notes history log** — that was cut per feedback; "History" next to "+ New block" is renamed **"Past blocks"** and only shows previous blocks, not a status/note timeline.
- **New block flow**: clicking "+ New block" (or opening an auto-generated draft) opens a modal with two choices — **Copy last block** (badge shows which block + how long ago it ended, e.g. "Block 2 · 7 weeks ago"; copies everything, including sets/reps, not just exercise names) or **Start blank**. This surfaces staleness clearly so a client returning from a long break isn't silently handed old programming without the coach noticing the gap.
- Blocks calendar: identical system to Group Programs (label column, current-week olive highlight, ⧉ copy-to-tile flow) — reuse that component/pattern, just 2 session-columns instead of 3.

### Exercise Library
**New: Type field (Lift / Warm-up)**, added as the *first* choice in the "New Exercise" modal, before Name. This is a real data field, not cosmetic — it drives:
- The Library page's primary segmented toggle is now **Lifts / Warm-ups** (muscle-group filter chips only apply within Lifts; Warm-ups has no muscle-group filter). Warm-up rows show a tan "warm-up" tag instead of a muscle-group string.
- Selecting **Warm-up** in the New Exercise modal hides Muscle group and Movement pattern (not applicable) and instead shows a **Default sets/reps** field (Sets + Reps number inputs) — pre-fills when the exercise is inserted into a session's warm-up slot, coach can still edit per-session.
- The **builder's exercise-library sidebar** (left column) now pins a tan-tinted "Warm-ups" section at the top, above the muscle-group-grouped "Lifts" list — so when building a session it's unambiguous which exercises are warm-up-only vs. main lifts. This sidebar is also intentionally narrow (~260-290px fixed) with the session/main editing area taking the flex:1 majority — the current build splits ~50/50, that's wrong, fix the proportions to match this file.

## Build order suggestion
1. Coach Home restyle + Roster-tile-to-filtered-Clients-list link (needs the Clients filter UI to exist first, so build Clients-list filters before wiring this).
2. Clients list restyle: filters/sort/pagination/tags.
3. Client detail restyle: snapshot panel (block progress + flags), split enrolled/frequency card structure.
4. Group Programs: restyle calendar first (pure visual, low risk), then delete Block Sessions page and point its tile-click behavior at the calendar, then build the copy-mode interaction last (it's the most novel piece — budget real time for the multi-select + overwrite-confirm logic).

## Files
- `Kova Web App.dc.html` — all reference screens: Coach Home, Clients list, Client detail, Group Programs (with copy-mode state shown mid-interaction on one tile).
