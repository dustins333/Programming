# History: member app (My Week, My Fitness, logging, History, auth screens, Benchmark, Conditioning)

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

## Visual pass v4 — member tabs restyled to a design handoff, new house style (2026-08-01)

A real design handoff (`design_handoff_visual_pass_v4/README.md` + a static HTML mockup, `Kova Mobile App v4.dc.html` — HTML is a design reference only, never copied in as markup) drove a full restyle of My Week, My Fitness, the Flagship/SPC "View full block" screens + session modal, and My History, across `app/(member)/index.js`, `plan.js`, `plan-block.js`, `plan-spc-block.js`, `history/index.js`, `history/[exerciseId].js`, `components/SessionLogger.js`, and `components/SessionDetailModal.js`. **No IA/functional changes** except My History's new "By Workout" data view (below). This **supersedes the "visual pass #2/#3/#4" celebratory-green-wash completion style** described earlier in this file (`DONE_BG`/`DONE_BORDER` full-card fills) — that approach is gone; every completion state everywhere in the member app is now **border-only** (a thicker, olive-colored border — `#4d6142`, 2px — never a background fill or checkmark badge). Treat the tokens below as the current house style for any future member-side (and likely eventual coach-side) visual work, not a one-off:

- **Canvas `#faf8f6`, card bg white, default card border `#ece7e1` (1px), "done" tint `#dbe8cf`, completed-element border `#4d6142` (2px).** Card radius 14–20px, pills 999px. Card shadow is a soft two-layer `rgba(68,64,60, .03/.045)` warm-gray, approximated in RN with one `shadowColor:"#44403c"` shadow (RN doesn't support multi-layer box-shadow).
- **Peach "last time" pill**: bg `#fdece5`, text `#b23a22` — used for the per-set history annotations in `SessionLogger.js`.
- **Selected-session banner** (peach-tinted row with an uppercase truncating eyebrow + title + a "View full block ›" pill button, bg `#fdf6f2` / border `#f0ddd2`) is the new pattern for "which session am I looking at" context — see `SelectedSessionBanner` in `plan.js`.
- **Nav bar**: 21px line icons (fixed, not whatever size the navigator would otherwise pass), inactive tint `#b5afa6`, active label renders bold (`fonts.sansBold`) via a custom `tabBarLabel` renderer — react-navigation's `tabBarLabelStyle` can't vary by focus state on its own, so `app/(member)/_layout.js`'s `TabLabel(title)` helper renders the `Text` itself off the `focused` arg instead.
- **Session/detail modals are bottom sheets now**, not centered cards — `border-radius: 22px 22px 0 0`, slide up over a `rgba(68,64,60,0.35)` scrim, sheet bg is canvas (`#faf8f6`) not white. Header is a flex column with `gap: 6` (not `margin-top`) between title and a completed-date line, specifically so a wrapped two-line title can't collide with the line under it — this bit a real layout bug in the pre-restyle version.
- **Deliberately left alone**: muscle-group label casing ("Back & Bis" vs "back and bis") — the handoff asked for this to be normalized, but that's coach-authored free text; auto-transforming it client-side risked mangling legitimate strings (acronyms, proper nouns), so this is a content-entry convention for Terra to keep consistent, not something the code enforces. Ask before changing this to an enforced transform.

**My History's "By Day" vs "By Workout" — the handoff's assumption was backwards from what was actually in the app**, worth remembering if a future handoff makes similar assumptions: the README described "By Day" (Today/Yesterday grouped sessions+nutrition) as *already built, restyle only*, and "By Workout" (exercise-grouped, searchable) as the net-new piece. The actual existing screen (`history/index.js` + `history/[exerciseId].js`) was already exercise-grouped — i.e. already basically "By Workout," just missing search and the last-reps/weight subtitle. There was no day-timeline screen at all. Flagged this mismatch and asked before building rather than guessing; user confirmed building both as originally designed. Result: **`lib/history.js`'s new `listDayTimeline(userId)`** is the real net-new query — merges `programming.session_completions` (group/SPC/one-off, one-hop embeds to each workout table for the session label, plus a two-hop embed `group_workouts → group_blocks → group_programs` for the program name, same embed depth already proven safe elsewhere in `lib/programming/workouts.js`) with finalized `nutrition.daily_logs` (via the existing `listLogs`), sorted into one date-descending timeline. **Simplification worth knowing about**: session set/exercise counts ("N exercises · M sets logged") are summed per *calendar date*, not per specific session — matching a completion to `logs.source` precisely would need resolving which of flagship/bwa/group a given group program maps to, and two sessions finalized the same calendar day is rare enough that the combined count is an acceptable simplification. `listLoggedExercises()` (`lib/programming/memberPlan.js`) was extended to also carry the most recent set's reps/weight (ordered `date_performed desc, set_number asc`, so "most recent" means that date's set 1) for the same "By Workout" row.

**Not visually verified** — same login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (Metro compiles clean, no console errors) across every touched route. Worth a manual pass, especially the new By Day timeline and the bottom-sheet session modal.

## Today tab reworked into a weekly overview, then redesigned as "My Week" (2026-08-01)

`app/(member)/index.js` used to show only "today's" single session (day-of-week gated). Per explicit ask, it's now a welcome/overview page: a Flagship/BWA card lists all 3 of the week's sessions (Session 1/2/3, always shown even if today isn't that day) each with a coach-authored title and a completion checkbox, plus a matching SPC card listing that client's `sessions_per_week` sessions for the current week. Tapping a published row opens a new read-only `components/SessionPreviewModal.js` popup (warmups + exercises, no logging inputs) — this lets a 2x/week member survey the week and plan which 2 of 3 days to attend. **Actual logging is unchanged**: My Fitness (`app/(member)/plan.js`) still only shows and finalizes whichever single session maps to *today* via `sessionNumberForDate()` — the overview is planning/preview only, not a second way to log.

Two new pieces of data this needed, neither of which existed before:

- **Per-session titles** ("Back & Bis"). Group: a plain nullable `title` column on `group_workouts` — trivial since it already has one row per (block, week, session). SPC has no per-week row (one `spc_workouts` row recurs across the whole block), so it got a `title` column on `spc_workouts` as the **default for every week**, plus a new `spc_workout_week_titles` override table (`spc_workout_id`, `week_number`, `title`, real unique constraint) for editing just one week's title after the fact ("last week! let's crush those delts") — `lib/programming/spcWorkouts.js`'s `getSpcWorkoutWeekTitles`/`setSpcWorkoutWeekTitle`/`listSpcWorkoutWeekTitlesForWorkouts` resolve override-or-default. Both SPC builder screens (native + web) now edit the default title plus a per-week override (native: tied to the existing week-selector chips; web: a new title-input row aligned above the per-week `WeekCell` columns). Group builders (native + web) just got one title `TextInput` each, since there's no default/override split needed there.
- **Per-client Flagship/BWA session frequency (1x/2x/3x a week)** — `client_program_assignments.sessions_per_week` (smallint, 1-3, default 3), mirroring `spc_clients.sessions_per_week` which already existed for SPC but had no group-side equivalent (only a fixed program-level default of 3). Editable via a 1x/2x/3x `SegmentedControl` on `app/(coach)/clients/[userId].js`'s Group program card. This is what "done for the week" is measured against on the overview (completed-count ≥ target).

New batch getters to avoid N+1 checkbox lookups: `memberPlan.js`'s `listWorkoutsForWeek(blockId, weekNumber)` (all 3 group sessions for one week in one query), `sessionCompletions.js`'s `listGroupCompletionsForWorkouts` (batch group completion set) and the now-exported `getCompletedSpcWorkoutIdsForWeek` (was already there internally for `getNextIncompleteSpcWorkout`, just needed exporting).

Migration `0009_session_titles_and_frequency.sql` — **run against the live project.**

**Visual pass #2, same day, per direct feedback after the first version shipped**: the tab was renamed **"My Week"** (`app/(member)/_layout.js`'s `title` — the route file is still `index.js`, only the tab label changed). The card design changed from a vertical row list to a compact grid: each program card is now a single header row (`{ProgramName}` left, big `{completed}/{target}` right) over a divider, then a horizontal row of session **bubbles** (`SessionBubble` in `index.js`) — small bordered tiles with a big `checkmark-circle-outline`/`ellipse-outline` Ionicon, no more per-row text list. The old "Log today's session in My Fitness →" CTA buttons are **gone entirely** — tapping a bubble still opens the same read-only `SessionPreviewModal` popup as before, and actual logging still only happens on My Fitness, unchanged. That freed-up button color (`colors.primary`, the brand terracotta) became the card/bubble **border** instead, and the page background darkened to `stone-200` (was `stone-100`) — both purely for contrast, since removing the border-less white-on-white-ish card read as flat. When a section is fully checked off (`completedCount >= target`) the **entire card** washes to a celebratory green (`#dcead0` bg / `#8fb473` border, deliberately more saturated than the app's usual subtle `statusColors.onTrack` tint) rather than just recoloring a text label — explicit ask: "people love to see things checked off."

**Nutrition's card is no longer a single "today" status tile** — it's now a Monday-Sunday row of 7 day bubbles (`NutritionStrip`, labeled M/T/W/Th/F/Sa/Su), each checked off once that day's `nutrition.daily_logs` row has `finalized_at` set. New `lib/nutrition/dailyLog.js`'s `listLogsForDateRange(userId, start, end)` fetches the whole week in one query rather than 7 round-trips. Only *today's* bubble is pressable (→ My Nutrition tab); past/future days are read-only status, same "preview only" philosophy as the session bubbles. This is a straight replacement of the old single-day weight/calorie-% display, not an addition — that content is gone from this page (still available on the My Nutrition tab itself).

New `lib/boiseDate.js`'s `addDays(dateString, days)` — the same plain ISO-date-math helper already duplicated in `lib/programming/blocks.js` and `spcBlocks.js` (both coach-only modules), added here too since this member-side screen needed basic date arithmetic (computing the week's Monday) without reaching into a coach lib file. Not consolidated into one shared implementation — three copies now exist; worth deduplicating if a fourth caller ever needs it.

The explicit "make this fit on one page, no scrolling" ask is **best-effort, not guaranteed** — the page is still a `ScrollView` (kept as a safety net for members enrolled in multiple programs, or long error/empty-state text), just with much tighter padding and the row→bubble-grid layout change to substantially cut vertical space per section. Whether it actually fits without scrolling depends on device height and how many programs a given member has. **Not visually verified** — same login limitation as everywhere else in this file; bundle-checked only (Metro compiles clean, no console errors on `(member)`), worth a manual pass once logged in.

**Visual pass #3, same day, fixing regressions/gaps from pass #2**: per-session titles (e.g. "Back & Bis") had disappeared entirely when the bubble redesign replaced the old text-row layout — added back as a small `numberOfLines={1}` line inside each bubble (only rendered when a real title is set, not the "Untitled session" placeholder, matching the same convention `openGroupPreview`/`openSpcPreview` already used for the modal's subtitle). Flagship/BWA bubbles also gained a permanent caption ("Mon/Tue", "Wed/Thu", "Fri/Sat") reflecting `schedule.js`'s fixed day-of-week routing — this replaced the small colored dot that previously marked "today's" bubble, which user testing found ambiguous (read as a second, redundant "completed" indicator sitting right next to the checkmark that already meant that). SPC bubbles get no caption — SPC has no day-of-week mapping. Each card (`WeekSection` and `NutritionStrip`) now has a two-tone header: a colored banner strip (`HEADER_BG` peach, or `DONE_HEADER_BG` deeper green when the section's fully checked off) behind the title row, edge-to-edge via `overflow-hidden` on the rounded outer container rather than inset by the card's own padding, with the existing divider now serving as that banner's bottom edge. The title (`fonts.display`) is now bigger than the `1/2` counter (28 vs 24, was the reverse) per feedback that a small title next to a big number "looked funny". **Safe-area fix**: the greeting/date/logo header was rendering under the phone's status bar/notch — `app/(member)/index.js` now reads `useSafeAreaInsets()` (from `react-native-safe-area-context`, already installed and wrapping the app via `SafeAreaProvider` in the root `app/_layout.js`, just never consumed by this screen) and applies `insets.top` as extra top padding on the ScrollView's content. This is the same class of bug the Tabs navigator's `headerShown: false` setup doesn't handle automatically for you — worth checking whether `plan.js`/`nutrition`/`history` have the identical issue, since they weren't specifically reported this session and haven't been checked.

**Visual pass #4, same day — bubble alignment, a real enrollment bug, and My Fitness reworked into a program selector.** `SessionBubble`'s content is now split into a `flex-1` top block (label + optional title) and a fixed bottom block (checkmark + caption) — since sibling bubbles in a row are stretched to equal height by RN's default `alignItems: stretch`, this pins the checkmark/caption to the identical Y position across all 3 bubbles regardless of whether a given session has a title set, fixing a real "looks uneven" bug spotted when session 1/2 had no title but session 3 did. Each `WeekSection` card header also gained a `chevron-forward` arrow next to the `x/y` count that deep-links straight to My Fitness with a `?program=flagship` or `?program=spc` route param.

**Real bug found and fixed: a client "unenrolled" from SPC (status set to `paused` via the coach's client-detail toggle) still saw the SPC card on My Week and My Fitness.** `handleSpcToggle` in `app/(coach)/clients/[userId].js` never deletes the `spc_clients` row when toggling off — it sets `status: 'paused'` so history/settings survive re-enabling. But `getSpcClient()` just checks row existence, and both member screens treated "row exists" as "enrolled," never checking `status`. New `lib/programming/spcClients.js`'s `isSpcActive(spcClient)` (`Boolean(spcClient && spcClient.status !== "paused")`) is now the required check everywhere on the member side — mirrors the coach-side client-detail page's own `spcActive` computation, which had this right all along. **Checked the group-program equivalent too, per the user's ask — it's fine as-is**: unassigning group (`assignProgram(userId, null)`) actually nulls `client_program_assignments.group_program_id` rather than using a separate status flag, and the member pages already gate on `assignment?.group_program_id` being truthy, so there's no analogous bug there.

**My Fitness (`plan.js`) reworked from "stack both programs, forever-scrolling" into a program selector.** A member with only one program (group-only or SPC-only) sees no selector at all — same single-card behavior as before. A member with both gets two tab buttons (`ProgramTabs`) at the top; only the selected program's card renders below, not both stacked. Tapping My Week's new chevron arrow lands here with the right tab pre-selected via the `?program=` param (falls back to whichever program the client actually has if the param's absent or invalid). **SPC's "which session" problem**: SPC sessions aren't pinned to a day of the week the way Flagship/BWA are (`sessionNumberForDate` doesn't apply), so a client on more than 1x/week SPC needs to actively choose which of their sessions they're working on — new `SpcSessionPicker` (a row of small session pills, each showing its own checkmark) appears only when `sessions_per_week > 1`; at 1x/week there's nothing to pick between, so it loads directly like before. Selecting a different pill lazily fetches that session's exercises via a `useEffect` keyed on `spc.selectedSessionNumber` (no caching across switches — refetching on toggle was judged simpler than a per-session cache given `sessions_per_week` is small, usually 1-3). One-off workouts are unaffected by any of this — they're not part of the tab selection, still always rendered below whichever program card is active, same as before this pass (not requested to change, and there's normally few enough of them that "forever scrolling" was never really about them).

**Visual pass #5, same day — one-offs folded into both pages, nutrition's arrow moved to the header.** My Fitness's `ProgramTabs` now builds its option list dynamically from whichever of {group program, SPC, one-offs} the client actually has, rather than being hardcoded to exactly Flagship-or-SPC — a 3rd "Extras" tab appears whenever `oneOffs.length > 0`, and `showTabs` now fires whenever more than one of the three is available (was `hasGroupProgram && hasSpc`). The `?program=` deep-link param now also accepts `"extras"`. My Week gained a matching one-offs tile (`OneOffsSection`) it never had before — reuses `SessionBubble` but with a new `fixedWidth` prop (96px, `flex-wrap` row) instead of the `flex-1`-in-a-row-of-3 sizing Flagship/SPC use, since a client can have any number of one-offs (usually 0-2, but not a fixed count). New `lib/programming/oneOffWorkouts.js`'s `listWeekOneOffWorkoutsForUser(userId, today)` is a distinct query from the existing `listActiveOneOffWorkoutsForUser` (which My Fitness still uses, and which drops a one-off the instant it's completed, correctly, since there's no reason to keep logging it) — the My Week version instead keeps a one-off visible (checked off) through the rest of the day it was completed, via `dateInBoise(completed_at) === today`, only rolling off at the next Boise-midnight boundary, so finishing one doesn't make it look like it silently vanished. **Nutrition's day bubbles are no longer pressable at all** — tapping today's bubble to navigate to My Nutrition felt inconsistent with how every other tile navigates (the header chevron), so `NutritionStrip` gained the same `chevron-forward` arrow in its header that `WeekSection` and `OneOffsSection` already had, and the day bubbles became pure status display.

**`components/SessionLogger.js`'s "Last time" panel reworked from an always-visible flat summary into an opt-in, per-set display.** It used to fetch and show `Set 1: … · Set 2: … · Set 3: …` as one combined line the moment an exercise card expanded, whether or not anyone wanted to see it. Now a small clock-icon toggle (`Ionicons` `time`/`time-outline`) sits above the set rows; tapping it lazily fetches history (once — toggling off just hides it, doesn't re-fetch on toggling back on) and, once loaded, annotates each individual set row with a small peach-tinted "Last: X reps @ Y" pill directly under that set's inputs, matched by `set_number` rather than position. If last time had a different number of sets than today's target, only the sets that line up by number get an annotation — extra historical sets with no matching row today are silently dropped rather than shown as an orphaned extra row. Since a session's `notes` field is genuinely one shared value per exercise-per-day (not actually per-set, even though every set row gets it written onto it identically — see `logResult`'s per-row `notes` write in the autosave effect), history's note (if any set from last time had one) is shown once below all the set rows, not duplicated per set.

## Weight calculator on My Fitness weight fields (2026-08-02)

Real member request (relayed by Terra): members were struggling to do plate math in their head while logging a set's weight. New `components/WeightCalculator.js` — a bottom-sheet modal (house style: `#faf8f6` sheet, 22px top radius, slides up over a scrim) opened via a calculator icon that sits next to every weight `TextInput` in `components/SessionLogger.js` (shared by group/SPC/one-off logging, so this covers all of them). Two modes via the existing `SegmentedControl`:

- **Standard**: a plain +/−/×/÷/= keypad, chainable (enter, operator, enter, =, keep going).
- **Plate**: bar first — **Barbell (fixed 35 lb, the only bar weight this gym actually has)** or **Specialty** (free-typed weight, for trap bars/safety squat bars/etc. that don't have one fixed number) — then tap each plate as it's actually loaded (45/35/25/10/5/2.5). **Each tap adds its face value directly, no per-side doubling** — an earlier version doubled each tap assuming "one tap = one pair," which Terra flagged as confusing; a member loading two 45s per side now just taps 45 four times. Undo/Clear, running total, Insert writes the total into that set's weight field.

**Real bug hit and fixed during this build, worth remembering as a general pattern**: the icon was originally designed to only appear when its weight field had keyboard focus (opacity/`pointerEvents` toggled off `onFocus`/`onBlur`). Tapping the icon itself blurs the TextInput first, and that blur reliably landed *before* the tap's press event finished — the icon flipped to `pointerEvents: "none"` out from under the tap, silently swallowing it, on both web and native. A delayed-hide (`setTimeout` on blur, cancelled on refocus) didn't fully fix it either. Abandoned the focus-gated visibility entirely — the icon is now just always rendered next to the weight field whenever that exercise card is expanded, no focus tracking at all. **General lesson**: don't gate a sibling control's interactivity on another element's blur state when the control itself is what causes that blur — the ordering isn't reliable enough to build on, on any platform this app targets.

**Confirmed working end-to-end by Terra clicking through the real app** (native keyboard dismiss + calculator open + insert, both modes) — one of the few features in this file with real interactive verification rather than the usual bundle-checked-only caveat.

## My Week / My Fitness weekly-cap fixes + finalized-state visibility + Group Programs DRAFT label (2026-08-05)

Three real bugs/gaps reported from actual use, no schema changes needed:

**Bug: a client on a reduced weekly frequency saw a confusing greyed-out bubble.** `app/(member)/index.js` was building My Week's session bubbles from the *program's* default `sessions_per_week` (3, for Flagship) instead of the per-client override on `client_program_assignments`. A 1x/week client still got 3 bubbles; the 2nd/3rd were just whatever the coach hadn't published yet for that slot (shared across every client on the program), reading as an unexplained grey tile. First fix attempt wrongly limited the *bubble count itself* to the client's target — corrected after direct feedback: a reduced-frequency client can still attend **any** of the week's sessions (whichever day fits), they just only need to complete as many as their target says. So all of a program's session slots still get their own bubble with their own real day-of-week caption (untouched, always shown) — what actually changes is a card-level "done" state: once a client's total completions this week (any of them, not a fixed first-N slice) meet their target, `ProgramCard` shows a **"✓ Training complete"** line above the bubble row (pushing it down slightly) and every bubble in that row greys out uniformly (`SessionBubble`'s new `weekDone` prop) — no more per-bubble distinction between attended/not once nothing more is required. An earlier version of this fix swapped individual bubbles' captions to "Not needed" instead — rejected per direct feedback for changing the always-real day-of-week text; the current version never touches captions.

**My Fitness gets the matching "done for the week" state for group programs** — SPC already had this ("✓ No remaining sessions this week"), group (Flagship/BWA) didn't, so a client who'd already hit their cap would still get prompted to log whatever session today's day-of-week mapping pointed to. `app/(member)/plan.js`'s group load now checks aggregate completions for the week against the per-client target *before* the day-of-week lookup — same "any completed session counts, not a fixed slice" logic as above, since (unlike SPC, which restricts a client to a fixed first-N subset of sessions by design) a group client can complete any day's session toward their cap. Once met, shows the same "done" card (with "View full block →" still linking through) instead of opening a new session to log.

**Finalized-state visibility, previously nonexistent on My Fitness.** `isCompleted` was already being passed into `SessionLogger` from both group and SPC call sites but the component never destructured it — a dead prop, so there was no visual difference between an unfinalized and already-finalized session anywhere on the page. Now: `SelectedSessionBanner` shows a small "Finalized" pill next to the session title (both group and SPC), and the Finalize button itself (footer-docked or inline) turns olive and reads "✓ Finalized — tap to update" once done — re-tapping still works since `finalizeGroupSession`/`finalizeSpcSession` are idempotent upserts. Deliberately kept the existing "just show today's lift" page model — no separate log-session screen, per explicit pushback on that idea.

**Coach-side counterpart of the same "couldn't tell it wasn't published" problem**: the Group Programs grid (`components/BlockGridCells.js`'s `SessionCell`) only distinguished published from draft via a subtle background-tint difference, easy to miss scanning a whole grid — exactly what led to the greyed-bubble confusion above going unnoticed by the coach. Added an explicit small amber "DRAFT" label, rendered in-flow above the "Wk N" line (not an absolute overlay — that was tried first and would've collided with the "Wk N" text sharing the same corner).

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (`expo export -p web`, clean, zero errors). Worth a manual click-through: a reduced-frequency client hitting their cap via a non-"first" session, the Training-complete/greyed-row treatment on My Week, the Finalized pill/button state on My Fitness, and the DRAFT label on the Group Programs grid.

## Numeric keyboard Done bar (2026-08-05)

Direct report: the keyboard felt "too persistent" on mobile, hard to dismiss. Root cause: iOS's `numeric`/`number-pad` keypads render with no Return/Done key at all, and nothing in the app provided an alternative — so the only way to close one was tapping blank space, easy to miss in a dense form like `SessionLogger`'s per-set reps/weight grid (tapping the wrong thing just moves focus to another field instead of dismissing).

New `components/NumericInputAccessory.js` — a shared "Done" bar (`InputAccessoryView`, iOS-only, no-ops on other platforms) mounted once at the app root (`app/_layout.js`, sibling of `<Slot />`, not nested in any `Modal` — required for `InputAccessoryView` to work correctly with a `Modal`'d TextInput per RN's own docs). Every numeric `TextInput` across the app opts in via `inputAccessoryViewID={NUMERIC_DONE_ID}` — 13 inputs across 11 files: `SessionLogger.js` (the main reps/weight grid), `WeightCalculator.js`, `ExerciseFormModal.js`, `NewGroupProgramModal.js`, `register.js`'s OTP code field, `(coach)/settings.js`'s numeric config fields, and the nutrition macro/target fields (`TargetField.js`, `ApproveTargetsForm.js`, `PhotoSubmissionsEditor.js`, nutrition `index.js`/`onboarding.js`).

**Verification was attempted but inconclusive, not skipped.** This session had real simulator access (booted iPhone 17 Pro) and a real installed dev-client build of the app — started a dedicated native Metro instance, confirmed the dev client connected and Fast Refresh picked up the change live with no crash (rules out a wiring/import bug). But interactive tap verification stalled: a stuck system "Allow widgets from Maps" dialog silently ate every tap for a while (invisible in some screenshots, confirmed once a Home-button press revealed it); after rebooting the simulator to clear it, taps stopped registering entirely, even on a plain navigation link — a tooling/input-injection problem, not something about this code specifically. Didn't chase it further since it was clearly unrelated to the original bug. **Worth a real click-through next time the app's in hand** — expand a set row on My Fitness, tap the reps/weight field, confirm a "Done" bar appears above the keyboard and dismisses it.

## Dynamic Type (iOS text-size scaling) support (2026-08-06)

Real bug reported directly: the app looked fine at the smallest iOS text size but broke badly once Text Size was raised — My Nutrition's segmented tabs truncated to "Tod:"/"Weel"/"Check"/"Phot", form labels truncated ("Sleep (l" for "Sleep (hrs)"), and "target: X" pills overlapped their labels. Root cause: every `Text`/`TextInput` in the app defaults to RN's `allowFontScaling={true}` with no ceiling anywhere (confirmed via a repo-wide grep — zero hits for `allowFontScaling`/`maxFontSizeMultiplier` before this), while dozens of components assume a fixed default font size (fixed-width table columns, fixed-width session-bubble tiles, 4-equal-`flex-1`-segment tab rows, small fixed-padding pill badges).

Given how data-dense a lot of this app is (grids, tables, pills), fully supporting iOS's largest "Accessibility" text sizes would need real per-screen redesign. Per explicit decision: **capped app-wide at ~1.3x** (covers the standard Dynamic Type range, clamps before the much larger Accessibility range) rather than chasing full support, and scoped to the **native mobile app only** — Dynamic Type is an OS-level native mechanism, the web build wasn't touched.

**Global cap via a Babel plugin, not a wrapper component.** This RN version's `Text`/`TextInput` (`node_modules/react-native/Libraries/Text/Text.js`) are plain function components with no `defaultProps` — confirmed by reading the source — so the usual `Text.defaultProps.maxFontSizeMultiplier = X` trick doesn't work here. A wrapper-component + codemod was considered (115 of 130 files under `app/`+`components/` import `Text` from `react-native`, 42 import `TextInput`) and rejected as unnecessary risk for zero benefit over the alternative: new `babel/maxFontSizeMultiplierPlugin.js` visits every `<Text>`/`<TextInput>` JSX element at compile time and injects `maxFontSizeMultiplier={1.3}` unless the element already sets one — registered in `babel.config.js`'s `plugins` array with the cap value as a config option (`{ max: 1.3 }`), so it applies to all ~150 existing call sites and every future one with zero source changes and nothing to remember.

**Convention going forward**: the 1.3x default is for primary reading content (body text, form labels, list rows). Small/decorative/badge text (pills, segmented-tab labels, short captions) should set its own tighter explicit `maxFontSizeMultiplier` — the plugin only fills in when nothing is set, so any per-instance override always wins. Fixed per this pattern: `components/SegmentedControl.js` (1.15, `numberOfLines={1}` added — 4 equal-width tabs have no slack for "Check-In"/"Photos"), `components/nutrition/TargetField.js` (the "target: X" pill pinned to `maxFontSizeMultiplier={1}` plus `flex-wrap` on its row — this was the exact overlap in the screenshot), `components/StatusBadge.js` (1.2 + `numberOfLines={1}`), `components/nutrition/MacroPills.js` (1.2), `app/(member)/index.js`'s `SessionBubble` (1.15 on label/caption, 1.2 on description — the one-off row uses a hard `fixedWidth: 96` with no slack), and `components/nutrition/WeekList.js`'s two fixed-width-column table renderers (`WeekList`/`WeekDayTable` — a new `TABLE_MAX_SCALE = 1.1` constant, since this table is deliberately pixel-faithful to the standalone Nutrition Tracker app per an earlier session's note and has no room to reflow at all).

**Verified for real, not just bundle-checked** — this session had real simulator access (booted iPhone 17 Pro on iOS 27, `com.kovastrength.app` already installed as a dev-client pointed at a long-running Metro tunnel). Relaunched via `xcrun simctl launch <udid> com.kovastrength.app -UIPreferredContentSizeCategoryName UICTContentSizeCategoryXXXL` (the largest *standard* Dynamic Type size, matching the capped design target — this launch-argument technique sets Dynamic Type for one process without touching system Settings at all, useful to remember for next time — relaunching without the flag does *not* reset it, since it's written into the app's own NSUserDefaults, not a one-shot process arg; explicitly relaunch without the flag afterward to actually clear it) and confirmed via real screenshots: Coach Home's roster tiles and the Clients list both rendered cleanly at the larger size with no clipping, and the coach Nutrition roster's `StatusBadge` pills rendered as full, clean, non-overlapping labels.

**Real bug found and fixed the same session, on the member side specifically**: Terra spotted it live — the member `(member)` tab bar (My Week/My Fitness/My Nutrition/My History/Coaching) was truncating to "My We"/"My Fitr"/"My Hist"/"Coachi" and the whole tab bar row was inflating, while the coach `(coach)` tab bar next to it stayed clean. Root cause: the coach tab bar uses React Navigation's own built-in label renderer (`tabBarLabelStyle` in `app/(coach)/_layout.js`), which doesn't scale with Dynamic Type at all — but the member tab bar has a hand-rolled `TabLabel()` helper (`app/(member)/_layout.js`, needed to vary font weight by focus state) that renders a plain `Text` with no scaling protection, so it inherited the global 1.3x cap same as any other text and had no slack in its narrow per-tab column. Tab icons were never the problem — `@expo/vector-icons`' underlying `Icon` component sets `allowFontScaling: false` internally (confirmed by reading `node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/lib/create-icon-set.js`), so icon glyphs never scale with the OS text size regardless of anything in this app. Fixed by pinning `TabLabel`'s `Text` to `maxFontSizeMultiplier={1}` + `numberOfLines={1}`, matching the coach tab bar's effective no-scaling behavior exactly.

**Both fixes confirmed live, end-to-end, on the actual originally-broken screen** — not just bundle-checked. Navigated Coach Home → More → My Training (dual-login staff's path into the member app) and, at forced XXXL: the tab bar rendered all 5 labels in full with no truncation; My Nutrition's Today tab (the exact screen from the original bug report) showed the segmented Today/Weekly/Check-In/Photos control fully readable, "Sleep (hrs)"/"Sleep quality (1-5)" labels intact, and "target: 100" pills sitting cleanly next to Steps/Protein/Carb without overlapping; the Weekly tab's day-by-day table (`WeekDayTable`) rendered its frozen Day column plus Weight/Protein/Carb/Fat headers with no column overflow. Screenshots taken, not just visually eyeballed once.

**Tooling note for next time**: the iOS Simulator control tool's tap coordinate space is genuinely `402x874` points as documented, not screenshot pixels — several taps this session missed their target because a screenshot's rendered pixel position was used directly as the point coordinate instead of being converted (scale factor was roughly ~2.25x). When a tap doesn't land where expected, don't assume the target is unreachable — recompute against a known reference point (e.g. the status bar clock, or a tab bar row that's already confirmed working) before concluding it's a real app or tooling bug. A transient "!"-badge overlay (looked like Expo's LogBox indicator) also sat over the bottom edge for a short window after a fresh launch, unresponsive to taps and blocking the tab bar underneath it — it cleared on its own after some navigation; if a fresh launch's tab bar taps seem to do nothing, check for this before troubleshooting the app.

**Same-day follow-up**: the native "More" tab's row into the member view (`app/(coach)/more.js`) was relabeled from "My Training" to "Member View" per direct ask — subtitle ("Log your own workouts & nutrition") left as-is. Scoped to that one row only; the web sidebar's equivalent link (`components/CoachShell.js`'s "My Training") and the member-side "Coaching" tab back out (`app/(member)/back-to-coaching.js`) were deliberately left unchanged, not asked for.

## Two more real bugs from actual use: superset keyboard coverage, Messages compose (2026-08-07, later same day)

**My Fitness — a focused field could end up hidden behind the keyboard with nothing to bring it into view.** Direct report: logging worked fine normally, but for a superset, "the bottom lift gets in the way" — manual scroll fixed it, but nothing did it automatically. Root cause: `SessionFocusModal.js` (the live logging surface — `app/(member)/plan.js` always passes `layout="focus"`, `SessionLogger`'s older "accordion" layout is unused in production) renders a superset's two `ExerciseCard`s fully expanded and stacked in one `ScrollView`, with no code anywhere scrolling a focused input into view. A single exercise's ~3-set card is usually short enough to already sit above the keyboard by luck; a superset's two full stacked cards often aren't.

Fixed with React Native's own first-party, purpose-built API for exactly this — `ScrollView`'s `scrollResponderScrollNativeHandleToKeyboard(nodeHandle, additionalOffset, preventNegativeScrollOffset)`, whose own doc comment says "This method should be used as the callback to onFocus in a TextInputs' parent view." Confirmed (by reading the actual installed source, not assumption) that `react-native-web` implements the same method with the same signature, so one code path works on both native and the web PWA — *except* the underlying keyboard-position math depends on a real `keyboardWillShow` event, which browsers never fire, so calling it on web would either no-op or scroll to a wrong/stale position. Scoped to `Platform.OS !== "web"` accordingly, rather than risk a bad jump on the PWA. `SessionFocusModal.js` now holds a `scrollViewRef` and threads it to every `ExerciseCard`; `ExerciseCard.js` attaches per-row reps/weight refs (via callback refs, since `rows` is a dynamic-length array — hooks can't be created in a loop) plus one for notes, each calling the scroll-to-keyboard method on `onFocus`.

**Verification hit a real environment wall, documented in case it recurs**: this session had live iOS Simulator access (already-booted iPhone 17 Pro, dev client on a long-running Metro tunnel — confirmed via `ps aux`, not assumed) and used the same unauthenticated-screen-mount trick to render a real superset with fake data (`SessionFocusModal` mounted directly on `login.js`, reverted after) — confirmed the component renders correctly with real 5-set data and that taps genuinely focus fields (a blinking cursor appeared in the Notes field). But the simulator's on-screen keyboard never appeared at all for any focused field, in this session, despite `ConnectHardwareKeyboard` confirmed `0` (disabled) via `defaults read` — ruling out the most common cause. Per this file's own standing "don't hunt simulator taps" guidance, stopped after confirming taps/focus work rather than continuing to chase a keyboard that won't render, and reported the gap honestly instead of claiming full interactive verification. **Also confirms the iOS Simulator's tap coordinate space needs real calibration, not eyeballing**: the tool declares 402×874 points for tap/swipe, but screenshots render inline at yet another size — the only reliable way to convert was pulling a real screenshot via `xcrun simctl io screenshot` (which reports true pixel size, e.g. 1206×2622 — a clean 3x point scale) and reading *that* file directly, whose viewer states its own displayed-vs-original scale factor explicitly. Guessing coordinates off the inline tool-call screenshot alone was wrong more than once before landing on this.

**Coach Messages inbox — new-message compose + search.** Direct ask after the inbox itself shipped: a way to start a conversation with a client who has no message history yet (the inbox only ever lists clients already in `listThreadSummaries()`'s output), plus a search box, plus confirmation the list sorts newest-to-oldest (it already did — `listThreadSummaries()` sorts by `lastMessageAt` descending — no change needed there beyond making sure filtering doesn't reshuffle it). New `NewMessageModal` (inline in `app/(coach)/messages/index.js`) — a "+ New message" button opens a searchable `listMembers()` picker (name/email match); picking someone calls the same `selectThread()` an existing row's tap already uses, so starting fresh vs. continuing a thread is the same code path. A plain search `TextInput` above the conversation list filters the already-sorted `summaries` client-side with a bare `.filter()` (never re-sorts), so search can't reshuffle the newest-first order. Visually verified via the Browser pane (mounted the real page on the unauthenticated login screen, reverted after) — search box, modal open, "No clients match" empty state, and Cancel-closes-modal all confirmed with no console errors; the picker's actual name/email filtering against real client rows wasn't exercised this way (no real member data reachable without login), just the empty-state path — low risk given it's a single-line `.filter()`, but worth a real click-through once Terra can log in.

## My Week / My Fitness rework: deep-link logging, per-exercise checkboxes, a real header-persistence fix (2026-08-08)

Direct ask, in stages across the same day: make My Week the real entry point for logging (see the week, tap what's due, land in My Fitness with that exact session ready to go) instead of a read-only preview; make My Fitness itself feel like a checklist instead of an information page; and several rounds of follow-up polish once each piece was described back and refined. Built without the user being able to click-test live in this environment (standing limitation) — verified via `npx expo export -p web` after every batch (clean throughout) plus a login-screen console-error check; a real click-through is still owed.

**Nutrition strip (My Week)**: every day-bubble is now its own tap target (previously only the tiny header chevron did anything) — tapping a past-or-today bubble deep-links straight to that date on the Nutrition Today tab via a new `date` param (`app/(member)/nutrition/index.js` now reads it via `useLocalSearchParams`, same "applied param ref" re-sync idiom `plan.js`'s own `program` param handling already used, so a second tap while the tab's still mounted still takes). A not-finalized past/today bubble now fills solid red (`statusColors.urgent.text`, `lib/theme.js` — no new color invented) instead of staying a plain hollow outline; future days are untouched and stay non-interactive, since there's nothing to log yet. New `lib/boiseDate.js`'s `daysBetween(dateA, dateB)` backs the offset math.

**My Week session bubbles**: Flagship/BWA bubbles now show a small "TODAY" badge on whichever session actually maps to today's weekday (`row.isToday`/`sessionNumberForDate` was already being computed, just never rendered before this). SPC bubbles get the same badge position/color but no text — just a dot — on whichever session is next incomplete (SPC has no day-of-week mapping, so there's no literal "today"). `components/SessionPreviewModal.js` gained its first-ever footer action: "Log session" / "Update session" (wording follows `completed`), which deep-links into My Fitness with `params: {session: "group"|"spc"|"one_off", groupProgramId, weekNumber, sessionNumber}` (or `oneOffWorkoutId`) — `app/(member)/index.js`'s three preview-openers now capture this into `preview.logParams`.

**My Fitness's `ProgramTabs` pill selector is gone entirely**, replaced by a resolution precedence computed fresh each render: (1) an explicit session param from a My Week deep link always wins, bypassing everything else including weekly-cap gating for that one program — the whole point of "log this specific session" is reaching it even if the member already hit their cap via a different one that week; (2) the older `program` param (My Week's card-header chevrons, "View full block" links) — same "already a made choice" treatment; (3) no param at all (bottom tab bar tap) auto-resolves if exactly one group/SPC candidate is still due, or opens a new `components/ProgramPickerModal.js` bottom sheet if 2+ are tied. **One-offs are strictly opt-in from My Week only** (the Extras card's chevron for the full list, or a specific bubble for just that one) — confirmed directly after an early draft had them appearing unconditionally underneath whichever primary session was showing, which was wrong; they never appear in the no-param auto-resolve/picker flow at all.

**Per-exercise "mark complete" checkbox — genuinely new, persisted state.** New migration `0040_exercise_completions.sql` (**run**, confirmed) mirrors `session_completions`' XOR-of-three + partial-unique-index + hand-rolled-upsert pattern exactly (group keyed by the join-row alone, SPC additionally needs `week_number` since `spc_workout_exercises` rows recur weekly, one-off needs neither) — new `lib/programming/exerciseCompletions.js` for the list/mark/unmark functions, row existence = complete (un-marking deletes the row, same as toggling anything else reversible in this app). Final interaction shape, after a couple of rounds of refinement:
- A single olive `checkmark-circle-outline`/`checkmark-circle` control, bottom-right of the card (not a square + text label, and not paired with a permanent arrow — both tried and rejected in earlier passes).
- **Manual tap** (hollow → checked) marks it complete and — once every exercise in that same focus "page" is checked (a superset's two cards both have to be done, not just the one tapped) — auto-advances to the next card after a ~550ms delay, long enough to actually see the checkmark fill before the view moves.
- **Auto-fill** (every set in the card gets both reps and weight) also turns the checkbox solid on its own, but deliberately does **not** auto-advance — instead a small arrow appears next to it (checkbox slides left to make room) so the member consciously chooses when to move on, since finishing typing the last number isn't necessarily "I'm ready for the next lift." This distinction (`source: "manual" | "auto"`) is why the advance-scheduling and the arrow-visibility are gated separately in `SessionFocusModal.js`'s `handleToggleComplete`.
- Finalizing from the last card also checks off that card's own exercise(s) if they weren't already, so the checkbox state and the whole-session finalize state can't disagree.
- The Finalize button itself simplified: just "✓ Finalized" (green), no more "— tap to update" suffix. If a set's reps/weight/notes are edited *after* finalizing (`ExerciseCard`'s autosave success now fires an `onDataChanged`/`onSessionDataChanged` callback that bubbles up to `plan.js`), the button locally reverts to the normal "Finalize workout" state — this never touches the database's `finalized_at`, it's purely a "this needs re-finalizing" UI nudge.

**Real bug found and fixed: reopening an already-completed session via "Update session" showed none of the member's real data.** `datePerformed` was always `todayInBoise()` regardless of which day a session was actually logged — fine under the old "My Fitness only ever shows today's session" model, but once a specific past session could be deep-linked back open, using today's date meant every autosaved set lookup missed entirely (stored under a different `date_performed`). Fixed in `plan.js`'s group/SPC loaders: `datePerformed` now derives from the session's real `completed_at` (`dateInBoise(new Date(completion.completed_at))`) when it has one, falling back to today only for a not-yet-completed session.

**Real bug found and fixed: an explicit "log Session 2" deep link only worked the first time.** The SPC session-selection effect was guarded by a ref that blocked it from re-firing for an already-seen param value — but `load()` itself unconditionally resets `spc.selectedSessionNumber` back to the program's own default (first incomplete session) on every fresh load, so the guard ended up blocking the *correction* on the second and every subsequent visit, silently falling back to "first unfinalized session" instead of the requested one. The first fix attempt removed the ref and instead re-asserted the explicit target via a `useEffect` keyed on `spc?.status`/`spc?.weekNumber` — **this had its own bug, found and fixed the next day, see below.**

**Real architectural fix: the page header couldn't stay usable while an exercise card was open, and there was no way to style around it.** First attempt duplicated the session-info bar (title/timer/View full block) into the exercise-focus view itself so the timer was reachable without backing out — rejected directly: "I dont want it on the exercise cards... I just want the main header on the tab to be the header... never greyed out, and accessible." The real fix needed abandoning React Native's `<Modal>` for `SessionFocusModal` entirely — a `Modal` always paints in its own native window layer above *literally everything else on screen*, including a sibling header with a higher z-index; there is no styling trick around this, confirmed via `KeyboardDoneButton.js`'s own comment about needing its own copy inside every `Modal` for exactly this reason ("a plain floating overlay can't cross a native Modal's own window boundary"). `SessionFocusModal.js` is now a plain always-mounted `View` (`position:"absolute"`, `StyleSheet.absoluteFillObject`, toggled via `display:"none"` rather than conditional unmounting — same "never cancel ExerciseCard's autosave debounce" reasoning as the existing focusIndex-display-toggling already used) manually wired for Android's hardware back button (`BackHandler`, this app's first use of it) since it no longer gets that for free from `Modal`'s `onRequestClose`. Its local `KeyboardDoneButton` was removed too — no longer needed once it's not a separate native window, the one mounted at the app root now reaches it correctly.

Since a plain `View` positions relative to its own immediate parent (not the whole screen) rather than portal-rendering above everything, the overlay had to actually move — it's rendered directly by `plan.js` now (a `{flex:1, position:"relative"}` sibling of the ScrollView, itself a sibling of the header/info-bar/footer), not nested three components deep inside `SessionLogger`/`FitnessCard`/the ScrollView's own content, which is the only way its `absoluteFillObject` correctly excludes the header instead of covering the whole screen. This meant lifting the whole focus-overlay state out of `SessionLogger` and up to `plan.js`: `SessionLogger` gained an optional `onOpenFocus` prop (backward-compatible — every other caller, e.g. the coach's read-only past-session viewer, keeps the original fully self-contained modal behavior when it's not passed) and is now wrapped in `forwardRef`/`useImperativeHandle` exposing a `refresh()` method, which `plan.js` calls (via a `Map` of refs keyed per-section, registered through each `SessionLogger`'s callback ref) once its own lifted overlay closes, to re-pull that section's summaries/completions the same way `SessionLogger`'s own internal `handleCloseFocus` already did. `plan.js`'s `focusTarget` state is deliberately sticky (never cleared to `null` on close, only replaced by the next open, with a separate `focusVisible` boolean controlling show/hide) for the same debounce-preservation reason.

**Weight calculator**: added a third bar mode, "No bar" (now the default — reordered to No bar / Barbell / Specialty per direct ask), and replaced the old free-typed "Specialty" weight field with a real picker (`SpecialtyBarPicker`, a small bottom sheet) listing coach-configured named bars — "the safety squat bar weighs 65 lb" no longer needs to live in anyone's memory. **No migration needed** — the list is one jsonb array under a new `core.settings` key (`specialty_bars`), the same generic key/value table every other admin toggle in this app already reads/writes via `lib/settings.js`'s `getSetting`/`updateSetting`. New thin wrapper `lib/equipment/specialtyBars.js` (`listSpecialtyBars`/`saveSpecialtyBars`), and a new admin-only **Settings → Equipment** tab (`app/(coach)/settings.js`) to add/remove bars (name + weight, saved immediately per action, no separate Save button — same pattern as the nutrition template question-list editors).

**Not visually verified** — same standing limitation as everything else in this file (no password entry in this environment); bundle-checked clean after every batch (`npx expo export -p web`), plus a login-screen console-error check via the Browser pane. Worth a real click-through covering: tapping a nutrition day-bubble lands on the right date; a My Week "Log session" tap opens My Fitness with that exact session (including a past-completed one showing its real logged data); the checkbox's manual-vs-auto-fill/advance/arrow behavior on both a single exercise and a superset; the Finalize button's green→revert-on-edit behavior; and, most importantly, that the header (back arrow, session title, timer, View full block) is actually still tappable while an exercise card is open — the whole point of the architecture change.

## My Fitness follow-up: the real SPC deep-link bug, warm-up checkboxes, checkbox/arrow spacing (2026-08-08, next day)

Real feedback from the day after the rework above: "which session loads on My Fitness when you select it from My Week... seems like just SPC" reverting to whichever session is due next instead of the one actually tapped.

**Found the real cause — a React effect-dependency staleness bug, not the ref problem the previous fix targeted.** The SPC deep-link override lived in its own `useEffect` keyed on `[params.session, params.weekNumber, params.sessionNumber, spc?.status, spc?.weekNumber]`, re-asserting `selectedSessionNumber` from the params whenever `spc?.status`/`spc?.weekNumber` *changed value*. But `load()` runs on every screen focus (`useFocusEffect`) and *always* recomputes `spc` fresh, resetting `selectedSessionNumber` back to the default (first incomplete session) every time — regardless of whether status/weekNumber actually changed. On the very common repeat-visit case (still mid-week, tapping a session bubble from My Week again — status and weekNumber come out identical to last time), the effect's dependency array saw no change and never re-ran, so the freshly-reset default silently won over the deep link. The *first* visit each session always looked correct (status/weekNumber genuinely changed from their initial `null`), which is exactly why it read as "half-working."

**Fix**: resolve the explicit target directly inside `load()`'s SPC branch, the same way the group branch's `isExplicitTarget` already does it — no second reactive pass to race against. `isExplicitSpcTarget` checks `params.session === "spc" && params.sessionNumber` against the freshly-computed `weekNumber`; if it matches, `defaultSession` resolves to that specific session instead of "first incomplete," and — mirroring the group branch's cap-bypass — the overall `status` stays `"ready"` even if every session in the relevant slice happens to already be complete, so reopening an already-finalized session via "Update session" still lands on it instead of the whole-week "done" card. The standalone `useEffect` is deleted entirely.

**First pass at "exercise cards won't open" didn't find the real bug** — an initial round of testing (mounting `SessionLogger`/`SessionFocusModal` on the login screen, the standing technique for this environment) opened reliably at desktop-width in the web preview, so that pass shipped only a plausible-but-unconfirmed defensive fix (removing a `KeyboardAvoidingView` nested deep in the tree — a real, independently-worth-having fix, kept) and asked Terra to confirm on her real device. **She did: still broken, "completely dead," no reaction at all** — same technique, same bug, still there. Web-preview testing was never going to catch this one; see below.

**Root-caused for real this session using a genuine native simulator build**, not the web preview — this session had real Xcode/simulator access (a booted iPhone 17 Pro Max), so a real `xcodebuild -sdk iphonesimulator` build was compiled, installed, and driven with the iOS Simulator control tool's actual `tap` action (real touch events, not a browser click) against the same login-screen test-harness technique. This is the same class of "web preview isn't native, go get real device/simulator proof" lesson already documented elsewhere in this file (the 2026-08-02 native photo-rendering bug, the 2026-08-07 CoachShell mobile-nav session) — worth remembering as a standing pattern: when a report is native-only and web keeps passing, stop trusting web.

**What the real device logs proved, step by step:**
1. A real tap on an exercise row produced *zero* visible change — but `xcrun simctl spawn ... log show` (filtered to the app process) showed 4 new `getLoggedSetsForDate` promise rejections appear immediately after the tap, exactly matching what 4 freshly-mounted `ExerciseCard`s (one per exercise in the fake 4-exercise/1-superset test data) would fire on their own `loadOnFirstExpand` effect. **The overlay was genuinely mounting and doing real work — it just never painted.** Not a touch-registration problem, not a state-logic problem — a pure rendering/paint problem, confirmed by the side effects it caused while remaining invisible.
2. Forcing `focusVisible: true` from the very first render (no toggle, no tap involved at all) still rendered nothing — ruling out "toggling `display` doesn't trigger a repaint" as the cause.
3. A trivial always-visible `position:"absolute"` red box in the exact same slot rendered perfectly. So did a hand-built copy of the real backdrop-Pressable + sheet-Pressable + header row + `ScrollView` + a real `ExerciseCard` — every individual piece worked standalone.
4. Bisecting by swapping one thing at a time between the working reconstruction and the real component's actual style object found it: **`style={[StyleSheet.absoluteFillObject, {...}]}` — `StyleSheet.absoluteFillObject` specifically, merged inside a style array — renders the `View` completely invisible on this app's Fabric/New Architecture build.** A hand-written equivalent object (`{position:"absolute", top:0, left:0, right:0, bottom:0}`) in the exact same array position, same other properties, renders correctly every time. Confirmed by flipping only that one value back and forth against an otherwise-identical component tree, multiple times, on a fresh app relaunch each time (not Fast Refresh state) to rule out a stale-reload artifact.

**Fix**: `SessionFocusModal.js`'s outer overlay `View` no longer imports or uses `StyleSheet.absoluteFillObject` at all — it's a single flat style object with `position`/`top`/`left`/`right`/`bottom` spelled out directly, plus explicit `zIndex`/`elevation` (kept as cheap insurance, not confirmed independently necessary) and `pointerEvents` moved into the style object per the "props.pointerEvents is deprecated" warning this was already throwing. **Grepped the rest of the codebase for the same pattern — this was the only usage of `StyleSheet.absoluteFillObject` anywhere in `app/`/`components/`/`lib/`**, so nothing else needed the same fix. Worth remembering as a real, reproducible RN gotcha if it ever comes up again elsewhere: `StyleSheet.absoluteFillObject` inside a style *array* is not safe to assume equivalent to writing the same four properties by hand on this app's RN/Fabric version — write them out directly instead.

**Two direct feature asks from the same feedback round**:
- **Warm-up checkboxes** — `WarmupCard` (`plan.js`) now renders the same olive `checkmark-circle-outline`/`checkmark-circle` control on the right of each warm-up row. Deliberately **local-only, non-persisted state** ("nothing fancy... placekeeping for the girls as they do their sessions") — no `exercise_completions` row, no migration, resets on reload. Warm-ups have no existing per-item completion concept and didn't need one; this is a live-session aid, not tracked data. Confirmed visible by Terra; tappability not independently re-confirmed after the fact but uses the same `Pressable`/`hitSlop` shape as every other working checkbox in the app.
- **Checkbox/arrow spacing on `ExerciseCard`** — went through two rounds. First attempt anchored both to the right edge but put the arrow *before* the checkbox in DOM order (arrow closer to center, checkbox pinned rightmost) — wrong per direct correction: "when the arrow becomes available, I want it to take the place of the checkbox, and the checkbox to slide just enough to the left." Fixed by swapping the order — checkbox first, arrow second, both still `justify-content: flex-end` — so the arrow now takes the rightmost spot the checkbox used to occupy, and the checkbox scoots left just far enough to make room, left-to-right reading as checkbox-then-arrow.

**Verification, for real this time, not just "should work":**
- **SPC deep-link fix**: confirmed working directly by Terra on her real device — "the spc card change to the my fitness tab, works as intended now."
- **Warm-up checkboxes**: confirmed visible by Terra on her real device.
- **Exercise-card-open fix**: confirmed by this session's own real native simulator tap-through (screenshots showing the sheet opening correctly with real set-input fields, header, checkmark), not just reasoning — but Terra herself hasn't re-tested the actual shipped fix on her physical device yet, worth a direct follow-up confirmation.
- **Checkbox/arrow reorder**: bundle-checked only (`npx expo export -p web`, clean) — not yet visually re-confirmed after the second correction.

**Same-day follow-up, once the above landed**: "ya looks good!" on everything above, plus one more mismatch spotted — the My Fitness overview's per-exercise index rows (`GroupIndexRow` in `SessionLogger.js`) used square `checkbox`/`square-outline` icons at size 17 with a two-tone color (olive when checked, muted gray when not), while `WarmupCard`'s warm-up rows right above them used circle `checkmark-circle-outline`/`checkmark-circle` icons at size 24, always olive regardless of state — two visually distinct controls for what reads as the same "mark this off" action on the same screen. `GroupIndexRow` now uses the identical icon pair/size/color as `WarmupCard`'s checkboxes (circle, 24px, `#4d6142` always) so every checkbox on the My Fitness overview looks the same regardless of whether it's a warm-up or a real exercise. Bundle-checked clean (`npx expo export -p web`); not yet visually re-confirmed by Terra.

## UX overhaul — "no one should have to think" (2026-08-09)

Executed the approved 5-phase plan (`/Users/Dustin/.claude/plans/how-about-the-ui-zany-rabbit.md` — read it for full context; it encodes several direct decisions from Terra, including the big one: **Kova is an in-person gym, so lift tracking beats TrueCoach-style remote comments** — session comments, member→staff message push, and the coach unread badge were explicitly cut). Five commits, one per phase, each bundle-checked clean. Highlights per phase:

- **Phase 0 (bugs)**: member onboarding questionnaire submit was genuinely broken (missing userId arg); reopened-check-in photo gate mismatch fixed server-side (counts from the reopened week, not a today-relative window); `NewTargetForm` prefills from the current target (blank macro no longer saves 0); "Copy questions from template" removed from the check-in header per Terra; dead weight-target pill dropped; **migration `0047_member_settings_read_and_group_rest.sql` (run + verified)** — member-read RLS policy on `core.settings` whitelisted to the messaging keys (the kill switch was invisible to members and defaulted ON — the bubble showed for members with messaging off gym-wide) + `group_workout_exercises.rest`.
- **Phase 1 (lift tracking)**: "Last time" per-set pills show automatically on every open card (device-wide pref, `lib/lastTimePref.js`); per-lift progress chart + best-set line (`components/LiftProgress.js`; `TrendChart` moved to `components/` with a re-export shim); coach cues finally fetched by member queries (were authored into a void) + labeled Coach note/Cues lines on `ExerciseCard`; tempo/rest on the target line and rest input in the group web builder; "Sessions completed this week" dashboard tile → drill-down feed (`components/ActivityFeed.js`, `listSessionsSinceAllUsers` in `coachLogs.js`) — **no push per workout, Terra's explicit call**; SPC client page got the `RecentSessionsCard` results view; missed-session flags now reach the dashboard as one aggregated attention row + native clients list renders `flagCount` and honors `?filter=flagged`; bulk publish on both grids (`setWorkoutStatusBulk`/`setSpcWorkoutStatusBulk`, count-stating confirm); group "copy latest block" choice on `NewBlockModal` (`copyLastGroupBlockContent`); prev/next session arrows in both web builders; finalize toasts on workout/nutrition-day/check-in.
- **Phase 2 (member fitness)**: nutrition-only members no longer told "not assigned to a program" (both My Week and My Fitness — the latter offers a Go to My Nutrition button); `components/RestTimer.js` countdown presets on every logging card; Extras sessions get the `SessionInfoBar` header + timer; retroactive logging date is a real picker (web `<select>`/`NativePickerField`, last 30 days); pressed-state opacity on the main logging touchables; unpublished bubbles toast instead of dead-tapping. **Deliberately skipped**: restyling warm-up checkboxes — Terra explicitly asked earlier for them to match the exercise checkboxes.
- **Phase 3 (nutrition)**: onboarding renders directly on the Nutrition tab once sent (interstitial + back-loop gone; approved members redirect to the real tab); **push deep-linking** — `lib/notifications/PushDeepLink.js` (native tap→route via `data.url`/legacy `type`) + `url` added to all three nutrition senders so web `sw.js` opens the right screen; check-in due dot (SegmentedControl `badges` prop) + green affirmed submitted state + Zoom-scheduler re-entry + skip-photos on the task row; olive Finalize Day + live on-track tint on macro fields (`TargetField liveCompare` — olive only, never red, since a daily log is cumulative); Photos tab shows due-status/missing angles/last-upload dates; Weekly shows this-week-vs-target and defines adherence; coach roster filter in the URL + zero tiles hidden; Check-In tab consolidates the whole review (live Focus/GamePlan + the stored `focus_snapshot`/`targets_snapshot` — written since day one, never rendered); week-paging spinner; target form gains Starts-today/next-Monday + actual averages; **coach pushes on check-in submitted / onboarding ready-for-review** via `send-push`'s new `notifyCoachOfClient` branch (target resolved server-side from `public.clients.coach_id`; a member can only reach their own coach). Redeployed: `send-push`, `scan-nutrition-reminders`, `scan-nutrition-checkin-available` (verify_jwt flags confirmed preserved).
- **Phase 4 (consistency)**: missing confirms added (template/per-client question deletes, specialty-bar remove, tracking-date unassign, payroll finalization reopen, own-request cancel) and the wrong-entity dialog on payroll's nutrition unassign fixed ("Remove this question?" about a person); destructive red standardized on `#b23a22` (WeekList's data-coloring red deliberately untouched); dead-end empty states made instructive; `← Back` outlier fixed; "Finalize" is the one check-in verb; member pages retitled to match their links ("{Program} Block"/"SPC Block"); SPC glossed on My Week ("Your individual strength program"); member tab-header parity — gear icon on all four tabs, My Fitness's root-tab back-chevron-to-another-tab removed and its title matched to the other tabs, My History's stray Sign out removed (Settings owns it). **Modal convention clarified, not blanket-migrated**: `components/BottomSheet.js` is the extracted house sheet, and the two content-heavy centered holdouts (check-in photo/form popups, Zoom scheduler) migrated to it — but `CalorieOverrideModal` is centered **per Terra's explicit ask** (its own header comment says so), so the standing rule is: member content modals = bottom sheet; small dialogs (CalorieOverride, MilestoneCongrats, SkipReason, option pickers) = centered; coach desktop-web dialogs = centered cards. Don't "fix" the centered ones.

**Not done from the audit, deliberately** (noted for a future pass, don't treat as forgotten): the remaining ~20 coach-web centered-card modals (now convention-compliant per the rule above); back affordances on the three member nutrition sub-screens (the segmented control is the navigation there); "‹ Back to X" label-wording variants; per-set "Check-in" casing normalization beyond the verb fix.

**Not visually verified** — standing login limitation; every phase bundle-checked (`npx expo export -p web`, clean) and the lift-progress chart screenshot-verified via the login-mount technique. Each phase's commit message ends with a Terra click-through list.

**Same-day follow-ups from Terra's own click-through** (commits `f228dc1` + `cbdef27`, pushed):
- **Objective tracking is optional per client.** Zero assigned tracking days = the phase is deliberately skipped: it auto-counts as complete in both `getOnboardingStatus` and the batched `getOnboardingPhasesForClients` (`lib/nutrition/onboarding.js`), the member's onboarding hub hides the task entirely, and the coach's phase cards read "Skipped — no days assigned (optional)". A client can reach ready-for-review with just Questionnaire + Photos.
- **My Fitness tab hidden for nutrition-only members** — new `lib/programming/useFitnessAccess.js`'s `useHasFitness()` (no group membership, no active SPC, no open one-off → `href: null` in `app/(member)/_layout.js`). Deliberately defaults **visible** while loading and on error — the opposite default from the nutrition tab's gating, since most members train and a network blip must never hide a tab someone genuinely has.
- **My Week during nutrition onboarding**: shows a normal-looking Nutrition program card with a single terracotta "Onboarding" button where the 7 day bubbles will eventually be (→ the onboarding hub). Went through two iterations same-day: a first version showed the assigned tracking days as check-off circles plus a "No training program yet — your plan lives on My Nutrition" message — **both explicitly rejected** ("makes it feel like they are missing something. and I dont want that"). The standing rule: for a nutrition-only member, My Week must read as fully *active*, with zero missing-something copy; the "not assigned to a program yet" text only ever shows for a member with literally nothing.
- **Messaging settings follow the module's audience scope.** Member Settings' two messaging references (the "Coach messages" notification toggle, the "Show message bubble" card) hide via the same audience-aware `isMessagingEnabledForUser()` the bubble/header-icon/route already use — so messaging scoped to e.g. nutrition-only means a fitness-only client sees no bubble, no chat icon, *and* no messaging settings.

## PWA rendering fixes: field alignment, iOS autofill, clipped tab labels (2026-08-09)

Three reports from Terra's own use of the installed PWA on a coach login. All three are RNW/react-navigation mechanics worth remembering — none needed a schema or deploy change.

- **Nutrition daily-log fields not lining up (her third report of this — earlier passes fixed the wrong thing).** The cause was never the target pills. `components/nutrition/RatingSelect.js` rendered its `1 = low · 5 = high` scale anchor **between** its label and its control, so in a shared `flex-row` its box sat ~18px lower than every `TargetField` beside it (Sleep/Sleep quality; Steps/Hunger/Energy). Its own header comment even claimed it lined up — that was a previous fix reasoning about the pills instead of measuring. Fixed by moving the caption **below** the control, into the same slot `TargetField`'s target pill uses, and giving both a shared exported `FIELD_MIN_HEIGHT` (50, `TargetField`'s existing natural height) — a web `<select>` sized by its own padding and a `TextInput` sized by padding + font metrics will never land on the same number by coincidence, which is why matching padding alone kept not working. Verified by measuring every input's real `getBoundingClientRect()` in the browser (identical top *and* height per row), not by eyeballing a screenshot.
- **"Weird blue boxes" over the macro fields = iOS Safari's AutoFill Contact highlight.** Root cause is one line in react-native-web's `TextInput`: `supportedProps.autoComplete = autoComplete || autoCompleteType || 'on'` — **omitting the prop renders a real `autocomplete="on"`, an explicit opt-IN to autofill**, not a neutral default. That's what put "AutoFill Contact" in the keyboard accessory bar and painted the blue autofill-target rectangles; they looked *offset* from the real inputs because Safari draws them in layout-viewport coordinates while the open keyboard has shifted the visual viewport. Fixed app-wide with new `babel/noAutofillPlugin.js` (injects `autoComplete="off"` into any `<TextInput>` that doesn't set one — same opt-out convention as `babel/maxFontSizeMultiplierPlugin.js`, registered alongside it in `babel.config.js`). The fields that genuinely *should* autofill declare real values so password managers keep working: login email/password (already had them), `register.js`'s code (`one-time-code`) and password, `set-password.js`, and `(member)/settings.js`'s dual-purpose field. Confirmed in the shipped bundle: 102 inputs carry `autocomplete="off"` with the auth values intact.
- **Tab bar labels sliced through — a layout-math problem, not the safe-area padding.** react-navigation gives each bottom-tab item a fixed 49pt box (`TABBAR_HEIGHT_UIKIT`), spends 5pt padding top and bottom plus a 28pt icon wrapper (`ICON_SIZE_TALL`), and leaves exactly **11pt** for the label. `app/(member)/_layout.js`'s hand-rolled `TabLabel` renders Montserrat at `fontSize: 11`, whose natural line box is ~13.4pt — so the bottom of every label was cut off. The coach tab bar never showed this because it uses react-navigation's own `Label` at `fontSize: 10` in the system font (~11.7pt), just barely inside. Fixed from both ends: `tabBarIconStyle: { height: 24 }` (applied last over `wrapperUikit`, and the glyph is only 21pt so it just re-centres — nothing visibly changes) widens the label slot to 15pt, and the label gets an explicit `lineHeight: 14` instead of relying on font metrics. **Reproduced side by side in the browser before fixing** (old box vs new box, same 49pt/5pt/icon geometry) rather than reasoning from the screenshot alone — worth doing again for any "text is cut off" report, since the fix is only obvious once you can see the two next to each other.

Everything above is verified by direct browser measurement/render plus a clean `npx expo export -p web`. Not click-tested in the real PWA — standing login limitation.

## Member mobile v5 design pass — all 12 screens (2026-08-10)

A full handoff (`design_handoff_member_mobile_v5/` — README + `Kova Member
Mobile - Directions.dc.html` + per-screen screenshots) drove a visual and
interaction pass across the **entire member-facing mobile app**: My Week, My
Fitness (overview + logger), all four My Nutrition tabs, both My History
views, Settings, and every empty/edge state. Coach web untouched. Same "the
HTML is a reference, never copied in" rule as every prior handoff.

**The single most important thing to carry forward — a real NativeWind bug
that invalidates "bundle-checked clean" for a whole class of change:**
NativeWind v4.2.6's `cssInterop` **drops a `Pressable`'s `style` prop
entirely on native whenever it's passed as a function**. Confirmed on a real
simulator build with a four-way A/B: a plain object style renders; the
function form renders completely unstyled — with or without a `className`
alongside it, and whether the function returns an object or an array. On
react-native-web it works fine either way, which is exactly why it survived
several clean web verifications. Symptoms it produced: a cream CTA button
vanishing into a dark hero (dark text on dark, button had no background),
session stripes collapsing to their caption width (`flex: 1` lost), selected
day chips turning into white text on nothing, rating squares losing all
backgrounds and borders. **Use `components/PressFade.js` instead** — it
tracks `pressed` via `onPressIn`/`onPressOut` and always hands `Pressable` a
plain object. All 15 call sites app-wide were converted; **5 of them were
pre-existing**, meaning the My Fitness Finalize buttons (`SessionLogger`,
`SessionFocusModal`, `plan.js`) and the superset index rows had been
rendering unstyled on native the whole time. There are now zero
function-style Pressables in the codebase; keep it that way.

Second RNW footgun found the same pass: `flex: 0` compiles to `flex: 0 1 0%`,
whose 0% basis collapses an explicit width to nothing, and an `<input>`
won't shrink below its intrinsic content width without an explicit
`minWidth: 0` (that one pushed the sleep tile's "hrs" unit clean off-screen).

**House rules established by this handoff** (apply to any new member screen):
dashed = not logged / solid = logged, everywhere; progress rings replace
count pills, olive **only** when the target is met and clay while in
progress; nutrition adherence measures against days *elapsed*, not 7; `|` as
a separator, never an em-dash; empty values render as `–`; olive means good,
never a neutral count; every tap target ≥44pt; nothing on any screen tells a
member she's missing a product she isn't enrolled in.

**New shared components**: `PressFade.js`, `ProgressRing.js` (react-native-svg,
since RN has no conic-gradient), `SessionHeroBar.js`, `nutrition/MacroDial.js`,
`nutrition/StatTile.js`, `nutrition/RatingSquares.js` (deliberately *not* a
rewrite of `RatingSelect`, which still has to height-match `TargetField`
inside the coach's forms). New `lib/keyboardAccessory.js` is a tiny
module-level store letting a focused field contribute an action to
`KeyboardDoneButton`'s floating bar — that's how the plate calculator is
scoped to weight fields in a live session and never appears on nutrition.
Registration is keyed by token because focusing a sibling input fires the new
field's `onFocus` before the old one's `onBlur`.

**Deleted after verifying zero references**: `components/RestTimer.js`
(superseded by ExerciseCard's `RestButton`), `components/SessionInfoBar.js`
(superseded by `SessionHeroBar`), `listLoggedExercises` in `memberPlan.js`
(superseded by `getExerciseStats`).

**New data work, no schema change** — everything derives from
`programming.logs`:
- `listLastLoggedSessions(userId, exerciseIds, today)` (`memberPlan.js`) —
  batched last-time top set per exercise, for My Fitness's overview rows.
  The per-exercise `getLastLoggedSession` still exists for the logger's own
  full last-session panel.
- `lib/programming/exerciseStats.js`'s `getExerciseStats()` — one query
  reduced into per-exercise session series, yielding best, trend, biggest
  jump and PRs. **PR rule, locked by the handoff**: an exercise needs 3
  logged sessions before it's PR-eligible, then any increase counts — no
  margin threshold, no rate limiting, and deliberately no PR counter tile
  (early on everything would be a PR). Nothing is stored, so there's no
  "best" column that can drift out of sync with the sets themselves.

**Logger interaction model (1d), worth understanding before touching it**:
set rows are logged / current / upcoming, driven by a `loggedCount` state
that the "Log set n" button advances. That is deliberately **separate** from
whether the fields have values — carry-over prefills the next set *before*
it's been done, so "has numbers in it" can't stand in for "completed".
**Persistence is unchanged**: every keystroke still autosaves exactly as
before, so nothing depends on a member remembering to press Log set; it's
purely a progression control. Reopening a session restores the position from
leading fully-filled sets. Per-exercise checkboxes and their auto-advance are
untouched and coexist — they operate on a different granularity (whole
exercise vs. one set).

**Deliberate deviations from the handoff, all with reasons:**
- **No session tabs for group programs.** Which session a member can log is
  decided by the weekday (`sessionNumberForDate`), so a tab row would offer a
  switch that isn't real. SPC gets tabs because SPC genuinely has no
  day-of-week routing; My Week's stripes remain the way into another day.
- **Per-session titles are gone from My Week's stripes** (the design replaces
  the titled bubbles with thin day-captioned stripes; the hero carries
  today's name). This reverses an earlier explicit ask to put those titles
  back — Terra said "fine for now", so it's still open.
- **Kept two things the mock drops**, because removing them loses real
  function: the coach's Focus/Game-plan/milestone slider above the macro
  card, and a quiet calories line under the dials (the Cronometer override
  modal has no other entry point).
- Member Weekly's old `WeekList`/`WeekDayTable` are no longer imported, but
  the components are untouched and still power the **coach's** Weeks tab.

**Verification status, honestly mixed** — My Week, the fitness overview, the
logger (tapped through: stepper → Log set → carry-over) and History By Day
were driven on a real iOS simulator build. Nutrition Today, Weekly, Check-In,
Photos and Settings are bundle-checked plus visually verified at mobile width
in the browser, but have **not** been through native. This pass proved twice
that a clean `expo export` and a clean web render can both hide a native-only
bug. Also worth remembering: a missing helper left `doneGroupCount` undefined
and `expo export` still reported clean — Metro doesn't resolve identifiers,
so "bundle clean" is weaker evidence than it looks.

**Still open**: the coach-side rest field should store integer seconds (the
handoff calls it a separate ticket; the logger's `parseRestSeconds` stays
forgiving about `0:20`/`90`/`90s` until then).

## Safari's blue boxes: it was the focus ring all along (2026-08-10)

Took four attempts because the first three chased AutoFill. The decisive
data point came from Terra testing on **desktop Safari** — identical blue
box, no keyboard, no AutoFill bar in sight — which ruled out every
iOS/AutoFill theory at once. The blue rounded box on a focused field is
**Safari's UA focus ring**, and the reason the very first fix didn't kill
it is a CSS trap worth remembering: the removal rule was written
`input:focus:not(:focus-visible) { outline: none }` (guard intended to
keep the ring for keyboard tabbing), but **per the spec's :focus-visible
heuristic, a text field matches `:focus-visible` whenever it's focused —
clicked, tapped, or tabbed, modality never matters for text-entry
elements** (confirmed empirically against the real export: a real click on
a text input reports `matches(':focus-visible') === true`; Chromium and
Safari both implement this). So `:focus:not(:focus-visible)` is dead code
for exactly the elements it targets. Fixed in `app/+html.js`: input/
textarea drop the outline **unconditionally** (every text field in this
app has its own border/caret, so keyboard users still see where they are);
**A follow-up sweep for the same bug then caught `<select>`**: a real
mouse click on a select reports `:focus-visible === true` as well
(measured in the browser, contradicting the first version of this note),
so the same guarded rule was dead code there too and every coach-side
dropdown — ~12 files: SPC coach picker, announcements audience/date/time,
nutrition roster filters, clients list filters, settings,
ExerciseFormModal, PayrollOtherRow, RatingSelect, SessionDetailModal,
photo-compare — kept the browser's ring. Now input/textarea/select all
drop the UA outline unconditionally, and select (no caret, so it genuinely
needs an indicator) gets an explicit `2px solid #a46a57` on
`:focus-visible`. The rule of thumb this leaves: **never write
`:focus:not(:focus-visible)` as a "keyboard-only" guard** — for anything a
user can click into it resolves to nothing. Style focus positively
instead, so the fallback is your own design rather than the UA's.

Verified in the same sweep and NOT a problem: focusable `<div tabindex>`
elements (every RNW `Pressable`) report `:focus-visible === false` on
click and draw no ring, and `textarea` / `input type="date"` are already
covered by the unconditional rule.

What the three failed rounds still established, kept for the record: (1)
the "AutoFill Contact" item on the iOS keyboard bar is an OS-level
affordance on arbitrary fields (Apple documents it as intended behavior) —
that part genuinely has no page-level off switch, only the device's
Settings → Safari → AutoFill → "Use Contact Info" toggle; (2) **never
generate a dashed `name` attribute on an input** — a dash makes Safari
classify the field as a phone number and show the contacts dropdown while
ignoring `autocomplete="off"` (this bit for real: the first suppression
shim generated `kova-search-1`); (3) `lib/webAutofillSuppression.js`
(type="search" + dash-free name) stays — it suppresses contact QuickType
suggestions, just not the focus ring it was mistakenly aimed at.

## Member lift tracking v1 — one scrolling session, app-level rest timer (2026-08-12)

A handoff scoped to one surface (`design_handoff_member_lift_v1/` — README +
`Kova Member Mobile - Directions.dc.html` turn 9 + five screenshots) rebuilds
the member's session-logging page. Direction **9a** (cards) was the
recommendation and is what's built; 9b (hairline list, no card chrome) was
reference only. **No schema change, no migration, no deploy step** — this is
all client-side.

**The overlay is gone.** `SessionFocusModal.js` is deleted: taking over the
screen one lift at a time meant looking ahead cost you your logging spot.
`SessionLogger`'s "focus" layout (the compact index rows + overlay) is gone
with it — `GroupIndexRow` too. Everything is one scrolling page of lift
cards, every lift **expanded on load**, only the warm-up starting closed.

**What else went away, and why** (all from the handoff's own table): the
per-set **Log set** button (read as a required extra step when autosave had
already persisted everything), the ± **steppers** (people believed they had
to use them instead of typing), the session **stopwatch** in the header
(unused, and it competed with rest — `components/TimerControl.js` deleted),
the red `PILL_BG`/`PILL_TEXT` **"Last time" band** (read as a warning), the
notes **placeholder** copy, the **History** and **Video** pills, the **✓** on
both Finalize buttons (fitness *and* nutrition — "Workout finalized" / "Day
finalized"), and the per-card **Show/Hide last time** toggle
(`lib/lastTimePref.js` deleted; last time always shows).

**A set is logged when reps AND weight both hold a value** — that's the olive
fill (`#f3f6ef` / `#dbe8cf`), derived from the values themselves. The v5
`loggedCount` progression is gone, and **so is carry-over prefill**: an
un-logged box now shows last time's matching set number as a grey ghost
*placeholder* (`#c9c4bd`) instead of pre-filling it. That's what the handoff
draws, and it's honest — nothing is written until it's typed — but it does
cost the "a straight 3×10 @ 65 is three taps" speed v5 had. Flag if Terra
wants that back; the ghost is already the right value to accept from.

**Auto-check does NOT auto-collapse, deliberately.** The checkbox still fills
itself in the moment every set holds both numbers (that's a real persisted
`exercise_completions` row and predates this pass). Collapsing on it would be
wrong: "fully filled" flips true after the **first digit** of a three-digit
weight, so the card would close mid-number. Only a manual tap collapses (to
one `Logged 3 × 8 @ 185` line); tapping again reopens. The expanded card
therefore keeps a chevron the mockup doesn't draw — without it, an
auto-checked lift could only be collapsed by unchecking it first.

**The rest timer moved above the tab navigator** — the one piece with real
architectural weight. New `lib/restTimer.js` (`RestTimerProvider` /
`useRestTimer` / `parseRestSeconds` / `formatSeconds`) + new
`components/RestTimerBar.js`, mounted in `app/(member)/_layout.js`. It never
auto-starts; once running it pins to the top (dark `#33251f`, remaining time,
`REST · {LIFT}`, filling ochre progress bar, Cancel), survives leaving the
card/session/tab, then turns olive `#4d6142` with "Rest done · {lift} · set
n" and clears itself after ~6s. The old `RestButton` was local state inside
`ExerciseCard`, so it died on unmount — which is exactly what this replaces.
Three things worth knowing:
- **The 250ms tick lives in the bar, not the provider.** A provider
  re-render re-renders every member screen under it; My Nutrition has no
  business repainting four times a second because someone is resting.
- **The bar is in normal flow above `<Tabs>`, not an overlay** (the handoff
  pushes content down rather than covering headers), so while it's up it owns
  the top safe-area inset — and every screen underneath would otherwise add
  that inset a second time. `MemberTabs` overrides
  `SafeAreaInsetsContext` to `top: 0` for the tab subtree while the bar
  shows. That's the one place it can be said once instead of in every member
  screen; if a screen ever renders with a dead ~60px gap under the bar, this
  is why.
- **"Back to lift ›" navigates, it does not scroll.** Each `SessionLogger`
  gets a `restReturnTo` built from the same deep-link params My Week already
  uses (`session`/`groupProgramId`/`weekNumber`/`sessionNumber`, or
  `oneOffWorkoutId`), so `load()` re-resolves that exact session. Scrolling to
  the specific card was deliberately skipped — it needs `measureLayout`
  against the ScrollView's inner node through four levels of nesting, and in
  the common case the member never left the page anyway.

**`SessionHeroBar` is a light header now, not the dark hero.** This reverses
v5's deliberate "promote it to match My Week" call — with the stopwatch gone
the dark block had nothing left on its right side, and the handoff draws it
light (eyebrow, session name in brand terracotta, `Full block ›`). The dark
hero stays My Week's alone. **Deviation worth confirming with Terra**: the
mockup shows no "My Fitness" title row at all, but that row is the tab's only
Settings entry point (UX-overhaul Phase 4's tab-header parity decision) — so
rather than stack two headers, the gear moved *into* the session header and
the plain "My Fitness" row now only renders when there's no session to log
(rest day, week done, nothing published).

**Two layouts remain in `SessionLogger`, and they now differ only in how
expansion starts**: `"session"` (all open, completions live, collapse on
manual tick) and `"accordion"` (all closed, single-open, no checkboxes) —
the latter is My History's `SessionDetailModal`, where an all-expanded
default would fire `onExpandExercise` immediately and lock the "when did you
do this?" date before anyone typed anything.

**Efficiency, not just paint**: per-card `getLastLoggedSession` (one query per
lift) is replaced by `SessionLogger`'s single batched `listLastLoggedSessions`,
which now returns `{ date, sets, topSet }` — `sets` is new, and it's what
feeds every ghost value. `ExerciseCard` also gained a real `+` at the end of
the last set row (a member can add sets past what the coach programmed), and
reload sizes the card to `max(targetSets, highest logged set_number)` so
those extra sets come back.

**Verified for real, not just bundle-checked**: `npx expo export -p web`
clean, and the whole card was driven at mobile width via the standing
login-screen harness (mounted, screenshotted, reverted — `git diff` on
`login.js` confirmed clean afterwards). Confirmed by real interaction: typing
two sets flips them olive and moves the terracotta "current" border + plate
calculator onto set 3; ticking the checkbox collapses to `Logged 2 × 10 @
145`; the pinned bar counts down with a correct progress fill and turns olive
"Rest done" on expiry, then clears itself. **Not verified**: any of it behind
a real login (standing limitation), and none of it on native — this pass
touches `Pressable`/absolute-positioning-adjacent layout, which this file has
been burned by twice (NativeWind's function-style `style` drop,
`StyleSheet.absoluteFillObject` in a style array). Worth a device pass,
especially the safe-area override while the bar is up and the keyboard
scrolling now that the page's own ScrollView — not the deleted overlay's — is
what a focused field scrolls inside.

**Follow-up, same session — everything Terra flagged clicking through it,
several of them outside this handoff's own scope:**
- **The Kova mark is back on My Fitness and My History.** My Week and My
  Nutrition both carried the 34px round logo at the right end of the header
  row; the other two tabs never had it. Added to both — on My Fitness it lives
  in `SessionHeroBar`, so it shows on the session header *and* on the plain
  "My Fitness" fallback header.
- **My Week's "today" marker is back**, dropped when v5 replaced the session
  bubbles with stripes (`row.isToday` was still being computed and simply not
  rendered). Two signals rather than one: a small `TODAY` label above the
  stripe, and today's stripe at full clay instead of the 31%-opacity upcoming
  tint. **The label's row renders empty on every other stripe on purpose** —
  sibling columns stretch to equal height, so omitting it would push their
  stripes and captions to a different vertical position, which is exactly the
  alignment bug the old session bubbles hit.
- **Real bug: leaving My Fitness and coming back re-expanded every lift**,
  including ones already ticked off. The checkbox was never the problem — it
  writes a real `programming.exercise_completions` row (0040) and that row was
  there the whole time. `load()` runs on every focus and flips the page to its
  loading state, which genuinely **unmounts** the whole subtree, so expansion
  state can't survive on its own and the new "everything starts open" seed
  reopened the lot. `SessionLogger`'s completions fetch now re-applies it:
  first load for a given exercise set collapses whatever's already complete
  (keyed by the exercise-id string, so switching SPC sessions re-seeds but a
  plain refetch can't stomp expansions made by hand since). `ExerciseCard`
  also now loads today's logged sets when it mounts collapsed-because-ticked,
  or its one-line summary would fall back to the coach's prescription instead
  of reading `Logged 3 × 8 @ 185`.
- **The rest presets fan out as circles along the timer button's own
  circumference** instead of a rectangular strip floating above it (which read
  as a menu bolted onto a round control). Same diameter as the button they
  fan off, so they read as siblings of it rather than a smaller menu hanging
  off it. Arc runs up-and-left — the only free space, since the button sits
  bottom-right (`PRESET_ANGLES = [110, 155, 200]`, `radius = size + 24`).
  **The last set row's "+" is hidden (opacity + pointerEvents, never
  unmounted, so nothing shifts under a finger) while the fan is open** — that
  is what lets the arc sit this close to the button and still start
  near-vertical. Without it the geometry doesn't work: three same-size bubbles
  only fit in the ~100° of free space at a wide angular spread, and at a
  radius tight enough to read as attached to the button, the top one lands on
  the "+". Two earlier attempts got this wrong in opposite directions — one
  put a preset straight on top of the "+", the next cleared it by pushing the
  whole fan 46px out, which read as floating away. Measured in the browser
  rather than eyeballed: 38px bubbles, 24px off the button, ~9.5px between
  adjacent edges, each hit-testing to its own control, and the "+" restored
  the moment a preset is picked.
- **Real bug: the program picker forgot your choice on every tab return.** A
  member with both a group program and SPC picks one from the picker, goes to
  My Week, comes back, and gets asked again. `pickedFocus` is deliberately
  tied to the params it was chosen under (so a fresh My Week deep link
  supersedes it rather than being silently overridden by an older pick) — but
  **pressing the My Fitness tab in the tab bar arrives with no params at
  all**, which changed the signature and threw the pick away. An absence of
  params isn't a fresh choice; `hasNavParams` now gates that invalidation, so
  only a navigation that actually names a session supersedes a pick.
- **Unrelated, reported mid-session: `exercises/merge` was leaking as
  its own tab in the native coach view.** `app/(coach)/exercises/` had no
  `_layout.js`, so Expo Router flattened both routes into the parent Tabs
  navigator and only `exercises` itself was declared — the same bug
  `blocks/_layout.js` and `payroll/_layout.js` already exist to prevent. Fixed
  with a `Stack` layout for the folder rather than a one-off `href: null`, so
  the next route added in there can't repeat it. Audited every other coach and
  member folder for the same shape: this was the only one.


## Member auth v1 design pass — clay screens + the ray-traced coin (2026-08-13)

A design handoff (`design_handoff_member_auth_v1/` — README + `.dc.html`,
approved direction **11a**, clay field with the spinning coin) drove a full
restyle of everything under `app/(auth)/`: login, reset-password, register —
**and set-password**, which isn't one of the handoff's seven frames but is
where "Email me a link instead" actually lands, so leaving it white would
have put a seam at the end of the exact fallback the redesign supports.

New `components/auth/`: `AuthChrome.js` (full-bleed clay shell + overlay
blobs; sets `StatusBar style="light"` — expo-status-bar's last-mounted
instance wins, so this overrides the root layout's `dark` only while an auth
screen is up; `PrimaryButton` swaps its label for "Sending…"/"Signing you
in…" when busy instead of adding an ActivityIndicator, since per the handoff
the coin is this app's only spinner; error text is cream `#ffe4d8` — the old
red-600 sits at roughly 2:1 against clay and effectively disappears),
`AuthFields.js` (translucent field with focus border + Show/Hide password
toggle; `CodeInput` renders six display boxes over **one** invisible
`TextInput` carrying `autoComplete="one-time-code"`/`textContentType`, so
SMS autofill still lands exactly as it did on the single field — six real
inputs would each be a one-character field and break it), and `KovaCoin.js`
(below). Handoff departures shipped: six-box code entry, "At least 8
characters." stated under the password field, and the round `←` goes one
step back within a flow (replacing the old "Use a different email" link)
while `‹ Back to sign in` remains the exit. The screens' old
`KeyboardAvoidingView` wrappers are gone — `AuthScreen`'s ScrollView uses
`automaticallyAdjustKeyboardInsets` (iOS-only; Android's adjustResize and
web's visual viewport already handle it), since a KAV inside a ScrollView
fights the scroll instead of helping.

**The coin is pre-rendered — a ray-traced sprite sheet, not live layers —
and the path there is the most instructive part.** Five successive 2D
composites failed, each in a way web verification could not catch (Terra
was watching live on her phone via the dev server the whole time, which is
what caught every one — that feedback loop is worth deliberately recreating
for anything visual+native):

1. RN has no `translateZ`/`preserve-3d` (checked the installed style types),
   so the mock's 13-disc CSS edge can't be built live at all.
2. `perspective` + `translateX` + `rotateY` composes the shift *before*
   projection — the rim rendered ~2× too wide with a seam. Orthographic
   (`scaleX(|cosθ|)`) makes offsets exact.
3. Two `<Svg>`s in one component sharing a gradient id: fine on web
   (duplicate ids resolve to the first identical definition), unresolved →
   transparent fills on native. The rim vanished; only a centre bar was
   left — "a spool".
4. Opacity-driven face culling let the far face bleed through on a real
   phone while web rendered it perfectly.
5. The rim fill itself: a clay-family bronze read as the wall showing
   through ("transparent"); flat black read as a void; a white ring on the
   rim disc read as the far face leaking (the mock gets away with that trick
   only because both its faces are white — this coin has a black reverse).

Final architecture: `scripts/render_coin.py` (a ~100-line numpy ray-tracer)
bakes a real cylinder — logo obverse, inverted logo sampled mirrored on the
reverse like a struck coin, machined steel edge, one key light — into
`assets/kova-coin-sheet.webp`: **120 frames in a 12×10 grid** of 300px cells
(a 120-frame vertical strip would be 36,000px tall, past iOS's 16,384
texture cap). 40 frames was tried first and Terra immediately read ~9fps as
jumpy; 120 gives 3°/step at ~27fps. q92 WebP, 1.7MB bundled, ~43MB decoded
while the screen is up (Metro bundles webp; iOS 14+/Android/browsers decode
it natively). The player in `KovaCoin.js` is a rAF + setState frame index
driving `translateX/Y` on one Image inside an overflow-hidden window —
no SVG, no perspective, no backfaceVisibility, no opacity switching
anywhere. The bob and shadow stay live `Animated` transform loops, the one
kind of animation that never misbehaved. `KovaDisc` (flat 58px disc) is the
static header for the reset/register/set-password screens.

**Preview-pane blind spots reconfirmed the hard way**: rAF is frozen in the
hidden Browser pane, so no animation can be verified there (only static
frames/math), and the console error log *accumulates stale errors across
HMR edits* — a transient mid-edit error (including another session's) reads
as current; only a fresh tab gives a trustworthy zero. Verification: web
screenshot/DOM-measured throughout, native confirmed by Terra live on her
phone at every step, including the final smooth spin.

## Non-blocking overlays, a finalize toggle, and two measured layout bugs (2026-08-13)

Four member-side fixes from real PWA use. The overlay one is the important
one — it had been silently breaking touch across the whole app.

**Every non-blocking overlay was rendered through an RN `<Modal>`, which on
web covers the entire screen and eats every touch.** react-native-web renders
a Modal as TWO stacked `position: fixed; inset: 0` divs (ModalAnimation's
container at `z-index: 9999`, then ModalContent's own), portaled to
`document.body`, and **neither sets `pointer-events`**. `pointerEvents=
"box-none"` on the child inside is no help — the ancestors have already
captured the event. Measured against a real RNW Modal: with a banner up,
`elementFromPoint` at the top, middle AND bottom of the viewport all returned
an element inside the Modal, so the whole app underneath was untouchable.
That is what made PWA scrolling "get stuck at times": a toast is only up for
3-4.5s so it read as intermittent, while `WebPushBanner` and — most likely the
one Terra kept hitting — `AppUpdateChecker`'s "New version available" pill
blocked everything **until dismissed**, which on a heavy-deploy day is often.
Same root cause as the `FloatingMessageBubble` bug on native ("its overlaying
the whole screen with a clear non clickable page"), which was fixed by
dropping ITS Modal; the note here previously claimed ToastHost/WebPushBanner
were "safe because they're small and dismissible" — that was wrong, they cover
the entire screen regardless of how small they look.

New `components/PassThroughOverlay.js` / `.web.js` — native keeps the Modal
(an RN Modal is its own window, and that boundary is exactly what lets a toast
fired from inside an already-open modal render above it); web gets its own
`body`-level portal at `z-index: 10000` with a `pointer-events: none` host,
children keeping their existing `box-none`. **A plain in-tree overlay does not
work as a substitute** — every RNW `View` is `position: relative; z-index: 0`,
so it creates a stacking context and an overlay nested anywhere in the app
tree is trapped in one: a `z-index: 10000` element still painted UNDER a real
Modal's body-level 9999 portal (measured). Verified all three ways: paints
above an open Modal, is clickable itself, and hit-testing away from it reaches
the content below. `ToastHost`, `WebPushBanner` and `AppUpdateChecker` all use
it now.

**My Week's "today" stripe sat 10px lower than its siblings.** The non-today
stripes reserved the `TODAY` label's row with a whitespace-only string, and
`numberOfLines={1}` makes RNW emit `white-space: nowrap`, which **collapses a
lone space to zero height**. Measured: the "TODAY" label rendered 10px tall
while every `" "` sibling rendered 0. Fixed with an explicit
`height`/`lineHeight` on the label instead of relying on a space to hold the
row open. **General rule: never reserve vertical space with a `" "` string in
a `numberOfLines={1}` Text** — give it a real height.

**Finalize is a two-way toggle now.** Members kept tapping it by accident with
no way back, and since My Week's "done for the week" count is derived straight
from `programming.session_completions`, one stray tap made the whole week read
as finished. New `unfinalizeGroupSession`/`unfinalizeSpcSession`
(`lib/programming/sessionCompletions.js`) delete the row; the member's own
`for all` policy from 0007 already permits it, so **no migration**. Deleting
rather than flagging because every reader treats "a row exists" as the
completion. Logged sets and per-exercise ticks are untouched. Button copy is
unchanged — `SessionLogger` already swaps olive/clay off `isCompleted`. One
gap worth knowing: a **1x/week** client who over-finalizes gets the "no
remaining sessions" card instead of the button, and has to go back via My Week
→ the session → "Update session"; the explicit deep link bypasses the weekly
cap, which is what makes that path work at all.

**The rest-timer preset fan had two separate defects.** (1) All three bubbles
rendered entirely outside their 38x53 parent (measured offsets -21/-58,
-56/-26, -58/+21), and **neither iOS nor Android delivers a touch to a view
outside its parent's bounds** — the arc had only ever been hit-tested in a
browser, where CSS has no such rule, so it worked on the PWA and would have
been dead on the App Store build. Fixed with `RestFanGutter`, which wraps the
card's bottom row and reaches past it via a **net-zero `marginTop`/
`paddingTop` pair** (the box grows upward by exactly what the margin pulls it
back, so nothing on the card moves) plus the same trick below, because the
200° bubble hangs ~6px under the row — a containment check caught that one
alone still escaping. It's `box-none` so the now-transparent overlap can't
swallow taps meant for the set rows. Anchoring from the gutter's bottom-right
IS the button's own corner, so positioning reduces to `right = -r·cosθ`,
`bottom = labelH + gap + r·sinθ` — no measurement, nothing to drift when the
notes field changes height. Verified pixel-identical to the previous
positioning (`dx 0, dy 0` on all nine bubble/variant combinations across
normal text, an inflated notes field, and compact) with card heights
unchanged.

(2) Reported separately: tapping a preset started the timer but left **white
circles stranded on screen with their text gone**. That's a repaint artifact,
not a hit-test failure — picking a preset unmounts three shadowed, rounded,
absolutely-positioned views in the *exact frame* `startRest` mounts
`RestTimerBar` in normal flow above `<Tabs>` and shifts the whole page down,
which is a well-known way to strand composited tiles in iOS Safari. The
bubbles are now **always mounted and faded** rather than added/removed — the
same treatment (and reason) the "+" add-set button beside them already used.
Verified the hidden state blocks nothing: `opacity: 0` + `pointerEvents:
"none"`, which RNW compiles to `pointer-events: none !important` so it beats
the gutter's box-none `> * { pointer-events: auto }` polyfill. **This one is
reasoned, not reproduced** — an iOS Safari compositing artifact can't be
recreated in the sandboxed browser. If ghosts survive it, the next move is
making `RestTimerBar` an overlay instead of in-flow, which fights the
handoff's deliberate "push content down" design and so wasn't done first.

**Dynamic Type was investigated and ruled out** as the cause of the fan
trouble, twice over: the fan's own text is already pinned at
`maxFontSizeMultiplier={1}` and measures identical geometry at 1x and 1.3x,
and more fundamentally **react-native-web has no reference to
`allowFontScaling`/`maxFontSizeMultiplier` at all** — they are native-only
props, silently ignored on web, so iOS text-size settings do not scale any RNW
text in the PWA. "Bigger text" there is Safari's per-site zoom, which scales
everything uniformly. Worth remembering before blaming Dynamic Type for a
web-only layout report.

**Tooling note that cost real time**: `onLayout` in react-native-web is
implemented with `ResizeObserver`, and **ResizeObserver never fires in the
sandboxed Browser pane** (measured: 0 callbacks in 800ms on a 350px-wide
element). Anything depending on `onLayout` is therefore unverifiable in this
environment — an `onLayout`-anchored version of the rest fan was written and
then abandoned for the measurement-free geometry above precisely because of
this. Prefer deterministic geometry over measured layout when the change has
to be verified from here.

**Not visually verified** — standing login limitation; `npx expo export -p web`
clean after every change, and every geometry claim above measured in a real
browser against real react-native-web components rather than eyeballed. Worth
a click-through once deployed: scrolling while a toast/update pill is up,
finalize→unfinalize round-tripping to My Week's count, the TODAY stripe
lining up with its row, and the rest presets on a real device.

## Member legibility pass: it was the grey, not the size (2026-08-18)

Terra (who keeps her phone text at the smallest setting) reported member text
"too small", one case specifically: the History set pill showed weight under
reps in a way you couldn't read, and with no unit. A three-agent audit of
every member screen found the real pattern: **base sizes were fine (13–14px);
what read as small was `#a8a29e` (stone-400, 2.5:1 on white) used as the
everyday secondary-text grey** in ~50 places carrying real information (units,
targets, dates, prescriptions, day summaries), plus ~15 uppercase letter-spaced
eyebrows at 8.5–10px, plus 26 distinct ad-hoc font sizes with no scale.

**New tokens in `lib/theme.js`**: `colors.muted` (#6f6862, ~5.5:1) for
secondary text that carries information; `colors.hint` (#9a9187, ~3:1) for
ghost/placeholder text (the TARGET overlay in the set box, "–" empties); and a
`type` scale (`eyebrow 11 / caption 12 / body 14 / …`) whose values are FLOORS
for anything a member has to read. `#a8a29e` is now for decorative text only.
**New shared `components/Eyebrow.js`** replaces five copy-pasted local
eyebrows. Rules for new member UI: information text ≥12 and `colors.muted` or
darker; uppercase eyebrows ≥11; nothing informational in `#a8a29e`.

Specific fixes: `ExerciseHistoryModal`'s `SetPill` weight is 14px semibold
dark with "lb" (was 11px grey, no unit, pinned to no scaling); every logged-set
renderer now shows `lb` and uses `weight != null` (three of four used
truthiness, dropping a 0 weight); the logged-row weight on the session sheet
and the collapsed "Logged 3 × 8 @ 185 lb" summary likewise; tab-bar inactive
colour is `colors.muted`; My Week stripe label/caption rows grew to 11 (their
fixed heights raised to match — those heights are load-bearing for alignment);
`ExerciseCard`'s `REST_LABEL_H` grew 11→15 (fan geometry reads it, so the arc
moved with the row). Deliberately left at 10.5: the TARGET tag inside the set
box (11 risked clipping the number in compact mode) and Nutrition Today's
LOGGED pill. `maxFontSizeMultiplier` pins were not touched.

Verified: clean `expo export -p web`, a Babel scope pass over all 38 touched
files, and the pill rendered via a throwaway harness route. **Not verified on
a phone** — the two places most worth a real look are My Week's stripe rows
(fixed-height captions) and the set boxes' TARGET tag.

## TrueCoach history import: staging tables + member-driven linking (2026-08-18)

Follows the TrueCoach harvest (141 client `.txt` exports in Drive
`TrueCoach/`, plans in `~/.claude/plans/truecoach-history-export-harvest.md`,
`truecoach-export-report.md`, `truecoach-import-build.md`). Members are
anxious about losing years of logged lifts when TrueCoach lapses; this makes
that history hers again, one lift at a time, on her terms.

**The design in one sentence**: every TrueCoach lift is parsed into staging
tables; nothing reaches `programming.logs` until the MEMBER matches an import
to a Kova exercise from her own history screen. Matching is never fuzzy-done
for her (the exercise-merge detector's 35 false pairs is the precedent);
multi-select is required (`DB bench` and `Dumbbell Bench Press` are both
today's lift); one import feeds exactly one Kova lift (or its sets would exist
twice and inflate PRs); picking one already linked elsewhere is a **move**,
confirmed by naming both lifts.

**Migration `0066_truecoach_imports.sql` (run, verified)**: `programming.
truecoach_imports` (person × TrueCoach lift name; `user_id` NULLABLE;
`unique (source_name, lift_name)`; `linked_exercise_id`), `truecoach_import_
sets` (one row per set; `raw_text` = the WHOLE result block verbatim on every
set row, exactly how Kova writes `logs.notes`), `logs.truecoach_import_id`
(cascade), `logs.source` widened with `'truecoach'`. Two security-definer RPCs
are the only member write path — `link_truecoach_import(import, exercise)`
(idempotent; deletes that import's prior logs rows first, so a move is one
atomic call) and `unlink_truecoach_import(import)` (deletes exactly the rows
carrying the import id — Kova-logged rows have NULL there and cannot be
reached, by construction, not convention). Members can only SELECT staging.

**Why `user_id` is nullable, and the trigger**: `core.users` had 34 rows when
this shipped — most of the 141 TrueCoach clients register later via the GHL
webhook. `truecoach_attach_on_user_insert` (after insert on `core.users`)
claims staged imports by lowercased email the moment the account appears, so
nothing has to be re-run per registration. Emails come from the harvest
checklist (`~/.claude/plans/truecoach-export-progress.json`), matched by email
at harvest time; the one file with no roster email (Bob Getsinger, billed
under his wife) is passed with `--email "Bob Getsinger=…"`.

**Parser `scripts/truecoach_import.py`** (code only in repo; corpus, checklist
and generated SQL never are): CRLF-normalise, md5-dedupe, `Workout Log:`
header → person, session (`-----`) → exercise (`^[A-Z]{1,2}\d{0,2}\) Name:
rx`) → result BLOCK (3-space-indented line + unindented continuation lines +
optional comment paragraph). Emits idempotent SQL in chunks (`000_imports`,
`NNN_sets`, `999_finalize`, `run.sh`); import ids are uuid5(source_name, lift)
so re-parsing keeps links, replaces sets, and re-materialises linked imports.
**Corpus survey findings that shaped the extractor** (all 141 files): 50,123
result blocks, 41% multi-line; median 100 distinct lifts-with-results per
client, max 185 (search in the picker is mandatory); 123 of 134 clients'
dominant result shape matched NEITHER of the two "known" shapes (Bob's
`50 lbs 3x15`, Abbi's `3x8 @50`) — the real corpus is `10 with 70 lbs`,
`15x7,6,6`, `40# 15/15/15`, `10# × 8` per line, `Set 1: 10 reps, 80 pounds`,
`8ea @15`… The extractor is a per-line tolerant grammar (rules tagged in
`parse_shape`) with prescription-range disambiguation (`3x8-12` decides which
of `45x8` is reps); it reaches **92% structured, 3.3% unparsed-with-digits,
4.5% pure text** — and every block is stored verbatim regardless. Two traps
worth remembering: `#44` → `44#` normalisation must not fire on `40# 15`
(digit-lookbehind), and `AxB` where A exceeds the prescribed set count is
reps×weight or reps×sets, never sets×reps. Loaded 2026-08-18: 12,550 imports /
117,764 sets (111,440 structured), 3,079 imports attached to 26 accounts.

**Member UI**: `components/TrueCoachMatchModal.js` (search, multi-select, rows
carry `14 sessions · May–Aug 2026 · last 45lbs 3x12`, linked-here rows on top
with Unlink, linked-elsewhere rows marked and pickable → move confirm; ordering
by word overlap only, nothing pre-selected), reached from exactly two places:
the history sheet's EMPTY state (`ExerciseHistoryModal` — deliberately no
permanent button on the logging path) and a persistent dual-state row on the
full-history page (`components/TrueCoachLinkRow.js`: `Match TrueCoach data →`
/ `TrueCoach: DB bench, Dumbbell Bench Press · 23 sessions matched · Manage`;
renders nothing for a member with no imports at all). `lib/programming/
truecoachImports.js` wraps the RPCs. **Two guards added to `memberPlan.js`**:
`logResult` and `getLoggedSetsForDate` filter `truecoach_import_id is null`
— without the first, a back-logged Kova set on a date that already held
imported sets would ADOPT the imported row and be deleted on unlink. `lib/
history.js`'s day timeline also excludes imported rows (per-lift history only,
by decision). `countPersonalRecordsOn` is keyed on `date_performed = today`, so
past-dated imports can't spray the coach dashboard; `tracks_weight = false`
lifts stay PR-excluded regardless of parsed weights.

**Verified**: RPCs + RLS driven as a real member (Bob) inside a rolled-back
transaction — 18 checks incl. link/move/unlink counts, Kova rows untouched,
other-user import rejected, member direct update inert; attach trigger with a
mixed-case email; parser against 38 unit cases + random block samples; UI at
375px via a throwaway `app/zz-harness.js` (deleted). **Not verified behind a
real login** — standing limitation. **Phase 2, not built**: a global "what
have I linked" list on My History (`truecoach_imports` already carries every
column it needs).

## The weight calculator's specialty bars were invisible to members (2026-08-31)

Reported as the calculator saying there were no specialty bars and to ask a
coach to add some. The bars were there — seven of them, configured and correct.
**Members could not read the key at all.**

`specialty_bars` lives in `core.settings`, and 0047 gave members a read policy
on that table deliberately scoped to a **whitelist of keys**, because it is a
shared bag (messaging kill switch, payroll anchor, notification copy) and a
blanket member read would expose all of it. That whitelist was messaging-only,
and when the Specialty bar picker landed it read from the same table without
the whitelist being widened. Migration `0109` adds the key and renames the
policy, since "messaging settings" had stopped describing it.

**The failure is silent by construction, and that is the part worth
remembering: RLS filters rows, it does not error.** `getSetting` saw zero rows,
returned its `[]` fallback, and the picker rendered its empty state. Nothing
threw, so the component's own `.catch` never ran, the console stayed clean, and
a clean bundle proved nothing. Staff read the same key through
`core.is_staff()` and saw the real list — which is why it only ever surfaced as
a member report and never reproduced for Terra.

`specialty_bars` was the only member-facing key affected; every other
`getSetting` call site is a coach or admin surface (checked, not assumed).

**Second fix, because the message named a cause it could not actually
distinguish**: a fetch failure and a genuinely empty list both rendered "a coach
can add some in Settings → Equipment", which sends a member chasing a setting
that is already there. `WeightCalculator` now tracks a load error separately and
shows "Couldn't load the bar list · Try again" instead. **Any empty state whose
copy asserts *why* it is empty needs to be able to tell that from a failed
load** — otherwise a bug reports itself as a configuration problem, which is
exactly what happened here.

**Verified**: dry-run in a rolled-back transaction with impersonation
assertions (member sees the key, still cannot see the payroll anchor; staff
unchanged at 19 rows; anon still 0), then applied and re-confirmed live as a
real member — 1 row, 7 bars. All three picker states plus the retry press
driven for real at 390px through a throwaway `app/zz-calcharness.js` (deleted;
`SpecialtyBarPicker`'s temporary export reverted and the file diffed
byte-identical afterwards). `npm run build` clean.

## A route back out of an accidental set, and pounds said out loud (2026-09-03)

Two reports off one screenshot of the member logging card. **No migration** —
the delete uses `programming.logs`' existing `for all` member policy (0004).

**The "+" at the end of the last set row becomes a "−" once that row is empty
AND it is a set she added herself.** Tapping "+" by accident had no way back.
The added condition beyond "the row is empty" is deliberate and is not a
refinement for its own sake: a member part-way through a 3×8 has an empty last
row too, so a bare empty test would take her "+" away exactly when she might
want a fourth set, and would offer to delete a set the coach programmed — which
`rows`' own initial state rebuilds from the prescription on the next load
anyway, so it would only look broken. A set she added and then filled shows the
"+" again; clearing both boxes brings the "−" back, which is the route to
removing that one. Same circle, same clay, only the glyph changes — nothing is
lost either way, because the row it removes is empty by definition.

**Two things had to be true for the removal to stick**, and only the first is
obvious. `logResult` never writes an all-blank row (it says so in its own
comment), so the common case — tap "+", tap "−" — has nothing in the database
at all. But a set she typed into and then *cleared* has already been saved as a
row of nulls, because `logResult` deliberately updates an existing row even to
null, and `getLoggedSetsForDate`'s `highest` counted that husk, so the deleted
set came straight back on the next load. So: new `deleteLoggedSet` in
`memberPlan.js` (scoped exactly like `logResult`'s own lookup — session-scoped,
then the session-less fallback, never a TrueCoach import), fired best-effort,
**plus** husks excluded from `highest`. The second is what makes it durable if
the delete fails, and it also fixes the pre-existing "type then clear then
reload" phantom row.

**Real bug visible in the screenshot she sent, fixed in the same pass**: an
added set 4 showed a target of `12-15, ...`. `rowTargets` fell through
`item.repScheme?.[i] ?? item.targetReps`, and `targetReps` is `ex.reps`, which
the builder writes as `summarizeRepScheme`'s **joined summary** ("12-15, 6-8,
6-8") whenever the scheme varies. So one set's target column was printing the
whole lift's scheme. A per-set scheme covers every programmed set (0030
backfills one entry per set), so a set past its length now has no target at
all, which is what the code's own comment had claimed all along.

**Pounds: fill the gaps, keep "lb".** Terra's ask was "add a # everywhere to
show that it's pounds"; asked, and she chose filling the gaps over switching
the app's ~40 existing "lb" strings to gym shorthand. Most member surfaces were
already covered (`summarizeSets`, the LB column header, My History, the session
sheet, `lib/history.js`); what was bare was the **lift progress chart** (now
`unit="lb"`), the **weight calculator's** total and Insert button, the SPC
readout's set chips, the hub's collapsed summary line and idle-board bests, the
specialty-bar button, and — the widest-reaching one — **`SetBubble`**, whose
every caller renders it with no column header above it.

That last one is the only place the unit costs layout, so it is width-aware
rather than unconditional: `SetBubbleRow` drops it at `xs`, and
`hubBubbleSize`'s thresholds moved one step earlier (`≥7 → xs`, `≥5 → sm`).
Measured in the 463px four-up wall column with 3-digit weights: 2/3/4 sets land
at 172/258/344, 5 at 384, 6 at 461, and 7-8 fall back to unit-less at 393/449 —
nothing clips at any count, where an unconditional unit overflowed at 8.

**Deliberately not touched**: the wall board's own "+ Add set" (a labelled
button a coach drives, not an icon a member can fat-finger, and nobody has
reported it); `CoachHomeMobile`'s weigh-in columns, whose 44px headers would
clip a unit and whose numbers are unambiguous body weight; and `WeekRows`' dense
day table, for the same width reason.

**Verified** by driving the real card at 390px through a throwaway
`app/zz-harness.js` (deleted; `git status` clean): add → "Remove set 4" with an
empty target, remove → back to 3 sets and "+", reps-only and both-filled → "+",
clearing both → "−" again, and the plate calculator reading "90 lb" / "Insert
90 lb". Bubble widths measured for every count 2-8 in a second harness pass.
`npm run build` + `check:routes` clean, plus a Babel parse and
unresolved-identifier pass over all ten touched files. **Not verified behind a
real login** — standing limitation; worth Terra confirming a real removal
survives a reload.


## Ramp-up sets: keep the warm-up, stop it counting (2026-09-04)

Members warm into a lift: grab the 25s, do a set, know it wasn't hard enough.
The set really happened and they want to keep it, but it is not one of the
three working sets the coach programmed. Swipe a logged set left-to-right and
a button uncovers on the left that converts it; swipe again to convert back.
Migration `0116` — **not yet run.**

**The database never renumbers, and that is the load-bearing decision.**
Terra's own framing was that the set numbers would have to move (1,2,3,4 →
ramp, 1,2,3). They don't, in storage: `logs.set_number` is part of
`logs_unique_set_idx` (0073), so shifting 2,3,4 down to 1,2,3 means updating
rows into numbers their neighbours still hold, which a unique index rejects
mid-statement — and it is an index, not a constraint, so it cannot be
deferred. A row keeps its stored position and only `set_type` changes.

The LABEL is derived instead: `lib/programming/setLabels.js` is the single
definition (`deriveSetLabels`, `workingSets`, `isRampUpSet`), and **every
screen that prints a set label goes through it**, because otherwise her own
card would call a set "SET 1" while My History called the same row "Set 2".
That was a real find, not a hypothetical — `history/[exerciseId].js` printed
the raw `set_number`. The helper reads both row shapes (`set_type` off the
database, `rampUp` on the card's local rows) so one function covers both.

**The bug this exposed, which existed before ramp-ups and would have got
worse:** the SPC read-out paired targets to sets by raw position
(`spcBlockDetail.js`), so a ramp-up at position 1 shifted the whole lift by
one and the "N short" verdict a coach reads was wrong for every set in it.
Working sets and ramp-ups are now separated BEFORE anything is paired. The
same off-by-one lived in the hub's `SetBubbleRow` and in `HubLiftCard`'s
per-set target; both fixed the same way. `SetBubbleRow` also now lays out by
stored position first, so a gap she left (set 1 and set 3 logged, set 2 not)
stays a gap instead of closing up and claiming a set she skipped.

**Terra's two calls, taken explicitly:** a ramp-up counts toward **nothing**
on the coach's numbers (set count, session volume, hit-target), and it is
visible **everywhere, marked** — the Last time sheet, My History, the coach's
lift history, the SPC read-out, and the wall display all show it a step
quieter with the word RAMP on it rather than a colour anyone has to learn.

**The line I drew where she didn't specify**, and it is worth keeping
consistent: a ramp-up is **counted as evidence she trained, not as one of her
programmed sets**. So `gymWeek`'s "trained without finalizing",
`spcSessionActivity`'s started-session floor, `hubHistory`'s "does this board
have data" and `coachLogs`' activity feed all still count it — she was in the
gym. Anything that compares against a prescription or announces progression
does not.

Three smaller decisions, none of which Terra's example distinguishes:
- **A converted set stays where it is.** Convert set 3 of 4 and you get
  working 1, working 2, ramp 1, working 3 — the order she actually did them,
  and no row moves under her finger after the swipe.
- **The card DOES grow a replacement row**, so the working sets always reach
  the programmed count: mark one of three as a ramp-up and three working sets
  are still waiting for her. Terra's call, and it reverses what her own example
  showed (four rows in, four out) — asked directly and she wanted the row. The
  invariant lives in `padWorkingSets` and is re-established on load as well as
  on the toggle, or reopening a session mid-conversion would come back one
  working row short. It pads only, never trims: converting a ramp-up BACK
  leaves one more row than the prescription asks for, which is exactly the
  state tapping "+" produces and which that row's own "−" already removes,
  where auto-trimming would sometimes eat an empty row she added on purpose.
  `canRemoveLastSet` counts WORKING rows for the same reason — on raw length it
  would offer to delete a set she genuinely still owes.
- **Fill-down ignores ramp-ups in both directions.** Carrying the 25s she
  warmed up with down into her working sets is precisely the wrong number.

**Two guards that would have silently done nothing**, both the class this file
already warns about: `topSetOf`'s new ramp-up filter reads `set_type`, which
`getExerciseStats` did not select — so PR exclusion would have been a no-op
with a clean bundle. Six `logs` selects needed the column added. And
`getMostRecentLog` (which seeds a coach's next prescription from her last log)
now excludes ramp-ups, or adding a lift to an SPC session would propose the
warm-up weight.

**`logResult` only writes `set_type` when a caller passes one**, same rule as
`notes` and for a sharper reason: the wall display and the back-log grid both
write sets through it with no opinion about ramp-ups, so a blanket default
would have a coach saving a note at the rack silently promote her ramp-up back
into a working set.

**Gesture notes.** PanResponder + `Animated`, matching the rest-timer button in
the same file rather than reaching for gesture-handler — it is the responder
system this app has proven on both native and the PWA, and everyone is on the
PWA. The **capture-phase** hook is what lets the row take the gesture off a
TextInput the finger landed on; it only claims the touch once the drag is
clearly horizontal, so vertical scrolling still wins. `touchAction: "pan-y"`
(web only) stops mobile Safari starting a text selection instead. Only one row
is open at a time, held by the parent. The action is rendered only while it
can be reached (open, or mid-drag) — rendering it always put four invisible
"Ramp-up set" buttons in the accessibility tree with nothing to say which set
each belonged to.

**Verified by driving it for real** at 375px through a throwaway
`app/zz-rampharness.js` (deleted; `logResult`/`getLoggedSetsForDate` stubbed to
capture writes, then restored and **md5-verified byte-identical**): the swipe
opens to exactly 116px, a swipe **starting on a text input** opens it (the
capture steal works), a mostly-vertical drag does **not**, the labels come out
`RAMP UP 1 / SET 1 / SET 2 / SET 3`, targets re-pair to 12/10/8, converting
back restores SET 1-4, and the persisted write keeps `set_number` 1,2,3,4 with
only set 1's `set_type` changed. Re-driven against a 3-set prescription for the
replacement-row behaviour: marking set 1 as a ramp-up leaves three working sets
with the third empty and awaiting her, that empty row correctly offers "+" and
not "−" (it is owed, not spare), the fill-down offer appears and skips the
ramp-up, and converting back leaves a spare SET 4 carrying a "−". `npm run build` + `check:routes` clean, plus a
Babel parse / unresolved-identifier / unused-import pass over all 14 files, and
10 unit cases against the shipped `setLabels.js`.

**Not verified**: anything behind a real login, and none of it on native —
standing limitation. The springs are rAF-driven and **rAF is throttled in the
sandboxed browser pane**, so the slide animation itself was never watched, only
the values it starts and ends at. Worth Terra's pass on a real phone: that the
swipe feels right under a thumb mid-session, and that a converted set still
reads correctly on the wall display.

## Supersets you can see, and a collapsed card you can just tap (2026-09-04)

Two small asks on the logging card, both from real use.

**The superset field is real peach now, not near-white.** The dashed container
was `#fffdfb` with white cards sitting on it — the same white, so the grouping
was invisible unless you went looking for the dashes. It is `#fdece5` (the
app's own peach) with an `#e0b6a5` dashed border; the cards stay white, and the
contrast between them and the field is what says "these two go together" from
across the gym. The SUPERSET chip had to invert with it — it was rust text on a
`#fdece5` pill, which is now exactly the colour behind it, so it would have
vanished into the ground. It is solid rust with white text.

**A collapsed card opens on a tap anywhere**, including the name and the
padding, rather than making her find a 15px chevron. Two details:
- The root element is a `Pressable` while collapsed and a plain `View` once
  open. **Not** a Pressable that stays mounted with its handler swapped: that
  would leave one more thing in the responder chain above the set rows for
  their swipe gesture to win against, and the expanded tree is the one that has
  actually been driven and verified. Changing the element type remounts the
  subtree, which costs nothing here — the expanded content is conditionally
  rendered and mounts fresh on expand anyway.
- The name is the link into history **only once the card is open**. On a
  collapsed card it does what the rest of the card does, so a tap on the most
  obvious thing on the row can't be the one thing that doesn't work.

The chevron is unchanged and stays on both states: on a collapsed card it is
what says the card opens at all, and it is still how it closes.

**The "+" between the two lifts is gone, and the chip is `colors.primary`
now, not `#b23a22` (2026-09-05).** A rust circle sat in the 10px gap between
supersetted cards to read as joining them; Terra's own pass said the field and
its border already do that, and the connector was one more thing inside a block
that is already busy. `SupersetLink` is deleted with it (and the now-unused
`Ionicons` and `Fragment` imports).

**The chip is the same rust the client goal card is filled with.** It shipped
as `#b23a22`, described in the commit as "rust" — it is not. `#b23a22` is this
app's destructive/alert red (the peach last-time pill's text, the tab badge,
the standardized destructive colour), and Terra read it as red immediately.
Rust is `colors.primary` (`#a46a57`), which `ClientGoalCard` fills its hero
with, so that is what the chip uses. **It has to stay a fill, not rust text:**
the field behind it is `#fdece5`, which is exactly the background the old
rust-text pill used, so text alone would vanish into it. Worth remembering as a
naming trap — `#b23a22` gets called rust in comments across this codebase and
is the red one; `colors.primary` / `colors.primaryOnWhite` are the rusts.

**Verified by driving all five cases** through a throwaway `app/zz-ssharness.js`
at 375px (deleted; `useAuth` and two `memberPlan` functions stubbed, restored
and **md5-verified byte-identical**): tapping the empty card body opens it,
tapping the name of a collapsed card opens it **without** opening history,
tapping the name of an open card **does** open history, the chevron still
expands and collapses, and — the case worth proving, since the checkbox is now
nested inside a pressable card — tapping the completion checkbox toggles it and
does **not** open the card, because the inner Pressable wins the responder.
Re-confirmed the set-row swipe still opens to 116px with the root's element
type now changing. `npm run build` + `check:routes` clean, scope pass clean.

**Not verified**: behind a real login, or on native — standing limitation.

## The member's phone gets the board's finish (2026-09-04)

Finalizing on the wall washes the session green and drops confetti; on a
phone it produced a toast and the accomplishment plate. Now both. **No
migration, no deploy step** — this is all client-side.

**The confetti has one implementation now.** `components/FinalizeConfetti.js`
holds the piece animation and the palette; the wall
(`components/hub/HubFinalizedOverlay.js`) and the phone
(`components/session/FinalizeCelebration.js`) pass their own tuning. The
wall's numbers are byte-for-byte what they were (28 pieces, 2600-4200ms
falls, 1100ms stagger, `CELEBRATION_MS` 5600) — that extraction is a pure
move. The phone runs the same 28 pieces faster (1300-2000ms, 500ms stagger),
because a run tuned to turn a head from twenty feet away just reads as
confetti that will not stop when it is in your hand. `FINALIZED_WASH` moved
into the shared file as well, so the member bundle never pulls in the hub's
overlay to know one colour.

**The plate is held 1500ms.** It is a full-screen Modal, so without the hold
the wash and the first pieces are covered in the same frame they appear —
the celebration would exist and nobody would ever see it. Terra picked this
over "plate immediately, confetti over it" and over waiting out the whole
run. `holdUntil(timestamp)` holds for the REMAINDER of the beat rather than
a flat delay: building the plate is two round trips of its own and those
should count toward the hold, not stack on top of it.

**The follow-up work runs detached (`void (async () => {...})()`).**
`SessionLogger` keeps its button on "Saving…" at 50% opacity for as long as
`onFinalize` is pending, and that button sits under the wash — awaiting the
hold inside the handler left it saying "Saving…" through the whole
celebration. Returning immediately lets it flip to its finished state while
the beat plays.

Every session kind celebrates, keyed so only the one just finalized washes
(`group:<programId>` / `spc` / `alternate:<id>` / `one_off:<id>`). A one-off
normally drops out of the list the instant it is done; its removal waits the
same 1500ms, or the card is gone before the wash has anything to land on.
Un-finalizing inside the run calls `clearCelebration()` — otherwise the
session sits green while its own button says it is no longer finished.

**Two decisions worth not re-litigating:**
- **The wash never blocks.** On the board a finalized session is genuinely
  closed and the wash is what says so; a member can still go back and fix a
  set, so it is `pointerEvents="none"` throughout and clears itself.
  Verified by hit-testing the middle of it and reaching the card underneath.
- **The wash is NOT faded in.** A 220ms `Animated.timing` was built and
  dropped: it buys a fifth of a second of polish and costs a whole failure
  mode. rAF is throttled in a backgrounded tab and frozen outright in the
  preview browser, and a timing that never advances leaves the wash at
  opacity 0 — measured, exactly that, on the first pass. The wall's wash
  appears instantly too.

**Verification, and the one thing it could not cover.** `npm run build` +
`check:routes` clean, a Babel parse / unresolved-identifier / unused-import
pass over every touched file, and the composed frame driven for real at
390px through a throwaway `app/zz-celeb.js` (deleted; `git status`
confirmed clean): 28 pieces in all six palette colours, the wash sized to
the finalized card alone with the second card untouched, hit-testing passing
through it, pieces painting above every card and button, and the plate
arriving after the hold. **The fall itself was never watched** — sampling
mid-flight showed the pieces sitting at their start for 800ms and then
jumping straight to the end state with nothing in between, which is the
throttled-rAF signature this file already warns about. Any animation is
unverifiable through the Browser pane. **Not verified behind a real login,
and not on native.** Worth Terra finishing a real session on her phone.

## A second tap of Finalize moved the day she trained (2026-09-05)

Found chasing why a client couldn't log: she trained on the 2nd, logged 19 sets
across 6 lifts, opened the session again three days later and tapped Finalize —
and spent the morning looking at empty boxes.

**`finalizeSpcSession` and its three siblings re-stamped `completed_at` to now
on an existing row.** That is not cosmetic. The member's logging screen derives
`datePerformed` from that timestamp (`plan.js`), so re-finalizing a session
trained days earlier repoints it at today, the set lookup misses, and her work
disappears from her own screen while sitting untouched in the table. The
member's own Finalize button passes no date at all, so it is one tap to trip.

**One rule now, in all four finalize functions**: an explicit date always wins;
no date means *now if this is new, leave it alone if it already exists*. The
back-log flows (`plan-block.js`, `plan-spc-block.js`, My Week's own, and the
coach logging on a client's behalf in `SpcClientPage`) all pass a date, so they
still move it — that is what they are for. Un-finalize DELETES the row, so
genuinely re-doing a session still gets today; only a second tap on a row that
is already there is protected. The board stops passing an explicit `now` for
the same reason, so reviewing a past board can no longer drag a session forward.

**Recovering a row that this already moved**: the true finish time is
`max(created_at)` of that session's own `logs` rows — the sets carry when they
were written, so nothing has to be guessed. Ashley Klink's was restored that
way.

**Worth generalising: a timestamp that a screen uses to LOOK SOMETHING UP is
not a free-form audit field.** `completed_at` reads like "when was this marked
done", and it is also the key the logging screen resolves a day's sets through.
Anything that writes it has to know that.

Verified by driving the shipped functions against the live database with a
throwaway user, all five branches (explicit past date, re-finalize with no
date, the board's call shape, explicit new date, un-finalize-then-finalize),
rows deleted afterwards.

## Benchmark Day: the neon board comes into the app (2026-09-06)

A handoff (`design_handoff_member_benchmark_v1/` — README + `Kova Benchmark
Day.dc.html` + 10 screenshots + `board-reference.png`) brings the gym's
quarterly self-test into the member app. Four times a year members test pull
ups, push ups and squats and place one plastic kettlebell per movement on a
neon board bolted to the wall; this is that ritual, on a phone. Migration
`0120` — applied and verified live.

**It is deliberately the one place in the app that is not warm clay and
cream.** Black ground, three neon lift colours sampled from the physical
board, mint for "this improved". Those tokens live in
`components/benchmark/neon.js` and NOT in `lib/theme.js`, on purpose: a mint
that only ever means "you beat last quarter" should not be reachable from a
nutrition screen.

**The glow, which is most of the visual identity.** The design calls for
LAYERED text glows (`0 0 16px …, 0 0 42px …`) and RN's
`textShadowColor/Offset/Radius` can only express one. **react-native-web
accepts a raw `textShadow` CSS string as a first-class style property** — it
is in RNW's own allowlist and its preprocessor concatenates it with any
derived value (it now warns that the `textShadow*` props are the deprecated
form). So on web, where every real user is, `neonTextShadow()` hands it the
literal CSS and the design lands exactly. Native falls back to the
single-layer props at the CORE radius. The handoff suggested an absolutely
positioned duplicate `Text` behind the real one to fake the halo; rejected —
a duplicate has to reproduce the original's line breaking exactly or it
fringes, and this codebase has been burned twice by absolutely positioned
text on Fabric. Box glows are `shadowColor` + `shadowRadius` at zero offset,
which RNW compiles to a real `box-shadow`; native Android gets a plain
elevation shadow instead of a coloured one, accepted rather than faked.

**Schema: two tables, and the `slot` column is the whole design.**
`benchmark_events` is the coach's three dates. `benchmark_entries` is one row
per (event, member, movement, **slot**), where slot is `'this'` or `'last'` —
because the member's screen has TWO columns and BOTH are editable. `'last'`
is an **override** of what the previous event says she did, not a write back
onto it: the Last column exists mostly for her FIRST benchmark, when there is
no history to prefill and she is typing what she remembers, and letting that
edit reach back would mean a finished benchmark can change months later with
nothing saying so. So the app reads the previous event's `'this'` row as the
default and only writes a `'last'` row once she actually changes something —
same override-or-default shape as `spc_workout_week_titles`. **A benchmark
that was recorded correctly stores nothing extra.**

**No status column and no publish step.** Which of the three My Week states
shows is derived from today against `show_from` / `benchmark_day` /
`hide_after`, so there is no half-published state to leave behind. The phase
is recomputed at RENDER on My Week rather than stored with the fetch, so a tab
left open overnight rolls from countdown to live on its own.
`value`/`load` are TEXT, not numeric — what goes on the bell is whatever she
keys in, and the unit differs per tier (pull ups tier 2 is seconds of an iso
hold, tier 4 is reps), so storing the string keeps the record equal to the
sticker on the physical kettlebell.

**Writes are bounded to `benchmark_day … hide_after` in RLS, deliberately
wider than the UI's lock.** The kettlebells lock the morning after benchmark
day, but a member finishing at 11:58pm must not hit a wall at 12:01, and a
stale browser tab must not be able to write into a benchmark from three
months ago.

**Comparison rules** live once in `compareEntries` and are derived on every
read, never stored. The rule worth not relitigating: **variation outranks
tier** — moving off the bands onto the floor is a win even when the tier
drops, and the pill is then the whole sentence with no tier in it at all.

**Two places the README and the prototype disagreed, and the prototype won**
(same precedent as the coach-web pass): the hub's movement names are **42px**,
not the README's 30 — the prototype's own markup renders 42 and the signed-off
screenshot shows it. And the celebration's result pill is **always the lift
colour**, never mint — checked against the prototype's markup rather than
inferred from the palette note, which is about the shareable card's delta line.

**Deviation worth Terra's call: the card's primary button says "Screenshot
this card", not the design's "Save to photos".** There is no rasterizer in this
app — `react-native-view-shot` is a native dependency and every real user is on
the installed PWA, where a native module never arrives — so a "Save to photos"
button would do nothing. The card is built screenshot-clean for exactly this
reason, the same way the coach's photo-compare board is. Making it a real save
means adding that dependency plus a native rebuild.

**Not built, and not in the handoff: a coach-facing results view.** The RLS
(staff read every member's entries) and the query
(`listBenchmarkEntriesForEvent`) are in place, so it is one screen away rather
than one migration away.

`FinalizeConfetti` gained an optional `colors` prop rather than growing a
fourth confetti implementation; everything else about it is unchanged.

**Two real layout bugs found by measuring, which a clean bundle did not
catch**: the My Week results tiles' three neon numbers sat 5px out of line
because `SEC ECCENTRIC` wrapped to two lines while `REPS` did not — with
`space-between`, a bottom block that wraps pushes the number above it up, so
the unit line now RESERVES two lines whether it needs them or not. And the
coach settings' name `<input>` took its own 181px intrinsic width against a
130px `minWidth` and wrapped the label beside it onto two lines — the standing
RNW rule, pin it with `width` + `flexGrow/flexShrink: 0`, never a bare
`flex: 0`.

**Verification.** Migration dry-run in a rolled-back transaction, then a
15-assertion RLS impersonation test as a real member, a real coach and a real
admin (member sees 1 of 3 events and only her own entries; insert into a
future or closed event, as another user, or of an event itself all refused
42501; coach reads all three and writes none; both constraints and the
uniqueness rule bite) — also rolled back — before applying for real. 34 unit
assertions against the SHIPPED comparison/phase/unit source. `npm run build` +
`check:routes` clean (the route gate caught the missing rewrite, as designed),
plus a Babel parse / unresolved-identifier / unused-import pass over all 18
touched files. And every screen driven for real at 390px through a throwaway
`app/zz-bench.js` route (deleted, stubs restored and md5-verified
byte-identical): all three My Week states, the hub empty and one-logged, the
pull-ups card placing a bell → keying a number → the gate advancing through
all four labels, moving the bell carrying the number AND the unit changing
with the tier, tapping the occupied box removing it, the squats variation
toggle with its load gate and the bell correctly hiding on the other
variation, the celebration with its flash/confetti/pill, the shareable card,
and the coach settings including the date picker and its out-of-order guard.

**Not verified**: any of it behind a real login, and none of it on native —
standing limitation. Worth Terra's pass: set a real benchmark's dates, then
log a real movement on a phone.

**Same-day follow-ups from Terra's first run through it:**

- **A logged movement is editable again, and that was a real bug, not a
  preference.** `locked` was `!loggingOpen || completedAt`, while the button
  under it read "Logged | tap a bell to change" — so the copy pointed at the
  one affordance that marking complete had just switched off. It is
  `!loggingOpen` now: she can move the kettlebell, re-key the number and
  rewrite the note right up until the window closes. Re-tapping the button
  still does nothing (the celebration is for the moment she finishes, not for
  every correction), and the trailing "logging is closed" note stopped being
  gated on `!completedAt`, which had hidden it from exactly the people whose
  entries were locked.
- **My Week rolls to results the moment the third movement is in**, rather
  than waiting for midnight. `benchmarkPhase` stays pure date arithmetic;
  new `benchmarkWeekState(event, board, today)` layers the one rule dates
  cannot express on top of it, and My Week calls that instead. The fetch
  still decides whether to load a board from the DATE phase, since the board
  is what the week state needs to be computed at all.
- **Nothing is called a card.** The hub's button is "See your Benchmark
  results"; the results screen says results throughout. The route is still
  `/benchmark/card` internally.
- **"bell" is not an abbreviation we use** — it is a kettlebell, or a KB.
  Full-word "kettlebell" is fine and stays in the placement copy and every
  accessibility label. This also rewrote one of the handoff's own strings: the
  push-ups hint was "Pick your variation, then place your bell."
- The hub's per-movement supporting line ("4 tiers | one bell", "2 variations
  | 4 tiers") is gone as fluff.
- **The celebration's supporting copy is gone entirely, and this one is worth
  reading before "restoring it from the handoff".** The README specifies a
  line under the number for three of the four results ("That is the training
  showing up." on a tier gain, "Same tier, and you held it. That counts." when
  held, "On the board. Now you have something to chase." with no prior data)
  and nothing on a variation move, reasoning that there the pill says it all.
  All three were built verbatim. Terra cut the first, then the other two.
  So the handoff's own variation-move rule is now applied to every result and
  `celebrationCopy` is deleted rather than left returning "" four times.
  **The handoff still asks for those lines; it is out of date on this point,
  by decision.** A note to that effect sits where the function was, since the
  next person to diff the code against the README will otherwise "fix" it back.
  Checked both the README and the prototype for alternative wording first —
  there is none, those three strings are the only supporting copy anywhere in
  the bundle.
- `isWinTone` was deleted, dead since the celebration pill was corrected to
  always use the lift colour.
- **Editing a completed movement un-completes it.** Changing the tier, the
  number, the load or the variation clears `completed_at`, so the button goes
  back to "Mark pull ups complete" and she confirms the new number the way she
  confirmed the first. Without it an edit landed silently — the button sat on
  "Logged | tap a KB to change" whatever she typed. The note is deliberately
  NOT in that set: it is commentary on the result rather than the result, and
  a sentence about how it felt dropping her back to un-logged would be
  surprising. Knock-on effects are correct and intended: the hub falls to 2/3
  and My Week drops out of its results state until she re-confirms.
- **Both celebration CTAs are the mint primary now**, and the mid-flow one
  reads "Next movement" rather than "Next test". The label is the only thing
  that differs between them.
- **No "logging closed" banner on the hub.** Opening the board after
  benchmark day leads with what she did, not with what she can no longer do.
  The movement card still explains the lock, at the one moment it is relevant:
  when she taps in and finds the fields inert. The removed line was also the
  last user-facing use of "bells" in the feature, which the earlier sweep
  missed — the word survives only in code comments now.
- **The results screen's screenshot line is plain text, not a button.** It
  shipped as a mint block that looked exactly like a button and did nothing,
  which is worse than not having it at all — there is no rasterizer here (see
  the "Save to photos" note above). Done is the only pressable thing on that
  screen, so it is the only thing that looks pressable.

**The prefill did not actually work, and finding that took a real test rather
than a read of the code.** Asked to confirm that a logged benchmark would fill
in next quarter's Last time column, the honest check was to build the second
benchmark in a rolled-back transaction and run the real queries as a real
member. Entries persisted and were readable; the EVENT row was not, because
0120 scoped that read to the event's own window and last quarter's is months
past it. So `getPreviousBenchmarkEvent` returned null and Last time silently
came up blank — no error, nothing in a bundle check, and nothing anyone would
notice until the next benchmark day. Fixed in 0121. **The general shape: a
policy scoped to "what is live now" quietly breaks anything that reads
history, and the symptom is an empty column rather than a failure.**

**Verified**: the unlock driven for real on a completed movement (re-keyed 28
to 31, moved the KB to another tier carrying the new value, both notes
editable), and the closed-window case still locking (number and this-time note
`readOnly`, the KB refusing to move). **RNW renders `editable={false}` as
`readOnly`, not `disabled`** — checking `disabled` reports false on a locked
field and reads like a bug that isn't there. Plus 20 unit assertions over the
two logic changes, and both My Week states screenshotted on the same date.

## A photo on a lift, in her own history (2026-09-08)

TrueCoach had one and members asked for it back. Terra scoped it: tied to a
lift, taken from a camera icon in the notes field on the logging card, viewed
from a camera icon on that lift's history row, and **coaches do not see them**.
Migration `0126` -- applied and verified live.

**The storage question she opened with, answered against real numbers rather
than guessed.** They are on Supabase **Pro**: 100 GB file storage included
(then ~$0.021/GB), 250 GB egress (then $0.09/GB). Usage the day this was built
was **236 MB total** -- `photos` 613 files / 220 MB / avg 368 KB, `help-videos`
2 files / 14 MB / avg 7.3 MB, `graphics` 9 files / 2.4 MB. The database is 73 MB
and images never go in it, so "db storage" was never the concern.

At ~200 finalized sessions a week: a photo on every session is ~3.8 GB a year,
realistic uptake under 1 GB. **Video is the cliff** -- 20% of sessions at ~10 MB
is roughly 20 GB a year, 25x the photo case, and it turns into a different
feature because somebody has to watch them. Held back deliberately; the bucket
caps below are what enforce that rather than intent.

**A new `lift-photos` bucket, NOT the existing `photos` one, and the reason is
load bearing:** `photos` carries a policy called "coach can manage photo files"
granting `is_coach()` ALL on everything in it. Reusing it would hand coaches the
exact thing Terra said they should not see. The new bucket also gets caps
`photos` still lacks -- that one is **nullable on both `file_size_limit` and
`allowed_mime_types` to this day**, so a 200 MB file can be pushed through the
progress-photo flow right now. Worth fixing whether or not anyone asks.

**Owner-only in every direction, with no staff policy at all** -- enforced in
RLS, not hidden in the UI. Proven by impersonation: a reviewer coach sees 0, an
admin sees 0, another member sees 0 and is refused 42501 on an insert under
someone else's id.

**The trap that finding produced, and it is the durable lesson.**
`mergeExercises` repoints every reference off the retired exercise and runs as a
**coach**. Measured, not assumed: a coach's direct UPDATE on this table affects
**zero rows and returns no error**. So a merge would have silently left a
member's photo on the half that then gets archived while her sets moved to the
survivor, and it would just stop appearing in her history. Fixed with
`programming.repoint_lift_photos()`, a narrow security-definer function gated on
`core.can_access_exercise_library()` that can only ever change `exercise_id` and
grants no read access. **It is deliberately NOT added to `REFERENCE_TABLES`** --
that list also drives `getExerciseUsageCount`, which would read zero for the
same reason and quietly understate what archiving affects.

**Android, flagged by Terra because it has bitten before.** The live Android
surface is Chrome on the PWA, and there is no Android SDK on this Mac. Two
things done about it: the feature reuses the exact camera path the nutrition
progress-photo flow already ships (so it inherits whatever works today rather
than introducing a second mechanism), and a failed capture surfaces a real
message instead of doing nothing. `expo-image-picker` on web renders
`<input type="file" accept="image/*" capture="camera">` and auto-resolves the
permission as granted -- **verified in the browser that a real input with
`capture="camera"` is created on tap**. It also degrades safely: a browser that
ignores `capture` shows a chooser with Camera in it, not a dead button.

**`pickImage` is called FIRST, with nothing awaited ahead of it.** On web it
ends in a synthetic click on a file input, and transient user activation is what
lets that open the camera at all -- awaiting anything in between risks spending
it. This is also the order `PhotoUpload` already uses, which is the one camera
path proven on the PWA.

**The camera icon lives inside the notes box, absolutely positioned, not in the
row.** Putting it in the flex row would shift the rest timer button left, and
the rest preset fan is positioned off the gutter's bottom-right corner rather
than off the button -- so the arc would stop lining up with the button it
belongs to. **It is hidden while the fan is open**, and that is not defensive:
measured, preset "Rest 2:00" lands at 262,357 -> 300,395 against the camera at
274,357 -> 304,387, a direct overlap. Faded rather than unmounted so nothing
shifts under a finger, the same treatment the last set row's "+" already gets.

**No photo count on the card, deliberately.** It would need a query per card on
every session load, and a count held only in local state resets on reload and
reads as "my photo is gone". The icon is an action, the toast is the
confirmation, and her history is where they live.

`groupByDate` gives a photo-only day its own card -- a photo taken on a day
whose sets were never typed, or typed and cleared, would otherwise be
unreachable, which is a photo silently going nowhere.

**Verified**: migration dry-run rolled back, then a 9-assertion impersonation
test as a real member, a second member, a plain coach, a reviewer coach and an
admin (also rolled back, nothing left behind); 13 unit assertions against the
**shipped** `groupByDate`; `npm run build` + `check:routes` clean; a Babel parse
/ unresolved-identifier / unused-import / **missing-named-export** pass over all
six touched files; and the card and viewer driven for real at 390px through a
throwaway `app/zz-liftphoto.js` (deleted, the one temporarily stubbed file
restored and md5-verified byte-identical, `git status` checked). Measured there:
the icon sits fully inside the notes box, 42px of padding reserves its space,
16px clear of the rest button, zero page overflow, hidden with
`pointer-events: none` while the fan is open and reachable by a real hit-test
when it is not, and the viewer's pager bounds dim correctly at each end.

### The first one saved fine and was still invisible (same day)

Terra attached one to KAS Glute Bridge on 9/7 and could not find it. The row
was there and correct -- **the photo saved; nothing surfaced it.** The icon
only existed on `history/[exerciseId].js`, the per-lift drill-down, so reaching
it meant History -> By Workout -> find the lift -> tap in. She was looking at
the History tab itself.

**Worth generalising: "attached to a lift" is where the data belongs, and it is
not where she looks for it.** She thinks in sessions. So the same photo now
surfaces in three places off one query.

- **`listLiftPhotosForUser` + `groupPhotosByDate`** (`liftPhotos.js`). One
  indexed read for the whole tab, and `ByDayView` hands the SAME rows to both
  the timeline pill and the popup it opens -- a count that can disagree with
  the list it opens is how the live board once advertised "16 sets logged" on
  an empty board.
- **A paperclip pill on the By Day timeline row**, between the subtitle and the
  chevron, with a count only past one. It is a **nested** Pressable inside the
  row's own: tapping the clip opens the photos, tapping anywhere else still
  opens the session. Verified by hit-test, not assumed.
- **Thumbnails inside `SessionHistoryModal`, on the lift they belong to.** That
  popup already groups a day's logs by exercise, so a photo slots straight onto
  its group. `mergePhotos` gives a photo whose lift has no logs that day its own
  card rather than dropping it, and falls back to "Exercise" when the embed
  returns no name -- member RLS on `programming.exercises` requires `is_active`,
  so an **archived** lift genuinely comes back nameless.
- "Right away" needed no work: `ByDayView` already keys its effect on
  `useRefreshOnFocus`, and the photo fetch is keyed on the same counter.

Signing happens when the popup opens, never when the timeline loads -- a signed
url lasts five minutes, so signing every photo up front hands back dead links by
the time she scrolls and taps. The photo fetch carries its own catch rather than
sharing the timeline's `Promise.all`.

**Verified**: 14 more unit assertions against the shipped `mergePhotos` /
`groupPhotosByDate` (orphan photo, archived-lift fallback, no-photos returning
the original array unmutated), plus the pill and popup driven at 390px through a
throwaway `app/zz-hist.js` -- clip vs row proven to fire different handlers with
a real hit-test landing on the clip, singular/plural labels, and a thumbnail
opening the viewer scoped to that one lift. Three temporarily hooked files
restored and **md5-verified byte-identical**.

### A cutoff that applied to the sets but not the photos (same day)

Second round of Terra's testing found two more things.

**The real bug: the lift-history screen showed today's photo with today's sets
stripped out**, so the session she was standing in rendered as a card holding a
picture and nothing else. `history/[exerciseId].js` is opened two ways -- from
My History with no cutoff, and from a lift's history sheet mid-session with
`before` set to that session's date, so her own half-finished sets don't read
back as "last time". `listLogsForExercise` honours that cutoff; my photo query
did not. **A cutoff has to apply to everything on a screen or it invents a day
that never looked like that.** `listLiftPhotos` takes `before` now and filters
identically.

**And the photo did not show on the session she was logging.** The card
originally carried no photo state at all, deliberately -- a per-card query would
be one round trip per lift on every session load, and a count held only in local
state resets on reload and reads as "my photo is gone". Terra asked for it
anyway, and she is right: *"so the girls can see that it uploaded, and then
delete it if needed."* Neither of those is reachable from a screen that shows
nothing.

Resolved by batching instead of dropping the constraint: new
`listLiftPhotosForDate({ userId, exerciseIds, date })` is **one** query for the
whole session, mirroring `listSessionExerciseNotes`, which `SessionLogger`
already batches exactly this way. It hands each card its own photos and an
`onPhotosChanged` callback, so an upload or a delete refetches the batch and the
strip is always real stored state rather than a local guess. Thumbnails sit
under the notes field; tapping one opens the same viewer the history screens
use, which is where delete already lived.

Signing stays lazy and per-card, keyed on the photo ids rather than the array --
`SessionLogger` rebuilds that array on every refetch, and an effect keyed on the
array itself re-signs in a loop. Most lifts have no photo, so most cards sign
nothing.

**Verified**: both new query shapes curled against the live API (`lt` cutoff and
the batched `in`), and the strip driven at 390px through a throwaway
`app/zz-card.js` -- one thumbnail on one lift, two on another, none on a third,
zero page overflow, a real hit-test landing on the thumbnail, and the viewer
opening with delete available. Stubbed file restored md5-identical.

### "View full block" could only ever open the CURRENT week (same day)

Terra opened week 2 session 1 from View full block and saw week 3's photo under
KAS Glute Bridge. She diagnosed it herself, correctly: *"because when i click
edit this session, it opens the current week (week 3)."* One bug, not two -- she
was looking at week 3 the whole time, so the photo was right and the screen was
wrong. **The photo is what made a long-standing navigation bug visible.**

`plan.js` computed the week from **today** in both the group and SPC branches
and used `params.weekNumber` only as an equality check, to decide whether to
bypass the weekly cap. So the week could never be navigated to -- it could only
be confirmed. Every handoff from a past week silently landed on the live week,
with that week's sets, notes and photo under the same lift.

The equality check was deliberate and its comment says why: a My Week link
generated last week and tapped after a rollover must not force a week that is no
longer current. That is right for My Week's bubbles, which are always about the
current week, and wrong for View full block, whose entire purpose is browsing
other weeks. **So the fix distinguishes the two rather than removing the guard**:
`plan-block.js` and `plan-spc-block.js` send `exactWeek: "1"`, My Week
deliberately does not, and only that flag lets a requested week win. Bounded to a
week that has actually started, since a future week has nothing to edit.

Two preconditions were checked before trusting this rather than assumed:
`datePerformed` already derives from the completion's own `completed_at`, so a
past session keeps writing to the day she trained; and the block view only ever
shows the CURRENT block (`getCurrentBlock`), so this is weeks within one block,
not arbitrary history. A past session that was never completed is `backlog` in
the sheet and finishes there without ever handing off, so the handoff path always
has a real completion date.

**Verified**: 15 assertions against the **shipped** resolution expressions --
week 2 honoured with the flag, ignored without it (the stale-link guard intact),
future weeks, week 0, NaN, a non-numeric week, another program's id, and the
SPC/group branches each ignoring the other's params.

**Not verified**: anything behind a real login, and none of it on native or on
Android Chrome. Worth Terra's pass: take a real photo on a phone, confirm it
opens the camera rather than a file browser, confirm the thumbnail appears on
the card straight away, that the paperclip shows on that session in History, and
that View full block -> a past week -> "Update this session" now opens THAT
week.

## Conditioning: zone 2 cardio as its own program (2026-09-13)

A new program type with no programming behind it. Migration `0130`, applied
and verified live. Decisions taken with Terra: it **counts as being in the
gym** (dashboard "girls in this week"), a member **can log more than her
target** and it still counts, **no missed-session flags**, and the coach gets
a **1x/2x/3x frequency** control now even though everyone starts at 1x.

**Its own two tables, deliberately not a group program, not SPC, and not
`programming.logs`.** Group/SPC carry blocks, weeks and exercises that every
reader would have to learn to skip for a program with none. `logs` is
set-shaped and its unique index broke production once when widened. A
session is one `conditioning_logs` row: `performed_on` (a Boise DATE, so
"which week" is string comparison, never a timezone bug), required
`duration_minutes`, optional `avg_heart_rate` (not everyone wears a monitor),
optional `feel` 1-5, `notes`. Logging IS finishing: there is no finalize step.
Enrolment mirrors `spc_clients`: switching off writes `inactive` so her
frequency survives. Everything lives in `lib/programming/conditioning.js`,
including `FEEL_OPTIONS` (😣 Rough, 🙁 Hard, 😐 Okay, 🙂 Good, 😄 Great, the
word under each face is load-bearing) and `describeConditioningLog`.

- **Coach**: a Conditioning card on the client page's Programs tab (switch +
  1x/2x/3x), and on My Training for a coach's own account. The Training
  history tab adds `ConditioningHistoryCard` under the lift history. Weekly
  target/completed on the Programming snapshot include it. No membership pill:
  there is no conditioning page to link to.
- **My Week**: a `ConditioningSection` card, one stripe per target session plus
  one per extra she logged, logged stripes captioned with the weekday, open
  ones "Anytime". Tapping opens `ConditioningSheet` ("Log this session", or the
  logged numbers + "Update this session"), which hands off to My Fitness with
  `session: "conditioning"` (+ `conditioningLogId`). The hero offers it after
  every lifting option; hero totals cap it at the target so "4 of 3" can't show.
- **My Fitness**: `focus.type === "conditioning"` renders `ConditioningForm`.
  Once the week's target is met it shows a done card with "Log another
  session" and this week's entries. A deep link naming an older log (from My
  History) fetches it as `extraLog`. It joins the program picker only while
  due, and becomes the focus automatically when it's all she has.
- **My History**: By Day gets a "Conditioning" row (opens the sheet); the
  Exercises view gets an expandable `ConditioningPanel` with average heart
  rate and time trend charts and every session. The panel lives inline rather
  than as a `history/conditioning` route on purpose: a new route in that
  folder needs a `href: null` line in `app/(member)/_layout.js`, which another
  session had open.
- **Gym week band** (`gymWeek.js`): conditioning enrolment joins the training
  roster and this week's logs count as sessions; `GymWeekModal` renders them as
  plain rows (a `SessionRow` would fetch that day's lift logs).
  `useHasFitness` includes it, so a conditioning-only member gets My Fitness.

**Placeholders are a dash, never a sample number**: a grey "45" in the time
box read as already entered, the same trap as the old warm-up placeholders.

**Verified**: RLS as a real member (above); `npm run build` + `check:routes`
clean; a Babel parse / unresolved-identifier / unused-import /
missing-named-export pass over all 13 touched files; the form and sheet driven
at 390px through a throwaway route (deleted): blank time blocked with a message,
feel select and re-tap clear, logged sheet showing minutes/bpm/feel and Update.
**Not verified behind a real login**: My Week's card, the My Fitness hand-off,
My History, the coach toggle. Worth Terra's pass: turn it on for a test client,
log one from My Week, check it on the coach's Training history.

## Member block overview + the four-state session sheet (2026-08-15)

A handoff (`design_handoff_member_block_v1/` — README + `.dc.html` turns 13/14
+ 9 screenshots) covering the two connected surfaces that had never been
designed: the screen behind *View full block ›*, and the sheet that opens when
a member taps a session. **My Week itself is not redesigned** — hero, program
cards, stripes and ring all stay; it gains exactly one thing (below).

**The counting rule that drives the whole thing: a week is measured against
the member's own `sessions_per_week`, never against how many sessions the
coach published.** A 3× member who trained twice reads `1 missed`; a 2× member
who trained twice reads `Complete` even with an untouched third session on
screen. The shortfall is the number shown — a ratio would invite a 2× member
to read her own finished week as incomplete. The block hero's denominator is
`weeks × her target` for the same reason: it can't move as sessions get
written. And **nothing unpublished is drawn** — a week with no published
sessions isn't rendered at all, so the page ends where the program does; a
week published 2-of-3 pads its row with an empty spacer so the two tiles keep
their width.

**Block overview** (`app/(member)/plan-block.js`, new `components/
BlockProgressHero.js` + `BlockWeekCard.js`) — dark one-line hero (`Block 12 |
Week 3 of 6`, thin bar, `9 of 18 sessions done`) over one status-tinted
container per week: pale olive Complete, pale red `N missed`, clay This week,
warm grey Coming up. Tiles say **`Session N`, never the coach's title** — a
title is optional and a grid alternating between named and unnamed tiles reads
as broken; the title lives on the session itself. "Block 12" is derived the
same way SPC's `labelBlocks()` does it (chronological position via
`listBlocksForProgram`, which members can read — same table `getCurrentBlock`
already uses), in its own try/catch so a failure just drops to "Week 3 of 6".

**The session sheet** — new `components/SessionSheet.js` + `components/
session/` (`SessionSheetParts.js`, `BacklogDatePicker.js`, `BacklogSetGrid.js`).
Four states switched on the session's **date and its completion row**, not one
`completed` boolean: `today` → "Log this session"; `backlog` → date question
then set entry, "Save this session"; `logged` → what she did, "Update this
session"; `future` → **no button at all**, just a line. Row anatomy is shared
by every state: position chip, lift name, prescription — nothing else, no
history or last-time weights (those belong in the logger, where she's actually
comparing). Consecutive singles share one card; each superset is its own
bracketed card with a rounds header. Logged rows put the sets in a full-width
row *beneath* the lift name, indented to the name column — structural, not
decorative: a five-set lift crushes the name if they share the line. Sets are
`flex: 1`, so three or five fit the same width.

**Two real bugs this fixes, both behavioural:**
1. **Back-logging recorded the wrong day.** The old sheet offered "Log
   session" for any incomplete session with no date question at all, so a
   session done last Thursday was stored as today. `BacklogDatePicker` asks
   first — Today plus the two days behind it as one-tap chips, "Pick a date"
   for anything older, and **never a day ahead**, since she can't have trained
   on one. The date locks once she starts entering sets (changing it mid-entry
   would split one session's log across two dates).
2. **A future session could be logged.** A session in a week that hasn't
   started now renders no button — deliberately removed rather than disabled,
   because a disabled button gets tapped.

**Set entry (14b) is a column per set** — reps on top, weight beneath, units
labelled once down the left edge instead of repeated in twelve boxes; empty
boxes stay dashed so an unfinished set is visible without an error state.
Persistence is the **same per-set `logResult` upsert the live logger uses**, so
a back-logged set is indistinguishable from one logged on the day — it just
carries the chosen date. Deliberately thinner than the live logger: no rest
timer, no last-time panel, no per-exercise ticks. She's catching up on
something already done, not working through it at a rack.

**My Week's one addition**: the session number in the label row that already
existed for `TODAY` (`S1`, `S2 | TODAY`, `S3`). Without it the stripe says
`WED / THU` and the sheet it opens says `Session 2`, with nothing shared
between them. That row already had an explicit height (see the v5 note on why
a `" "` placeholder collapses), so no layout risk. My Week's three preview
openers now also feed the sheet real state — a current-week session whose days
have already passed opens as `backlog` and finalizes right there; SPC and
one-offs have no day-of-week routing so they're `today`-or-`logged` with their
own pill (`THIS WEEK` / `ANYTIME`) via the sheet's `pillLabel` override.

**Real bug caught by looking rather than reasoning**: the sheet's `maxHeight:
"84%"` did **not** stop the ScrollView from sizing to its own content and
pushing the footer CTA clean off the bottom of the screen — a flex child needs
`overflow: "hidden"` on the container plus `flexShrink: 1` on the scroller to
actually give way. Clean bundle, clean console, and it would have shipped a
sheet whose button you could never reach on any session longer than about four
lifts.

**Deliberately left alone**: `SessionPreviewModal` still exists and is still
used by four **coach** screens (both builders, SPC templates, CoachHomeDesktop)
— the handoff's "replace" is scoped to the member surface. `plan-spc-block.js`
still uses `SessionDetailModal`; the handoff is written against the group block
page, and porting SPC is its own pass.

**Open questions the handoff raises and this build does not answer** (worth
Terra's call): whether a 2× member's untouched third session should be
loggable as a bonus (currently yes), whether pale red is too strong for a week
she was ill or travelling, and where a correction lives if a back-logged date
turns out wrong (13d/14c show the date as fact with no edit affordance).

**Verification**: all four sheet states and the block overview were rendered at
390×844 through a throwaway `app/zz-harness.js` route and screenshotted against
the mocks (harness deleted, `git status` confirmed clean); `npx expo export -p
web` clean; a Babel scope pass over every touched file, since Metro doesn't
resolve identifiers. **Not verified**: any of it behind a real login, or on
native — standing limitation. Worth Terra's click-through of a real block, a
real back-log save, and confirming the tile states against a week she actually
missed.

### Follow-ups from Terra's click-through

- **"This week" was a third tint and read as the red one.** The mock gives the
  current week a peach fill one shade off the pale red of a short week. It's a
  **white card with a 3px clay border, a larger week label and a filled `THIS
  WEEK` chip** instead — an outline, not a wash, which is also the app's own
  selected-state language.
- **Back-log dates run oldest→newest** (two days ago, yesterday, today) and
  "Pick a date" opens a real month grid (`lib/monthGrid.js`, future days inert,
  forward arrow stops at this month) rather than a 30-item dropdown.
- **Rest is out of the overview and the sheet** — `4 × 8`, not `4 × 8 | rest
  2:00`. It isn't set on every lift, so half the rows read as incomplete
  prescriptions. It still shows in the logger, where she's timing against it.
- **My Week's logged pill carries a real date.** It was fetching completions as
  a bare id Set; both group and SPC now use the `…CompletionDetails…` variants,
  so the pill reads `LOGGED AUG 11`.
- **The logger already kept a completed session's original date** (it derives
  `datePerformed` from `completed_at`, falling back to today only when there's
  no completion), so "Update this session" edits the day it happened. No change
  was needed — worth knowing before "fixing" it.

### The coach preview, and why it isn't a Preview button

The builder — even read-only — is a build surface, and doesn't hold up on a
phone. Coaches get the member's own block view instead, via
`components/coach/CoachBlockOverview.js` and `CoachSpcOverview.js` (one
component each, so the pushed web routes and the embedded native screens can't
drift).

**On native the overview IS the screen**, with nothing to press first:
`app/(coach)/blocks/index.js` (program pills + block) and
`app/(coach)/spc/[userId].js` (that client's block). Both were large build
grids and are now ~30-line screens; the grids survive untouched in their
`.web.js` siblings, which shadow these entirely on web. Each keeps one
`Manage blocks ›` link so a coach isn't locked out of block length / Extend /
rolling / past blocks from a phone. **What native deliberately gives up on the
SPC page** (Terra's explicit call): editing status, assigned coach and
sessions-per-week, the coach notes, recent sessions, and building from the
grid. The pre-restructure versions are in this session's scratchpad if either
needs reviving.

Two differences from the member view, both because it's a coach looking:
drafts are **drawn** (as the dashed tile) where the member view hides
unpublished sessions entirely, and the hero counts **published**, not
completed — a group block is shared, so there's no one person's completion to
report. `BlockWeekCard` gained a `neutral` tone for this; only the current
week is marked.

`components/BlockPicker.js` steps through blocks (a stepper, not a tab row —
a client with a dozen blocks wraps tabs into three lines on a phone).
`blockHeroTitle` keeps the hero honest across them: `Week 3 of 6` only for the
block covering today, else `Finished 06/23` / `Starts 09/08`. The default block
is **resolved, never written back to state** — setting it would change the
loader's own dependency and double-fetch on every open.

**Real bug worth remembering: `listBlocksForSpcClient` takes the USER id, not
`spc_clients.id`.** `spc_blocks.spc_client_id` stores the user id despite the
parameter name (every pre-existing call site passes `userId`; `getCurrentSpcBlock`
does too). Passing `spcClient.id` returns zero rows silently — it hit both the
new coach overview and, invisibly, the member SPC block page's hero label.

## Last time comes out of the input boxes (2026-08-15)

`design_handoff_member_lasttime_v1/` (README + 5 screenshots, no `.dc.html`),
prompted by a real report: members were confused by the grey number sitting in
each not-yet-logged reps/weight box. **This is the third attempt at the same
problem and the first that removes it rather than relabelling it** — worth
knowing before anyone reaches for a fourth. v5 put last time in as a plain
ghost; 2026-08-13 added `GhostSourceToggle`, a This time/Last time switch
picking the ghost's *source* with the ghost text colour-coded to match. Neither
worked, because the problem was never which reference it drew from — **anything
sitting inside an empty input reads as already-entered.** Terra's own read:
"its confusing to have them inside of the fields like that."

Direction **B** of the handoff (blank card, tap for everything) was chosen over
A (a one-line `last: 3 × 10 @ 135` under the name); A stays in the file as the
fallback if testing shows the tap is being skipped rather than taken.

**The card.** An empty reps box now holds the one thing that is unambiguously
NOT hers — the coach's prescription, tagged: `TARGET 8–10`, label first (a
trailing tag read as a unit), 1.5px dashed `#ddd6cd` on `#fdfbf8`, value
`#d5cdc4`. Empty weight boxes hold an en dash, since weight is never prescribed
in this gym and there is nothing honest to put there. Keyed boxes go solid
`#dbe8cf` on `#f3f6ef` at full size/weight. **Keyed is per BOX, not per row** —
typing reps without a weight settles the reps box and leaves the weight box
still asking; the clay border marks whichever box she's on. Nothing under the
lift name but `Logged 3 × 8 @ 185`, and only once the card is closed over it.

Two implementation notes that are load-bearing:
- **The target is an overlay (`TargetHint`), not the TextInput's placeholder.**
  A placeholder is one string in one style; the tag has to stay small enough
  that the number is still what you read. Its position is written out longhand
  — `StyleSheet.absoluteFillObject` inside a style array renders the view
  invisible on this app's Fabric build, which cost a whole session once
  already. `pointerEvents` lives in the style object so the tap still reaches
  the input.
- **Per-set targets are the strongest argument for the whole design**: a
  `10/8/8` scheme reads `TARGET 10 / 8 / 8` down the column, which is exactly
  what one summary line could never say. That's why `targetLineFor` was deleted
  rather than kept alongside.

**The sheet** (`ExerciseHistoryModal`, rewritten) is now the ONLY place a
member sees what she lifted last time. Three sessions, one row each, date +
"10 days ago", every set as its own pill in columns that align across the three
rows; most recent tinted peach and tagged `LAST TIME`; `View full history ›`
into My History. Three rather than one because the question is "should I go up
today", not "what did I do"; set-by-set rather than a summary because the
summary hides the case that decides it, where last week's third set dropped
off. The chart and full log deliberately did NOT get rebuilt thinner in here.

**Deleted**: `GhostSourceToggle.js` and its threading through `plan.js` →
`SessionHeroBar` → `SessionLogger` → `ExerciseCard`; `targetLineFor`;
`SessionLogger`'s batched `listLastLoggedSessions` call. That last one is a
real efficiency win — history is now fetched lazily, for one lift, only when
the sheet opens, taking a query off every session load and every refocus.

**Kept, though the mock doesn't picture them**: `Coach note:` / `Cues:`, which
only render when the coach wrote something (their absence in the mock is the
example lift, not a decision), and a **new `Tempo:` line** — tempo lived only
in the deleted `targetLineFor`, so without it it would silently stop reaching
members, exactly how cues went unseen for months. Sets/reps moved into the
boxes and rest is already under the stopwatch, so neither needed a home. Also
kept the collapsed `Logged …` line, which screenshot `15b-1` omits: the README
rules out "no last-time line, no per-set chip, no summary of what was asked
for", and a record of what she *did* is none of those three.

**Answers to the README's five open questions**, decided rather than sent back:
last time = the last time she **logged** it (same-slot-previous-week breaks the
moment she misses a session); fewer than three sessions shows what exists, with
a first-time lift getting "First time logging this lift." and the name still
tappable so the affordance doesn't silently vanish on some lifts; uneven set
counts stay exactly as logged, since an invented empty pill reads as a set she
skipped rather than one never asked for; `GOAL` → **`TARGET`**, because
nutrition already uses "target" throughout and Terra confirmed; rest unchanged.

**Three real bugs found after the first pass, two of them mine:**
1. **`daysBetween` is A minus B, so today comes FIRST.** The other order made
   every past session render as "today". CLAUDE.md already warns that the five
   copies of this helper have three different rounding/offset semantics — this
   is what that warning looks like in practice. Check the signature, don't
   infer it from the name.
2. **`listLogsForExercise` had no date cutoff**, so her own autosaved sets came
   back as the most recent entry and got tagged `LAST TIME` within seconds of
   typing them. The old ghost query (`getLastLoggedSession`) took a `today`
   parameter for exactly this reason and it wasn't carried over. Now takes an
   optional `before`, passed by the sheet and by the full-history screen when
   either is reading history *of* a session she's currently in. **It's the
   session's date, not literally today** — back-logging Thursday's workout has
   to compare against what came before Thursday. My History reached normally
   still shows everything, since a finished session today is genuinely history.
3. **The full-history screen's back button landed on My Week.** Pushing
   `history/[exerciseId]` from My Fitness enters the History tab's own stack,
   so `router.back()` hands control to the tab navigator rather than returning
   where she came from — the existing `canGoBack()` guard was doing what it was
   told, the stack just doesn't mean what it looks like it means across tabs.
   Fixed by carrying the origin explicitly: the sheet passes **`restReturnTo`**
   (JSON-stringified, since route params must be strings), which already
   existed for the rest timer's "Back to lift ›" and resolves the *specific*
   session. That mattered — a plain push to `/(member)/plan` would have
   silently dropped her onto today's session even when she'd deep-linked in to
   update a past one. Label reads "‹ My Fitness" when it's set, "‹ My History"
   otherwise; the read-only card in My History is untouched.
   **Worth generalising: `router.back()` is not trustworthy for a push that
   crosses tab stacks — carry the origin.**

**Verification**: driven and screenshotted at 375px via a throwaway
`app/zz-harness.js` route (a top-level route rather than mounting on
`login.js` — it can't strand sign-in if teardown goes wrong), covering the
target boxes, per-set schemes, the keyed/current/unkeyed treatments, the sheet
at 3 and 5 sets, the first-time empty state, and the title colours measured out
of the DOM (`rgb(164,106,87)` name, `rgb(213,205,196)` target label) rather
than eyeballed. `expo export -p web` clean, plus a Babel parse/scope pass over
every touched file — Metro resolves no identifiers, so a clean export is weaker
evidence than it looks. **A measurement gotcha worth remembering**: the sheet's
footer button measured at y=1552 in an 812 viewport and looked like the
classic flex-child overflow bug — it was the Modal's own slide-up animation
caught mid-flight. Re-measure after it settles before "fixing" a non-bug.

**Not verified**: anything behind a real login, or on native. The two
navigation behaviours (back landing on the right session, the sheet excluding
today) both need real logged sets. Dashed borders with a corner radius render
solid on iOS in some RN versions — other screens here use them fine, so
probably OK, but the target overlay is exactly the kind of absolutely-
positioned element this codebase has been bitten by twice.

### Follow-ups from Terra's click-through

Back button and the today-cutoff both confirmed working on her side. Three more
reports, only one of which was a bug in this pass:

- **History showed a session of dashes.** Real regression, mine. `logResult`
  updates an existing row **even to null**, deliberately — clearing a field you
  had already filled in is a genuine edit that has to persist — so typing `10`
  and deleting it leaves a row with reps AND weight null. The insert path is
  already guarded against creating blank rows; it's the update path that leaves
  husks, and that's correct. `getLastLoggedSession` has always skipped them,
  and the rewritten sheet never got that guard. Both the sheet and
  `history/[exerciseId].js` now filter `reps !== null || weight !== null`
  before grouping, and a date left with nothing real drops out rather than
  rendering as dashes. `LiftProgress` (`weight == null` continue) and
  `exerciseStats.topSetOf` already guarded, so the per-date lists were the only
  surface still showing them. **Filtering at read also fixes the junk already
  in the table, with no cleanup migration.**
- **"Dustin's SPC sessions aren't pulling" was not a bug.** Checked against the
  live DB rather than guessed: his block runs 2026-08-01 → 08-28, today is week
  3, and **both of week 3's sessions are drafts with zero exercises** (week 2
  session 2 likewise, with one). Member RLS requires `status = 'published'`, so
  drafts are invisible at the database level — an empty member view is the app
  being right. Worth reaching for this check first whenever "a member can't see
  their session" comes in: query `spc_workouts.status`/exercise count before
  reading any code.
- **A `.web.js` sibling shadows its native file on web at ANY width — the
  platform extension splits web from native, NOT desktop from phone.** This is
  the trap worth remembering. `d2ecefa` put the new coach block overviews in
  `blocks/index.js` and `spc/[userId].js` (native-only), so the installed PWA —
  which is web — kept serving the 40KB desktop build grid on a phone, and Terra
  reported the mobile coach view as "showing the desktop version of the
  builder". Fixed with the pattern `CoachShell` already uses: both `.web.js`
  screens now branch on `useWindowDimensions()` against `MOBILE_BREAKPOINT`
  (now **exported** from `CoachShell` so there's one definition, not a third
  copy) and render exactly what native renders below it. **Each screen is two
  components with a branch, not an early return inside one** — the desktop grid
  runs a long list of hooks and an early return would break hook order; only
  one component is ever mounted, so each keeps its own stable order.
  - The overview was already reachable on web via a "Preview" button on the
    desktop grid (`blocks/overview.js` / `spc/overview/[userId].js`), so this
    isn't new surface — it just makes phone-width land there directly instead
    of expecting a coach to find a button inside a grid she can't use.
  - **Applies to every future native/web split**: if a screen has a `.web.js`
    sibling and the native version is the phone design, the web sibling needs
    this branch or the PWA silently gets the desktop build.
  - **Audited all 14 coach `.web.js` files** (2026-08-15). Branching correctly:
    `index.web.js` (Coach Home, which has done this since it was built — its own
    local `MOBILE_BREAKPOINT = 768`), `nutrition/index.web.js` (internal
    `isMobile` at 900), `blocks/index.web.js`, `spc/[userId].web.js`,
    `spc/index.web.js`. **Still unbranched with a fixed-width table**:
    `clients/index.web.js` — it renders `ClientRosterTable`, whose `TABLE_WIDTH`
    is the sum of six fixed columns, so it squeezes exactly the way the SPC
    roster did. Not fixed unilaterally because the native clients list drops the
    flag/last-session columns, which is a real trade for Terra to make rather
    than a straight bug fix. Lower confidence: `exercises/index.web.js`
    (a table, one fixed width) and `payroll/admin/report.web.js` (several, but
    admin-only desk work). Deliberately desktop-only regardless: the three
    builders, `spc/print/[blockId].web.js`, `_layout.web.js`.
  - **NEVER import the native sibling from inside the `.web.js` file.** Metro
    applies platform-extension resolution to plain imports, not just to routes,
    so `import Native from "./index"` written inside `index.web.js` resolves
    straight back to `index.web.js`. The "native" component is then the file's
    own default export, and at phone width the branch renders itself forever:
    stack overflow, page dies, Safari reloads, and after a few rounds you get
    "A problem repeatedly occurred." It cost a real production crash loop on
    the SPC roster (2026-08-15), and its quiet failure mode is worse than its
    loud one — at desktop width the branch never fires, so it looks fine, and
    the phone symptom reads as a stale cache. **Put the shared screen in
    `components/` where nothing has a `.web.js` sibling** (see
    `components/coach/SpcRosterMobile.js`, `components/coach/CoachBlockOverview.js`)
    and have both the route and the web file render that.

## WebKeyboardViewport does nothing on focus, on purpose (2026-08-15)

`components/WebKeyboardViewport.js` (added by `171a6b4`, "Push the web layout
up when the keyboard opens") made it impossible to sign in on a phone. Tapping
the email field on `/login` opened the keyboard and closed it again instantly,
in the installed PWA *and* in a plain browser tab — so nobody on mobile web
could log in at all. That commit's own message flagged it as needing "a
click-through on the PWA and TestFlight"; this is what that click-through
found.

**Cause**: it listened on `focusin`/`focusout` and from there did three DOM
writes in the middle of the focus gesture — rewrote the viewport `<meta>` to
pin `maximum-scale` (guarding against iOS auto-zooming sub-16px fields),
`window.scrollTo(0, 0)` to unwind Safari's keyboard pan, and `scrollIntoView`
on the focused field. On WebKit any of those can cost the focus, and losing
focus closes the keyboard the tap just opened; the visual viewport then springs
back and the resize handler runs again.

**Took two attempts**, worth knowing why: removing only the two scrolls left
the meta rewrite, which sits behind a `!standalone` guard — so the installed
PWA and a browser tab take *different* paths through the same component, and a
fix verified against one says nothing about the other. Test both.

**Now**: no focus listeners at all. It is a passive observer — the visual
viewport shrinks, the root element shrinks to match, which is the whole reason
the file exists. **Auto-zoom on sub-16px fields and scroll-into-view are
unsolved again**; if either needs fixing, get a real device first. This has now
been reasoned about wrongly twice from a desktop, and a desktop browser cannot
reproduce any of it — with no on-screen keyboard the entire code path no-ops.

## Android login: the keyboard closed itself — `keyboardDismissMode="on-drag"` on web (2026-08-18)

A member on Android, installed PWA: tap the email field on /login, the
keyboard appears and disappears immediately. Same *symptom* as the iOS
focus-drop fixed on 2026-08-15, entirely different cause, and it survived
every iOS fix because iOS never exercises the code path.

**Root cause, reproduced in the browser rather than reasoned**: `AuthScreen`
(`components/auth/AuthChrome.js`) was the one ScrollView in the app with
`keyboardDismissMode="on-drag"`. On react-native-web that prop is implemented
as **"blur the focused TextInput on ANY `scroll` event of this ScrollView"**
(`ScrollView._handleScroll` → `dismissKeyboard()` →
`TextInputState.blurTextInput`) — a real drag is not required. On Android,
`interactive-widget=resizes-content` shrinks the layout on keyboard-open,
Chrome scrolls the focused field into view *inside that ScrollView*, that fires
`scroll`, RNW blurs the field, keyboard closes. iOS was immune only because
Safari scrolls the *document* (the ICB doesn't shrink there), so the
ScrollView itself never fires. Proof: with the field registered as focused, a
single dispatched `scroll` event on that node moved `activeElement` from the
input to `<body>`; after the fix, repeated scroll events leave it focused.

**Fix**: `keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"}`.
Native keeps real drag-to-dismiss. **Rule: never set `on-drag` on a web-
reachable ScrollView** — grep for it before adding one; there are now zero on
web.

**Two testing traps that made the first repro attempt pass falsely**: (1) in
the hidden Browser pane, `input.focus()` sets `activeElement` but fires no
focus *event*, so RNW's `TextInputState._currentlyFocusedNode` stays null and
`dismissKeyboard()` is a silent no-op — dispatch a bubbling `focusin` after
`focus()` to register the field the way a real tap does; (2) real `scroll`
events don't dispatch while the pane is hidden (rendering-tied, like rAF and
ResizeObserver) — dispatch `new Event("scroll")` on the node to exercise the
handler.

**New opt-in diagnostic**: `components/KeyboardDebugOverlay.js`, mounted in
`app/_layout.js`. Off by default; open any page with `?kbdebug=1` for a
fixed on-screen panel (browser/UA, standalone vs tab, innerHeight, visual
viewport height/offset, ICB/#root heights, scrollY, focused field's rect, and
a timestamped focus/resize/scroll log). Sticks per tab via sessionStorage;
`?kbdebug=0` clears. Read-only, pointer-events none, its own DOM node outside
React. This is the "on-screen event log" technique from the iOS session made
permanent, so a member on a phone we can't simulate can hand over the numbers
in one screenshot. Note: no Android SDK/emulator exists on this Mac; Android
Studio + an AVD (Chrome inside, dev server at `10.0.2.2:8081`) would make
Android verifiable here.

## Auth fields behind the keyboard: the shell fix, then the hero collapse (2026-08-15)

Two commits, and the second only exists because the first was half a fix.

**`171a6b4` — the shell.** Expo pins the app to `#root,body,html{height:100%}`
+ `body{overflow:hidden}`, and iOS shrinks the VISUAL viewport on keyboard-open
while leaving the LAYOUT viewport alone. So `height:100%` never changes, the
page keeps rendering full-height, and the bottom ~45% sits under the keyboard.
Measured on `/login` at 375x812: the email field's only scrollable ancestor
reported `scrollHeight 720 === clientHeight 720` — nothing could scroll,
anywhere. That's why it read as "a common theme" rather than one screen's bug.
`WebKeyboardViewport` shrinks the root to `visualViewport.height` (the web
equivalent of Android's adjustResize, which this codebase already assumes).
Note `automaticallyAdjustKeyboardInsets` is an **iOS-native prop that
react-native-web's ScrollView never reads** — it has always been a no-op on the
PWA, so any comment claiming it covers web is wrong. Same commit: auth inputs
15px → 16px (iOS auto-zooms anything smaller), `interactive-widget=resizes-content`
so Android does this natively, and `overflow:hidden` on the auth shell — its
bottom-right decorative blob (`right:-110`) was unclipped and pushed document
scrollWidth to 486 against a 375 viewport, which iOS lets you pan sideways
("it doesn't hold its shape").

**`b7b0fe7` — the hero collapse.** Shrinking the root makes a screen
*scrollable* but nothing scrolls the field into view, and per the section above
nothing may. `/login` only looked fixed because its fields happen to land inside
the strip already. On `/register`'s code step the visible strip is **377pt**
while the password field sat at **429-477pt**. New `AuthHero` (in `AuthChrome`)
drops the mark/heading/explainer while the keyboard is up, reclaiming ~152pt —
a pure render, no scrolling, no focus contact. Applied to register (both steps),
reset-password (both steps), set-password. Native gets a 0 inset from
`useKeyboardInset` and keeps its hero.

**Three things measured on device that are worth not rediscovering:**
- **Deferring a scroll does not make it safe.** A `scrollIntoView` debounced
  300ms — deliberately long after the focus gesture — still produced `focusout`
  308ms after the keyboard opened. There is no safe moment to scroll while an
  iOS keyboard is open, not merely no safe moment during focus.
- **Collapse the minimum that works.** Also wrapping the back-button row
  (~236pt) made Safari pan the visual viewport, which changes `vv.offsetTop`,
  which flipped the hook to "no keyboard", which re-showed the hero — a visible
  oscillation.
- **`useKeyboardInset` and `WebKeyboardViewport` can disagree.** The hook
  subtracts `vv.offsetTop` (correct for placing a bottom sheet) so it reads "no
  keyboard" once Safari pans. `AuthHero` therefore compares `visibleHeight`
  against the layout viewport — the shim's exact test, same 80px floor. The hook
  is unchanged; its own callers need offsetTop. If a bottom sheet misbehaves
  mid-pan, this is the thread.

**How it was verified, since a desktop browser genuinely cannot reproduce any of
this**: booted iPhone 17 Pro simulator, real Mobile Safari, dev server over
`http://localhost:<port>` (the simulator reaches the host's localhost directly —
`xcrun simctl openurl <udid> <url>`). The decisive tool was an **on-screen event
log** rendered into the page (focusin/focusout/vv.resize with timestamps), which
gives the whole story from a single screenshot even after the keyboard has
closed — far better than tapping and guessing, and it's what pinned the 308ms
focusout to the debounced scroll. Still unverified: set-password and
reset-password's code step (structurally identical, not individually driven).

## Tweak batch: reps-only lifts, Flagship→Group, nutrition notes + finalize undo (2026-08-17)

A batch of ~9 direct tweaks in one session. Three commits (`2d40329`,
`09fbbf5`, `1cb02d4`). Worth reading for the four real bugs found along the
way, two of which would have shipped silently.

**Reps-only lifts** (migration `0064`, run). `exercises.tracks_weight`,
default true. A lift with nothing to load — inverted row, push-up, plank —
was still asking for a weight, and the card could never read as done
because its weight box stayed empty forever. On a reps-only lift the weight
column **disappears** rather than being disabled: a greyed box still reads
as something she failed to fill in. `isLogged`, the auto-complete check and
the autosave all stop waiting on it; the "last time" pills drop their weight
line (a dash under every pill reads as missing data, not "there is none");
both libraries show a `reps only` pill. **No PRs for those, per Terra's
explicit call** — the existing `weight != null` guard covers a lift that
never logged one, but an exercise *switched* to reps-only can still have
older weighted rows behind it, so the exclusion is explicit in all three PR
paths (`getExerciseStats`, `countPersonalRecordsOn`, `getSessionBests`).
**Known gap, flagged not built**: `LiftProgressSection` returns null without
a weight, so a reps-only lift shows no progress chart at all. Those lifts do
progress — on reps — and charting that is a real change nobody asked for
yet.

**Default sets/reps now apply to lifts.** The columns have existed since
0012 and `ExerciseFormModal` already had the fields; `lib/programming/
exercises.js` was simply nulling them out for anything that wasn't a
warm-up. Wired through every insert path. **SPC deliberately differs**: it
already seeds from that client's most recent log, which is better
information than a library default, so the order is last-logged → library
default → 3×10.

**"Same for the rest"** on the logging card — carries set 1 down the lift,
appearing only when set 1 is complete and something below it is empty, and
only filling the gaps. This is the explicit version of the carry-over
prefill removed in the lift_v1 pass; that one pre-filled boxes she hadn't
done yet, which made an untouched set read as already logged. **Reversal of
a deliberate decision, at Terra's request** — the note in that section
predicted she'd want the speed back, and she did.

**Flagship renamed to Group.** One row (`group_programs.name` has been free
text since 0010) plus a sort pin, a stale subtitle, and the log-source tag.
New rows tag `source: 'group'`; nothing reads that column back (history
matches on the completion row), so older `'flagship'` rows are harmless.

**Real bug the rename would have caused**: `getCoachDashboardStats` looked
the program up by the literal string `"Flagship"`, so the tile would have
silently zeroed. The same hardcoding meant **LLYL (6 members) and Trial
Group (5) had never appeared on the dashboard at all** — it only ever knew
about two programs. The roster row now builds one chip per program from
whatever exists, since programs have been coach-creatable since 0010.
Worth remembering as a class: **grep for hardcoded program/exercise names
before any rename**, and treat a by-name lookup as a bug in its own right.

**"Logged today" on Coach Home mobile** put the 7-day average in the
subtitle under the name and today's weigh-in on the far right edge. They're
one group on the right now (`avg | today | delta`, down olive / up clay,
matching the nutrition dashboard's own weight line). Column labels moved
into a **single table header** rather than sitting on every row: repeating
them cost enough width to truncate real client names. Columns are sized off
**measured** text — the name box is 162px against the 156px "Lauren
Bottelberghe" actually needs — with the delta column giving up its slack to
pay for it. Note the average includes today's weigh-in, so the delta is
slightly conservative; left as-is because redefining it here would make this
list disagree with every other screen.

**"Game plan" is called Notes**, and the Check-In tab's right rail **no
longer freezes when finalized** — it used to switch to the focus/game-plan
copy captured onto the response row, which was never referenced and read as
"wait, I thought I just changed this" next to the live one. **This
supersedes the phase-5 decision to render those snapshots.** The columns are
still written (harmless, reversible), just never displayed.

**New `components/nutrition/ClientNotesBubble.js`** — Notes + Focus
reachable from any tab of a client's nutrition record. Reuses `GamePlan`
and `FocusChecklist` rather than reimplementing either. **Bottom-LEFT
because `CoachMessageBubble` already owns bottom-right there**; stacking
them is worse, since that bubble is gated on the messaging kill switch and
this one would hover above nothing for a client with messaging off. Same
Modal rule as the other two bubbles: the idle control is NOT wrapped in one.
- **`GamePlan` gained `saveIfDirty()` via `forwardRef`/`useImperativeHandle`**,
  because "click off and it minimises" would otherwise bin an unsaved note
  (it saves on an explicit button). It returns `unchanged`/`saved`/`failed`,
  **not a boolean** — on a failed write the sheet has to stay open with the
  text on screen; closing would drop it and a toast wouldn't bring it back.

**The green "Check-in completed" pill is now the undo.** Finalizing is one
click with no confirmation, so a misclick was permanent from inside the app.
No confirmation on the undo on purpose — this *is* the recovery, and
friction on the escape hatch is backwards. **Real bug caught while wiring
it**: the first version targeted `selectedWeek` (whatever the Check-In tab
is paged to) while the pill's label derives from `currentCheckin` (this
week), so a pill reading "Awaiting her check-in" could quietly reopen a
different week than the one it names. It targets the current week and only
renders as pressable when the pill genuinely reads "Check-in completed".

**`countPersonalRecordsOn` didn't select `exercises` at all**, so the
reps-only guard added to it would have silently never fired — clean bundle,
clean scope pass, and a no-op. Found by grepping the function's own query
rather than trusting the guard read correctly. **Worth doing whenever a
guard is added to a batched query: confirm the column it reads is actually
in the select.**

**"Liza was instantly due for a check-in after onboarding" was not a bug.**
She has 24 check-ins and an unbroken weekly cadence back to March —
`start_date`/`objective_tracking_approved_at` are both `2026-03-02
15:00:00+00`, the on-the-hour stamp of the tracker backfill. She's a
migrated client, correctly read as ongoing. **Check whether a "new" client
is actually new before treating this shape of report as a bug.** Terra's
stated wanted behaviour (a genuinely new client isn't due until the Sunday
after approval) is unverified and unbuilt.

**Gotcha that cost a live error**: converting `GamePlan` from `export
function` to `export const … = forwardRef(…)` **breaks a running dev server
until Metro is restarted** — React Fast Refresh handles a component's body
changing but not its export identity, and throws "Component is not a
function … `Component` is an instance of Object", attributed to a
*neighbouring* element in the same rail rather than the culprit. Verified
the code was fine by cold-rendering the exact failing rail. **Warn Terra
whenever a change alters a component's export shape.**

**Verification**: `npx expo export -p web` plus a Babel parse/scope pass
after every batch (a clean export alone does not resolve identifiers). The
reps-only card, the fill-down (driven for real — typed set 1, tapped, all
six boxes filled), the notes bubble (including a failed save keeping the
sheet open with the text intact), the weigh-in row (measured in the DOM, not
eyeballed) and the undo pill were all rendered and driven through a
throwaway `app/zz-harness.js` route. **Not verified behind a real login** —
standing limitation.

**Left from this batch — all three done 2026-08-18**, see the next section:
bar→line graphs with a 1m default, the questionnaire surfaced as her first
check-in, and the week selector. The "open problem" flagged here (highlight
storage for questionnaire answers) turned out not to exist — the column was
already there.
