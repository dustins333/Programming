# Handoff: Settings Restructure + Nutrition Polish + New Client Settings (v2)

## Overview
Three things, covering both the coach web app and the member (client) mobile app:
1. **Coach Settings** restructured from one long scroll into sub-tabs (Team / Program Defaults / Nutrition Templates / Notifications / Diagnostics).
2. **Coach Nutrition** — roster (now with clickable status-filter chips) and the full 6-tab client-detail page (Dashboard, Weeks, Trends, Check-In, Photos, Targets) — visual polish pass, restored/added the client "gear" Settings modal, restored photo upload/fix tools, and a real line-graph on Trends.
3. **Client mobile app** — the 4 Nutrition tabs (Today, Weekly, Check-In, Photos) tightened up (no more dead space), plus a brand-new **Settings** screen (email/password change, push-notification toggles, assigned coach, sign out, delete account), reached via a gear icon on My Week rather than a 5th tab.

## About the Design Files
The two `.dc.html` files in this folder are **design references built in HTML/JS** (an internal prototyping tool's format) — they are NOT code to copy into the Expo/React Native app. Treat them exactly like static mockups: recreate the layout, spacing, colors, typography, and structure using this codebase's real stack (Expo Router, React Native, NativeWind, `lib/theme.js` tokens) and existing component patterns (`CoachShell`, `SegmentedControl`, `StatusBadge`, etc.) — don't try to run or embed the HTML.

Each file has a row of buttons above the mock browser/phone frame that switch between the screens/tabs shown inside — that's a prototyping convenience, not something to build.

## Fidelity
**High-fidelity.** Colors, spacing, and type follow the existing `lib/theme.js` tokens and the house style documented in `CLAUDE.md`'s "Visual pass v4" section. Copy/microcopy is close to final; wire to real data per the notes below.

## Files
- `Coach Web — Settings + Nutrition Redesign.dc.html` — Settings, Nutrition roster, Nutrition client-detail (all 6 tabs), Client Settings modal.
- `Client Mobile Nutrition Redesign.dc.html` — My Nutrition's 4 tabs, plus the new member Settings screen.

## Design Tokens (reuse from `lib/theme.js` — do not reinvent)
- Rust primary `#a46a57` (fills/icons/large headings), text-on-white `#8a5140`, accent `#ad816d`, tertiary `#beac95`.
- Olive/complete `#4d6142` (bg tint `#eef1e7`), peach/alert `#b23a22` (bg `#fdece5`), tan/pending `#8a5a2e` (bg `#f4ede3`), neutral pill `#78716c`/`#a8a29e` (bg `#f1efed`).
- Canvas `#faf8f6`/`#f6f1ec` (coach sidebar bg), card bg `#ffffff` with a couple of barely-there off-white variants (`#fbf9f6`, `#f7f3ee`) used to separate adjacent cards/rows without a hard border-only look.
- Card border `#ece7e1`, input border `#d9d4cd`. Card radius 12–16px, pills 999px. Card shadow: `0 1px 2px rgba(68,64,60,.03), 0 6px 16px rgba(68,64,60,.045)`.
- Type: Protest Strike for page/section titles (18–27px, rust), Montserrat 400–700 everywhere else.

## Screen 1 — Coach Settings (`app/(coach)/settings.js`)
**Structural change**: replace the single long `ScrollView` with a sub-tab row (same underline-tab pattern already used on the Nutrition client-detail page — active tab: `border-bottom: 2px solid #a46a57`, bold, rust text; inactive: transparent border, gray, medium weight). Tabs, in order:
1. **Team** — unchanged content (coach/admin cards, +Add coach/+Add admin, per-coach module-permission switches), just under its own tab now instead of at the top of the long scroll.
2. **Program Defaults** — the 4 numeric settings (alert lead time, Flagship/BWA/SPC block lengths) move into one card, 2-column grid, with a single "Save changes" button at the bottom instead of one input+Save pair per row.
3. **Nutrition Templates** — the two template cards (Weekly check-in / Onboarding questionnaire), unchanged fields.
4. **Notifications** — the 4 push toggles, now inside one card with row dividers instead of loose page rows.
5. **Diagnostics** — the "Send test push to myself" button, with a one-line explainer above it.

No functional/data changes on this screen — purely a restructure of existing fields into sub-tabs plus grouping the 4 default-length fields into a single save action instead of 4 independent ones (confirm with Terra whether independent per-field save should be kept, or the single combined save is preferred — the mock shows combined).

## Screen 2 — Nutrition Roster (`app/(coach)/nutrition/index.web.js` and native equivalent)
- **New functionality**: the 6 status chips (Onboarding/Check-in due/Needs target/Awaiting review/On track/Paused) are now clickable filters — clicking one filters the client table to that status (toggle off returns to all), matching the click-to-filter pattern already built on the SPC roster's status tiles. Active chip gets a rust border + light rust-tinted background. A "Filtered: {status} · Clear filter" line appears above the table when a filter is active.
- No other changes to this screen.

## Screen 3 — Nutrition Client Detail (`app/(coach)/nutrition/clients/[userId].js` + `[userId]/` subroutes)
Header/tab row unchanged in structure; added a gear icon button next to the client's name that opens the **Client Settings modal** (see below).

- **Dashboard tab — reordered**: Focus items and Game plan move to the TOP of the page as a full-width 2-column row (Focus items left, Game plan right), ABOVE "This week at a glance" / "Current target" / "This week vs. last week" (which now sit below, in their previous 2-column arrangement minus Focus/Game plan). No field changes, purely a re-order per explicit ask.
- **Weeks tab**: rows are now expandable — clicking a week row (chevron indicator, ▾/▴) reveals that week's day-by-day breakdown (same columns: Weight, Protein, Carb, Fat, Fiber, Steps, Sleep) indented/tinted below it. Collapsed by default.
- **Trends tab**: real line graph (not a bar chart) — SVG polyline + circular data points + a soft area fill under the line, y-axis min/mid/max value labels on the left, x-axis date labels below, "Hover a point to see its value" hint text. Segmented buttons for Weight/Sleep/Steps/Hunger/Energy and a W/1m/3m/6m/1y range row, unchanged from before. **Known bug, not fixed here**: the live app's current x-axis first two date labels overlap — worth a fix while rebuilding this chart for real.
- **Check-In tab**: restored the "‹ Prior week / Week of {date} / Next week ›" navigation row and the "This week's snapshot" 5-card row (Weight, Nutrition, Steps, Sleep, Hunger & Energy — left-border accent in rust) above the Check-in answers card. These existed in the live app and should not be dropped.
- **Photos tab**: Compare section (Front/Side/Back toggle + two date-picker/photo panes) plus, restored below it: a **"Fix a day's photos"** card (description + "Edit" button) and an **"Add photos (e.g. old/starting photos)"** card (date input, Front/Side/Back upload slots — simple placeholder body-silhouette icon with a "+" badge, matching the client mobile app's upload placeholders — and an "Upload" button). **Known bug, not fixed here**: the live Photo Compare view renders a raw Supabase error message instead of the actual photos (looks like a broken join between `spc_workout_exercises`/`spc_exercise_weeks`) — needs a real fix, this mock just shows the intended clean state.
- **Targets tab**: unchanged from before (Set new target form + Target history list).

## Screen 3b — Nutrition Photo Compare (new standalone screen, `app/(coach)/nutrition/photo-compare.js`)
Reached via the roster's existing "Photo compare →" link. Purpose: let a coach build a shareable before/after image for social media — the "board" (see below) is what gets screenshotted, everything above it is just picker/toggle chrome.

- **Controls** (plain functional UI, not part of the screenshot): client `<select>`, Front/Side/Back toggle (same pill style as the client-detail Photos tab).
- **The shareable board** — a distinct branded card, rounded corners (~22px), drop shadow, thin warm-tan border:
  - Top section: soft warm gradient background (`linear-gradient(160deg, #fbeee4, #f6ded0, #f0cdb8)`). Header row: Kova logo (small circle, white ring) + "KOVA STRENGTH" wordmark (Protest Strike, dark rust `#8a3a24`) + tagline "REAL RESULTS, REAL WOMEN" (tiny, bold, uppercase, letter-spaced, `#a8574a`) on the left; client name + date range (e.g. "June 8 → August 2, 2026") right-aligned, dark rust / muted rust text.
  - Three photo panes side by side, rounded corners, each with its own drop shadow, a date label (bold, dark rust) and weight label (muted rust) centered below it.
  - Bottom section: white background, separated from the gradient section by a 3px solid rust top border. Centered stat row: big "Protest Strike" numbers — "{total change} lb" (olive `#4d6142` if a loss, otherwise use the app's existing positive/negative convention) and "{N} Weeks" (rust `#a46a57`), each with a small uppercase muted label underneath, separated by a thin vertical divider. **Adherence was deliberately left off this stat row** — a coach might not want a bad adherence number to end up on a client's social post; only positive/neutral, coach-chosen stats belong here. If more stats are added later, keep them opt-in per client/coach rather than automatic.
- This whole card is the target for the "screenshot the board below to share" instruction — implement it as a single easily-selectable/exportable DOM region (e.g. a ref'd container) so a coach can screenshot or export it cleanly.

## Client Settings modal (new, reached via the gear icon)
Centered modal over a dim scrim, matching the app's existing modal pattern:
- Title: "{Client Name} — Client Settings" (Protest Strike, rust).
- Fields: Name (text input), Phone (text input), Start date (text input).
- Status: 3-way segmented control (Active / Paused / Archived), same segmented-pill visual as `SegmentedControl.js`.
- Progress photo frequency: 5 pill options (Off / Weekly / Biweekly / Monthly / Bimonthly), single-select, active pill filled rust.
- Two expandable rows: "Weekly check-in questions" (badge: "Available to client") and "Check-in status" — both show a chevron; expand to reveal their existing content (per-client check-in template editor / check-in status detail) — not fully mocked here, just the collapsed affordance.
- Footer: Cancel (outline) / Save (filled rust) buttons, right-aligned.

## Screen 4 — Client Mobile: My Nutrition, 4 tabs (`app/(member)/nutrition/*.js`)
- **Today**: essentially unchanged — Daily Log split into 3 clearly-separated cards (Log-on-waking: Weight/Sleep, Macros: Protein/Carb/Fat/Fiber + calculated calories + optional Cronometer override, Activity: Steps/Hunger/Energy), each on a subtly distinct off-white card background, then Notes + autosave status line + Finalize Day button. Field labels have a fixed-height reserved area so a wrapping "target: N" tag never pushes that field's input out of alignment with its row-mates.
- **Weekly**: replaced the previous "8-week trend" mini bar chart (which had no axis/label and read as unclear) with just the two summary tiles (8-week weight trend, Avg adherence) plus two real tables: "This week — day by day" (Day/Wt/Prot/Carb/Fat/Fiber/Steps/Sleep) and "Prior weeks" — the prior-weeks table now matches the day-by-day table's column layout exactly (collapsed one row per week) and is tappable to expand that week's own day-by-day rows inline (no redundant summary text, just the real daily data).
- **Check-In**: unchanged from the live app (progress-photos-submitted / check-in-form rows + Finalize Check-In button) — just confirm the Finalize button's active/inactive visual states are intentional (it renders in a lighter, lower-contrast rust when the week isn't fully ready to finalize — this is likely a disabled-state style, not a bug, but worth a sanity check against the design system's disabled-button spec).
- **Photos**: "Add today's photos" upload row (Front/Side/Back — simple placeholder body-silhouette + "+" badge, dashed border, peach-tinted bg) + Upload button, THEN "Compare" (Front/Side/Back toggle + two date-picker/photo panes) below it. **Known bug, not fixed here**: same raw-Supabase-error rendering issue as the coach Photo Compare view.

## New Screen — Member Settings (`app/(member)/settings.js`, new route)
Reached via a small gear icon added to the top-left of the **My Week** tab's header (not a 5th bottom tab — keeps the tab bar at 4 items; the gear should realistically appear on every member tab's header, not just My Week, but was only mocked on My Week for brevity — confirm placement before building).

Sections, top to bottom:
- **Account** card: Email row (current email + "Change ›"), Password row ("Last changed X ago" + "Change ›") — each presumably opens its own small form/modal, not mocked in detail.
- **Notifications** card: toggle rows — "Daily log reminder", "Weekly check-in available", "Coach messages" (each with a one-line description, same toggle visual as elsewhere in the app).
- **About** card: read-only "Assigned coach" row.
- **Sign out** button (outline).
- **Danger zone**: peach-tinted card with a warning line + filled red "Delete account" button — needs a real confirmation step (e.g. type-to-confirm or a second modal) before actually building this, not shown in the mock.

## State Management Notes
- All tab/filter/modal state in the mocks is local component state (`useState`/equivalent) — no new global state needed.
- Roster filter, week-row expand/collapse, and client-settings-modal-open are all simple local booleans/strings — implement the same way in the real screens.
- The Trends line-graph's data (dates → values) already exists via whatever query currently feeds the bar/line chart in the live app; only the rendering changed.

## Screenshots
`screenshots/` has numbered captures of every screen/tab described above (coach web: Settings/Roster/Client Detail's Weeks/Trends/Photos/Targets tabs; client mobile: My Week, Nutrition's 4 tabs, and the new Settings screen) — use them alongside this README when details are ambiguous from the text alone.

## Assets
- Kova Strength logo (existing `assets/kova-logo.jpg`).
- No new icon assets — gear/chevron/plus glyphs are simple inline glyphs/shapes in the mock; use the app's existing `@expo/vector-icons` (Ionicons) equivalents when building (e.g. `settings-outline`, `chevron-down`, `add`).
