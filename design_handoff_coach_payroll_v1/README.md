# Coach Payroll — visual pass + tab restructure

**Scope:** every payroll screen, staff and admin. Behaviour is preserved end to end — this is anatomy, hierarchy, and naming, not a rework of how pay is calculated, submitted, finalized, approved, or closed.

**Brief, in your words:** "keep all the functionality here, especially with the finalizing, but i just want it to look good like the rest of the app does." Phone-first, because coaches log at the end of each day on a phone.

Open `Kova Coach Payroll.dc.html` in a browser. The day strip in 1a/1b and the attendee chips in 1i are live — click them.

---

## The three problems this fixes

1. **Tiles didn't line up.** Every tile centred its own stack, so a tile with a caption sat at a different height from the one beside it, and the checkmark half-hung off the bottom edge on its own white circle to avoid the border cutting through it. That badge is what made the screen read as unfinished.
2. **Four tabs on a phone, two of them rarely used.** `My Entries / Requests / 1:1 Nutrition / Pay Stubs` needed a horizontal ScrollView, and the two middle tabs are both "pay that isn't logged daily."
3. **Three date mechanisms.** A 150×72 date tile, two step arrows, and a bounded calendar modal — all to answer "which day am I logging."

---

## Screens

| # | Screen | File in the app | What changed |
|---|---|---|---|
| 01 | Log · in progress | `app/(coach)/payroll/entries.js` | Uniform tile anatomy; sliding day strip; peach = entered-not-submitted |
| 02 | Log · submitted | same | Day flips sage across tiles, strip pill, and footer together |
| 03 | Hours & names sheets | `HourMinuteStepperPopup`, `NamesListPopup` | One sheet shell; names get per-row delete + add row |
| 04 | SPC sheet | `SpcSessionPopup` | Head count 0–4 builds that many optional name rows |
| 05 | Extra pay | `requests.js` + `nutrition.js`, merged | Two tabs become two segments of one screen |
| 06 | My Pay | `report.js` | Dark band for the money; elapsed-days progress |
| 07 | Finalize confirm | `FinalizeModal` | Restates the period being signed, not just "are you sure" |
| 08 | Admin · this period | `admin/periods.js` | Restyle; fixed-width review rail so every row aligns |
| 09 | Admin · requests | `admin/requests.js` | Dark approval cards, three across; decided history below |
| 10 | Admin · closed periods | `admin/closed.js` | Receipt row: owner / staff / taxes / grand total, expand at frozen rates |
| 11 | Admin · report | `admin/report.js` | Share bars; breakdown as a side panel on web |
| 12 | Admin · rates | `admin/settings.js` | Three columns instead of one long scroll |

Screenshots are in `screenshots/`, numbered to match.

---

## Decisions

**State is fill and border, never a floating badge.** White = empty, peach (`#fdf6f2` / `#f0ddd2`) = entered and autosaved, sage (`#eef1e7` / `#4d6142`) = the day has been submitted. Both tones are already in the app — the peach selected-session banner and `statusColors.onTrack`. An 11px inline tick sits in the tile's top-right on submitted tiles; it is not a button and never was one after the day-submit rework.

**One tile anatomy.** Label top-left, value bottom-left, control bottom-right, one reserved 15px caption line. Because the caption slot is always reserved, `TILE_HEIGHT` stays static without `paddingBottom: 28` holding space for a floating badge. Repeatable things (SPC, Other) carry a small count chip beside the label instead of the corner badge.

**Staff bar: three tabs, equal width.** `Log · Extra pay · My Pay`. No ScrollView. `can_view_nutrition` now gates the Nutrition *segment* inside Extra pay rather than a whole tab, so a coach without the permission sees Requests only and never an empty tab.

**Day strip replaces all three date mechanisms.** Five days visible inside the 14-day Thursday→Wednesday period. `windowStart = clamp(selectedIndex - 2, 0, 9)`: at the start of the period the window is pinned and the selection moves within it, from day 3 the selection rides the centre, and over the last two days it drifts right while the window holds — so it finishes the period out. Arrows step the selected day. No scroll container, no calendar modal.

**"Day 9 of 14" is elapsed period time, not days logged.** Deliberate, per your call: most coaches don't work every day, and a bar that counts submissions implies a daily submit is owed. The "days not submitted" callout was removed for the same reason.

**Finalize keeps its confirm.** It's the only hard confirm in the flow, because it's the only step that snapshots rates and takes the period out of the coach's hands. The sheet restates the whole period and says plainly that an admin has to send it back.

**Approvals never appear on the staff side.** Admins have their own login; the dark approval card lives in Admin View → Requests (09) only.

**Admin keeps five tabs.** Splitting closed periods out of "This period" was a deliberate earlier call — a growing list of finished periods under the review table buried the thing you came to do. This pass only restyles it.

---

## Implementation notes

**`components/payroll/PayrollTile.js`**
Delete `TileCheckmark` and its absolute positioning. `TILE_BG` / `TILE_BORDER` gain an `entered` state so the three states are explicit rather than `solid ? x : y`. Drop `paddingBottom: 28`. Keep `TILE_HEIGHT` static — with the new anatomy it no longer needs a reserved badge zone. Watch `box-sizing`: the mocks set `border-box` on every tile; RN is already border-box, web isn't.

**`components/payroll/PayrollDateNav.js`**
Rewrite as the strip. It needs no new data — `datesWithEntries` and `submittedDates` already carry the dot states, and the period bounds come from `periodStart` / `computePeriodEnd`. `PayrollDatePicker` and its bounded-calendar modal can be deleted with it unless it's used elsewhere.

**`components/PayrollTabBar.js`**
Four tabs to three; `ScrollView` to an equal-width flex row. Route names can stay as they are — only labels changed (`entries → Log`, `report → My Pay`).

**`app/(coach)/payroll/requests.js` + `nutrition.js`**
Merge into one route with a two-segment switch. Both keep their own loaders and their own permission checks; nothing about assignments, `approveRequest`, or `addNutritionAssignment` changes. The staff screen renders no approval queue at all.

**`app/(coach)/payroll/report.js`**
Restyle only, no new query. The progress figure is `(today - periodStart) / 14`.

**`app/(coach)/payroll/admin/report.js`**
`PayrollBottomSheet` becomes an inline side panel on web (`Platform.OS === "web"`); native keeps the sheet. Share bars are each staff member's total over the period leader's — straight from the `computeTotalsByStaff` output the screen already has.

**`app/(coach)/payroll/admin/periods.js`**
The review row is a fixed 194px rail: 96px primary + 8px gap + 90px secondary, and single-action rows ("Waiting on Avery", "View note") span the full 194 so every edge lines up. Staff column 200px, numeric columns 58px, and `nowrap` on names, status sublines, and pay figures so all rows share a height.

**`SpcSessionPopup`**
Attendee count is 0–4 and drives the number of optional name rows; deleting a row decrements the count so the two can't disagree. Names remain optional — a session logs on head count alone. Needs a place to store per-attendee names; today the popup stores `spc_attendees` (int) and `spc_notes` (text). Simplest path is newline-joined names in `spc_notes`, same convention the core rows already use for `program_notes` / `welcome_notes` / `strategy_notes`.

---

## Open questions

1. **SPC tiers vs. the 0–4 chips.** `admin/settings.js` still lists tiers to "6 or more" while entry now caps at 4. Trim the tiers to 0–4, or does the 5/6+ tier still need to exist?
2. **The 0-attendee rate.** Added as a `$0.00` row in 12 as a placeholder. What does a no-show session actually pay?
3. **Per-attendee names for SPC** — reuse `spc_notes` as newline-joined text (no migration), or a real column?
