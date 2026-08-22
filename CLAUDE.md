@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What this is

The Kova Strength unified app — replaces TrueCoach for programming (~150 Flagship + ~60 SPC clients) and will eventually absorb the separate Nutrition Tracker app's core loop too, all behind one login. Ships as native iOS/Android apps plus a web build, from one Expo codebase. Coaches do the majority of real program-building work on the web build; the native app is for members' day-to-day use and coaches' light on-the-go adjustments + push notifications.

Full build plan: [build-plan.md](build-plan.md) — read this first, it covers the architecture decisions and why (native+web from one codebase, drag-and-drop web-only, shared-Supabase-project-with-new-schemas, etc.). Programming's feature spec: [gym-app-spec.md](gym-app-spec.md).

**Status**: Phases 1-5 built and verified (Foundation, Workout Builder, Group Programming + Client Portal, Nutrition core loop, SPC). See build-plan.md's "Build order — status" section for the current checklist.

**Superseded**: Nutrition was originally a one-time port of the standalone Nutrition Tracker app's core-loop logic against Kova's own placeholder `nutrition.*` schema — that's gone. As of 2026-08-02, Kova's nutrition module reads/writes the exact same live `public.*` tables the standalone app itself uses (same Supabase project, different schema) — see "Nutrition rebuilt against the standalone app's live tables" below for the full rebuild, including onboarding, photos, and the coach's full 6-tab client detail page. The old `nutrition.*` schema and its `lib/nutrition/*` placeholder functions are dead code, left inert rather than dropped.

## Design/UX pass — status

Phases 1-5 (above) are the functional build. Separately, a visual/UX design pass is underway — not in `build-plan.md`'s phase numbering, tracked here instead.

**Done:**
- Design tokens: `stone-*` replaces `neutral-*` app-wide, `lib/theme.js` has `colors.primaryOnWhite` (`#8a5140` — use for brand-colored *text* on white; `colors.primary`/`#a46a57` is for fills/icons/borders/large headings only, it fails AA contrast as body text) and `statusColors`/`components/StatusBadge.js` (shared 4-tone pill: urgent/needsAction/onTrack/paused). **Status labels have no emojis** — removed after user feedback that they read as unprofessional; if you're tempted to add an emoji to a status label, don't, the colored `StatusBadge` background already carries the signal.
- Real tab navigation: `(member)` and `(coach)` route groups both use Expo Router `Tabs` (see `app/(member)/_layout.js`, `app/(coach)/_layout.js`) instead of the original plain `<Slot/>` + text links. `@expo/vector-icons` was added as a real dependency for this (the design handoff doc claimed it was already available — it wasn't, check before trusting a handoff doc's dependency claims).
- Member "Today" tab is read-only status (session preview, SPC teaser, nutrition status) — actual set-logging moved to new `app/(member)/session.js` (group) and `app/(member)/spc-session.js` (SPC, wraps the existing `SpcSessions` component) routes, reached via a "Start session" button. Member Nutrition tab got a segmented control (`components/SegmentedControl.js`) for Today/Check-in/History.
- **Web coach shell**: `(coach)` gets a persistent left sidebar on web (`components/CoachShell.js`) instead of inheriting the mobile tab-bar styling — `app/(coach)/_layout.web.js` renders no chrome of its own (just the auth gate), `CoachShell` is a no-op passthrough on native and the actual sidebar on web, and every coach screen wraps its content in `<CoachShell>` to opt in (the workout builder screens deliberately don't, staying full-bleed since they need the width — they got a "‹ Back" link instead). Sidebar nav is flat: Dashboard/Clients/Group Programs/SPC/Nutrition/Exercise Library/Settings.
- New shared `lib/programming/coachDashboard.js`'s `getCoachDashboardStats()` — one aggregation function both `app/(coach)/index.js` (native) and `app/(coach)/index.web.js` (web, wider 2-panel layout with more stat tiles) read from, instead of duplicating the fetch. All fields are client-side aggregations over existing data — no new tables, no billing/revenue data (this app has none, unlike generic gym-management dashboards).
- **Bug fixed**: `expo-router`'s `Slot` (what `<Link asChild>` renders through) throws if the child `Pressable`'s `style` prop is an array — `style={[a, b]}` must be flattened to a single merged object (`style={{...a, ...b}}`) before passing through an `asChild` boundary. Hit this in the SPC roster; checked every other `Link asChild` spot in the app for the same pattern, only that one had it.
- **Clients list rebuilt** (`app/(coach)/clients/index.js`): all 4 program "possibilities" (Flagship/BWA/SPC/Nutrition) show as bubble pills per row. Rows are **locked by default** — bubbles visible but inert. A per-row lock icon (only one row unlocked at a time) enables editing; unlocked, Flagship/BWA are a mutually-exclusive 2-state pair, SPC/Nutrition keep their existing 3-state cycle (`handleSpcToggle`/`handleNutritionToggle`). When a row is locked, clicking it (not a bubble) navigates to the client profile page instead of editing inline.
- **Client profile page** (new, `app/(coach)/clients/[userId].js`): a read/link hub for one client — group program (plain text), SPC status + link to `/(coach)/spc/[userId]` if enrolled, Nutrition status + link to `/(coach)/nutrition/clients/[userId]` if enrolled. Backed by two new single-row getters: `getAssignment(userId)` in `lib/programming/clients.js` and `getNutritionClient(userId)` in `lib/nutrition/clients.js`.
- **SPC page regrouped**: status is now the primary grouping on both platforms (coach demoted to a filter chip row). `STATUS_LABELS`/`STATUS_TONES`/`STATUS_ORDER` extracted into shared `lib/programming/spcStatus.js` (needed since `spc/[userId].js` and the new `.web.js` sibling both import them, and Metro's platform-extension resolution applies to plain imports too, not just routes).
- **SPC web kanban** (`app/(coach)/spc/index.web.js`): status tiles pinned (`position: "sticky", top: 0`) as `dnd-kit` drop targets (`useDroppable`), client rows below are drag sources (`useDraggable`) that are *also* normal click targets (same dual click-or-drag pattern as `LibraryExercise` in `[workoutId].web.js`), `pointerWithin` collision detection + a `DragOverlay` so the dragged card follows the pointer. Dropping calls the existing `setSpcStatus(userId, status)`. Native (`spc/index.js`) keeps status-primary/coach-filter grouping but no drag — tap a row to navigate.

**Not yet click-tested**: the SPC kanban drag-and-drop was built by closely mirroring the workout builder's already-verified `dnd-kit` pattern, but hasn't been interactively verified — Claude Code can't log in (no password entry in this environment). Bundle-checked only (Metro compiles clean). Worth a manual pass in the browser before relying on it.

**Clients rebuilt as directory + client-settings-hub split** (per user feedback that the original locked-row/bubble-pill design "wasn't thought out"): `app/(coach)/clients/index.js` is now a plain scannable list (avatar initials, name, email, tap-through) — no inline editing, no lock icons, no pills. All program management moved to `app/(coach)/clients/[userId].js`, which is now the single place a coach edits a client: `SegmentedControl` (reused from the member Nutrition tab) for Group program (None/Flagship/BWA, mutually exclusive), a native `Switch` + `StatusBadge` for SPC and Nutrition enrollment (reusing the existing `handleSpcToggle`/`handleNutritionToggle` on/off-not-full-status-cycle logic, just relocated), and a "View current block →" / "View SPC program →" / "View nutrition dashboard →" link under each enrolled section. The group-program link required a new lookup: `getCurrentBlock(groupProgramId)` (already existed in `lib/programming/memberPlan.js` for the member side — reused as-is, RLS permits coach reads of `programming.group_blocks` too) resolves the client's group assignment to whichever block covers today, linking to the existing `/(coach)/blocks/[blockId]` sessions grid. **Not visually verified** — same login limitation as the kanban (no password entry in this environment); bundle-checked only, no console/bundler errors. Nutrition is intentionally left alone here beyond the enrollment switch — a separately-built, more mature Nutrition Tracker app is being ported in as the real nutrition experience later, so the sidebar's Nutrition tab is not a target for visual investment right now. **Update (2026-08-02)**: that port happened — see "Nutrition rebuilt against the standalone app's live tables" below.

**Group Programs page rebuilt as an at-a-glance grid** (`app/(coach)/blocks/index.js`): rows are relative to *today* ("Current week"/"Next week"/"3-6 weeks out"), columns are Flagship's sessions then BWA's sessions, each in its own colored panel (`PANEL_BG` — soft peach for Flagship, soft sage for BWA, both reused from the existing palette rather than new colors) so the two programs read as visually distinct at a glance. Each cell shows the actual programmed exercise names (capped at 5 + "+N more") plus a small draft/published dot. Added `listWorkoutExercisesForWorkouts(workoutIds)` to `lib/programming/workouts.js` to batch-fetch exercise names for a whole grid's worth of workouts in one query instead of N+1. New `app/(coach)/blocks/history.js` — a "History" button next to "+ New Block" surfaces blocks whose `block_end_date` is already in the past, so completed blocks are "retired" off the main page; each row links to the existing `/(coach)/blocks/[blockId]` sessions grid.

**Per-row date coverage, not "current block's week + offset."** Each row is a real calendar date (`today + offset*7`, via `lib/programming/blocks.js`'s `addDays`), and `loadProgramData` finds whichever block (fetched via new `listBlocksForProgram`, every block for that program oldest-first) actually covers that date — not just "the one block active today." This matters because a 4-week Flagship block only covers the first 4 of the 6 visible rows; the old version assumed exactly one "active" block for the whole window and just showed static "no active block" text once it ran out. Now `groupRows()` collapses consecutive uncovered rows into one span, and renders a single **"Start new block"** button sized to exactly that gap — including the case where a block ends partway through the visible window (row 5 of 6, say), not just "the program has zero blocks at all." Clicking it computes the correct gap-free start date from whichever block immediately precedes *that specific gap* (not just "the overall latest block," which would be wrong if a future block is already scheduled further out with a gap before it) and calls the existing `createBlock`. This replaced an earlier, simpler version of this feature (`getLatestBlock`/`startNextBlock`, since removed) that only handled "this program has no active block at all" and missed the far more common case shown in the screenshot that prompted this fix: a block that's still active but ending soon, with nothing queued up after it. **Not visually verified** — same login limitation noted elsewhere in this file; bundle-checked only.

**SPC client detail page rebuilt + app-wide date format + back-button pass**: `app/(coach)/spc/[userId].js` restructured — Status and Assigned Coach cards moved to the top (Assigned Coach is now a real `<select>` dropdown on web via a `Platform.OS === "web"` branch inside the file, matching the coach filter already on the SPC roster page; native keeps the old pill-list since raw `<select>` isn't a valid RN element and this page has no `.web.js` sibling), a two-column body below (native falls back to stacked via the same `isWeb` flag), and Blocks now only show current/upcoming ones with a "History" button (new `app/(coach)/spc/history/[userId].js`, mirroring the Group Programs history page) pulling past ones out. **Blocks got a naming scheme**: `labelBlocks()` in `lib/programming/spcBlocks.js` numbers a client's blocks by chronological `block_start_date` order ("Block 1", "Block 2"...) since there's no stored name column and adding one would need a migration for something fully derivable — needs the client's *full* block list to number correctly, so history/print views fetch all blocks and label-then-filter rather than labeling a pre-filtered subset. Also added `getSpcSiblingPatterns()` to `lib/programming/spcWorkouts.js` and wired `PatternTally` into both SPC builder screens (web + native) — SPC had no movement-balance tally where the group builder already did; scoped to the whole `spc_block` (all of a client's sessions) rather than a shared week, since SPC has no per-week workout rows. **New `lib/formatDate.js`'s `formatDateMDY()`** converts ISO dates to MM-DD-YYYY for display everywhere a date is rendered as text (block dates, nutrition target/log dates, touched-by stamps) — internal storage/comparisons stay ISO (`todayInBoise()`, block-end lexicographic comparisons, etc. are untouched). Also added missing "‹ Back" links on several drill-down screens that had none (`blocks/[blockId].js`, both native workout builders, nutrition client detail, nutrition check-in questions) — the native `(coach)` Tabs navigator runs with `headerShown: false`, so pushed routes had no back affordance at all before this. **Not visually verified** — same login limitation noted elsewhere in this file; bundle-checked only, no console/bundler errors.

**Deferred, needs the user to do it themselves**: generating a real "block about to end" test scenario requires either driving the live app's own UI (create-block flow) or a raw SQL insert — Claude Code has no DB credentials in this environment and cannot log in to click through the UI (no password entry). To see the due-soon/auto-draft UI: open an SPC client's page, check the actual `alert_lead_time_days` value on `/(coach)/settings` (defaults to 3 if never set), then use "+ New block" with a start date far enough in the past that `block_end_date` lands within that many days of today (e.g. for a 4-week/28-day block and a 3-day lead time, a start date 25 days ago puts the end date 2 days out). Next time `/(coach)/spc` loads, `checkAndAutoDraft()` (in `lib/programming/spcDashboard.js`) should fire and auto-create the next block with `new_program_asap` status.

**Group Programs: auto-start next block, no lapse/no date-picking.** `lib/programming/blocks.js` gained `getLatestBlock(groupProgramId)` (most recent block for a program regardless of whether it's active/ended/not-started — same `.order().limit(1).maybeSingle()` guard used everywhere else for "at most one row") and `startNextBlock(groupProgramId, createdBy)`, which starts the new block the day after the program's most recently-ended block (or today, if the program's never had one) so a coach never has to compute a gap-free start date by hand. The Group Programs grid (`app/(coach)/blocks/index.js`) was restructured from row-major (weeks outer, programs inner) to program-major specifically so a program with no active block can show **one** "Start new block" prompt spanning the whole 6-row grid height (`EmptyProgramSlot`, sized via `GRID_HEIGHT`) instead of repeating "No active block" in every session cell. It also now tells apart two different empty states: nothing scheduled at all (shows the button) vs. a future block already queued but not started yet (shows "Next block starts {date}" instead, so the button can't create an overlapping second block). **Not visually verified** — same login limitation noted elsewhere in this file.

**Next up**: the client/member-facing app is next, planned for a separate session (current one is coach-side only). Noted but not built: the member build needs to default lift-assignment to the existing Mon/Tue=Session1, Wed/Thu=Session2, Fri/Sat=Session3 mapping (`lib/programming/schedule.js`'s `sessionNumberForDate` already implements this correctly — nothing to fix there, it's the member-side UI that needs to consume it) rather than TrueCoach's one-specific-day-per-lift model, which was one of the bigger frustrations with the old tool.

**Member workout experience rebuilt: read-only Today + all logging moved to My Fitness** — supersedes the original Today/`session.js`/`spc-session.js` design described earlier in this section. Today (`app/(member)/index.js`) is now a pure preview — no buttons, no inputs, just "what to expect today" for both group (Week/Session + exercise names, or a compact "✓ Completed" state) and SPC (next incomplete session this week, or "✓ No remaining sessions this week"). All actual set-by-set logging now lives on My Fitness (`app/(member)/plan.js`) via new `components/SessionLogger.js`: a single-open accordion of exercise cards, each breaking its target sets into individual per-set reps/weight rows (captures `3x10/3x8/3x8`, or an ascending-weight set — the old model only stored one flat sets/reps/weight value per exercise per day), a "Last time" history panel per lift, a shared notes field per lift, and one "Finalize workout" button per session. Everything **autosaves** (900ms debounce, same pattern as Nutrition's daily log) instead of a manual save tap — `logResult()` in `lib/programming/memberPlan.js` is now a hand-rolled upsert (select-then-update-or-insert) rather than a plain insert, so repeated autosaves overwrite the same set instead of piling up duplicate rows. `app/(member)/session.js`, `spc-session.js`, `components/LogResultRow.js`, and `components/SpcSessions.js` are deleted, fully superseded. Both Today and My Fitness now use `useFocusEffect` (from `expo-router` directly — it re-exports it, no need for `@react-navigation` which isn't even in `node_modules` on this Expo version) instead of a mount-only `useEffect`, since Tabs keep screens mounted across navigation and a finalized session wouldn't otherwise show as done until a full reload.

**New `programming.session_completions` table** (migration `0007_session_logging.sql`, run against the live project) tracks whether a member has finalized a given session — keyed by `group_workout_id` alone for group (each week already has its own row), or by `(spc_workout_id, week_number)` for SPC (one `spc_workout` row recurs every week of the block, so `week_number` is required to tell one week's completion from another's). `programming.logs` also gained a `set_number smallint` column (default 1, so old rows stay valid as single-row historical summaries). `lib/programming/sessionCompletions.js` has the getters/finalizers — finalize functions are hand-rolled upserts too, not `.upsert()`, since the table's uniqueness rules are partial indexes (only one of `group_workout_id`/`spc_workout_id` is ever set per row) and Postgres requires an `ON CONFLICT` clause's predicate to match a partial index's `WHERE` exactly, which supabase-js's `onConflict` option can't express.

**New read-only `app/(member)/plan-block.js` / `plan-spc-block.js`** ("View full block" / "View full SPC block" links from My Fitness) show the whole multi-week program for looking ahead/back, adapted from the pre-rework `plan.js`/`SpcSessions.js` week-selector code. Once a session is finalized, they also show the actual logged sets + notes under each lift (fetched via `getLoggedSetsForDate`, keyed off the session's `completed_at` date) — nothing shows for a lift that wasn't logged, or a session that hasn't been finalized yet. **Bug caught while building this**: deriving that lookup date via `completed_at.slice(0, 10)` reads the *UTC* date out of a timestamptz's ISO string, which is already "tomorrow" for anything finalized in the Boise evening — same class of bug as the `todayInBoise()` rule below, just applied to an arbitrary past timestamp instead of "now." Fixed by adding `lib/boiseDate.js`'s `dateInBoise(date)` (a parameterized version of `todayInBoise()`) — use this, never `.slice(0, 10)`, whenever a UI needs a Boise-local date derived from a stored `timestamptz`.

**Fixed a real data bug found via this rework**: two overlapping `spc_blocks` rows for the same client (one with actual published sessions, a newer empty duplicate created on top of it) caused `getCurrentSpcBlock`'s "most recently started" tiebreak to pick the empty one, hiding the client's real published sessions from their own Today/My Fitness view. `getCurrentSpcBlock` (`lib/programming/spcBlocks.js`) and `getCurrentBlock` (`lib/programming/memberPlan.js`, same latent risk on the group side) now prefer whichever overlapping candidate actually has published content, falling back to newest-started only if none do. This is a symptom fix, not prevention — see the deferred SPC-block-creation rework note below.

**Coach-side stray-component cleanup**: `NewBlockModal.js`, `LinkMemberModal.js`, `NewSpcBlockModal.js`, `ExerciseFormModal.js`, `ExercisePickerModal.js`, `CommentThread.js`, `PatternTally.js` were all sitting directly inside `app/(coach)/*` route folders instead of `components/` — Expo Router's file-based routing was treating them as routes (Metro logged "missing the required default export" warnings for each one), the same root cause as the member-side "extra tabs" bug fixed earlier this session (`LogResultRow.js`/`SpcSessions.js` sitting in `app/(member)/`). Moved all seven into `components/`, fixed every import path. These didn't leak into the *visible* tab bar like the member ones did (nested inside already-hidden coach route folders), just noisy Metro warnings — but same fix, same reasoning.

**Deferred, not built this session, saved to cross-session memory for later**: (1) reworking SPC block creation to mirror the Group Programs calendar-grid pattern, prevent overlapping blocks at creation time, one-off/injected workouts for travel or an extra session, and no-commitment trial SPC sessions for prospects; (2) an abandoned-session push reminder (member starts logging, doesn't finalize within ~2 hours) — needs `session_completions.started_at`/`reminder_sent_at` columns, a new scanning Edge Function, and Supabase cron (`pg_cron`/`pg_net`) to invoke it, none of which this environment can deploy or set up (same `send-push` deployment blocker noted below). Both were explicitly deferred by the user mid-session, not abandoned.

**One-off workouts + templates (items 3 and 4 from the deferred SPC-rework ask) — built, plus the group overlap gap flagged above is now fixed too.** `lib/programming/blocks.js`'s `createBlock()` gained the same overlap check as SPC's `createSpcBlock()` (scoped by `group_program_id` instead of by client, since group blocks are shared across a whole program rather than per-client) — the shared interval-test logic (`rangesOverlap`) moved to a new `lib/dateRange.js` so both call sites use one tested implementation.

One-offs turned out to apply to *any* client (group or SPC), not just SPC as originally framed — a Flagship/BWA member can need an away workout too. New migration `0008_one_off_workouts.sql` (**not yet run against the live project** — needs the SQL Editor + `NOTIFY pgrst, 'reload schema'` per usual) adds: `workout_templates`/`template_warmups`/`template_exercises` (coach-authored, reusable, single flat prescription — no per-week progression like SPC needs, since a template is used once per assignment) and `one_off_workouts`/`one_off_warmups`/`one_off_exercises` (a template's content copied onto one specific client, keyed directly by `user_id` rather than through a block/assignment join, since a one-off works the same regardless of what else that client is enrolled in). Per explicit answers when this was scoped: trial-session prospects are assumed to already have a `core.users` login (via the existing admin "Link account" flow, just no program enrollment) rather than needing a new account-creation path, and a one-off has **no scheduled date** — it's an open extra in My Fitness until the member finishes it, not tied to a specific day like a real session.

`programming.session_completions` (0007) gained a third nullable `one_off_workout_id` column and its check constraint/partial-unique-index were widened to a three-way exactly-one-of (group xor spc+week xor one-off) — same completions-table-separate-from-content-table pattern as group/spc, so a one-off's content stays coach-only-write while completion stays member-writable. `programming.logs.source`'s check constraint also widened to allow `'one_off'`. **Both constraint alters use `drop constraint if exists <name>` with Postgres' default auto-generated names** (`session_completions_check`, `logs_source_check`) since these were never explicitly named in 0004/0007 — very likely correct (well-documented Postgres convention: unnamed table-level check → `<table>_check`, unnamed column-level check → `<table>_<column>_check`), but if either DROP silently no-ops due to a name mismatch, check `\d programming.session_completions` / `\d programming.logs` in the SQL Editor and the migration will need a follow-up correction.

New `lib/programming/templates.js` (template CRUD) and `lib/programming/oneOffWorkouts.js` (`createOneOffFromTemplate()` copies a template's content onto a new one-off, published immediately — no draft/review step, since assigning a ready-made template is a lighter action than building from scratch) plus `finalizeOneOffSession()`/`getOneOffCompletion()`/`listCompletedOneOffWorkoutIds()` added to `sessionCompletions.js`. **New coach UI**: `app/(coach)/spc/templates/index.js` (list + create, grouped by category: away programming / trial sessions) and `app/(coach)/spc/templates/[templateId].js` (builder — modeled on the native group builder, minus draft/publish/comments/pattern-tally since none of those apply to a single-prescription template), reachable via a "Templates →" link added to both SPC index screens (per the user's call — templates apply to any client, but the management entry point lives under SPC since that's where the ask originated). `app/(coach)/clients/[userId].js` gained a "One-off workouts" card: list existing assignments with a completed/not-completed indicator, "+ Assign one-off" opens a new `components/AssignOneOffModal.js` to pick a template, delete removes a mistaken assignment.

**Member side**: `app/(member)/plan.js` (My Fitness) gained a third independently-loaded section (same "one section's failure shouldn't hide another" pattern as group/spc) listing all published-and-not-yet-completed one-offs, each rendered via the existing `SessionLogger` component completely unmodified — it was already generic enough (`source` is just a tag string, now also accepting `'one_off'`) that no new logging UI was needed at all. Finalizing a one-off just drops it from the active list (no "completed" display state, matching "open until completed, no date" — once done, it's done). Fixed the page's early-return-to-empty-state condition, which previously didn't account for one-offs and would have shown "you're not assigned to a program yet" to a member whose *only* content was a one-off workout.

**Migration 0008 has been run against the live project, and Terra clicked through this whole one-off/templates build herself and confirmed it works** (she can log in directly; Claude still can't, no password entry in this environment) — the "not visually verified" caveat on this feature is lifted.

**Real bug found and fixed while following up: the group and SPC web builders had no working way to add a warmup exercise at all.** `handleAddWarmup` existed in both `app/(coach)/builder/[workoutId].web.js` and `app/(coach)/spc/builder/[workoutId].web.js` — correctly implemented — but was never wired to any click handler or drop zone, so a coach on web (where the majority of program-building happens) had literally no way to populate the Warm-up section; only the native builders (which never had this bug) could. Root cause looks like a leftover from whenever these files were split into native/web variants — the function was carried over but its trigger wasn't. Fixed identically in both files: added a `warmup-dropzone` droppable region (parallel to the existing `session-dropzone`) so dragging a library exercise onto the warm-up section now calls `handleAddWarmup` instead of falling through, plus a "+ Insert warm-up exercise" button (reusing `ExercisePickerModal`, already used elsewhere) as a guaranteed non-drag fallback — matching what the native builders already had. Worth a proactive check for the same "handler defined but never wired to a trigger" shape elsewhere if a similar bug report comes in. Confirmed fixed by Terra clicking through both web builders directly.

**Templates now get the same drag-and-drop builder as group/SPC workouts, not just the plain click-based one.** New `app/(coach)/spc/templates/[templateId].web.js` mirrors the group web builder's interaction model exactly (dnd-kit library sidebar, sortable exercise list, warmup drop zone — built with the warmup fix from the start, not retrofitted) adapted for templates: no draft/publish (templates aren't visible to any member directly), no per-week columns (a template is one flat prescription, used once per assignment), no comments/pattern-tally (no block/siblings concept for a standalone template). The original plain-click `[templateId].js` stays as-is for native (drag-and-drop is web-only per the build plan, same split as every other builder) — Expo Router's platform-extension resolution picks the right one automatically, so `templates/index.js`'s `router.push` needed no changes. Also removed `CoachShell` from the native template builder, which had wrapped it inconsistently with every other builder screen (group/SPC builders are deliberately full-bleed with just a "‹ Back" link, not sidebar-wrapped, since they need the width) — missed this the first time around. Confirmed working by Terra clicking through the web version directly.

**SPC block creation reworked to mirror Group Programs' calendar grid (item 1 above), plus real overlap prevention (item 2)** — items 3 (one-off/injected workouts) and 4 (templates/trial sessions) from the same deferred ask remain untouched, since they need net-new data modeling rather than porting an existing pattern. `app/(coach)/spc/[userId].js`'s flat "Blocks" list is replaced with a per-client version of the same grid: rows relative to today (`lib/programming/gridRows.js`'s `WEEK_OFFSETS`/`groupRows`, extracted out of `blocks/index.js` since both screens now need byte-identical gap-detection logic, not just similar-looking code), one contiguous "Start new block" prompt sized to the actual gap, computing a gap-free start date the same way Group Programs' `handleStartGapBlock` does (day after whichever block immediately precedes that gap, or today if none). The presentational grid cells (`SessionCell`/`PlaceholderCell`/`GapSlot`) moved to `components/BlockGridCells.js` for the same reason. SPC's version differs from Group Programs' in one structural way worth remembering: a group grid row is one specific `group_workouts` row per (week, session) since group has per-week workout rows, but an SPC row is whichever `spc_workouts` row covers that week — the same session row appears across every week its block spans, since SPC has no per-week workout rows (progression lives in `spc_exercise_weeks` columns instead). `listSpcWorkoutExercisesForWorkouts()` (new, `lib/programming/spcWorkouts.js`) batches exercise names for the grid the same way `listWorkoutExercisesForWorkouts()` already did for group. **Real overlap prevention, not just UI convention**: `createSpcBlock()` (`lib/programming/spcBlocks.js`) now checks the new block's date range against every existing block for that client and throws a descriptive error naming the conflicting block if they overlap — this is a genuine fix for the bug found during the member-fitness rework (two overlapping `spc_blocks` rows hid a client's real sessions; `getCurrentSpcBlock`'s "prefer whichever candidate has published content" tiebreak only patched the symptom). Since the check lives in `createSpcBlock` itself, it protects both the new gap-aware "Start new block" button and the older manual-date `NewSpcBlockModal` (still used for a client's very first block, where there's no gap to detect yet) — **Update**: Group Programs' `createBlock` gap has since been closed too (see the one-off/templates section above) — Terra asked for it explicitly once this was reported. Confirmed working end-to-end (grid, gap-aware block creation, overlap rejection) by Terra clicking through both the SPC and Group Programs pages directly.

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

## Commands

```
npm install         # install dependencies — see "npm install gotcha" below, use --legacy-peer-deps
npx expo start --web   # web dev server (this repo's `run` skill / .claude/launch.json target: kova-strength-web)
npx expo start       # native dev server (needs a device/simulator — not available in this sandboxed environment)
npm run build        # what Vercel runs: expo export -p web, then the route guard below
npm run check:routes # fails if a dynamic route has no vercel.json rewrite (needs a built dist/)
```

No lint/test scripts. `npm run build` is the closest thing to CI — it is the
real production build command (Vercel prefers a `build` script over its own
detected Expo command) and it gates on `scripts/check-vercel-rewrites.mjs`, so
a dynamic route shipped without a rewrite fails the deploy instead of 404ing
for whoever follows a link to it. See the first-run-audit section below.

**Verification bar for any change here, in order of strength:** run
`npm run build`; then a Babel parse + unresolved-identifier pass over every
touched file (**a clean export is weaker evidence than it looks — Metro neither
parses every file you touched nor resolves identifiers**, and this has hidden a
missing import and a missing helper more than once); then, where the screen is
reachable, actually drive it. Signed-out screens (`/login`, `/register`,
`/reset-password`, `/set-password`, `/support`) can be driven directly; for
anything behind a login, render the component through a throwaway top-level
route such as `app/zz-harness.js` and delete it afterwards — preferred over
mounting on `login.js`, since deleting it cannot leave sign-in broken.

## Tech stack

- **Frontend**: Expo SDK 57, Expo Router (file-based, route groups for `(auth)`/`(member)`/`(coach)`), React 19, React Native 0.86, plain `.js` (no TypeScript, except Edge Functions which are Deno/TS by necessity)
- **Styling**: NativeWind v4 (Tailwind for RN) — `tailwind.config.js` has the brand tokens, `global.css` has the `@tailwind` directives, `babel.config.js`/`metro.config.js` wire it up
- **Backend**: Supabase (Postgres + Auth), same project as the Nutrition Tracker app (`rtgwhchycfnfvwagilkw`). `core`/`programming` are Kova-owned schemas. **Nutrition is the one exception to "never touch Nutrition Tracker's tables"**: as of 2026-08-02 the nutrition module reads/writes that app's live `public.*` tables directly (see the nutrition-rebuild section below) — the old Kova-owned `nutrition.*` schema is dead/unused.
- **Drag-and-drop**: `@dnd-kit/core` + `@dnd-kit/sortable`, web-only (`.web.js` builder screen only — this does not run on native)
- **Push**: `expo-notifications` → Expo Push Service, native-only (no Web Push/VAPID in this app)
- **Fonts**: `@expo-google-fonts/montserrat` + `@expo-google-fonts/protest-strike`

## Environment variables (`.env.local`, gitignored)

```
EXPO_PUBLIC_SUPABASE_URL=https://rtgwhchycfnfvwagilkw.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...        # same project as Nutrition Tracker, safe to reuse
EXPO_PUBLIC_ADMIN_EMAIL=terra@kovastrength.com           # bootstraps the first core.users admin row on first login
```

`.env.example` documents the shape without real values.

## Key architectural decisions (see build-plan.md for full reasoning)

- **Schema split**: `core.users` (role: admin/coach/member) is the shared identity layer Programming reads. `programming.*` owns everything Programming-specific. **Nutrition is the exception**: it reads/writes the standalone Nutrition Tracker app's own `public.coaches`/`public.clients`/etc. tables directly (a Kova coach needs a matching `public.coaches` row, a Kova member needs a matching `public.clients` row — see the nutrition-rebuild section below for how those get provisioned) rather than having its own Kova-owned schema. Programming/core are still deliberately separate from `public.*` — this exception is nutrition-only.
- **Timezone discipline**: `lib/boiseDate.js`'s `todayInBoise()` is the only correct way to get "today" anywhere in this app — never `new Date()` directly, never trust device local time. This already caught a real issue during testing: a block's `block_start_date` set to what looked like "today" in the UI was actually the next calendar day in Boise time (the browser's system clock was UTC-ahead), and the app correctly refused to show it as active. That's the timezone logic working as intended, not a bug — if a block/session isn't showing up when you expect, check `todayInBoise()` against the actual Boise clock before assuming the query is wrong.
- **Day-of-week session routing**: `lib/programming/schedule.js`'s `sessionNumberForDate()` maps Mon/Tue→1, Wed/Thu→2, Fri/Sat→3, Sunday→no session. `currentWeekNumber()` is `floor(daysSinceBlockStart / 7) + 1`, clamped to the program's block length — not calendar-Monday-aligned, just a flat day count from whatever date the block actually started.
- **Draft/publish lives on `group_workouts` (per session-per-week), not on `group_blocks`.** A block itself has no status; a coach can publish week 1 while week 3 is still a draft, and can edit a published week anytime with no locking.
- **Member RLS policies require `status = 'published'`** — draft workouts are invisible to members at the database level, not just hidden in the UI. If a member-facing query returns nothing unexpectedly, check whether the workout is actually published before debugging the query itself.
- **Cross-schema PostgREST embeds are avoided.** `programming.program_comments.coach_id` and `programming.logs.user_id` reference `core.users`, but the code fetches those separately and merges client-side (see `lib/programming/comments.js`) rather than relying on PostgREST's embedded-resource syntax across schemas — that reliability wasn't confirmed, so this sidesteps it entirely. Same-schema embeds (e.g. `group_workout_exercises` → `programming.exercises`) are used freely and work fine.
- **`.maybeSingle()` throws on 2+ rows, not just on error.** Any query using it needs a genuine guarantee of at-most-one-row, or an explicit `.order(...).limit(1)` before it. This was a real bug (see "Bugs found and fixed" below), not a hypothetical.

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

## Group programs: multi-membership (2026-08-01)

Prompted by a real need: coaches are running specialty group programs on top of a client's normal Flagship/BWA training — "Look Like You Lift" (4 clients, same days, same coach-authored content) and a shared conditioning program, both explicitly **in addition to** the client's existing group program, not instead of it. That's a genuine architecture change, not a visual one: `client_program_assignments` used to be one row per client (`user_id` as the primary key, a single `group_program_id` column) — a client could only ever be on exactly one group program at a time. Considered and rejected modeling this as SPC instead (see the options discussion that preceded this build) — SPC's defining trait is *no* day-of-week routing, the opposite of what these specialty programs need; they're structurally identical to Flagship/BWA (shared calendar, shared content, day-of-week routing), just a client can now be in several at once.

**Migration `0010_group_program_memberships.sql` — run against the live project.** Two schema changes:
- `group_programs.name` is no longer locked to exactly `('Flagship', 'Better With Age')` — the CHECK constraint is dropped entirely so coaches can create new program types.
- `client_program_assignments` moves from one-row-per-client to **one-row-per-membership**: the old `user_id` primary key is dropped in favor of a real `id` column, `group_program_id` becomes `NOT NULL` (a null row used to mean "not assigned to anything" — under the new model that's just zero rows, so those placeholder rows are deleted first), and a `unique(user_id, group_program_id)` constraint replaces the single-slot guarantee — still can't join the same program twice, but Flagship + "Look Like You Lift" simultaneously is now representable. **No RLS policy changes were needed** — every policy reading this table already used `exists(select 1 from client_program_assignments where ...)`, which was already correct for a client matching zero, one, or several rows; only application code assumed a single row. Also widens `programming.logs.source`'s CHECK (already widened once in 0008 for one-offs) to add a generic `'group'` value — `source` only ever special-cased Flagship/BWA by name, and an arbitrary new program name has nowhere to go otherwise; Flagship/BWA keep tagging as `'flagship'`/`'bwa'` for backward compatibility with existing log rows, any other group program tags as `'group'`.

**Every layer that assumed "a client has at most one group program" needed updating** — this was a wide-blast-radius change, not a contained one:
- `lib/programming/clients.js`: `getAssignment`/`assignProgram`/`setSessionsPerWeek` (singular, `.maybeSingle()`/upsert-on-`user_id`) replaced with `listAssignmentsForUser`/`addGroupMembership`/`removeGroupMembership`/`setMembershipSessionsPerWeek` (array-returning, scoped by `(user_id, group_program_id)` pairs).
- `lib/programming/memberPlan.js`: `getMyAssignment` → `listMyAssignments` (array).
- `lib/programming/blocks.js`: new `createGroupProgram({name, blockLengthWeeks, sessionsPerWeek})` for the coach "add a new group type" flow.
- **Coach client detail page** (`app/(coach)/clients/[userId].js`): the mutually-exclusive None/Flagship/BWA `SegmentedControl` is gone, replaced by a per-program list of `Switch` toggles (one row per `group_programs` row, built dynamically via `listGroupPrograms()` rather than hardcoded to two named programs) — same on/off + frequency-control shape the SPC and Nutrition cards already used, now applied to group programs too since membership stopped being mutually exclusive.
- **Coach Group Programs page** (`app/(coach)/blocks/index.js`): used to lay out every program's grid side by side in one wide horizontal scroll — stopped scaling once there could be more than 2 programs. Now a program-selector pill row up top (defaults to the first program, re-picks if the selected one ever disappears) shows exactly one program's grid at a time, plus a **"+ New group type"** pill opening `components/NewGroupProgramModal.js` (name, block length weeks, sessions per week → `createGroupProgram`, then auto-selects the new program).
- **My Week** (`app/(member)/index.js`): the single `group` state object became a `groups` array, one entry per membership, each independently fetched (own try/catch — one program's failure doesn't hide another's, same philosophy as the existing group-vs-SPC-vs-nutrition isolation) and rendered as its own `WeekSection` tile.
- **My Fitness** (`app/(member)/plan.js`): same singular-to-array change. `ProgramTabs` now builds one tab per group membership (keyed by `group_program_id`, a uuid) plus SPC plus Extras, rather than a hardcoded "flagship" slot — `showTabs` fires whenever more than one of *any* of these is available. The `?program=` deep-link param now carries a `group_program_id` for group tabs (My Week's per-tile arrow passes its own program's id) instead of the string `"flagship"`.
- **`plan-block.js`** ("View full block" destination): now reads a `?programId=` param to know *which* membership's block to show, falling back to the first membership for direct navigation with no param — previously there was only ever one possible block to show.

**Not visually verified** — same login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only across every touched route (Metro/Expo compiles clean, no console errors). This is the largest single change of the day's sessions and touches RLS-adjacent data modeling — worth a careful manual pass (create a second group program, enroll a client in two at once, verify both tiles/tabs show correctly and logging tags the right `source`) before trusting it with real clients.

**Follow-up, same day — real bug caught by the user during that manual pass: a real day-of-week/session-count model was missing.** The multi-membership build above shipped with a leftover assumption: `sessionNumberForDate()` (`schedule.js`) was a single hardcoded global function (Mon/Tue=Session 1, Wed/Thu=Session 2, Fri/Sat=Session 3), and both My Week and My Fitness still rendered exactly 3 session bubbles/rows for *every* group program regardless of its actual `sessions_per_week`. Fine when Flagship and BWA were the only two programs and both happened to be 3x/week on the same calendar — broke immediately for a 2x/week specialty program ("Look Like You Lift"), which still showed 3 bubbles (the 3rd permanently empty/unpublished) captioned "Fri/Sat" even though that program only runs 2 days.

**Migration `0011_group_program_session_days.sql` — run against the live project (needed `NOTIFY pgrst, 'reload schema'` after — this bit the SPC-titles bug earlier the same day, so don't skip it).** Adds `group_programs.session_days` (jsonb, default `[[1,2],[3,4],[5,6]]` — array of arrays of weekday ints 0=Sun..6=Sat, index i = session (i+1)'s applicable weekdays). The default exactly reproduces Flagship/BWA's old hardcoded behavior, so they're unaffected; any *new* program gets to define its own.

- `schedule.js`'s `sessionNumberForDate(dateString, dayMap)` now takes an optional day-map parameter (defaults to the old Flagship/BWA scheme via exported `DEFAULT_SESSION_DAYS`, for any caller not yet updated) instead of being hardcoded. New `formatSessionDays(days)` turns one session's day array into a "Mon/Tue" caption.
- `lib/programming/memberPlan.js`'s `listMyAssignments` now also selects `group_programs.session_days`.
- My Week and My Fitness both now build session rows from `program.sessions_per_week` (not a hardcoded `[1,2,3]`) and resolve `sessionNumberForDate`/captions from that specific program's `session_days` — every membership's tile now reflects its own program's actual schedule.
- **New coach-facing configuration surface, since this needed to be settable both at creation and later**: `components/SessionDayPicker.js` (a session-row × weekday-toggle grid, plus a `resizeSessionDays` helper that keeps the day-map array in sync as the coach changes sessions/week) is now part of `components/NewGroupProgramModal.js`, which gained an `initialProgram` prop making it dual-purpose — create a new program, or (when a program is passed in) edit an existing one's name/block-length/sessions-per-week/day-map via a new **"⚙ {Program} settings"** button next to the program selector on the Group Programs page. Editing only affects blocks created from that point forward — `createBlock` already reads the program's current settings fresh at creation time, and existing `group_workouts` rows keep whatever `session_number`/`week_number` they were created with, so this needed no backfill. New `lib/programming/blocks.js`'s `updateGroupProgram(programId, fields)` is a plain free-form patch, same pattern as `updateSpcClient` elsewhere in this codebase.
- **Not visually verified**, same caveat as above — bundle-checked only.

## Coach web v1 design pass (2026-08-01)

A real design handoff (`design_handoff_coach_web_v1/` — README + static HTML mockup, later updated in-place with a second `design_handoff_coach_web_v1 2/` drop adding three more sections) drove a restyle + several structural changes across the coach-side web app: Coach Home, Clients list, Client detail, Group Programs, SPC dashboard, SPC client detail, and Exercise Library. Same "HTML is a reference, not code to copy in" rule as every other handoff in this file.

**Coach Home** (`app/(coach)/index.web.js`) — visual-only restyle plus real functionality: every Roster stat tile and every "Needs your attention" / Group Programs summary row now deep-links to `/clients` or `/blocks` with a `?program=` filter pre-applied, instead of just opening the page generically. `getCoachDashboardStats()` (`lib/programming/coachDashboard.js`) now also returns `flagshipProgramId`/`bwaProgramId` so the dashboard has real ids to link with, not just counts.

**Clients list** — split into `app/(coach)/clients/index.js` (native, untouched) + new `app/(coach)/clients/index.web.js` (web, matching the SPC-page native/web split precedent): search, "All programs"/"Flags"/"Sort" filter dropdowns (real `<select>`s, web-only), real pagination, and per-row program tag pills + a peach "N flag" pill. The flag count is real, not decorative — see `lib/programming/flags.js` below.

**Client detail** (`app/(coach)/clients/[userId].js`, shared native+web) — new Snapshot panel: current-block progress bar(s) (one row per active group membership, per explicit doc guidance to stack rather than pick one) plus a Flags side showing **missed-session flags only**. The handoff's other example flag type, "injury/note," was explicitly skipped per a direct decision mid-session — there's no way in this app to tag a coach note as injury-related (`program_comments` has no tag column), and fabricating that distinction from untagged free text would be worse than not showing it. Group program cards restructured: enrolled toggle + name + link on row 1, a visually subordinate "Frequency" sub-row (bg `#faf8f6`) only when enrolled.

**New `lib/programming/flags.js`'s `getMissedSessionFlagsByUser()`** — the one new real data feature this pass needed. Batched (not N+1): for every group program with an active block, finds this week's published-and-already-due sessions (`isSessionDue` — due once a session's last scheduled weekday has passed), fetches completions for all of them across every client in one query, and cross-references against each client's own `sessions_per_week` cap. Returns `Map<userId, flag[]>` so both the Clients list (count only) and Client detail (full description) read off one computed pass.

**Group Programs** (`app/(coach)/blocks/index.js`) — the "Block sessions" page (`blocks/[blockId].js`) is retired from normal navigation: client detail's "View current block" and both group builders' "‹ Back to block" links now go to `/(coach)/blocks?program=<id>` (the calendar reads that param to pre-select the right tab) instead of the old per-block page, since the calendar's own tiles already open the exact same builder on click. `blocks/[blockId].js` itself is **not deleted** — History (`blocks/history.js`) still needs it for retired blocks, which fall outside the calendar's rolling 6-week window entirely, so it's kept as History-only. History is now scoped to whichever program you were viewing (`?program=` in, and its own "‹ Back" link carries the same param back out so returning from History reopens the same tab you left).

**Group Programs' click-to-copy flow** replaces any drag-and-drop copy concept: ⧉ on a populated tile enters copy mode (rust border + "· copying"), every other tile becomes a click target (dashed rust outline, or "Click to paste here" if empty), multi-select with a sticky bottom confirm bar, overwrite-confirm via new shared `lib/confirmDialog.js`'s `confirmOverwrite()` (native `Alert.alert` vs. web `window.confirm`). New `copyWorkoutContent()` (`lib/programming/workouts.js`) does the actual plain copy (warmups + exercises, no live link after). `components/BlockGridCells.js`'s `SessionCell` gained optional `highlight`/`copyRole`/`onStartCopy` props for this — all default to the old behavior, so SPC's existing use of the same shared component is unaffected.

**SPC dashboard** (`app/(coach)/spc/index.web.js`) — "All clients" flat sortable grid (Client/Status/Freq./Block ends/Coach columns, real `<select>` sort by Block ends/Name/Status/Coach) is now the default view; the old status-grouped drag-and-drop kanban is still there behind a "Grouped" toggle. The 5 status tiles now double as filter chips in both views (olive ring + "· filtering" marks the active one — a fixed olive, not the status's own tone color, matching the "olive = current selection" convention used elsewhere, e.g. Group Programs' current-week highlight) while still working as `useDroppable` drag targets in Grouped view.

**SPC client detail** (`app/(coach)/spc/[userId].js`) — Status/Coach/Sessions merged into one card (status pills go olive-filled when active, not rust — same fixed-olive-for-selection convention; divider; coach dropdown + a widened 1x–4x `SegmentedControl` replacing the old +/- stepper). "History" renamed "Past blocks". **"+ New block" replaced with a real choice modal** (new `components/NewSpcBlockChoiceModal.js`): Copy last block (badge shows which block + how long since it ended, live preview of its sessions) vs. Start blank — the start date is always computed the gap-free way (day after the latest block, or today if none), never typed. The old free-typed-date `components/NewSpcBlockModal.js` is deleted, fully superseded. The block calendar grid got the identical ⧉ copy-mode flow as Group Programs (2 columns instead of 3, same `highlight`/`copyRole` props on the shared `SessionCell`).

**Real behavior change worth flagging**: `copyLastBlockContent()` (`lib/programming/spcWorkouts.js`) used to *deliberately* leave the new block's per-week sets/reps blank ("copying stale numbers forward would be wrong," per its own prior comment) — the new handoff explicitly asked for a full copy including sets/reps, so this now copies everything verbatim via a shared `copyExerciseWithWeeks()` helper. This affects both the new choice-modal flow and the pre-existing "Copy last block" button on `spc/blocks/[blockId].js`, since they're the same underlying action. New `copySpcWorkoutContent(fromWorkoutId, toWorkoutId)` is the SPC equivalent of the group calendar's `copyWorkoutContent()`, used by the SPC grid's own ⧉ flow.

**Exercise Library** (`app/(coach)/exercises/index.js`) — Lifts/Warm-ups is now the primary toggle (muscle-group chips only apply under Lifts); warm-ups show a tan pill instead of a muscle-group line. This needed a real schema change — **migration `0012_exercise_type.sql`**: `exercises.type` (`lift`/`warmup`), `default_sets`/`default_reps` (warm-up prefill), `muscle_group` made nullable. `components/ExerciseFormModal.js` gained a Type field first; selecting Warm-up swaps Muscle group/Movement pattern for a Default sets/reps pair.

**Real bugs found and fixed while wiring the Lift/Warm-up split in** (worth remembering as a class, several are RN/RNW footguns that could resurface):
- Every place that read `exercises.muscle_group` unconditionally (`.replace(...)` on a value that's `null` for warm-ups) would have crashed the instant a real warm-up exercise existed — `components/ExercisePickerModal.js` and the old `exercises/index.js` list row both hit this; fixed to branch on `type === "warmup"` instead.
- All three drag-and-drop builder sidebars (`builder/[workoutId].web.js`, `spc/builder/[workoutId].web.js`, `spc/templates/[templateId].web.js`) bucketed the whole library by `MUSCLE_GROUPS` with no type awareness — after the migration, warm-up exercises (null `muscle_group`) would have silently never rendered in the sidebar at all. Fixed with a pinned tan "Warm-ups" section above the muscle-group list in all three, and clicking a warm-up item now correctly calls `handleAddWarmup` instead of inserting into the main session.
- **The warm-up picker showed every exercise, lifts included** (`ExercisePickerModal`'s `library` prop was never filtered by type) — fixed across all 6 builder call sites (group/SPC/SPC-templates × native/web): the warm-up picker now filters to `type === "warmup"` only, and the native builders' shared picker (one modal, `pickerTarget` state) filters either direction depending on which slot it's inserting into.
- **Default sets/reps silently did nothing** — `addWarmup()`/`addSpcWarmup()` (`lib/programming/workouts.js` / `spcWorkouts.js`) never accepted `sets`/`reps` params at all, so there was nothing for the picker to prefill regardless of the exercise's `default_sets`/`default_reps`. Fixed in both functions plus all 4 group/SPC call sites (native+web); **SPC templates can't get this yet** — `template_warmups` has no `sets`/`reps` columns in the schema at all (unlike group/SPC), so that's a real gap needing its own migration if ever asked for.
- **Drag-and-drop was only visible while the cursor stayed inside the library sidebar** — the dragged item was self-transforming via `translate3d` instead of using a `DragOverlay`, so the drag preview got clipped by the sidebar `ScrollView`'s own `overflow` the moment the cursor left that column. Fixed in all three drag-enabled builders: dragged item now just fades (`opacity`), a `DragOverlay`-rendered preview card follows the pointer anywhere on screen (same pattern already proven on the SPC dashboard kanban), `collisionDetection={pointerWithin}` replaces the default rect-intersection (same fix as the kanban's original drop-target bug), and the warm-up/main-session drop zones get a real dashed rust highlight box on hover, not just a small text label.
- **The builder sidebar was rendering roughly 50% width instead of the intended fixed ~288px** (`className="w-72"` on a `ScrollView`) — confirmed by a real screenshot, not just a code read. Root cause: React Native Web's `ScrollView` applies its own default `flex: 1` internally, which overrides a plain Tailwind width class in a flex-row layout (the width still computes, but flex-basis/flex-grow win the actual layout). Fixed in all three builder sidebars by setting `flexGrow: 0, flexShrink: 0` explicitly via inline `style` (which does override the default), alongside `contentContainerStyle={{ flexGrow: 1 }}`. Worth remembering as a general rule: **don't rely on a Tailwind width class alone to constrain a `ScrollView`'s cross-axis size inside a flex row** — a plain `View` doesn't have this problem (see `CoachShell`'s sidebar, which never had this bug), only `ScrollView`.
- **`px-4.5`/`mb-4.5` render as zero padding** — `4.5` isn't a real Tailwind spacing step (the default scale has `0.5`/`1.5`/`2.5`/`3.5` fractional keys, then jumps straight from `4` to `5` — confirmed via `tailwindcss/resolveConfig`, not assumption). Used across 7 files this pass (Exercise Library, Clients list, SPC dashboard, SPC client detail, Group Programs, and two modals) before being caught by a real screenshot of the Exercise Library page showing text flush against the card edges. Fixed by swapping to `px-[18px]`/`mb-[18px]` arbitrary-value syntax everywhere. Worth a proactive grep (`-[a-zA-Z]*-4\.5\b`) if a similar "looks like there's no padding" report comes in on an untouched screen.

**Date format**: Group Programs' and SPC's calendar grid week-range labels (e.g. "Current week — 08/01 – 08/07") now use a new `formatDateMD()` (`lib/formatDate.js`, MM/DD, no year — the row's own relative label already establishes which year) instead of the full `formatDateMDY()` (MM-DD-YYYY, used everywhere else and left untouched), per explicit ask to shorten just those two grids.

**Verification status is mixed for this pass, unlike most others in this file**: the builder sidebar width, warm-up picker filtering, default-sets-prefill, and drag-and-drop visibility bugs above were all **found and fixed from the user's own real click-through and screenshots** (this environment still can't log in — no password entry — so this was the user testing directly and reporting back, not Claude Code's own verification). Coach Home, Clients list, Client detail, SPC dashboard/client-detail restyle, and the Exercise Library Lift/Warm-up split itself are still bundle-checked only (Metro/Expo compiles clean, zero console errors across every touched route) and haven't had the same direct click-through pass yet.

## Coach push notifications (Phase 6) — server side deployed and live, device delivery still blocked (2026-08-01)

Real trigger built to replace the dashboard-load-only auto-draft. Previously, `checkAndAutoDraft()` (`lib/programming/spcDashboard.js`) only ran client-side when a coach happened to open the SPC dashboard, and never sent a push regardless — `sendPush()` (`lib/notifications/sendPush.js`) had exactly one call site in the whole app, a manual "send yourself a test push" button on `app/(coach)/settings.js`. Nothing notified a coach when a block was actually auto-drafted.

**New `supabase/functions/scan-spc-alerts/index.ts`** — a server-side port of `checkAndAutoDraft`'s logic (same lead-time check, same overlap guard from `createSpcBlock`, same block+session-skeleton creation), running on a schedule independent of anyone having the app open. Unlike the client version, it also pushes the assigned coach on every block it drafts. Push-sending logic was extracted out of `send-push/index.ts` into shared `supabase/functions/_shared/expoPush.ts` so both functions use one tested implementation instead of duplicating the Expo API call.

Since this is invoked by `pg_cron`/`pg_net`, not a logged-in user, it has no caller JWT to check — auth is a `CRON_SECRET` shared-secret header instead, and the function is deployed with `--no-verify-jwt`.

**Deployed and running as of this session** — Terra ran the CLI steps herself (this environment still can't run an interactive `supabase login`, but walked her through it directly): `send-push` and `scan-spc-alerts` are both live (`supabase functions deploy`), `CRON_SECRET` is set (`supabase secrets set`), and `0013_spc_alert_push_cron.sql` has been run — `spc-alert-scan` is a registered `pg_cron` job, firing daily at 13:00 UTC (~6-7am Boise). The scan/auto-draft/push-attempt logic itself is genuinely live in production now, not just deployed-but-dormant.

**Update 2026-08-04 — both blockers below are resolved/moot now; see "Gym-wide announcements + real push notifications finally unblocked" further down for what's left.** `eas init` turned out to already be done (`app.json`'s `extra.eas.projectId` and `eas.json`'s submit config were already present — this note was stale, not an accurate blocker) and Terra has since gotten her Apple Developer Program account. The remaining gap is narrower than "not started": real APNs push credentials (`eas credentials`, needs Terra's Apple ID login) and a fresh EAS build/TestFlight submit with the Push Notifications capability actually enabled (removed from the one prior physical-device build because a free/personal Apple ID team doesn't support it — that limitation no longer applies). Original text, kept for history: ~~pushes won't reach an actual device yet. `eas init` hasn't been run (no EAS project id), and iOS additionally needs real Apple Developer Program enrollment for APNs (Phase 0, not started) — Android via FCM/Expo's push service is less blocked and could work sooner.~~ Until the credentials + rebuild above are done, the cron job will run daily, correctly auto-draft blocks and attempt pushes, but `sendPushToUser()` will just find zero registered tokens for every coach and no-op on the push half.

Can be tested directly (bypassing the daily schedule) by POSTing to the function URL with the `x-cron-secret` header.

**Follow-up, same session — on/off toggles + the nutrition app's 3 notification types ported over.** `app/(coach)/settings.js` gained a "Push notifications" section: `NOTIFICATION_TOGGLES` (a small config array, not the generic numeric-settings loop above it — booleans render as `Switch` rows, not text inputs) reads/writes `core.settings` via `getSetting`/`updateSetting` per key, defaulting to `true` (unset = always-on, matching pre-toggle behavior) so no seed migration was needed — the jsonb `value` column takes a real boolean fine, and the first toggle flip creates the row. `scan-spc-alerts` now checks `notify_spc_block_alerts` before its push (drafting itself is unaffected by the toggle — only whether the coach gets notified).

Also ported the standalone Nutrition Tracker app's only 3 notification types (researched directly from that app's code — see its `app/api/cron/reminders/route.js` and `app/api/cron/checkin-available/route.js`) into two new Edge Functions, since this app's nutrition module never had push at all (explicitly deferred at v1, see the nutrition section above — this closes that gap for these 3, not for photos/Focus-Game-Plan/highlights):
- **`supabase/functions/scan-nutrition-reminders/index.ts`** — daily: (1) evening reminder if today's log isn't finalized, (2) Monday-only nag if last week's check-in was never submitted (existence check against `checkin_responses`, not `finalized_at` — submitting is a client action, finalizing is coach-only in this app's model, unlike the source app). Both client-facing, independently toggleable (`notify_nutrition_daily_log_reminder`, `notify_nutrition_checkin_nag`).
- **`supabase/functions/scan-nutrition-checkin-available/index.ts`** — unconditional Sunday announcement that the new week's check-in is open, to every active nutrition client (`notify_nutrition_checkin_available`).

Both reuse the same `CRON_SECRET` already set for `scan-spc-alerts` (Supabase function secrets are project-wide) — no new secret needed. New `supabase/migrations/0014_nutrition_reminder_cron.sql` registers their two cron jobs (`nutrition-reminders-scan` daily at 2:00 UTC, `nutrition-checkin-available-scan` Sundays at 15:00 UTC — same schedules the source app used). **Not yet deployed or run** as of writing this — same manual CLI/SQL-Editor steps as everything else in this section.

## Coach account permissions + dual-login (staff-as-client) (2026-08-01)

Two asks from the same conversation, scoped deliberately narrow: skip building GHL-tag-driven program automation (agreed not worth the ongoing tag/parser-drift maintenance for how infrequently membership type actually changes — new-client and cancellation *webhooks* are still the plan, just not yet built this session) and instead build (1) admin-configurable per-coach module access and (2) letting a coach/admin account also be a real training client under the same login.

**Per-coach module toggles.** `core.users` gained three booleans (migration `0015_coach_permissions.sql`, **run against the live project**): `can_view_spc`, `can_view_nutrition`, `can_view_exercise_library`, all defaulting `true` so no existing coach's access changes until an admin flips one off. This is account-level, not per-client scoping — `core.is_staff()`'s "all coaches see all clients" design (0001's comment) is untouched. Three new security-definer functions (`core.can_access_spc()` / `_nutrition()` / `_exercise_library()`) encapsulate "admin always passes, coach passes only if their own flag is on," and every SPC/Nutrition/template "staff manage" RLS policy (0004/0005/0006/0008/0009) was switched from a bare `core.is_staff()` check to the matching `can_access_*()` call — real enforcement, not just hidden nav. Two deliberate scope decisions: `programming.exercises`' **read** policy stays plain `is_staff()` (every workout builder needs to read the library regardless of a coach's own toggle, or building group/SPC workouts would break for them — only the insert/update "manage the library" policies are gated), and `one_off_workouts`/`warmups`/`exercises` are **not** gated by `can_view_spc` even though `workout_templates`/`template_*` are — one-offs are reached from a client's own detail page regardless of program, templates' management entry point lives under the SPC nav section per its own build notes.

Nav visibility mirrors the RLS gating (`AuthProvider.js`'s profile fetch now selects the three flags): `CoachShell.js`'s sidebar (web) and `app/(coach)/_layout.js`'s Tabs (native, Nutrition is a direct tab there) filter on the same `can_view_*` flags, and `programs.js` (SPC row)/`more.js` (Exercise Library row) filter their rows the same way — admin always sees everything.

**Team management UI.** `app/(coach)/settings.js` gained a "Team" section (admin-only, same as the rest of that page): lists every coach/admin (`listCoaches()`), each coach row gets the three module `Switch`es (`updateCoachPermissions()` in `clients.js`) — admin rows show "Full access" instead, since the toggles don't apply to them. "+ Add coach"/"+ Add admin" open new `components/AddStaffModal.js` (name/email/role), which calls new `inviteStaffMember()` → new Edge Function **`supabase/functions/invite-staff/index.ts`** (deployed). That function is admin-only (checked server-side, not just left to RLS — there's no RLS equivalent for creating an `auth.users` row), calls `auth.admin.inviteUserByEmail()` (sends the actual "set your password" email), and — since this project's auth is shared with the Nutrition Tracker app — falls back to finding an existing `auth.users` row by email (via `admin.listUsers()`, no direct getUserByEmail in the admin API) if the invite errors as already-registered, so promoting an existing Nutrition Tracker login to coach works the same as a brand-new hire. Upserts the `core.users` row on `id` afterward so re-inviting an existing profile only touches name/email/role, leaving that person's permission flags as they were.

**Dual-login.** A coach/admin is also a real training client now, per explicit ask — same login sees their coach dashboard by default and can switch into the exact same member experience any client uses. This turned out to need no new data model at all: `client_program_assignments`/`spc_clients`/`nutrition_clients` were never actually restricted to `role: 'member'` rows, and `app/(coach)/clients/[userId].js` (the existing per-client program-assignment page) has no role assumptions anywhere in it — confirmed by grep before relying on it. So a coach's own training is just set up via that same page (`Settings` → Team → "Manage own training →" links straight to `/(coach)/clients/{their own id}`, reusing it as-is), and the only real work was the routing: `app/(member)/_layout.js`'s old hard redirect-away-if-not-member is now redirect-away-only-if-no-profile — staff are let through — and a staff-only "Coaching" tab (`app/(member)/back-to-coaching.js`, a plain `<Redirect href="/(coach)" />`, hidden via `href: null` for plain members) is the way back. Entry points: `CoachShell.js` (web sidebar) and `app/(coach)/more.js` (native) both gained a "My Training" link to `/(member)`. Member-side empty states ("not assigned to a program yet") already handled a client with nothing set up gracefully, so a coach who hasn't set up their own training yet sees exactly that, not an error.

**Migration 0015 is run and `invite-staff` is deployed.** Still **not visually verified** — same login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (fresh `expo start --web` on a scratch port, clean compile, no console errors on the reachable unauthenticated screens). Worth a manual pass: add a coach, flip a toggle off and confirm the nav item + underlying data both actually disappear for that account, and click through "My Training" → "Coaching" both directions. The invite email's `kovastrength://set-password` link also needs a real test — the app isn't published anywhere yet, so it's untested whether that link does anything useful on a device that doesn't already have the app installed (this is the same gap that later prompted the phone-OTP onboarding discussion below).

## Weight calculator on My Fitness weight fields (2026-08-02)

Real member request (relayed by Terra): members were struggling to do plate math in their head while logging a set's weight. New `components/WeightCalculator.js` — a bottom-sheet modal (house style: `#faf8f6` sheet, 22px top radius, slides up over a scrim) opened via a calculator icon that sits next to every weight `TextInput` in `components/SessionLogger.js` (shared by group/SPC/one-off logging, so this covers all of them). Two modes via the existing `SegmentedControl`:

- **Standard**: a plain +/−/×/÷/= keypad, chainable (enter, operator, enter, =, keep going).
- **Plate**: bar first — **Barbell (fixed 35 lb, the only bar weight this gym actually has)** or **Specialty** (free-typed weight, for trap bars/safety squat bars/etc. that don't have one fixed number) — then tap each plate as it's actually loaded (45/35/25/10/5/2.5). **Each tap adds its face value directly, no per-side doubling** — an earlier version doubled each tap assuming "one tap = one pair," which Terra flagged as confusing; a member loading two 45s per side now just taps 45 four times. Undo/Clear, running total, Insert writes the total into that set's weight field.

**Real bug hit and fixed during this build, worth remembering as a general pattern**: the icon was originally designed to only appear when its weight field had keyboard focus (opacity/`pointerEvents` toggled off `onFocus`/`onBlur`). Tapping the icon itself blurs the TextInput first, and that blur reliably landed *before* the tap's press event finished — the icon flipped to `pointerEvents: "none"` out from under the tap, silently swallowing it, on both web and native. A delayed-hide (`setTimeout` on blur, cancelled on refocus) didn't fully fix it either. Abandoned the focus-gated visibility entirely — the icon is now just always rendered next to the weight field whenever that exercise card is expanded, no focus tracking at all. **General lesson**: don't gate a sibling control's interactivity on another element's blur state when the control itself is what causes that blur — the ordering isn't reliable enough to build on, on any platform this app targets.

**Confirmed working end-to-end by Terra clicking through the real app** (native keyboard dismiss + calculator open + insert, both modes) — one of the few features in this file with real interactive verification rather than the usual bundle-checked-only caveat.

## Nutrition rebuilt against the standalone app's live tables (2026-08-02)

The placeholder "Nutrition v1" module (Kova's own `nutrition.*` schema, a minimal one-time port) is fully replaced. Terra's own framing for why: *"This is why we built this new app on the same Supabase DB... current clients using [the standalone] app can use that one up until the day this one is approved and then just make the switch, and it will all be the same."* Because Kova's nutrition screens now read/write the exact same live `public.*` tables the standalone Nutrition Tracker app itself uses, cutover for an existing client needs no data migration at all — just linking their Kova login to the row that already exists. The old `nutrition.*` schema and every `lib/nutrition/*` function pointed at it are dead code now, left inert rather than dropped (no rollback plan for dropping a schema, not worth the risk for pure cleanup credit).

**Schema bridge**: `public.coaches`/`public.clients` (the standalone app's own tables) require a matching row for `is_coach()`-gated RLS to pass — a Kova coach with no `public.coaches` row silently gets zero rows back from every query, not a loud error. Migration `0018_nutrition_coach_backfill.sql` (**run against the live project**) backfills one for every existing `core.users` coach/admin; going forward, `supabase/functions/invite-staff/index.ts` upserts one on every new-coach invite, and a new self-service `supabase/functions/ensure-nutrition-coach/index.ts` (called fire-and-forget from `AuthProvider.js` on every coach/admin login) covers accounts that never went through `invite-staff` at all (e.g. a role promoted via raw SQL, like the `test2@kovastrength.com` QA account).

**Client rollout — deliberately untouched by this build.** Three populations: (1) already a Kova member *and* already a standalone-app client (their `public.clients` row already exists — turning on the Nutrition switch just reactivates it, no onboarding replay); (2) already a Kova member, new to nutrition (gets a fresh `public.clients` row via `createOrReactivateClient` in `lib/nutrition/clients.js`, lands in onboarding); (3) **the real bulk of Terra's ~150-200 current clients — standalone-app-only, no Kova login at all.** Population 3 needs zero code changes here: Kova's `AuthProvider.js` only shows real content once a `core.users` row exists, and the only way to create one (`linkMemberByAuthId`) is a silent, admin-only, no-email database insert — so nobody in population 3 can see or be notified about Kova's existence until Terra explicitly links them, one at a time. Bulk-onboarding the rest is the separate, already-noted GHL+phone-OTP effort (below), not something this rebuild does.

**Coach roster** (`app/(coach)/nutrition/index.js` + new `index.web.js`) — repointed at `public.clients`/`public.coaches`/etc., with an "Onboarding" status added to the existing 5-tone `rosterStatus` bucketing. Web got the SPC dashboard's flat-grid treatment (`app/(coach)/spc/index.web.js`'s pattern, no drag-and-drop this time since nutrition status is fully computed, not coach-set): status tiles double as one-click filter chips, a coach filter + sort dropdown, one table listing everyone — replacing an earlier filter-chip-row-plus-card-list version that Terra found hard to scan. **Real pre-existing bug caught in the same pass**: `app/(coach)/nutrition/index.js` (and `questions.js`) were never wrapped in `<CoachShell>` at all, so opening either dropped the left sidebar — fixed both, predates this session.

**Member 4-tab core loop** renamed to match the standalone app exactly — Today/Weekly/Check-In/Photos (was Today/Check-in/History). `lib/nutrition/useNutritionAccess.js` gates all four: no `public.clients` row → "not turned on" message, row exists but `objective_tracking_approved_at` is null → routes into the onboarding hub, otherwise the real tab. `components/nutrition/WeekList.js` (shared by the member's Weekly tab and the coach's Weeks tab) is a real single aligned table with color-coded weekly averages (green/red on a ±10% band, steps one-directional) that expands per-week into all 7 calendar days — ported to match a real screenshot Terra sent of the standalone app's version, after an earlier stacked-card attempt read as "ugly."

**Onboarding flow** (net-new product surface, not a data-source swap) — 3 steps for Kova (Questionnaire / Objective Tracking / Starting Photos), dropping the standalone app's 4th "Account" step since a Kova member already has a working login before nutrition is ever turned on. Coach side: `app/(coach)/nutrition/clients/[userId]/onboarding/{questionnaire,tracking,photos,approve}.js` (nested under the same dynamic `[userId]` segment as the client-detail page itself — confirmed this coexistence pattern works fine in Expo Router, was an open question in the plan). `approve.js` inserts the first `targets` row, stamps `objective_tracking_approved_at`, and seeds check-in questions from the template — "graduation," ported verbatim from the standalone app's `approveAndSetTargets`. Member side: new `app/(member)/nutrition/onboarding.js`, a welcome hub with 3 tappable tasks (in-page state, not separate routes, matching the standalone app's own UX). Turning Nutrition on for a genuinely new client now auto-copies the questionnaire template (`copyQuestionnaireTemplateToClient`, wired into `createOrReactivateClient`) so onboarding has real content immediately, mirroring what the standalone app's now-skipped draft/invite step used to do.

**Coach client-detail page rebuilt as the real 6 tabs** (`app/(coach)/nutrition/clients/[userId].js`): Dashboard (stat tiles, editable focus checklist, game plan, week-over-week comparison), Weeks (`WeekList`), Trends (a hand-rolled `react-native-svg` line chart with metric/range pickers — `react-native-svg` added as a new dependency for this, verified nothing else got dropped from `node_modules`), Check-In (week cycler, snapshot cards, answers with **click-to-highlight** — web-only, since drag-select-text isn't a touch interaction; native renders the same stored highlights read-only), Photos, Targets. Native gets full parity per explicit ask, not a simplified fallback — the one deliberate exception is text highlighting.

**Photos** (`lib/nutrition/photos.js`, `components/nutrition/{PhotoUpload,PhotoCompare,PhotoRequirementControls,PhotoSubmissionsEditor,ZoomableImage}.js`) — camera-or-library upload via new `expo-image-picker` + `expo-image-manipulator` dependencies (client-side compression, replacing the standalone web app's browser-Canvas approach, which doesn't exist on native), private Supabase Storage bucket (already existed, RLS already correct, no bucket changes needed). `PhotoCompare`'s 2-slot widget has a real per-slot date picker (`<select>` on web, a modal list on native) showing "MM/DD/YYYY | weight lb" — **fixed after Terra caught a real gap**: the first version only had an anonymous "1/4" index stepper, no visible date, and lost the selected date entirely when switching angle tabs. Now tracked by date string, not array index, so switching Front→Side tries to keep the same date selected instead of jumping to oldest/newest. The full-screen lightbox (`ZoomableImage.js`) has real pinch-zoom/pan/double-tap-reset, built on `react-native-gesture-handler` + `react-native-reanimated` (both already app dependencies, no new gesture library needed) — native parity with the standalone app's web lightbox, per explicit ask. The photo-requirement gate (blocks check-in submission until that week's required photos are up) is wired for real into `submitCheckin`, not stubbed.

**Real data bug found and fixed, not just a UI gap**: `lib/nutrition/weekCycle.js`'s `summarizeWeek` was still filtering/sorting on `log.log_date` — the placeholder schema's column name — after `daily_logs` had already been repointed at `public.daily_logs`, whose column is just `.date`. This silently zeroed every week's `days` array everywhere `summarizeWeek` is used (Weeks tab, Dashboard tiles/comparison, Check-in snapshot) while the freshly-written Trends tab (built directly against `.date`) worked fine — exactly the "some data shows, some doesn't" symptom Terra reported. Fixed by correcting both the filter and the sort to `.date`.

**Push reminders**: `supabase/functions/scan-nutrition-reminders` and `scan-nutrition-checkin-available` rewritten from the placeholder schema to `public.*` (redeployed), plus a real new filter neither the placeholder version nor the standalone app needed: only scan clients with `objective_tracking_approved_at` set, since someone mid-onboarding has no daily-log/check-in cadence to nag about yet. `0014_nutrition_reminder_cron.sql` (registers the actual cron schedule) — check whether it's been run with `select * from cron.job;`; if `nutrition-reminders-scan`/`nutrition-checkin-available-scan` aren't listed, it still needs running in the SQL Editor.

**New admin pages** (as originally built this session, since superseded — see "Nutrition coach-tools follow-up pass" below): a standalone `app/(coach)/nutrition/questionnaire.js` template editor and `app/(coach)/nutrition/photo-compare.js` (standalone client-picker + compare board, still current).

**Verification is real for once, not the usual "bundle-checked only" caveat**: Terra logged in and clicked through this build directly during the session (she can log in, this environment still can't). Three real bugs came back and were fixed same-session: the roster's missing sidebar + hard-to-scan filter-chip layout, the Weeks-tab data bug above, and the Photos date-picker gap. Everything else (onboarding end-to-end, native photo capture/compression/zoom specifically) is still bundle-checked only — worth a real click-through, especially anything native-only that the web build can't exercise.

## Nutrition coach-tools follow-up pass (2026-08-02)

Terra's own first click-through of the nutrition rebuild above surfaced nine follow-ups, all built same-session. **Not yet visually verified** — same standing login limitation as everywhere else in this file; bundle-checked only (fresh `expo start --web` on a scratch port, clean compile, no console errors on `/` or `/settings`).

- **Templates moved into Settings, made editable.** `app/(coach)/nutrition/questions.js` and `questionnaire.js` are deleted — both template editors (weekly check-in + onboarding questionnaire) now live inline on `app/(coach)/settings.js` under a new "Nutrition templates" section, via a new shared `components/nutrition/QuestionListEditor.js` (add/rename-in-place/▲▼-reorder/delete — reorder swaps `position` between two rows, no drag-and-drop dependency needed). **This makes both templates admin-only** (Settings redirects non-admins) — previously any coach with `can_view_nutrition` could reach them from the Nutrition index page. Deliberate per Terra's ask, flagged here in case a coach-accessible copy is wanted later. New `updateTemplateQuestion`/`updateQuestionnaireTemplateQuestion` in `lib/nutrition/checkin.js`/`onboarding.js` back the rename+reorder.
- **Per-client question editing is check-in-only, not questionnaire** — confirmed directly with Terra mid-session: the onboarding questionnaire stays copy-from-template-only (unchanged), only weekly check-in questions get per-client editing, and that lives in the new Client Settings modal below (not its own page). New `addClientQuestion`/`updateClientQuestion`/`deleteClientQuestion` in `checkin.js`, reusing `QuestionListEditor`.
- **New `components/nutrition/ClientSettingsModal.js`** ports the standalone app's `EditClientModal` (Name/Phone/Start date/Status/Progress photo frequency/"Starting the week of" + This week/Next week quick-fill) plus embeds that client's check-in question editor. "Starting the week of" is a UI label only — it still writes `photo_frequency_started_at`, don't rename the column to match. New `updateClient(userId, fields)` free-form patch in `lib/nutrition/clients.js`. Opened via a new gear icon (`Ionicons settings-outline`) next to the client name in both header branches of `app/(coach)/nutrition/clients/[userId].js`. **`components/nutrition/PhotoRequirementControls.js` is deleted** — its recurring-cadence picker moved into this modal, its one-off "require next check-in" flag moved into the check-in timeline below; the Photos tab's "Photo requirements" card is gone.
- **Photo-pose backgrounds restored.** Copied `front.png`/`side.png`/`back.png` from the standalone app's `public/photo-poses/` into `assets/nutrition/photo-poses/`. Checked the actual pixel content first (`PIL` bbox analysis) — the silhouettes were already centered within their own canvas (sub-3% vertical offset, negligible), so Terra's "weird centering issues last time" was a layout bug, not bad source art. `components/nutrition/PhotoUpload.js`'s `AngleBox` now renders the pose image via `StyleSheet.absoluteFillObject` + `resizeMode="contain"` (pins all 4 edges, unlike a bare `width/height: "100%"`) at 0.25 opacity behind the placeholder, only when no photo is selected yet.
- **New `components/nutrition/MacroPills.js`** ports the standalone app's `MacroBubbles.js` — fixed per-macro-type pill color (protein/carb/fat/fiber/calories/steps/sleep), not an on-track/off-track comparison. Applied to the Dashboard tab's "Current target" card and `TargetsHistory.js`'s per-row line, both of which were plain concatenated text before. **Deliberately not touched**: `WeekList.js` (kept pixel-faithful to the original per an earlier session) and `WeekComparison.js` (its red/green coloring is a this-week-vs-target comparison, a different thing from a target listing).
- **Trends range picker** (`TREND_RANGES` in `[userId].js`) widened from `30d/90d/6mo/1yr` to `W/1m/3m/6m/1y` (7/30/90/180/365 days) — pure data-array change, the day-count already drives `trendCutoff` generically.
- **New `components/nutrition/CheckinWeekTimeline.js`** — per-client (not roster-wide; confirmed directly with Terra after an initial roster-wide-grid proposal was the wrong read of her ask) check-in status view: Upcoming (next 3 weeks) / This week / Past (last 5), each row showing completion status (Completed/Awaiting review/Missed/Not due yet, via the existing `deriveCheckinStatus`), whether that week required photos and whether they came in (`isPhotoRequirementWeek`/`hasAllAngles`, both pre-existing), and — the "ability to add a requirement" ask — a per-row toggle on upcoming/current weeks for the existing single-column one-off flag (`requirePhotosNextCheckin`/`clearPhotosNextCheckin`; only one week can hold it at a time, same as before, just surfaced per-row now instead of as one blanket Photos-tab button). Rendered above the existing (untouched) `WeekList` averages table in the Weeks tab. New `enumerateUpcomingWeeks()` in `lib/nutrition/weekCycle.js` (forward counterpart to `WeekList.js`'s `enumerateRecentWeeks`) and `listCheckinsSince()` in `checkin.js` back it.
- **Photo compare: 2→3 slots, controls moved above the photo, logo watermark.** Ported from the standalone app's `PhotoCompareBoard.js` (confirmed by reading it directly): `components/nutrition/PhotoCompare.js`'s `leftDate`/`rightDate` pair became a 3-element `slotDates` array (oldest/middle/newest default, same as the original), each column's `DateStepper` now renders above its `Slot` instead of below, and a low-opacity `assets/kova-logo.jpg` watermark sits bottom-right — same as the original, which also has no image-export pipeline, just a live overlay meant for a manual screenshot (`react-native-view-shot` would be the RN equivalent of a real one-tap export, if ever wanted). `app/(coach)/nutrition/photo-compare.js`'s wrapper page got a canvas-background + soft-bordered-card restyle so the board itself is a clean thing to screenshot. The client-detail Photos tab's "Compare" section picks up the 3-slot change automatically since it shares the same component.

**Unrelated but found the same day, worth knowing since it touches the exact tables this section is about**: the standalone Nutrition Tracker app's own `setClientStatus` used to also call `admin.auth.admin.updateUserById(clientId, { ban_duration: ... })` whenever a client's status changed away from "active" — a real, ~100-year Supabase Auth ban on the shared `auth.users` row (`public.clients.id` *is* `auth.users.id` in that app's schema, and this Supabase project's auth is shared with Kova). Terra hit this directly: pausing a test client row under her own email banned her real account, locking her out of Kova too. Fixed in the standalone app's repo (`app/dashboard/actions.js` — status-column-only now, matching its already-existing non-banning `updateClient` path) and documented in that repo's own `CLAUDE.md`/`CHANGELOG.md`. **Kova itself never had this bug** (verified — no `auth.admin.*` call anywhere in this repo touches ban/status), but since `lib/nutrition/clients.js`'s `setClientStatus`/`updateClient` write to that same shared `clients.status` column (including the Status field in the new Client Settings modal above), both now carry an explicit comment warning against ever wiring a ban in from this side.

## Nutrition coach-tools follow-up pass 2 (2026-08-02)

A second round of feedback on the same build, all done same-session. **Not yet visually verified** — same standing login limitation as everywhere else in this file; bundle-checked only (fresh `expo start --web` on a scratch port, 1785 modules, zero console/bundler errors).

- **Both question templates (Settings) now sit behind a "Manage →" button, not permanently expanded.** New `components/nutrition/TemplateEditorButton.js` wraps `QuestionListEditor` in a modal popup — `app/(coach)/settings.js`'s Nutrition templates section now shows a compact row (name + question count) per template instead of the full editor inline.
- **`ClientSettingsModal.js` gained a new `ExpandableSection` pattern** (click a header row to expand/collapse) applied to two things: the per-client check-in questions editor now shows an "Available to client" / "Not available yet" badge (based on `questions.length > 0` — matches what a client with zero questions actually sees on their own Check-In tab), and **`CheckinWeekTimeline` moved here from the Weeks tab entirely** (not duplicated) — the modal now takes `checkins`/`photos`/`today` props from `[userId].js`, and the Weeks tab is just `WeekList` now.
- **`TrendChart.js` reworked**: hover-to-inspect on web (mousemove over the whole `<Svg>`, nearest-point lookup) replaces tap-only, with x-axis date labels (`formatDateMD`, up to 5 evenly spaced) added along the bottom. Also fixes a real console warning (`Unknown event handler property 'onResponderTerminate'`) — caused by `onPress` on individual `<Circle>` elements, which react-native-svg's web build turns into RN touch-responder props that don't exist as real DOM attributes on a raw `<circle>`. `onPress` per-point is now native-only; web tracks pointer position against the chart instead.
- **`PhotoCompare.js`'s slot count is now a `slots` prop, default 2** (was hardcoded to 3 everywhere). Only `app/(coach)/nutrition/photo-compare.js` (the dedicated compare tool) passes `slots={3}` — the member's own Photos tab and the coach's per-client Photos tab both stay at 2. `defaultDates()` generalized to N evenly-spaced dates instead of a hardcoded oldest/middle/newest triple.
- **Photo-pose guide images fixed** — the previous "restored" version (see above) rendered full-bleed via `StyleSheet.absoluteFillObject`, which turned out wrong once actually seen: the source PNGs (`assets/nutrition/photo-poses/*.png`) are full illustrated frames (radial-glow background, not a transparent-margin silhouette), so filling the whole box with one read as "way oversized." Now rendered at a fixed 65% of the box, centered via a wrapping `View` with `alignItems`/`justifyContent` (genuine flexbox centering, not an unconstrained absolutely-positioned `Image` guessing its own static position) — can't overflow the box regardless of aspect ratio.
- **Coach-only photo backfill date (`PhotoUpload.js`'s `allowDatePick` mode) is now a real date picker on web** (`<input type="date">`) instead of a `YYYY-MM-DD` text field — native keeps the text field (no date-picker library installed, and this mode is coach-only/web-first per Terra's own framing of that workflow).
- **"Fix a day's photos" (`PhotoSubmissionsEditor.js`) angle picker is now a dropdown** (`<select>` on web, a modal option list on native — same split as `PhotoCompare.js`'s own `DatePicker`) instead of tap-to-cycle. Save is now genuinely blocked (button disabled, not just an error after clicking) unless the day has **exactly** one front, one side, and one back — the old check only caught duplicate angles, not a day saved with 2 angles or 4+ photos, either of which breaks the requirement-gate/compare logic that assumes a complete 3-angle set per date.
- **Targets tab shows the current value as a small colored pill next to each field's label** (`NewTargetForm.js`'s `Field`, now takes a `current`/`styleKey` pair) — reuses `MacroPills.js`'s per-macro color palette, now exported as `MACRO_STYLES` instead of being a private constant.
- **Photo Compare tool page widened** (`app/(coach)/nutrition/photo-compare.js`, `maxWidth: 700` centered → `maxWidth: 1100`, left-aligned like every other coach page) — the 3-slot board was reading as small/lost in the sidebar layout's available width.
- **Check-In tab rebuilt into a task-checklist landing page** (`app/(member)/nutrition/checkin.js`) — two collapsible `TaskCard`s: "This week's progress photos" (only shown on photo-required weeks; done once `hasAllAngles`, or the member can tap "I can't provide photos this week" → a popup asking why → that unblocks submission) and "Check-in form" (the existing questions, done once submitted). Previously, a photo-required week just hard-blocked `submitCheckin` with an alert and no way through at all — there was no skip path. **Deliberately no schema change**: raised directly by Terra mid-session (worried a new column on the shared `checkin_responses` table — `public.*`, also used by the standalone Nutrition Tracker app — might affect that app's own flow). The skip reason is instead appended as one more `{question, answer}` pair inside the existing `answers` jsonb array on submission (`submitCheckin(userId, answers, { photosSkipReason })` in `lib/nutrition/checkin.js`), so the standalone app's rows/rendering are completely unaffected — this only changes Kova's own gating logic and UI. The coach's Check-In tab on `[userId].js` needed no changes to show it — it already renders `checkin.answers` generically. **Superseded same day** — see "pass 3" below: the "collapsible card" interaction shipped here was replaced with real popups per direct follow-up feedback.

## Nutrition coach-tools follow-up pass 3 — real device debugging, a real native rendering bug (2026-08-02)

Terra reported the installed native app crashing on photo upload, and (once that was fixed) that the pose-guide images still didn't render right — "you need to rethink" after several wrong guesses. Two genuinely separate problems, both root-caused for real this time by using actual device/simulator access rather than reasoning from screenshots alone:

**Root cause #1 — stale native build, not a code bug.** `expo-image-picker`, `expo-image-manipulator`, and `react-native-svg` were added to `package.json` during the nutrition rebuild, but nobody had re-run `pod install` in the gitignored `ios/` folder since — every native rebuild kept reusing Pods from before those libraries existed, throwing a JS-catchable "Cannot find native module 'ExponentImagePicker'" the moment the picker was used. Separately, `Info.plist` was missing `NSPhotoLibraryUsageDescription`/`NSCameraUsageDescription` (only declared in `app.json`'s plugin config, which only reaches the hand-maintained native `Info.plist` via a real `expo prebuild`, not a plain rebuild). Fixed by running `pod install` and hand-adding the two Info.plist keys — see the "Physical iOS device builds" section's new bullet for the general lesson (native deps need `pod install`, config-plugin-only settings need hand-porting).

**This session had real Bash access to a Mac with Xcode and a physical device connected** (same unusual-but-recurring situation as the original physical-build session) — used it to pull real crash logs, run `pod install` directly, and eventually spin up an **iOS Simulator build** (via the `mcp__Claude_Code_iOS_Simulator__build`/`control` tools) purely to *see* the bug myself instead of reasoning about it blind, after web-preview checks kept passing while the real device kept failing. Debugging technique worth reusing: temporarily swapping a component under investigation into an already-reachable unauthenticated screen (here, `app/(auth)/login.js`) to view/screenshot it without needing real login credentials (which this environment still can't enter) — revert immediately after.

**Root cause #2 — a real native-only rendering bug, not a caching or asset problem**, despite three wrong turns first:
1. First guess: pose PNGs were "oversized" — shrank them to 65% + 20% opacity. Wrong; way too faint to see (Terra: "the girl is not rendering").
2. Second guess (once a real screenshot was sent as reference): switched to `resizeMode="cover"` at full size. Wrong; cropped heads/feet off since the images are much taller/narrower than the 3:4 box — `cover` always fills the box completely by cropping the overflow.
3. Actual asset bug found by pixel-analyzing the source PNGs directly (`PIL`, per-column/row brightness profiling): `front.png`/`side.png`/`back.png` had genuine dead solid-black margins baked into the canvas (93px/68px/20px respectively) — a previous session's "already centered, sub-3% offset" analysis had only checked vertical centering, never horizontal. Cropped all three to their real content bounds. Correct now, confirmed by direct visual inspection — but the *app* still rendered a tight, wrong zoom even with `resizeMode="contain"` and the fixed assets.
4. **The actual bug**: `StyleSheet.absoluteFillObject` (`position:"absolute"` + all four edges `0`, no explicit `width`/`height`) does not reliably size an `Image` for `resizeMode="contain"`'s scaling math on real native iOS — it rendered correctly every single time in the web preview (react-native-web's CSS-based `object-fit` doesn't have this problem) which is exactly why repeated "bundle-checked, no errors" verification kept giving false confidence. Fetching the exact compiled JS bundle Metro was serving (`curl .../entry.bundle`) and grepping it confirmed the *code* running on Terra's phone was correct the whole time — this was purely a layout/rendering quirk, not stale JS, stale assets, or stale native modules (all three were independently ruled out first: uninstalled/reinstalled the app from scratch, verified Metro served the freshly-cropped image bytes, verified the compiled bundle's asset registry had the correct new width/height). Fixed by switching the base `Image` to plain `style={{ width: "100%", height: "100%" }}` (still a child of a `position:"relative"`-by-default `Pressable`) instead of `absoluteFillObject` — confirmed via a real Simulator screenshot, not just "should work now." Grepped the rest of the codebase afterward for the same `absoluteFillObject`-on-`Image` pattern — nothing else uses it, so this was contained to the one component.

**Lesson for future debugging**: when web-preview verification keeps passing but a real device keeps failing on something visual/layout-related, stop trusting the web preview as a stand-in — react-native-web and true native `Image`/layout behavior can genuinely diverge, and the only way to know is to actually look at native output (simulator screenshot, or a real device).

## Design handoff v2: Settings restructure + Nutrition polish + member Settings (2026-08-02)

A new handoff (`design_handoff_v2_settings_nutrition/` — README + two `.dc.html` mockups + screenshots) covering three things: restructuring Coach Settings into sub-tabs, a visual/functional polish pass on the coach Nutrition roster/client-detail/photo-compare screens, and a brand-new member-facing Settings screen. Full plan (including the pre-implementation audit of what was already built vs. genuinely new) is in the session that built this — summarized here.

**Real finding going in**: several of the handoff's "asks" were already functionally built from earlier sessions (the roster's clickable status-filter chips, Weeks tab expand-to-days rows, Trends tab's hover line chart, Client Settings modal) — this pass only touched what was actually new or visually off, not a rebuild.

- **Coach Settings** (`app/(coach)/settings.js`) restructured from one long scroll into an underline sub-tab bar — Team / Program Defaults / Nutrition Templates / Notifications / Diagnostics — same `TabBar` visual pattern the nutrition client-detail page already used. Program Defaults' 4 numeric fields moved into one 2-column card with a single combined "Save changes" button (was one Save button per field) — a judgment call per the README's own note flagging this as worth confirming; went with the mock's combined-save since independent per-field save wasn't a real pain point.
- **Nutrition roster** (`app/(coach)/nutrition/index.web.js`): default sort changed from `"status"` to `"name"` per direct feedback — an unfiltered roster now reads as a plain alphabetical list instead of grouped by status tile; "Sort: Status" stays available in the dropdown. Added a "Filtered: {status} · Clear filter" line above the table when a status chip is active.
- **Nutrition client detail** (`app/(coach)/nutrition/clients/[userId].js`): Dashboard tab reordered — Focus items + Game plan now lead as a full-width 2-column row at the top, above "This week at a glance"/"Current target"/"This week vs last week". `SectionCard` (used by all 6 tabs) restyled to the house token spec — `#ece7e1` card border (was plain `stone-200` gray) + 12px radius + soft shadow, instead of a flat `rounded-lg`/gray-border card.
- **New branded Photo Compare board** (`components/nutrition/PhotoCompareBoard.js`) — a distinct shareable social-media board (warm gradient header, Kova wordmark + tagline, client name + date range, 3 photo panes with date/weight labels, a stat row for total weight change + weeks), separate from the plain `PhotoCompare` widget used elsewhere (client-detail's own "Compare" section stays unbranded). The gradient uses `react-native-svg` (`LinearGradient`/`Rect`, already a dependency via `TrendChart`) rather than adding `expo-linear-gradient` as a new native dependency — avoids the "forgot to `pod install`" class of bug documented elsewhere in this file. `app/(coach)/nutrition/photo-compare.js` now owns angle/date-selection state itself (lifted out of `PhotoCompare`, which had `DateStepper`/`defaultDates` exported for reuse) so the date pickers stay outside the board as "screenshot-clean" chrome, per the README.
- **Member Weekly tab** (`app/(member)/nutrition/weekly.js`): added two summary tiles (8-week weight trend, avg adherence) and split the single `WeekList` into "This week — day by day" (always-expanded, new `WeekDayTable` export from `components/nutrition/WeekList.js`) + "Prior weeks" (the existing collapsible `WeekList`).
- **New member Settings screen** (`app/(member)/settings.js`) — reached via a gear icon on My Week's header only (the README flagged it as realistically belonging on every tab but only mocked on My Week; easy to extend later). Sections: Account (email/password change via plain `supabase.auth.updateUser`, same call `app/(auth)/set-password.js` already uses), Notifications (3 per-user toggles — see migration below), About (read-only assigned coach, omitted entirely if the member has no `public.clients` row), Sign out, Danger zone (type-DELETE-to-confirm account deletion).
  - **Per-user notification prefs are new state**, distinct from the admin's existing gym-wide toggles on Settings → Notifications (those gate whether a feature sends *at all*; these gate whether *this member* wants it). `core.users` gained `notify_daily_log_reminder`/`notify_checkin_available`/`notify_coach_messages` (migration `0020`, **not yet run**). No plain "user can update own row" RLS policy was added for this — that would let a member overwrite *any* column on their own row (including `role`) via a raw client update. Instead `core.update_own_notification_prefs(...)` is a narrow security-definer RPC that can only ever touch those 3 columns, called via `lib/notifications/memberPrefs.js`. `scan-nutrition-reminders`/`scan-nutrition-checkin-available` were updated to also check the relevant per-user flag (batched, not N+1) — **not yet redeployed**. "Coach messages" has no send path at all today (no push fires on a new `program_comments` row) — that toggle is real and persisted, just inert until such a feature exists.
  - **Account deletion is a real App Store requirement, not just a nice-to-have**: Guideline 5.1.1(v) requires apps that support account creation to also offer in-app account deletion. New `supabase/functions/delete-account/index.ts` (self-service — resolves the caller's own id from their JWT, never a passed-in userId, same shape as `ensure-nutrition-coach`; `auth.admin.deleteUser` cascades through every FK, including the shared-auth standalone Nutrition Tracker app's tables) — **written but not deployed**, same standing deferred-deployment pattern as every other Edge Function in this repo.

**Not visually verified** — standing login limitation (no password entry in this environment); bundle-checked only (fresh `expo start --web` on a scratch port, 1792 modules, zero console/bundler errors on the reachable unauthenticated screen). Worth a manual click-through, especially: Settings sub-tabs actually switching, the new Photo Compare board's gradient/layout, the Weekly tab's new tiles, and the member Settings screen's forms end-to-end (email/password change, notification toggles, and — once migration 0020 + the `delete-account` function are both live — account deletion).

**Needed before this is fully live**: run migration `0020_member_notification_prefs.sql` + `NOTIFY pgrst, 'reload schema'`, deploy `supabase functions deploy delete-account`, and redeploy `scan-nutrition-reminders`/`scan-nutrition-checkin-available` to pick up the per-user pref check.

## Nutrition onboarding review: real gap found + a ported "skip" feature (2026-08-03)

Found via a real client (Roxy) stuck in a state the coach couldn't act on: her roster status was "Needs target," but the review/approve screen (`onboarding/approve.js` — baseline averages + coach prep notes + macro-target form, confirmed to faithfully match the standalone app's own `approve/page.js` byte-for-byte in structure) was completely unreachable for her.

**Root cause**: `approve.js` redirected away for anyone with `objective_tracking_approved_at` already set, treating "already approved" as "nothing to review." But a client can be approved with **zero targets** — e.g. a pre-existing standalone-app client whose Kova nutrition access was just turned on, never run through Kova's own onboarding cycle. That's exactly what "Needs target" means, and there was no path to the review screen for it, and no link to that screen anywhere outside the onboarding hub (which a client stops seeing the moment they're approved).

Fixed:
- `onboarding/approve.js`'s redirect now gates on "does this client already have a target" (`listTargets`), not on the approval timestamp.
- `lib/nutrition/onboarding.js`'s `approveAndSetTargets` now checks whether the client was already approved before deciding whether to re-stamp `objective_tracking_approved_at` (would overwrite their real original approval date) or re-seed `client_checkin_questions` from the template (would duplicate whatever they already have) — for an already-approved client it now only inserts the target.
- `app/(coach)/nutrition/clients/[userId].js` gained a "No target set yet" banner, shown on every tab whenever `!currentTarget`, linking straight to the review screen — the only entry point to it outside the onboarding hub.

**Separately, a real missing feature, not just a bug**: the standalone app's drafts flow has `bypassObjectiveTracking` — lets a coach mark a client approved immediately, skipping the questionnaire/tracking/photos requirement entirely, for a client who won't do that in-app (legacy client being migrated in, paper/verbal intake, someone who'll just never log in). This never made it into Kova's port at all (Kova has no `client_drafts` concept, and the skip action itself got dropped along with it, not just the drafts mechanism). Ported as `lib/nutrition/onboarding.js`'s `bypassOnboarding(userId)` — same behavior as the original (stamps approval, seeds check-in questions, deliberately does NOT insert a target, same as the source) — exposed as a "Skip in-app onboarding →" link on the onboarding hub page (`[userId].js`'s not-yet-approved branch), next to the existing "Approve & Set Targets" button. Confirmed via `window.confirm`/`Alert.alert` (`lib/confirmDialog.js`'s new `confirmBypassOnboarding`, same web/native branch as `confirmOverwrite`/`confirmDelete` — plain `Alert.alert` with a button array doesn't render as a real dialog on web, where coaches do most of this work) before it fires, since it's a real state change with no undo path built.

**Verification real for the approve.js fix** (Terra clicked through it directly on Roxy's real account, confirmed working) — the "Skip in-app onboarding" feature itself is bundle-checked only, not yet clicked through.

## Nutrition onboarding pipeline page + real "never signed in" tracking (2026-08-03)

Same session as the fixes above, prompted by the same real client (Roxy) turning out to have never signed into Kova at all — direct feedback that this used to be visible in the standalone app and "onboarding felt like a black hole" without it. Read that app's actual `/dashboard/onboarding` page + `lib/onboardingClients.js`/`lib/clientStatus.js` directly (not guessed) and ported the real pieces, adapted for Kova's identity model:

- **Never-signed-in tracking** — first built as `core.users.first_login_at` (migration `0021_first_login_at.sql`, a new column stamped client-side via `core.stamp_own_first_login()`, called fire-and-forget from `AuthProvider.js` on every login). Replaced same-day, before `0021` ever ran against the live project, by `0022_login_activity.sql`'s `core.get_login_activity(user_ids)`: a new column has no history, so real prior logins would've shown as "Never signed in" until someone happened to reopen the app after the migration — `get_login_activity` instead reads `auth.users.last_sign_in_at` directly (tracked natively by Supabase Auth since account creation, no backfill gap) via a staff-only security-definer function. `0022` drops `0021`'s column/function first (`if exists`, safe either order), so **only `0022` needs running**.
- **`lib/nutrition/onboarding.js`** gained `describeOnboardingProgress()` (ported from the standalone app's `computeClientStatus` — "Waiting on questionnaire" / "Waiting on Objective Tracking days" / "Waiting on starting photos" / "Ready for review") and `getOnboardingRoster()` (ported from `getOnboardingClients()` — batched fetch of every not-yet-approved client with phases + progress text + `firstLoginAt` attached, cross-schema `core.users` join done as a separate fetch + client-side merge per this app's standing "avoid cross-schema PostgREST embeds" rule).
- **New `app/(coach)/nutrition/onboarding.js`** — a dedicated pipeline list (ported from the standalone app's `/dashboard/onboarding` page + `ClientRow.js`): every mid-onboarding client, a status dot (gray/olive) + progress line, "· Never signed in" appended when `firstLoginAt` is null, and a **"Resend invite"** action shown only for that case. Reachable via a new "Onboarding →" link on the main roster (both `index.web.js` and native `index.js`), next to the existing Archived/Photo compare links.
  - **"Resend invite" isn't a literal port** — the standalone app has a real email-invite system (`client_drafts` → `inviteUserByEmail`) that Kova has no equivalent of (a Kova member's `auth.users` row already exists before nutrition is ever turned on — see `linkMemberByAuthId`). Instead it calls `supabase.auth.resetPasswordForEmail()`, the exact same call this app's own `/reset-password` screen already uses — sends a real, working set-password link regardless of whether they ever completed a first login. Genuinely functional, not a stub.

**Superseded later the same day** — see "Nutrition dashboard rework" below. The pipeline page, `getOnboardingRoster()`, and `describeOnboardingProgress()` are all gone: onboarding phase detail now surfaces directly on the main roster's tiles instead of a separate page, and "Resend invite"/"Never signed in" moved to the main Clients page (an account-level concern, not nutrition-specific). `core.get_login_activity` is still exactly what backs it, just called from a different screen.

## Nutrition dashboard rework: real onboarding/check-in statuses, Finalize relocated, Objective Tracking history (2026-08-03)

Same day as the onboarding-pipeline work above, later session — direct feedback that the dashboard's tiles didn't match how a coach actually thinks about a roster. Replaced the flat `STATUS_ORDER` row (one "Onboarding" catch-all, one vague "On track" catch-all) with two real 3-way splits, and relocated a few actions that were in awkward spots.

- **`lib/nutrition/rosterStatus.js`** now has `NEW_CLIENT_STATUSES` (`otSetup` / `otInProgress` / `readyForReview`) and `ACTIVE_CLIENT_STATUSES` (`checkinPending` / `readyForCheckin` / `checkinCompleted`), plus `OTHER_STATUSES` (`needsTarget` / `paused`) for the rare edge cases that don't fit either grouping. `deriveCheckinStatus` only ever returns pending/ready/completed, so the 3 active-client statuses are exhaustive — there's no "on track" catch-all left. New `getOnboardingPhasesForClients(userIds)` (`lib/nutrition/onboarding.js`, replaces the removed `getOnboardingRoster`) batches phase data for whichever clients are onboarding; `deriveOnboardingBucket` in `lib/nutrition/dashboard.js` splits them by whether tracking days are assigned yet vs. logged vs. fully ready (`readyForReview` requires OT logging *and* the questionnaire *and* starting photos — a client done with OT but still missing photos stays in `otInProgress`).
- **Web roster** (`app/(coach)/nutrition/index.web.js`) groups these into two labeled, one-line tile rows — "Active clients" and "New clients" (`TileSection`, `flex-row` with no wrap) — instead of one flat wrapping row. `OTHER_STATUSES` renders as a small secondary row only when either bucket has anyone in it, so it disappears entirely once there's nobody paused or target-less.
- **Tile labels went through a couple of rounds of direct feedback**: `checkinPending`/`readyForCheckin` are now labeled "Awaiting client check-in" / "Awaiting coach check-in" (clearer than the original "Pending"/"Ready for" wording, though the underlying split already existed). Considered folding `needsTarget` into Active clients as a 4th tile, landed on keeping 3-and-3 instead — see the bypass-onboarding fix below, which should make `needsTarget` a rare-to-nonexistent state going forward rather than something worth a permanent tile.
- **Finalize Check-In relocated** from the bottom of the Check-In tab to the top of the client-detail page, next to the client's name — visible regardless of which tab a coach is on, still wired to the same `checkin`/`selectedWeek` state the tab's own week-navigator drives (so paging to a late-submitted prior week still works through the same button). A small person icon appears on the button only when that check-in cycle has progress photos in (a live "has any" check, not unread/seen tracking — no migration needed). The bottom of the Check-In tab is now just a status readout, not a second action.
- **Check-in submitted-at timestamps** — new `formatDateTimeInBoise()` (`lib/boiseDate.js`, Boise-local "MM/DD HH:MM AM/PM") shows in two places: the Client Settings modal's per-week `CheckinWeekTimeline` (historical, every week), and directly under the roster row's status badge for anyone currently "Awaiting coach check-in" (a better spot for a same-week glance than opening Settings).
- **Bypass onboarding now requires a target immediately** — `handleBypassOnboarding` (`clients/[userId].js`) routes straight into `onboarding/approve.js` right after calling `bypassOnboarding()`, instead of leaving the coach to remember to come back later. `approve.js`'s own gate already only checks whether a target exists (not the approval timestamp — see the onboarding-review fix above), so it was already the right landing screen. This is what should make `needsTarget` a rare state going forward instead of a standing one.
- **New Objective Tracking history on the Targets tab** — `components/nutrition/ObjectiveTrackingHistory.js`, under Target History: averages via the existing `computeBaseline` (same one `approve.js` uses for the one-time review), clickable to a modal listing every individual logged day (date, protein/carb/fat/fiber, derived calories). Backed by new `listObjectiveTrackingLogs(userId)` (`lib/nutrition/onboarding.js`) — unlike `approve.js`'s one-time baseline, this is available any time after onboarding, not just during the initial review.
- **Coach Home's own "Nutrition" summary tile is unaffected** — `lib/programming/coachDashboard.js` computes its breakdown independently off raw `checkinStatus`/`hasTarget`/`needsAttention` fields, not off `rosterStatus`, so the tile-taxonomy rename didn't touch it. Confirmed by reading it directly before assuming otherwise.

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (fresh `expo start --web` on a scratch port, clean compile, zero console errors). Worth a manual click-through, especially the tile bucketing against real onboarding/active clients and the relocated Finalize button.

## Gym-wide announcements + real push notifications finally unblocked (2026-08-04)

Direct ask: a way to write a note, send it to all clients (or a filtered subset) right away or on a schedule, and have it pop up when they open the app — explicitly compared to the nutrition milestone "Congrats!" popup as the interaction model to copy. Same day, separately: **Terra got her Apple Developer Program account**, clearing one of the two real blockers on push that had been standing since Phase 6 (the other, `eas init`, turned out to already be done — `app.json`'s `extra.eas.projectId` and `eas.json`'s submit config were already present, so that CLAUDE.md note was stale).

**New `programming.announcements` + `announcement_acknowledgments` tables** (migration `0024_announcements.sql`, **not yet run**). Admin-only to compose/manage (`core.is_admin()`, not the generic `can_view_*` staff toggles — a gym-wide broadcast is a bigger blast radius than the rest of the coach permission surface, same reasoning as Settings being admin-only). `target_type` (`all`/`group_program`/`spc`/`nutrition`) + `target_group_program_id` encode the optional audience filter; `send_at` is both "when to show this" (RLS gates member visibility on `send_at <= now()`) and "when to push it." `announcement_acknowledgments` is a member-owned row (own-`user_id` RLS, no security-definer RPC needed — unlike the milestone table, ack isn't a column on a coach-owned row, so a plain insert policy is already narrow enough).

**In-app popup — works today, no infra dependency.** `lib/programming/announcements.js`'s `listDueUnseenAnnouncementsForUser()` fetches due+unseen rows, then resolves audience membership (group program via `client_program_assignments`, SPC via the existing `isSpcActive()`, Nutrition via `public.clients.status` — cross-schema, plain `supabase` client with no `.schema()` call, same as the rest of the nutrition module) client-side, since RLS only gates on `send_at`, not audience. New `components/AnnouncementModal.js` (visually identical pattern to `MilestoneCongratsModal.js`, generic title/message instead of fixed "Congrats!" copy) + `lib/notifications/AnnouncementChecker.js` (mounted once in `app/(member)/_layout.js` as a sibling of `<Tabs>`, not nested inside it — fires for real members and for staff using "My Training" alike, since both land in this layout).

**Real push send — code-complete, needs the deploy/credentials steps below before it actually reaches a phone.** New `supabase/functions/_shared/announcementAudience.ts` (server-side mirror of the client-side audience resolution above — kept in sync by hand, same as this app's other intentionally-duplicated client/server logic) backs two functions: `send-announcement` (JWT-authenticated, admin-only, fires immediately — called right after `createAnnouncement()` when the coach picks "Send now") and `scan-announcements` (CRON_SECRET-authenticated, catches *scheduled* announcements once `send_at` passes — migration `0025_announcement_push_cron.sql`, **not yet run**, registers a `pg_cron` job hitting it every 15 minutes). Both mark `pushed_at` so a scheduled announcement never double-sends. If push delivery itself fails (no deployed function yet, no registered device tokens), the announcement row and in-app popup are unaffected — `pushAnnouncementNow()`'s failure is caught and logged, not surfaced as a compose-flow error, so "the popup still works" was never contingent on push infra being finished.

**New `app/(coach)/announcements/index.js`** — admin-only page (nav entry in `CoachShell.js`'s sidebar on web, `more.js` on native, both admin-gated same as Settings), reusing `SegmentedControl` for audience/timing pickers and a `<select>`/pill-list split for the group-program target (web/native, matching the coach-dropdown convention elsewhere). New `confirmDeleteAnnouncement()` in `lib/confirmDialog.js` backs the History list's delete action, following the existing `confirmDeleteMilestone`-style named-variant pattern rather than reusing the generically-titled `confirmDelete`, which is hardcoded to "Delete this block?".

**Schedule picker went through a real-world fix, not just a build-check**: the first version used `<input type="datetime-local" step={900}>` on web and two free-text fields on native. Terra reported it back as genuinely broken on web — clicking a date changed it but the picker never closed, and no time control showed at all. Root cause: cross-browser support/behavior for a combined date+time input with a `step` restricting minute granularity is inconsistent (Safari doesn't auto-close the way Chrome does), so it was dropped entirely rather than patched. Both platforms now use plain, explicit option lists instead — a `<select>` pair on web (one for date, one for time), a tap-to-open scrollable modal-list pair on native (`NativePickerField`, same pattern as `PhotoCompare.js`'s `DatePicker`) — fed by shared `buildDateOptions()` (next 60 days) / `buildTimeOptions()` (all 96 quarter-hour slots, 12-hour labels) functions. Time is restricted to `:00/:15/:30/:45` by only ever offering those as selectable options, matching `scan-announcements`' own 15-minute cron cadence — picking anything finer would be a false promise of precision anyway.

**Status as of this session — fully live, not just code-complete:**
1. Migration `0024_announcements.sql` — **run.**
2. `send-announcement` and `scan-announcements --no-verify-jwt` — **both deployed** (this session's Supabase CLI happened to be authenticated already — see the "No DB credentials available" working note below for why that's notable).
3. Migration `0025_announcement_push_cron.sql` — **run**, registered as pg_cron job id 6, confirmed firing successfully against the deployed `scan-announcements` function (`CRON_SECRET` reused from the existing `scan-spc-alerts` setup, confirmed still set via `supabase secrets list`).
4. **Real APNs push credentials — generated automatically**, no separate `eas credentials` step needed: kicking off `npx eas-cli build --platform ios --profile production` (now that the Apple Developer Program is active) had EAS detect the missing push key from the `expo-notifications` plugin and prompt Terra to generate one against her Apple ID right there in the build flow. Confirms the "needs `eas credentials` run interactively" note below and in "Coach push notifications" above is now resolved, not just theoretically unblocked.
5. **Build submitted, Apple processing pending** as of this writing — `npx eas-cli submit --platform ios --profile production --latest` was queued ("waiting for an available submitter"). Once it clears Apple's processing and gets installed on a device, that device registers a real push token for the first time — that's the last gap before `send-push`/`scan-spc-alerts`/the nutrition reminder scans/this announcement pipeline all start actually reaching a phone. None of their own code needs to change; they were only ever missing a registered token to send to.

**Not yet verified** — same standing login limitation as everywhere else in this file; bundle-checked only (fresh `expo start --web` on a scratch port, zero console/bundler errors). Worth a manual click-through once the new build is installed: compose an announcement as Terra, confirm the popup appears on a member login, confirm the audience filter actually excludes/includes the right clients, and confirm a "Send now" announcement produces a real phone notification.

## iOS push confirmed live, Universal Links, GHL import groundwork (2026-08-04, later session)

**Push notifications reached a real phone for the first time.** Build 6's TestFlight submission finished processing, Terra installed it, and a real announcement push (`announcement-scan`'s 15-minute cron) showed up on her device — the last gap noted in the previous section (a device with a real registered push token) is closed. This is a real end-to-end confirmation, not just "should work now."

**Real bug found from that same test: the in-app announcement popup didn't show on reopening the app**, even though the OS push notification itself arrived correctly. Root cause: `lib/notifications/AnnouncementChecker.js` only checked for due/unseen announcements once, in a mount-only `useEffect` keyed on `profile.id`. It's mounted at the `(member)/_layout.js` level, not as a per-tab screen, so the `useFocusEffect` fix already applied elsewhere in the member app (session-completion state) doesn't apply the same way here — reopening/foregrounding an already-running app doesn't remount the layout or change `profile.id`, so the check never re-ran. Fixed by also listening for `AppState` foreground transitions (`AppState.addEventListener("change", ...)`, re-checking whenever the app becomes `"active"`) — the first use of `AppState` anywhere in this app's own code. Worth checking for the same "mount-only effect at a layout/provider level, not a per-screen level" shape if a similar "works on cold start, not on reopen" report comes in elsewhere.

**iOS Universal Links configured and verified live.** `app.json` gained `ios.associatedDomains: ["applinks:app.kovastrength.com"]`; `public/.well-known/apple-app-site-association` (Team ID `CDY5M385LV` + bundle ID `com.kovastrength.mobile`, `paths: ["*"]`) is committed and deployed — confirmed serving with `content-type: application/json` at `https://app.kovastrength.com/.well-known/apple-app-site-association` (a `vercel.json` header rule was needed since Vercel doesn't infer the right content-type for an extensionless file). The three places that built a `kovastrength://` custom-scheme link (`reset-password.js`, the coach's admin resend-invite in `clients/[userId].js`, and `invite-staff`) now build `https://app.kovastrength.com/set-password` instead, so the link works whether or not the app is already installed. **Needs a new EAS build to actually take effect** — `associatedDomains` is a native entitlement, not something a JS-only update can carry to an already-built binary.

**Real Vercel-deploy lesson**: `kovaapp` (the `app.kovastrength.com` project) *is* connected to GitHub (`dustins333/Programming`, `main` branch, confirmed via the `kovaapp-git-main-*.vercel.app` auto-alias only git-connected projects get) — deploys happen by pushing to `main`, not via the Vercel CLI. Running `vercel --prod` directly is actively the wrong tool here: it does a raw local-disk upload that bypasses git's own file filtering and hit Vercel's 15,000-file request limit (uploaded 19,235) even though only 274 files are actually git-tracked. Don't suggest `vercel --prod` for this project again — just commit and push.

**This session's Supabase and EAS CLIs were both already authenticated** (same "don't assume the sandboxed limitation always holds" exception noted elsewhere in this file) — used for real, verified work rather than guesswork: confirmed migrations `0020`/`0022`/`0023`/`0024` and all 4 `pg_cron` jobs (`spc-alert-scan`, `nutrition-reminders-scan`, `nutrition-checkin-available-scan`, `announcement-scan`) were already live (several CLAUDE.md "not yet run" notes were stale), deployed `delete-account` (the one genuinely-undeployed function), and read real EAS build/submit state directly (`eas-cli build:list`/`submit:list --json`) rather than asking the user to check manually. Also cancelled a duplicate EAS submission directly (`eas-cli submit:cancel`) after a client-side TLS disconnect error caused a second `eas submit` attempt to queue alongside a first one that had actually succeeded server-side despite the local error.

**GHL client onboarding is fully built and verified end-to-end, same day, once Terra got a GHL Private Integration Token** — see the "Client onboarding via GHL + phone-OTP registration" bullet under Manual/deferred setup below for the complete current state. Short version: `import-client`, `request-registration-code`, `verify-registration-code`, and `app/(auth)/register.js` are all built, deployed, and confirmed working against the live project — a real account was created via a real GHL-fired webhook, texted a real code via GHL's Conversations API, verified, had its password set, and signed in successfully (confirmed via a direct password-grant token request, not just "the function returned 200").

**Two real bugs found and fixed getting there, both worth remembering as a class**: (1) `import-client`'s original field-parsing was written against a synthetic contract (`{name, email, contact_id}`) that turned out wrong once a real GHL webhook fired — GHL sends `first_name`/`last_name`/`full_name`/`email` as native top-level fields regardless of the webhook action's own Custom Data config, and only `contact_id` (which has no native top-level equivalent on this trigger type) needed to be added there explicitly. Fixed by reading the real fields the real payload actually had, not by asking Terra to reshape GHL's config further. (2) The GHL Private Integration Token returned a real, specific `401 "The token is not authorized for this scope"` from GHL's own API on the first send attempt — the token already had "Edit conversations"/"Edit conversation messages" scopes checked, but sending required a separate, additionally-named scope that wasn't obviously the same thing from the scope picker's own labels. Diagnosed by curling GHL's API directly with the same credentials the Edge Function uses (bypassing the function entirely) to get GHL's real error text, rather than guessing from the function's own deliberately-generic `{sent: true}` response — worth doing again for any future "did the third-party API call actually work" question, since Supabase's CLI doesn't expose remote Edge Function logs (`supabase functions logs` isn't a real subcommand as of this CLI version — only `list`/`deploy`/`download`/`delete`/`new`/`serve`).

**This all works on the web build (`app.kovastrength.com/register`) today, no native rebuild needed** — new Expo Router screens and Edge Function calls are pure JS, unlike the Universal Links entitlement change earlier in this session. The already-installed TestFlight build won't get the new Register screen until a future build bundles it, though (no EAS Update/OTA channel configured for this project as of this writing).

**First Android build ever attempted — finished successfully** (`eas build -p android --profile production`, version code 2) — checked live, Android had never been built before this session. Made it through despite Expo's own active "Elevated Android build failures" partial outage at the time (iOS unaffected); produced a real `.aab` artifact. A cloud-managed Android keystore was auto-generated since none existed. **Play Store is still blocked on**: Terra's Play Developer account finishing identity verification, a Play Console service-account key (for `eas submit -p android`, needs adding to `eas.json`'s `submit.production.android`), and — a real content gap found this session — `kovastrength.com/privacy-policy/` is generic GHL/marketing boilerplate that never mentions the app or any of the health-adjacent data it actually collects (workout logs, nutrition data, progress photos). A drafted addendum covering that was handed off for Terra's/legal's review; not yet published to the site. Also worth flagging when it comes up: Google requires new personal Play Developer accounts to run a closed test with 20+ testers for 14 days before allowing a production release — a real calendar constraint independent of anything else being ready.

**Clarified how the GHL bulk-import rollout is actually meant to work, prompted by direct questions**: a client imported via `import-client` shows up on the Clients list *immediately* when the webhook fires — well before they've ever opened the app — since `listMembers()` has no gate beyond `role = 'member'`. This means a coach can fully set up someone's Flagship/SPC/Nutrition programs ahead of their first session, then walk them through the in-app Register flow in person. No email or SMS goes out automatically when the webhook fires (deliberate — the whole design point of phone-OTP was avoiding an automated message that might not land), so today that first-session hand-holding (or a separately-configured GHL automation) is the only thing that tells a client the app exists at all.

**New: a "Not registered yet" option on the web Clients list's Status filter** (`app/(coach)/clients/index.web.js`) — repurposed the existing Flags dropdown into a combined Status filter (All / Has flag / Not registered yet) rather than adding a fifth control, per direct ask to reuse either the Sort or Flags dropdown instead of growing the row. Backed by `core.get_login_activity` (migration 0022, same RPC the individual client detail page already used) called once for the whole roster, not per-row. Lets a coach pull up exactly who's been bulk-imported but hasn't gone through Register yet, to follow up in person — the actual reason this was asked for, ahead of migrating the existing ~140-200 clients over. Bundle-checked only, same standing login limitation as every other coach-side change in this file.

## Nutrition/mobile polish batch: milestone emojis, real bugs, layout asks (2026-08-05)

A batch of direct feedback from actually using the app — several real bugs, not just polish.

**Milestones can now carry a coach-picked emoji** (migration `0027_milestone_emoji.sql`, **run**). `MilestoneFormModal.js` gained a quick-pick row of common emoji plus a free-text field (typed/pasted, no picker library needed — RN's native emoji keyboard handles entry fine on both platforms). Shown wherever a completed milestone surfaces on the member side: a new "Completed milestones" slide on the Nutrition Today tab's `TodayCardSlider` (a row of tappable emoji chips, trophy icon fallback for milestones predating this feature) and a new entry type in My History's day timeline (`lib/history.js`'s `listDayTimeline`, own try/catch-isolated fetch so a milestones failure can't take down session/nutrition history). Tapping an emoji in either place opens new `components/nutrition/MilestoneDetailModal.js` — a generic reusable detail popup, distinct from `MilestoneCongratsModal.js` (a one-time "you just completed this" notification, not a reusable view).

**Real bug: the native progress-photo date picker had no scroll mechanism at all.** `components/nutrition/PhotoCompare.js`'s native `DatePicker` modal listed every date via a plain `.map()` inside a `maxHeight: "70%"` `Pressable` — fine for a client with a handful of photos, but a client with "a bunch" (found via a real client's photo page) just overflowed past the modal's bounds instead of scrolling. Fixed by wrapping the date list in a `ScrollView`.

**Weeks tab (shared by the member's Weekly tab and the coach's per-client Weeks tab) got two layout fixes**: the date/week label column was tightened (150px → 120px — the actual text never came close to filling 150px, leaving a dead gap before the Weight column), and — the bigger one — that label column is no longer inside the same horizontal `ScrollView` as the metric columns. `WeekList`/`WeekDayTable` now render a frozen (non-scrolling) label column alongside a separately-scrolling metrics table, built from one shared flattened `rows` array so the two sides can't desync on which week/day is expanded. Previously, scrolling right to see Steps/Sleep/Note meant the date column scrolled away too, losing track of which row you were looking at.

**Finalize Check-In's "this cycle has photos" indicator is now a camera icon**, not a person icon — same lightweight flag as before (`weekPhotos.length > 0`), just a more legible pairing with "photos."

**Native (mobile) coach Nutrition roster's status filter row now stacks 3-per-row** (`app/(coach)/nutrition/index.js`) instead of scrolling horizontally — a wrapping grid (`flex-wrap`, `width: "31%"` each) so every status is visible without sideways scrolling. Native only; the web roster's two-row `TileSection` layout is a different, already-non-scrolling design and wasn't touched.

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (`expo export -p web`, clean, zero errors). Worth a real click-through, especially the frozen-column Weeks tab (row-height parity between the frozen and scrolling sides is the easiest thing to get subtly wrong) and the milestone emoji flow end-to-end.

**New app icon applied across every platform, same session.** Terra dropped a new cream-background wordmark icon (`assets/kova-app-icon-source.png`, kept for future re-derivation) at 1024x1024 with real alpha transparency outside its rounded-square shape — not directly usable as-is for `icon.png` (iOS icons must be fully opaque). Derived every slot `app.json` references, matching existing dimensions/formats exactly: `icon.png` (flattened onto the source's own cream, RGB), `favicon.png` (48x48), and Android's adaptive icon layers — `android-icon-background.png` (solid cream fill) plus `android-icon-foreground.png`/`android-icon-monochrome.png` (the wordmark isolated from its cream background via color-distance thresholding, not a hard-edged cutout, then scaled/padded to Android's safe zone rather than reusing the source's own baked-in rounded-square framing, which would've double-framed against Android's own adaptive mask shape). **Worth knowing, not fixed since it's a pre-existing, unrelated config choice**: the `expo-notifications` plugin's Android notification-icon slot also points at plain `icon.png` — Android tints status-bar notification icons to a flat white silhouette regardless of the source image's color, so a full-color icon there likely renders as a white blob in the notification tray. Was already configured this way before today; flagging it since it'll look wrong the first time a real push notification's icon is actually seen on an Android device, not something this icon swap introduced.

## Coach can reopen a missed weekly check-in (2026-08-04)

Real ask from Terra: a client (Roxy) missed her weekly check-in filing window and wants to submit it late. There was no path for this at all — `submitCheckin` (`lib/nutrition/checkin.js`) always filed against the live `currentWeek`, computed fresh from today's date every time, never an arbitrary past week, so a missed week was permanently unrecoverable through the app once its own filing window (see `weekCycle.js`'s `computeWeekWindows` — a week stays "current" for filing purposes through the following week, then lapses) closed. Notably, this needed **no RLS or schema change to the shared `public.checkin_responses` table at all**: its insert policy only ever checked `client_id = auth.uid()`, with no `week_start` restriction, confirmed by reading the standalone Nutrition Tracker app's own migration directly — a member could already insert against any past week at the DB level. The only real gap was app-side: nothing ever offered the member a form for anything but the live current week, and nothing gated *which* past weeks a member should be allowed to resurrect (letting a client freely rewrite arbitrary history isn't the goal — only a coach-approved late window is).

**New `programming.nutrition_checkin_reopens`** (migration `0028_checkin_reopen.sql`, **run** — confirmed live via direct schema query 2026-08-07) — genuinely new state with no standalone-app equivalent, so it lives in Kova's own schema rather than touching `public.*`, same reasoning as `nutrition_milestones` (0023). One row per grant: `user_id`, `week_start` (which missed week), `opened_by`, `expires_at`. `expires_at` is computed once at reopen time as the Sunday that already closes the *current* filing cycle (`computeWeekWindows(today).currentWeek.end + 7`) — exactly the "reopens now, but recloses before the new one comes available" safeguard Terra asked for, and it needs no cron job or explicit close action: `lib/nutrition/checkin.js`'s new `getActiveCheckinReopen(userId, today)` just stops returning a row once `today` passes `expires_at` (or once the client actually submits — it also excludes any week that already has a `checkin_responses` row), so the next cycle proceeds normally on its own.

**Coach side**: `components/nutrition/CheckinWeekTimeline.js` (the "Check-in status" section of the Client Settings modal — `components/nutrition/ClientSettingsModal.js`) — a "Missed" row now gets a "Reopen" action (mirroring the existing "+ Require photos" action already on upcoming/current rows), and once reopened shows a new amber "Reopened" status with an "until {date}" line instead of the flat red "Missed". Threaded `reopens`/`coachId` props down from `app/(coach)/nutrition/clients/[userId].js` (`listCheckinReopensSince`, loaded in its own isolated try/catch like the milestones fetch, so an unmigrated 0028 can't break the rest of the page).

**Member side**: `app/(member)/nutrition/checkin.js` now independently loads `getActiveCheckinReopen` alongside the normal currentWeek load. If one's active, a distinct rust-bordered "Missed check-in reopened" card renders above the normal (unmodified) current-week check-in — its own Photo/Form popups and its own "Submit missed check-in" button, filing via `submitCheckin(userId, answers, { weekStart: reopen.week_start, ... })`. `submitCheckin` gained an optional `weekStart` override (defaults to the live currentWeek exactly as before) — the one sanctioned exception to "week_start is always server-computed, never client-supplied." The reopened week's own photo-requirement check uses that week's actual photos (`photo.date >= reopen.week_start`), not a recency-window-relative-to-today check the way the normal flow does, since a late submission is filed well after the missed week itself.

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (fresh `expo start --web` on a scratch port, 1619 modules, zero console/bundler errors). Worth a manual click-through once 0028 is run: reopen Roxy's missed week from Settings, confirm the card appears on her My Nutrition → Check-In tab, submit it, and confirm the card disappears / the week shows "Completed" on the coach's timeline.

## My Week / My Fitness weekly-cap fixes + finalized-state visibility + Group Programs DRAFT label (2026-08-05)

Three real bugs/gaps reported from actual use, no schema changes needed:

**Bug: a client on a reduced weekly frequency saw a confusing greyed-out bubble.** `app/(member)/index.js` was building My Week's session bubbles from the *program's* default `sessions_per_week` (3, for Flagship) instead of the per-client override on `client_program_assignments`. A 1x/week client still got 3 bubbles; the 2nd/3rd were just whatever the coach hadn't published yet for that slot (shared across every client on the program), reading as an unexplained grey tile. First fix attempt wrongly limited the *bubble count itself* to the client's target — corrected after direct feedback: a reduced-frequency client can still attend **any** of the week's sessions (whichever day fits), they just only need to complete as many as their target says. So all of a program's session slots still get their own bubble with their own real day-of-week caption (untouched, always shown) — what actually changes is a card-level "done" state: once a client's total completions this week (any of them, not a fixed first-N slice) meet their target, `ProgramCard` shows a **"✓ Training complete"** line above the bubble row (pushing it down slightly) and every bubble in that row greys out uniformly (`SessionBubble`'s new `weekDone` prop) — no more per-bubble distinction between attended/not once nothing more is required. An earlier version of this fix swapped individual bubbles' captions to "Not needed" instead — rejected per direct feedback for changing the always-real day-of-week text; the current version never touches captions.

**My Fitness gets the matching "done for the week" state for group programs** — SPC already had this ("✓ No remaining sessions this week"), group (Flagship/BWA) didn't, so a client who'd already hit their cap would still get prompted to log whatever session today's day-of-week mapping pointed to. `app/(member)/plan.js`'s group load now checks aggregate completions for the week against the per-client target *before* the day-of-week lookup — same "any completed session counts, not a fixed slice" logic as above, since (unlike SPC, which restricts a client to a fixed first-N subset of sessions by design) a group client can complete any day's session toward their cap. Once met, shows the same "done" card (with "View full block →" still linking through) instead of opening a new session to log.

**Finalized-state visibility, previously nonexistent on My Fitness.** `isCompleted` was already being passed into `SessionLogger` from both group and SPC call sites but the component never destructured it — a dead prop, so there was no visual difference between an unfinalized and already-finalized session anywhere on the page. Now: `SelectedSessionBanner` shows a small "Finalized" pill next to the session title (both group and SPC), and the Finalize button itself (footer-docked or inline) turns olive and reads "✓ Finalized — tap to update" once done — re-tapping still works since `finalizeGroupSession`/`finalizeSpcSession` are idempotent upserts. Deliberately kept the existing "just show today's lift" page model — no separate log-session screen, per explicit pushback on that idea.

**Coach-side counterpart of the same "couldn't tell it wasn't published" problem**: the Group Programs grid (`components/BlockGridCells.js`'s `SessionCell`) only distinguished published from draft via a subtle background-tint difference, easy to miss scanning a whole grid — exactly what led to the greyed-bubble confusion above going unnoticed by the coach. Added an explicit small amber "DRAFT" label, rendered in-flow above the "Wk N" line (not an absolute overlay — that was tried first and would've collided with the "Wk N" text sharing the same corner).

**Not yet verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (`expo export -p web`, clean, zero errors). Worth a manual click-through: a reduced-frequency client hitting their cap via a non-"first" session, the Training-complete/greyed-row treatment on My Week, the Finalized pill/button state on My Fitness, and the DRAFT label on the Group Programs grid.

## Two real "signed out too often" bugs found and fixed — no schema/deploy changes (2026-08-05)

Direct complaint from Terra: both the web app and the TestFlight app were kicking people back to a sign-in-adjacent screen far more often than actual session/token expiry could explain. Traced two separate, concrete mechanisms (not just theory — walked the actual `@supabase/auth-js` 2.110.7 source to confirm both failure paths end in exactly this symptom) and fixed both:

**Bug 1 (both platforms) — a network blip during profile refresh got treated as "you have no profile."** `lib/auth/AuthProvider.js`'s `loadProfile()` re-fetches the caller's `core.users` row on every `onAuthStateChange` event, including the routine background token refresh that fires roughly hourly on both web and native. The old code treated *any* fetch error (a dropped connection, a slow response, a transient 5xx) identically to "this account genuinely has no profile row" — `setProfile(null)`, no retry. `app/(member)/_layout.js` and `app/(coach)/_layout.js` both `Redirect` to `/pending-setup` whenever `!profile`, and that screen reads *"Your account is signed in, but a coach or admin still needs to finish setting up your profile"* with a prominent Sign Out button — which looks exactly like getting logged out, and actually does log you out if tapped. Fixed: `loadProfile()` now retries a failed fetch up to 3 times (500ms/1000ms backoff) before giving up, and never clears an already-loaded profile over a transient error after retries are exhausted — stale-but-correct profile data beats a false "signed out" bounce. Also added a `profileRequestId` ref so an older, slower-resolving call can't stomp a newer call's result if two land close together (e.g. the initial `getSession()` call and an `onAuthStateChange` `INITIAL_SESSION` event racing at boot).

**Bug 2 (native/TestFlight only) — a real storage race could silently corrupt the saved session.** `lib/supabase/largeSecureStore.js` (the `expo-secure-store` + `AsyncStorage` wrapper backing Supabase's native session persistence) used to generate a **new** random AES key on every `setItem` call, write it to SecureStore, *then* write the ciphertext to AsyncStorage as a second, separate write — no atomicity between the two. Since this runs on every background token refresh, and iOS can suspend/kill an app between two sequential awaited writes as a completely routine event (not an edge case), a suspend landing between those two writes left SecureStore holding the new key while AsyncStorage still held ciphertext encrypted under the old one. Confirmed via `@supabase/auth-js`'s own `getItemAsync` (`lib/helpers.js`) that a resulting JSON-parse failure is caught and silently treated as "no session" — no error, no `SIGNED_OUT` event, just a null session on next launch, i.e. indistinguishable from being signed out. Fixed by generating the AES key **once** (lazily, reused after that) instead of rotating it every write, so `setItem` is now a single atomic AsyncStorage write; a fresh random nonce is still prepended to the ciphertext on every write (not a reused counter) so reusing the same key across writes doesn't reintroduce an AES-CTR keystream-reuse weakness. `getItem` also now wraps decryption in a try/catch and treats any failure (e.g. a leftover value in the old pre-nonce-prefix format) as "no session" rather than throwing.

**One-time cost of the storage-format change**: an already-installed TestFlight build's existing stored session won't decrypt under the new nonce-prefixed format (old ciphertext has no nonce prefix) — every native user needs one fresh login after this ships, then sessions should stick. No migration, no Edge Function redeploy, no schema change — both fixes are pure client-side logic. Bundle-checked only (`expo export -p web`, clean); the actual sign-out-frequency improvement itself isn't independently verifiable from this environment (same standing login limitation as everywhere else in this file) — worth Terra keeping an eye on whether the "signed out" reports actually drop off.

## Nutrition onboarding: unreachable phase cards, a calendar date picker, per-client questionnaire editing, and a real "send to client" gate (2026-08-05)

Same day as the auth-fix session above, prompted by Terra hitting a real dead end trying to onboard a genuinely brand-new nutrition client (Cozeth Scott) — confirmed against the live database directly (queried via an authenticated Supabase CLI session, same "don't assume the sandboxed DB-access limitation always holds" exception noted elsewhere in this file) that her `public.clients` row was a fresh insert, `objective_tracking_approved_at` null, zero dates/response/photos — not a data bug.

**Real bug found: `components/nutrition/PhaseCard.js` only wrapped its content in a `Pressable` once a phase was already `done`** (`if (!done) return content;`) — but `onboarding/tracking.js` and `onboarding/questionnaire.js` are exactly where a coach takes the actions that make a phase done in the first place (assigning tracking dates, copying/editing questionnaire questions), and no other screen in the app links to either page. This made Objective Tracking permanently unreachable for **every** new nutrition client, not just Cozeth's — fixed by always wrapping in `Pressable`, dimmed-but-tappable when not done. Starting Photos was unaffected (a pure read-only viewer, nothing coach-actionable pre-completion).

**Calendar date picker — went through three real rounds of feedback the same day, final shape below supersedes the first two.** `onboarding/tracking.js`'s plain `YYYY-MM-DD` text field is replaced by new `components/nutrition/DateCalendarPicker.js`. Pure hand-rolled grid math throughout (`daysInMonth`/`buildMonthGrid`, no calendar library) built on `lib/boiseDate.js`'s existing `dayOfWeekInBoise` — matches this app's standing "never trust device-local Date parsing for date math" rule and its general preference for hand-rolled pickers over new dependencies (same reasoning as `PhotoCompare.js`'s `DatePicker`/announcements' `buildDateOptions`).

1. First version: a `Modal` bottom sheet, tap-to-multi-select, "Assign N dates" bulk-confirms via a sequential loop over the existing single-date `addTrackingDate`. Shipped with no `maxHeight` at all, unlike every other bottom sheet in this app (`WeightCalculator.js`'s `maxHeight: "85%"` precedent) — on a shorter phone viewport this let the sheet (and its 6-row grid) exceed the screen with no scroll fallback, cutting off the header and making the footer buttons unreachable. Fixed with `maxHeight: "85%"` + an inner `ScrollView`, footer pinned outside it.
2. Still wrong: the sheet was `width: "100%"` with day cells sized off that width via `aspectRatio: 1`. Fine on a phone, but this feature is coach-only and coaches mostly use the **web build on desktop** — on a wide browser window the sheet stretched full-window-wide and every cell inflated to 100px+, looking broken. Fixed with `maxWidth: 440` + `alignSelf: "center"`.
3. **Final, current shape — the Modal/confirm-button pattern itself was the wrong interaction**, per direct feedback ("I just want it small... think of a normal date picker"): dropped the `Modal` entirely. It's now a small fixed-280px-wide calendar embedded directly inline in the Tracking dates card — no popup, no select-then-confirm step. Tapping an unassigned date calls `addTrackingDate` immediately (circle fills in); tapping an already-assigned date calls `removeTrackingDate` immediately (circle clears) — `onAssign`/`onUnassign` props instead of the old `visible`/`onConfirm(dates[])`. The per-row ✕ remove control in the dates list below became redundant with tapping the date itself and was removed.

**Actually visually verified at every step, not just bundle-checked** — temporarily mounted on the unauthenticated `login.js` screen (same documented technique used in the 2026-08-04 native-photo-rendering investigation), screenshotted and click-tested on both mobile and real desktop-width (1440px) viewports, reverting the test harness each time before committing. Worth remembering for future verification: the `computer` tool's screenshot-pixel coordinate space did not match naive visual estimation from the rendered image at a couple of points this session (once needing `read_page` element `ref`s instead of guessed coordinates, once needing the tool's own reported "Screenshot size" taken at face value instead of assuming a 2x scale) — when clicks don't land where expected, re-derive the coordinate space from a known reference point rather than assuming a fixed scale factor.

**Per-client editable questionnaire questions** — reopens a deliberate decision from the 2026-08-02 "coach-tools follow-up pass" ("questionnaire stays copy-from-template-only... confirmed directly with Terra") per this session's explicit new ask. New `addQuestionnaireQuestion`/`updateQuestionnaireQuestion`/`deleteQuestionnaireQuestion` in `lib/nutrition/onboarding.js`, same shape as `checkin.js`'s existing per-client `client_checkin_questions` CRUD. `onboarding/questionnaire.js` now renders the existing shared `QuestionListEditor` (add/rename/reorder/delete) whenever the client hasn't submitted yet — editing stops being offered once real answers exist, since editing questions underneath an already-submitted response doesn't make sense.

**Real "send to client" gate — genuinely new state, not just a UI toggle.** Before this, a brand-new-to-nutrition client's `public.clients` row being created was itself the only gate — whatever the coach had or hadn't finished setting up (questionnaire questions, tracking dates) was immediately live the moment nutrition was turned on, with no way to prep things first. Migration `0031_nutrition_onboarding_send.sql` (**not yet run**) adds `public.clients.onboarding_sent_at timestamptz default now()` — the `default now()` is deliberate: every pre-existing row (and any insert that doesn't know about this concept at all, including the standalone Nutrition Tracker app's own client-creation path, since this is a shared `public.*` table) reads as "already sent," so nothing about the standalone app's behavior changes. Only Kova's own brand-new-to-nutrition insert path (`lib/nutrition/clients.js`'s `createOrReactivateClient`) explicitly passes `null` to opt into the held-back state; the reactivate-existing-row path is untouched. New `sendOnboardingToClient(userId)` sets it to `now()`.

- **Coach side**: `app/(coach)/nutrition/clients/[userId].js`'s onboarding-hub branch gained a status banner — a rust "Not sent yet" bar with a "Send to client" button (new `confirmSendToClient()` in `lib/confirmDialog.js`, same web/native branch as every other confirm dialog in that file) when unsent, or a quiet "Sent to client {date}" line once sent.
- **Member side (real gate, not just cosmetic)**: `lib/nutrition/useNutritionAccess.js`'s existing "onboarding" status split into `"pending"` (not yet sent — same not-approved condition, but `!client.onboarding_sent_at`) vs `"onboarding"` (sent). `components/nutrition/NutritionAccessMessage.js` (already shared by all 4 member nutrition screens) gained a `"pending"` branch: a plain "Your coach is getting your nutrition program ready" message, no button, no task list. `app/(member)/nutrition/onboarding.js` — normally only reachable via that message's "Continue onboarding" button, which itself only appears once sent — got its own independent `useNutritionAccess` check too, belt-and-suspenders against a stale bookmark/deep link landing a "pending" client directly on the real task list. **Worth knowing**: this is an app-level gate only, not an RLS one — deliberately, since adding a real RLS restriction on `objective_tracking_dates`/`client_questionnaire_questions` risked affecting the standalone app's own (shared-table) RLS assumptions in ways not worth the risk for this session's scope. A client bypassing the app UI entirely (e.g. hand-crafted API calls) could theoretically still read the data — not a concern raised or asked about this session, just worth remembering if it ever is.
- **Roster status fix, found live mid-session**: Terra assigned Cozeth a tracking date via the new calendar picker and watched her roster tile immediately jump from "Objective tracking set up" to "Objective tracking" — before ever clicking Send. `lib/nutrition/dashboard.js`'s `deriveOnboardingBucket` used to key that transition purely on `trackingDatesCount === 0`, with no awareness of the new sent gate at all. Now takes a third `sent` parameter and stays in `"otSetup"` until `onboarding_sent_at` is set, regardless of how much prep work the coach has done behind the scenes — matches the whole point of the gate (nothing looks "in progress" from the roster's view until the client can actually see it).

**Migration `0031` has been run** (Terra ran it directly) — confirmed live via a direct schema query (`onboarding_sent_at` exists, `default now()`). One real consequence worth knowing: running an `ALTER TABLE ... ADD COLUMN ... DEFAULT now()` retroactively stamps that default onto every *existing* row at the moment the migration runs, not just future inserts — so Cozeth's own row (created earlier the same session, before this migration existed) got backfilled to "already sent" even though nobody had clicked the button for her specifically. Correct/intended per the column's own design (a pre-existing row had already been fully visible to the client the whole time, so grandfathering it in as "sent" matches reality) — but it meant Cozeth's page no longer showed the real "not sent yet" state to test against. Terra deleted her `public.clients` row directly (`delete from public.clients where id = ...` — every FK from that table is `on delete cascade`, confirmed by querying `information_schema` first, so this cleanly removes all her nutrition data with no orphans, and her `core.users`/`auth.users` login is untouched) and re-added her via the Nutrition toggle, which correctly re-triggers the fresh-insert path with `onboarding_sent_at: null`. **I declined to run that delete myself** despite having live query access this session — a permanent `DELETE` against production data is exactly the kind of irreversible action to hand the user precise instructions for rather than execute directly, even on explicit request.

**End-to-end confirmed working by Terra directly**, not just bundle-checked: the phase-card fix, the redesigned inline calendar (assign/unassign by tapping), and the send-to-client gate were all clicked through live. The alphabetical-sort ask below and the calendar's sizing fixes came out of that same real testing pass.

**Nutrition roster sort** — the web roster already defaulted to alphabetical (`useState("name")` in `index.web.js`, from an earlier session). Native (`index.js`) and the Archived list rendered clients in raw query order with no sort at all — both now sort by `name.localeCompare` to match.

## Real bug: announcement pushes silently excluded coach/admin accounts (2026-08-05)

Direct report from Terra: coaches never receive announcement push notifications, even though switching into their "My Training" tab (dual-login's member view) *does* show the in-app announcement popup — a real discrepancy between the two code paths, not "push just isn't working at all."

**Root cause, isolated to one line**: `supabase/functions/_shared/announcementAudience.ts`'s `resolveAudienceUserIds()` — the server-side function both `send-announcement` (send-now) and `scan-announcements` (scheduled/cron) call to figure out who to push — had its `target_type: "all"` fallback branch hardcoded to `.eq("role", "member")` when querying `core.users`, explicitly excluding every coach/admin account from the push audience. The **client-side** equivalent, `lib/programming/announcements.js`'s `matchesAudience()`, has no such restriction — its `default` case (i.e. `"all"`) just `return true` for anyone, member or staff, which is why the in-app popup (`AnnouncementModal` via `AnnouncementChecker`, mounted in `(member)/_layout.js`, reached by staff through My Training) always showed correctly while the real OS push never fired for them. Push-token registration (`PushRegistrar` in the root `app/_layout.js`) and the actual send path (`sendPush.js`/`expoPush.ts`) were both already role-agnostic — confirmed by reading them — so this wasn't a token or delivery problem, just audience resolution silently dropping staff before `sendPushToUser` was ever called for them.

**Fix**: dropped the `.eq("role", "member")` filter — `"all"` now resolves to every `core.users` row regardless of role, matching the client-side behavior and Terra's explicit ask ("I want them to go to everyone"). `group_program`/`spc`/`nutrition`-targeted announcements were already fine as-is (they query the underlying assignment/client tables directly, no role filter to begin with) — a coach/admin enrolled in one of those via their own dual-login training setup was already correctly included.

**Deployed live this session** — this session's Supabase CLI was authenticated (same "don't assume the sandboxed limitation always holds" exception noted elsewhere in this file): `supabase functions deploy send-announcement` and `supabase functions deploy scan-announcements --no-verify-jwt` both succeeded directly against the live project, no manual redeploy step left for Terra. No migration, no schema change — this was a pure server-side logic fix in a shared function file.

**Not independently verified beyond the deploy succeeding** — same standing login limitation as everywhere else in this file (no password entry in this environment) means the actual "does a coach's phone now receive the push" outcome needs Terra to confirm on a real device by sending a real "all"-targeted announcement.

## Numeric keyboard Done bar (2026-08-05)

Direct report: the keyboard felt "too persistent" on mobile, hard to dismiss. Root cause: iOS's `numeric`/`number-pad` keypads render with no Return/Done key at all, and nothing in the app provided an alternative — so the only way to close one was tapping blank space, easy to miss in a dense form like `SessionLogger`'s per-set reps/weight grid (tapping the wrong thing just moves focus to another field instead of dismissing).

New `components/NumericInputAccessory.js` — a shared "Done" bar (`InputAccessoryView`, iOS-only, no-ops on other platforms) mounted once at the app root (`app/_layout.js`, sibling of `<Slot />`, not nested in any `Modal` — required for `InputAccessoryView` to work correctly with a `Modal`'d TextInput per RN's own docs). Every numeric `TextInput` across the app opts in via `inputAccessoryViewID={NUMERIC_DONE_ID}` — 13 inputs across 11 files: `SessionLogger.js` (the main reps/weight grid), `WeightCalculator.js`, `ExerciseFormModal.js`, `NewGroupProgramModal.js`, `register.js`'s OTP code field, `(coach)/settings.js`'s numeric config fields, and the nutrition macro/target fields (`TargetField.js`, `ApproveTargetsForm.js`, `PhotoSubmissionsEditor.js`, nutrition `index.js`/`onboarding.js`).

**Verification was attempted but inconclusive, not skipped.** This session had real simulator access (booted iPhone 17 Pro) and a real installed dev-client build of the app — started a dedicated native Metro instance, confirmed the dev client connected and Fast Refresh picked up the change live with no crash (rules out a wiring/import bug). But interactive tap verification stalled: a stuck system "Allow widgets from Maps" dialog silently ate every tap for a while (invisible in some screenshots, confirmed once a Home-button press revealed it); after rebooting the simulator to clear it, taps stopped registering entirely, even on a plain navigation link — a tooling/input-injection problem, not something about this code specifically. Didn't chase it further since it was clearly unrelated to the original bug. **Worth a real click-through next time the app's in hand** — expand a set row on My Fitness, tap the reps/weight field, confirm a "Done" bar appears above the keyboard and dismisses it.

## Add Coach dialog: existing-client search + a real `import-client`/`invite-staff` bug found migrating the first 12 nutrition clients (2026-08-06)

**Add Coach/Admin dialog gained an existing-client picker.** Prompted by a design question, not a bug: coaches are added one at a time by an admin, and some are already Kova clients (or already have an account from the shared-auth standalone Nutrition Tracker app). `invite-staff` already handled this correctly — `inviteUserByEmail` fails as already-registered, falls back to finding the existing `auth.users` row by email, and upserts `core.users` onto that same id rather than duplicating — but the admin had to type the person's exact existing email by hand for that fallback to find the right account, with a mistyped email silently creating a second orphaned account instead. `components/AddStaffModal.js` now has an "Existing client (optional)" search box (name-only match, not email — an admin is far more likely to recognize a name) backed by `listMembers()`; picking a result locks the Name/Email fields and shows a "Promoting existing client X — same login, no new account" banner, with a "Change" link back to manual entry. Purely a fill-the-form safety net — `invite-staff` itself is still what does the actual matching and promoting.

**Real bug found and fixed migrating Terra's first 12 existing nutrition clients into Kova via the GHL "won" webhook.** The plan (confirmed correct, see the "iOS push confirmed live, Universal Links, GHL import groundwork" section) was: fire the GHL trigger on each existing client → `import-client` finds their existing `auth.users` account by email and creates a `core.users` row on it → coach flips their Nutrition switch on, which reactivates their existing `public.clients` row in place, no data migration needed since Kova reads the same live table. The first attempt (bulk GHL action, then a per-contact tag trigger) produced zero new rows and no visible error in GHL's own logs. Diagnosed live, with this session's authenticated Supabase CLI (`supabase db query --linked` reads/writes the real project directly) and direct `curl` calls against the deployed function — same "curl the API directly to get the real error text" technique used for the original GHL scope issue:

- Ruled out the shared secret and endpoint URL first (a direct curl with Terra's actual configured header value returned a clean `200` and created a real row).
- Ruled out "all 12 firing at once" as a cause — fired 12 genuinely concurrent requests at the live function myself; all 12 returned `200` with no throttling or race condition.
- The real cause only showed up testing against an email that **already had an existing `auth.users` account** (every one of the 12 real clients, unlike the throwaway test emails above, and unlike Cozeth — who worked on the first try specifically because she had no prior account at all, so never hit this code path): `auth.admin.createUser`'s real duplicate-email error text is *"A user with this email address has already been registered"* — note "already **been** registered." Both `import-client` and `invite-staff` had a regex (`/already registered|already exists|email_exists/i`) written against the wrong exact phrasing, missing the word "been," so the intended existing-user fallback never triggered — every real (non-first-time) import 500'd instead of finding and promoting the existing account. Fixed to `/already.*registered|already exists|email_exists/i` in both files (found and fixed in `import-client` first, then defensively applied the same fix to `invite-staff` — same underlying Auth API, same error text, same bug shape, not independently confirmed broken but not worth leaving as a landmine).
- Redeployed both functions live this session (`supabase functions deploy import-client --no-verify-jwt` / `invite-staff`), re-tested against a real affected client (Abbi Stauffer) to confirm the fix, then Terra re-ran the real trigger on all 12 — confirmed via direct DB query that all 12 landed with real `ghl_contact_id`s and (for the 11 who already had nutrition data) `status: active` reactivated in place. One of the 12 (Dustin Smout) turned out to have no prior `public.clients` row at all — a genuinely new nutrition client, not a migration — so he still needs the normal "Send to client" onboarding gate, unlike the other 11 whose full history was already sitting there waiting.

**Worth remembering for any future "already registered" duplicate-account handling in this codebase**: match on `/already.*registered/`, not `/already registered/` — confirmed against Supabase's real Auth Admin API error text this session, not assumed.

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

## Quality audit & fix pass — all 4 rounds done (2026-08-07)

Terra's ask: stop the "little things keep getting missed" pattern — prompted by a web-vs-app auth bug, the Exercise Library scroll bug surviving two prior fix attempts, and three fresh member-logging bug reports. Full audit of the member flow, coach flow, auth layer, and navigation graph turned up ~60 distinct issues, split into 4 rounds. **Full plan with every finding's file:line detail lives at `/Users/Dustin/.claude/plans/when-my-credits-reset-swift-horizon.md`** — read that before starting Round 3, it has everything this summary compresses.

**Round 1 — the 4 reported bugs, all fixed and confirmed working:**
- Exercise Library (and `clients/index.web.js`) now scroll — both were a plain `View`+`FlatList` inside `CoachShell` instead of a real `ScrollView`; `app/+html.js`'s `body{overflow:hidden}` means every screen must supply its own scroll container, and neither did.
- PWA decimal keyboard — `keyboardType="numeric"` maps to an RNW `inputMode` with no decimal key; switched every real decimal field (weight, sleep, targets, photo weight) to `decimal-pad`.
- Keyboard covering My Fitness's logging cards — added `KeyboardAvoidingView` to the three logging bottom-sheets. Confirmed working by Terra.
- Finalize button now renders on the last focus card and closes back to the overview on success — confirmed end-to-end via a live DB query (`session_completions.completed_at` update), not just a screenshot, after the pixel-hunting in the Simulator became too slow (see `[[feedback_dont_hunt_simulator_taps]]` memory).
- Bonus, same session: the web PWA viewport staying zoomed in after the keyboard closes (Safari's own bug) — `components/ViewportZoomReset.js`, mounted at the app root, forces a viewport-meta reset on every input blur.

**Round 2 — silent failures & auth, DONE, bundle-verified after every commit, NOT yet visually verified (standing login limitation):**
- New `lib/toast.js` + `components/ToastHost.js` — a real cross-platform toast (rendered through an RN `<Modal>` so it stacks above an already-open create/edit modal), replacing **all ~78 `Alert.alert` call sites** across `app/(coach)/**`, `components/nutrition/**`, and the member web-reachable screens with the same gap. `Alert.alert` is `static alert() {}` on react-native-web — every one of those was silently going nowhere on the platform where Terra does most of her work.
- Fixed handlers with no error handling at all: My Fitness's finalize, both web workout builders (had zero error surface — no `Alert` import, no `loadError`, `handleTogglePublish` had no catch so a failed publish looked identical to a successful one, 6 fire-and-forget writes per file), Settings bricking its entire page on one failed fetch, and a drag-to-reassign bug on the SPC dashboard that replaced the whole roster with a red sentence.
- Added Retry to every one of those error screens (~25 files) instead of a dead end, and fixed the 4 member nutrition sub-tabs (Today/Weekly/Check-In/Photos) hiding their own `SegmentedControl` on error — one blip used to trap the member on whichever sub-tab broke with no way to switch tabs.
- 4 auth bugs, all "looks like being signed out but isn't": `AuthProvider`'s `ready` collapsing on every token refresh (roughly hourly, and on native also on every foreground) and unmounting the whole nav tree mid-session — this was the actual bug behind Terra's original web-vs-app auth report; a cold-start network blip still routing to `/pending-setup` with only Sign Out as an exit (now distinguishes "fetch failed" from "no profile row," offers Retry); `(auth)/_layout.js` redirecting away from `/set-password` the instant `detectSessionInUrl` mints a session on web, before the user ever saw the password field; `register.js` reading only `error.message` on a failed Edge Function call instead of the real body (`FunctionsHttpError.context`), so every registration failure showed the same generic message regardless of cause.
- 9 member data-correctness bugs found while touching this code: dead "Extras" one-off bubbles (missing a `published` key), coach's per-exercise notes silently dropped/overwritten on both group and SPC programs, `useNutritionAccess` mount-only-ness making the whole Nutrition tab vanish on a transient error, a trapped `history/[exerciseId]` screen with no back link reachable on failure, `plan-block.js` showing the wrong program's block due to a missing effect dependency, `plan.js` silently reverting a manually-picked program tab back to the original deep-link param on every focus, SPC fetch errors being shown as "not assigned to a program," and a missing `isSpcActive()` check letting a paused SPC client still see their old content.
- Commits: `b5ab052` (Round 1), `38d1b02` (viewport zoom), `a10b629` (toast sweep), `29e0f03` (uncaught handlers), `225a78d` (retry buttons), `a68ef7c` (auth), `d2b45a6` (member data-correctness). All pushed.

**Round 3 — navigation correctness — DONE.** Full detail in the plan file's "Batch 3" section, commit `a11305a`. Added missing back buttons on `exercises/index.js`/`announcements/index.js`/`settings.js`/the nutrition onboarding hub (native has no back at all without one, `headerShown:false`) — all native-only, since web already has the `CoachShell` sidebar. Wrong-destination back links on multi-entry screens (`blocks/[blockId].js`, `clients/[userId].js`, `spc/[userId].js`, `nutrition/clients/[userId].js` ×2, `spc/blocks/[blockId].js`) now use a `router.canGoBack() ? router.back() : router.push(fallback)` guard instead of a hardcoded `Link`, same fix applied to the 4 previously-unguarded `router.back()` calls. Native was losing the `?program=` filter entirely on the Clients list (nothing there ever called `useLocalSearchParams`) — new `lib/programming/clientsRoster.js` extracts the roster-aggregation query so native and web share one implementation instead of diverging again; a `?program=null` race in `blocks/index.js`'s History button is now guarded too. SPC Templates were gated web-only despite a complete native builder already existing (`spc/templates/[templateId].js`) — gate removed. `more.js`/`programs.js` now wrap in `CoachShell` so a direct web visit doesn't strand a coach with no sidebar. Coach screens that are `Tabs` navigator roots (dashboard, clients, nutrition, blocks, spc, exercises, settings, announcements) switched from mount-only `useEffect` to `useFocusEffect`, since native keeps them mounted across tab switches and stats/rosters were going stale for a whole session. 5 destructive actions (delete SPC template, archive exercise, remove one-off, Nutrition switch-to-archived, delete a template/per-client question) now confirm via `lib/confirmDialog.js` instead of firing instantly.

**Round 4 — the 3 features Terra explicitly asked for — DONE.** Full detail in the plan file's "Batch 4" section, commits `7ca52f2`/`9592eb2`/(messaging, below).
1. **Coach sees a member's actual logged reps/weight** — no migration needed, `staff manage logs`/`staff can read session completions` RLS already existed. New `lib/programming/coachLogs.js`'s `listRecentSessionsForUser()` mirrors My History's day-timeline query scoped to an arbitrary `userId`; per-session expansion reuses `memberPlan.js`'s `listLogsForDate` as-is (same precedent as `getCurrentBlock` being reused for the coach side elsewhere in this file). New `components/RecentSessionsCard.js` — a per-client accordion — is wired into `clients/[userId].js` as a "Recent sessions" card.
2. **Exercise library where-used + safe archive.** Archiving flips `is_active`, and every member-facing embed of `programming.exercises` is RLS'd on `is_active` — an in-use exercise going inactive silently blanks its name out of a live session. New `getExerciseUsageCount()` (`lib/programming/exercises.js`) runs 8 cheap head-only counts across group/SPC/template/one-off exercise+warmup tables and feeds the result into `confirmArchiveExercise()`'s message. `listExercises({includeArchived})`/`setExerciseActive(id, true)` already existed but were never called that way — Exercise Library gained a "Show archived" toggle and an Un-archive action. Also renders `exercises.cues` (write-only until now — typed into the form, never shown anywhere) on each Exercise Library row, and warm-up `notes` on the member's My Fitness `WarmupCard` (the actual session-logging screen — `SessionPreviewModal`/`SessionDetailModal`'s plain warmup-name lists elsewhere were deliberately left alone, would need reshaping 4 separate member screens' warmup arrays for a lower-traffic preview-only surface).
3. **Coach↔member messaging.** The only genuinely new schema in this pass — `CommentThread` was coach-to-coach only by design (RLS, copy, API shape all assumed that), and there was no member→coach channel anywhere despite `(member)/settings.js` already shipping a `notify_coach_messages` toggle with nothing behind it. New migration `0032_client_messages.sql` (**run** — confirmed live via direct schema query 2026-08-07) adds `programming.client_messages` — one flat thread per client (`user_id`), not per-coach, matching this app's "all coaches see all clients" design (`core.is_staff()`); `sender_role` (`'member'`/`'staff'`) is stamped app-side rather than inferred from `sender_id`'s own role, since a coach/admin's dual-login "My Training" identity would otherwise misclassify their own messages. Insert-only RLS (no update/delete anywhere — messages are an immutable log, same shape as `program_comments`). New `lib/programming/messages.js` (`listMessages`/`sendMemberMessage`/`sendStaffMessage`) and shared `components/MessageThread.js` (scrollable sender-labeled list + send box, not a chat-bubble UI — this app has no existing chat-bubble pattern to match). Coach surface: a new "Messages" card on `clients/[userId].js`, coach names resolved via `listCoaches()` for staff-authored rows. Member surface: new hidden route `app/(member)/messages.js`, reached via a chat-bubble icon next to the gear icon on My Week's header (not a 6th tab, same `href: null` pattern as Settings). Push fires one-directional — staff→member only, gated on the target member's own `notify_coach_messages` flag (read off `member.notify_coach_messages`, already loaded via `getUser`) — via the existing `sendPush()`/`send-push` Edge Function, fire-and-report so a push failure doesn't look like the message itself failed to send. No coach-side push (member→staff) since there's no per-coach notification preference to gate it on, and the ask only named the one toggle. **Deliberately no unread-message indicator** — a real gap for a coach managing 150+ clients, but out of scope for this pass; worth a follow-up (`programming` schema would need a small `last_read_at`-per-party table, not just a column on an existing row) if Terra asks.

**Also found, deliberately not scheduled** (flagged in the plan file, not forgotten — several since resolved: SPC missed-session flags and the `deletePhoto` wiring were built in the follow-ups section below, and the dead exports (`getNextIncompleteSpcWorkout`, `setPhotoFrequency`/`clearPhotoFrequency`, etc.) were deleted in the 2026-08-09 ship-readiness audit): `dashboard_dismissals` is keyed globally, not per-coach; `getNutritionRoster`/`getSpcRoster`/`listMembers` are unscoped by coach (every coach sees every coach's clients — possibly fine for a one-gym product, worth confirming with Terra before treating as a bug).

**Standing verification gap**: everything in Rounds 1-2 is bundle-checked (`npx expo export -p web`, clean after every commit) but not click-through-verified except the 4 things Terra tested live in Round 1 (keyboard fix, finalize button, and the two she'll check on the PWA herself). Same login limitation as everywhere else in this file. Worth a real pass once Round 3/4 land too, before calling this done.

## Quality-audit follow-ups: SPC missed-session flags, photo staging/delete, nutrition coach assignment, Messages inbox (2026-08-07)

Terra picked four items off the "found, deliberately not scheduled" list above and asked for them built. Full plan at `/Users/Dustin/.claude/plans/its-pushed-ok-we-binary-duckling.md`.

1. **SPC missed-session flags** — `getMissedSessionFlagsByUser()` (`lib/programming/flags.js`) now covers SPC too, not just group. SPC has no day-of-week routing, so this is deliberately **retrospective**: it checks the most recently *completed* week (`currentWeekNumber - 1`), only once a client is at least in week 2 of their block — a session flags as missed only after its whole week has fully passed, never mid-week. New `addSpcFlags()` batch-fetches active `spc_clients` → each one's block covering today → that block's published workouts in the check-week → completions, and merges into the same `flagsByUser` map the group scan already builds (one-offs are structurally excluded — no `week_number`/`spc_block_id` at all, so they're never part of the query). Every flag object now carries a `period` field (`"this week"` for group, `"last week"` for SPC) — `SnapshotPanel` in `clients/[userId].js` interpolates it instead of a hardcoded "this week" string, which used to read wrong for a retrospective SPC flag. No migration — pure query logic against existing tables.
2. **Progress-photo staging "×" + coach-only delete.** `components/nutrition/PhotoUpload.js`'s `AngleBox` gained a small circular "×" on a populated thumbnail (member-facing, and the coach's `allowDatePick` backfill mode which shares the component) — clears the locally-staged pick back to empty before the separate "Upload" tap commits it to Storage; pure local state, no `photos.js`/DB change. Separately, the already-existing-but-uncalled `deletePhoto()` (`lib/nutrition/photos.js`) is now wired into `components/nutrition/PhotoSubmissionsEditor.js`'s `DayEditor` (the coach-only "Fix a day's photos" tool) — a small trash icon per photo thumbnail, confirmed via new `confirmDeletePhoto()` (`lib/confirmDialog.js`), then a real delete (Storage + DB row) with the local `rows` state updated and `isValidSet` re-run. Per Terra's answer: members can clear a staged (not-yet-uploaded) pick themselves, but deleting an already-submitted photo is coach-only — `PhotoCompare.js` (shared by the member's own Photos tab) deliberately got no delete affordance.
3. **Nutrition coach assignment starts unassigned.** `public.clients.coach_id` was `not null` and `createOrReactivateClient()` used to default it to whichever coach flipped the Nutrition switch on — migration `0033_nutrition_coach_optional.sql` (**run** — touches the shared `public.*` schema, not `programming`/`core` — drops the not-null constraint; backward-compatible, the standalone Nutrition Tracker app is unaffected since it keeps setting a real `coach_id` on its own inserts) plus a code change so a fresh insert now passes `coach_id: null` and the function's `coachId` param is dropped entirely (the one call site, `handleNutritionToggle` in `clients/[userId].js`, stopped passing it). New shared `components/nutrition/CoachAssignmentField.js` (same web-`<select>`/native-pill-row split as SPC's own `CoachDropdown`) is wired into two places: the Objective Tracking onboarding step (`onboarding/tracking.js` — also fixed a real pre-existing bug there, a missing `Pressable` import that crashed the `loadError` Retry button), and `ClientSettingsModal.js` (below Status, included in the existing `handleSave`'s `updateClient` payload) so assignment stays editable any time after onboarding too. `getNutritionRoster()`'s coach-name fallback changed from `"—"` to `"Unassigned"` (matching SPC's own wording) now that it's a common real state, not just a display polish for an edge case.
4. **Coach Messages inbox** (`app/(coach)/messages/index.js`, new) — the messaging feature that shipped as a buried per-client card on `clients/[userId].js` (see the Round 4 note above) now also gets a real inbox: `listThreadSummaries()` (`lib/programming/messages.js`) groups `client_messages` by client (client-side reduction over the full message set — same "fetch everything, group in JS" pattern as `listDayTimeline` elsewhere, since supabase-js has no DISTINCT ON), sorted by most recent activity. One universal file (`Platform.OS` branch for layout, not a `.web.js` sibling — no drag-and-drop or platform-specific library involved) renders a two-pane list+thread on web and a list-then-drill-down-with-back on native, reusing `MessageThread` unmodified for the thread pane. Nav: `CoachShell.js`'s sidebar gained a plain "Messages" item (no `permission` gate — this isn't behind any `can_view_*` toggle), native reaches it via `More`, `_layout.js` registers the route as `href: null` same as `blocks`/`spc`/`settings`.
   - **Real unread tracking**, not just a list — migration `0034_client_message_reads.sql` (**run**) adds `programming.client_message_reads` (`user_id` PK, `last_read_by_member_at`/`last_read_by_staff_at`) — two timestamps because the thread itself is shared (any staff can post, and "read" from the staff side is one shared state across all coaches, not per-coach, matching this app's "all coaches see all clients" design), not a per-message flag. Staff side is a plain `for all using (core.is_staff())` policy (any coach can mark any thread read/unread — new `markThreadReadByStaff`/`markThreadUnreadByStaff`, upserting `last_read_by_staff_at`). Member side needs a narrow security-definer RPC (`programming.mark_own_thread_read()`, same pattern as `core.update_own_notification_prefs`/`acknowledge_nutrition_milestone`) since RLS can't restrict *which column* a plain update touches, and a member must never be able to write `last_read_by_staff_at`.
   - **Coach-side**: each inbox row shows a red dot + bold name when `unread` (latest message is member-authored and newer than `last_read_by_staff_at`), plus an explicit "Mark as read"/"Mark as unread" Pressable per row (no need to open the thread first, per direct ask) — `handleToggleRead` doesn't stop the row's own `onPress` from also opening the thread; the row's own `onPress` and the mark-read button's `onPress` are separate elements so they don't collide. Opening a thread also auto-marks it read via the same `markThreadReadByStaff` call.
   - **Member-side**: `app/(member)/messages.js` calls `markThreadReadByMember()` in its existing `useFocusEffect` (fire-and-forget, doesn't block the thread load) — opening the screen is what clears the flag, no explicit button, matching Terra's ask that the explicit mark-read/unread control is coach-inbox-only. `app/(member)/index.js` (My Week) gained one more isolated `hasUnreadMessages` fetch (own try/catch, same "one domain's failure shouldn't hide another" pattern as groups/spc/nutrition/one-offs on that screen) and renders a small red dot on the header's chat-bubble icon when true.

**Migrations for this session**: `0033_nutrition_coach_optional.sql` and `0034_client_message_reads.sql` are both **run and confirmed live** (schema queries: `public.clients.coach_id` is nullable, `programming.client_message_reads` and `mark_own_thread_read()` both exist), `NOTIFY pgrst, 'reload schema'` sent after. This session had live read *and* write access via an authenticated Supabase CLI — the harness's auto-mode classifier initially blocked the mutating `db query -f` call as too high-risk to run unattended (used to confirm real schema state throughout in the meantime — e.g. `public.clients.coach_id` really was `not null`, `programming.client_messages` and `0028`'s `nutrition_checkin_reopens` were already live despite this file previously saying "not yet run" for both, now corrected above and below), then allowed it once Terra explicitly confirmed in chat.

**Not visually verified** — same standing login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (`npx expo export -p web` after each logical batch, clean, zero errors). Both migrations are run, so all four features are live end-to-end, not just code-complete — worth a manual click-through: an SPC client with a genuinely missed week showing the "· last week" flag, clearing a staged photo before upload, a coach deleting a duplicate submitted photo, assigning/reassigning a nutrition coach from both the onboarding step and Client Settings, and the Messages inbox's unread dot/mark-read-unread/two-pane behavior on web plus the drill-down on native.

## Coach web sidebar gets a real mobile nav (2026-08-07, same day)

Real report from Terra after pushing the session above: signing into a coach profile on the installed home-screen PWA still opened in standalone mode (no Safari address bar came back — that part was never broken), but showed the desktop coach sidebar squished onto a phone-width screen. Investigated first, since nothing in the pushed diff touched the PWA manifest, Universal Links config, or any routing/redirect logic — confirmed via `git diff --stat` against the previous deployed commit. Root cause: `CoachShell.js` (wraps every coach web screen) has never had any responsive/width logic at all, going back to the original "Coach web v1 design pass" — it's rendered a fixed 232px sidebar unconditionally on *any* web viewport, phone or desktop, since it was built. Not a regression from the session above; just newly noticed, and worth building for real since the PWA is genuinely useful during testing (instant deploy via `git push`, no App Store review) even though the long-term plan is the native app for on-the-go coach use.

**Fix, not a workaround**: `CoachShell.js` now branches on `useWindowDimensions()` against a new `MOBILE_BREAKPOINT = 768` (matching this project's own preview-tooling mobile/tablet/desktop convention). At or above it: the original persistent sidebar, byte-identical to before. Below it: a compact header (hamburger + logo, safe-area-aware via `insets.top`) with a slide-in drawer (`Modal`, tap-scrim-to-close) showing the exact same nav content. The choice is by viewport width, not by trying to detect "is this the PWA" — there's no reliable way to detect that distinction from JS, and it wouldn't be the right signal anyway (a desktop browser resized narrow should get the compact nav too, a phone in landscape-tablet-width shouldn't be forced into a cramped drawer). Full-bleed screens that already skip `CoachShell` (the workout builders) are unaffected either way.

**Real layout bug caught and fixed during the same pass**: the first refactor (extracting the nav-item list into a shared `NavList` component so the sidebar and the new drawer render identical content instead of duplicating ~50 lines twice) accidentally dropped the flex-spacer that pins "Sign out" + the profile name to the bottom of the sidebar — wrapping `NavList`'s output in an extra `<View style={{flex:1}}>` at the call site made the *whole block* fill remaining height without redistributing space *within* it, so the footer would have floated up directly under the nav items instead of sitting at the bottom. Fixed by moving the flex-spacer *inside* `NavList` itself, between the items block and the footer block, as one of three direct children of a Fragment — since a Fragment doesn't introduce a layout boundary, those three children become direct flex items of whichever real container renders `<NavList/>` (the 232px sidebar `View` or the drawer's `Pressable`), so the footer pins to the bottom of either one the same way the original single-file sidebar did.

**Actually visually verified, not just bundle-checked** — this session had no other way to reach a coach-only component without logging in (still can't, no password entry in this environment), so used the same documented technique as the 2026-08-05 calendar-picker work: temporarily mounted `<CoachShell>` on the unauthenticated `login.js` screen, reverted immediately after. Confirmed via the Browser pane at both a 375px mobile viewport and a real desktop width: the mobile header/hamburger renders, the drawer opens and closes (scrim tap), nav items and "Sign out" render with the footer correctly pinned to the bottom in the drawer, and the desktop sidebar is visually unchanged from before. **Tooling note worth remembering**: this session's synthetic clicks via the `computer` tool's `left_click` action reliably timed out ("Browser pane is currently hidden") when targeting react-native-web `Pressable`s inside this app, for reasons not fully diagnosed — dispatching a manual `pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click` event sequence directly on the target element via `javascript_tool` worked reliably instead, same fallback technique already documented elsewhere in this file for `dnd-kit` drag gestures. Also worth remembering: a raw coordinate guessed from *looking at* a screenshot can be wrong even when the reported "Screenshot size" matches the real viewport exactly — the first click attempts missed the hamburger icon by clicking a few pixels below its actual bounding box; recomputing the target's real `getBoundingClientRect()` via `elementFromPoint`/JS before clicking resolved it, same "re-derive from a known reference point" lesson as the earlier calendar-picker session.

## Two more real bugs from actual use: superset keyboard coverage, Messages compose (2026-08-07, later same day)

**My Fitness — a focused field could end up hidden behind the keyboard with nothing to bring it into view.** Direct report: logging worked fine normally, but for a superset, "the bottom lift gets in the way" — manual scroll fixed it, but nothing did it automatically. Root cause: `SessionFocusModal.js` (the live logging surface — `app/(member)/plan.js` always passes `layout="focus"`, `SessionLogger`'s older "accordion" layout is unused in production) renders a superset's two `ExerciseCard`s fully expanded and stacked in one `ScrollView`, with no code anywhere scrolling a focused input into view. A single exercise's ~3-set card is usually short enough to already sit above the keyboard by luck; a superset's two full stacked cards often aren't.

Fixed with React Native's own first-party, purpose-built API for exactly this — `ScrollView`'s `scrollResponderScrollNativeHandleToKeyboard(nodeHandle, additionalOffset, preventNegativeScrollOffset)`, whose own doc comment says "This method should be used as the callback to onFocus in a TextInputs' parent view." Confirmed (by reading the actual installed source, not assumption) that `react-native-web` implements the same method with the same signature, so one code path works on both native and the web PWA — *except* the underlying keyboard-position math depends on a real `keyboardWillShow` event, which browsers never fire, so calling it on web would either no-op or scroll to a wrong/stale position. Scoped to `Platform.OS !== "web"` accordingly, rather than risk a bad jump on the PWA. `SessionFocusModal.js` now holds a `scrollViewRef` and threads it to every `ExerciseCard`; `ExerciseCard.js` attaches per-row reps/weight refs (via callback refs, since `rows` is a dynamic-length array — hooks can't be created in a loop) plus one for notes, each calling the scroll-to-keyboard method on `onFocus`.

**Verification hit a real environment wall, documented in case it recurs**: this session had live iOS Simulator access (already-booted iPhone 17 Pro, dev client on a long-running Metro tunnel — confirmed via `ps aux`, not assumed) and used the same unauthenticated-screen-mount trick to render a real superset with fake data (`SessionFocusModal` mounted directly on `login.js`, reverted after) — confirmed the component renders correctly with real 5-set data and that taps genuinely focus fields (a blinking cursor appeared in the Notes field). But the simulator's on-screen keyboard never appeared at all for any focused field, in this session, despite `ConnectHardwareKeyboard` confirmed `0` (disabled) via `defaults read` — ruling out the most common cause. Per this file's own standing "don't hunt simulator taps" guidance, stopped after confirming taps/focus work rather than continuing to chase a keyboard that won't render, and reported the gap honestly instead of claiming full interactive verification. **Also confirms the iOS Simulator's tap coordinate space needs real calibration, not eyeballing**: the tool declares 402×874 points for tap/swipe, but screenshots render inline at yet another size — the only reliable way to convert was pulling a real screenshot via `xcrun simctl io screenshot` (which reports true pixel size, e.g. 1206×2622 — a clean 3x point scale) and reading *that* file directly, whose viewer states its own displayed-vs-original scale factor explicitly. Guessing coordinates off the inline tool-call screenshot alone was wrong more than once before landing on this.

**Coach Messages inbox — new-message compose + search.** Direct ask after the inbox itself shipped: a way to start a conversation with a client who has no message history yet (the inbox only ever lists clients already in `listThreadSummaries()`'s output), plus a search box, plus confirmation the list sorts newest-to-oldest (it already did — `listThreadSummaries()` sorts by `lastMessageAt` descending — no change needed there beyond making sure filtering doesn't reshuffle it). New `NewMessageModal` (inline in `app/(coach)/messages/index.js`) — a "+ New message" button opens a searchable `listMembers()` picker (name/email match); picking someone calls the same `selectThread()` an existing row's tap already uses, so starting fresh vs. continuing a thread is the same code path. A plain search `TextInput` above the conversation list filters the already-sorted `summaries` client-side with a bare `.filter()` (never re-sorts), so search can't reshuffle the newest-first order. Visually verified via the Browser pane (mounted the real page on the unauthenticated login screen, reverted after) — search box, modal open, "No clients match" empty state, and Cancel-closes-modal all confirmed with no console errors; the picker's actual name/email filtering against real client rows wasn't exercised this way (no real member data reachable without login), just the empty-state path — low risk given it's a single-line `.filter()`, but worth a real click-through once Terra can log in.

## Real Web Push (VAPID) for the PWA — ported from the standalone app (2026-08-07)

Direct ask: native push only ever reaches the (still-unshipped) App Store build, but the PWA install (`app.kovastrength.com`, "Add to Home Screen") has been usable for weeks and Terra is shipping fast enough that waiting on App Store review isn't realistic — so PWA users (clients and coaches alike) had zero notification delivery. Rather than build Web Push from scratch, ported the standalone Nutrition Tracker app's own implementation, which has run in that app's production since 2026-07 — see [[nutrition_tracker_repo]]. Read its actual source (`public/sw.js`, `app/components/PushSubscribe.js`/`pushActions.js`, `app/api/cron/reminders/route.js`) rather than reimplementing from general Web Push knowledge.

**The reuse turned out bigger than expected: `public.push_subscriptions` already exists live in the shared Supabase project** (`user_id → auth.users`, RLS = own-rows-only, full grants to `authenticated` already confirmed via a direct schema query) — the standalone app's own migration `0011_push_subscriptions.sql`. Since Kova's members/coaches already share that `auth.users` table (same pattern as every other `public.*` nutrition touch-point), this needed **zero new migration** — just point at the existing table.

**Client side** (web-only throughout, gated on `Platform.OS === "web"`):
- `public/sw.js` — the service worker, ported near-verbatim (push + notificationclick handlers; the offline-page-caching half of the original was dropped, Kova has no `/offline` route and this pass is push-delivery-only, not an offline-first shell).
- `lib/notifications/webPush.js` — `getWebPushStatus()`/`subscribeToWebPush(userId)`/`unsubscribeFromWebPush()`, direct `supabase`-client calls (no server actions — this app has none) against `public.push_subscriptions`, ported from `PushSubscribe.js`'s status-detection states (`unsupported`/`ios-needs-install`/`denied`/`ready`/`subscribed`).
- `components/WebPushBanner.js` — dismissible enable-notifications banner, mounted once in `app/_layout.js` as a sibling of `PushRegistrar` (native's equivalent). Rendered through a `Modal` (same technique as `ToastHost.js`) rather than threaded into the member Tabs layout or `CoachShell` individually, so one component covers both without duplicating chrome-specific wiring. Detects iOS-outside-standalone-mode and shows "Add to Home Screen first" instead of a subscribe button that can't work yet, same as the original.
- `registerPushToken.js`'s old "native-only, coaches only get push on the app side" comment is now stale/corrected — that function is still native-only (Expo/APNs/FCM), but the web PWA has its own real path now via `webPush.js`.

**Server side — the actual send mechanism, unified at the existing choke point.** `sendPushToUser()` in `supabase/functions/_shared/expoPush.ts` is the one function every push-sending caller already goes through (`send-push`, `scan-spc-alerts`, `scan-nutrition-reminders`, `scan-nutrition-checkin-available`, and — via `announcementAudience.ts` — `send-announcement`/`scan-announcements`). It now fires native Expo push and the new `sendWebPushToUser()` (new `_shared/webPush.ts`, `npm:web-push@3.6.7`, VAPID-signed, same 404/410-triggers-cleanup pattern as the standalone app's cron route) in parallel and sums the counts — **zero caller changes needed**, every existing notification type picked up PWA delivery automatically the moment the shared file changed and the 6 functions were redeployed.

**Confirmed `npm:web-push` actually runs in Supabase's Deno Edge Runtime before trusting it** — deployed a disposable `test-webpush-import` function (`--no-verify-jwt`, no real secrets touched) that just imported the library and called `setVapidDetails`, curled it directly, got a clean 200, then deleted it. This was the one genuinely unproven piece of the port (everything else was either an existing live table or a straight code port); confirming it first meant the real functions could be redeployed with confidence rather than discovering a Deno/npm incompatibility after the fact.

**Fresh VAPID keypair generated for Kova specifically** (`npx web-push generate-vapid-keys`) rather than reusing the standalone app's — keeps the two apps' push identities cleanly separate. Public key is `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (in `.env.local` for local dev, and set on **both** Vercel Production and Preview via `vercel env add` — this app's web build reads `EXPO_PUBLIC_*` vars at Expo build time, so it needs to exist in Vercel's own env, not just `.env.local`); private key + subject (`mailto:terra@kovastrength.com`) are `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`/`VAPID_PUBLIC_KEY` Supabase Edge Function secrets only, never shipped client-side.

**Status as of this session — Supabase side fully deployed and live, Vercel/web side blocked on one missing credential:**
1. All 6 push-sending Edge Functions redeployed with the merged `sendPushToUser()` — confirmed via `supabase functions list` that redeploying without `--no-verify-jwt` **preserves** each function's existing `verify_jwt` setting rather than resetting it (the 4 cron-triggered ones stayed `verify_jwt: false` as needed, confirmed by version number bump + unchanged flag — worth remembering, this was a real risk this session flagged and checked rather than assumed).
2. VAPID secrets set, Vercel env vars set, `.env.local`/`.env.example` updated.
3. `npx expo export -p web` — clean, `sw.js`/`manifest.json` land correctly in the static output.
4. Verified as far as this environment's tooling allows: served the real export locally, opened it in the Browser pane, confirmed zero console errors from the new code, confirmed `navigator.serviceWorker.register("/sw.js")` succeeds with the correct scope, confirmed the VAPID public key parses and `pushManager.subscribe()` reaches the browser's real push mechanism (failed only on `AbortError: permission denied` — this sandboxed browser auto-denies `Notification.permission`, which is the harness's own limitation, not a code bug; same class of "can't log in / no real device" gap noted throughout this file).
5. **Terra pushed it herself** (`git push origin main` — this session's own push attempt failed, see the "git push is NOT reliably available" working note below) — deployed to `app.kovastrength.com` via the usual Vercel auto-deploy.

**End-to-end delivery confirmed for real, not just bundle-checked.** Terra subscribed via the new banner on `localhost:8081` (a real `public.push_subscriptions` row landed, confirmed via a direct schema query), and a direct server-side call to `sendPushToUser()` for her account (a disposable diagnostic Edge Function, deployed/tested/deleted same session) returned `sent: 2` — one real push reached her phone (native, existing token) and one reached her browser (new web subscription), same call.

**Follow-up same session — "coaches aren't getting push" turned out to be a swallowed error message, not a role bug.** Terra reported the Settings → "send yourself a test push" button failing with a generic "Edge Function returned a non-2xx status code." Checked first (before assuming a bug) whether coach/admin accounts are excluded from push anywhere — they aren't; `sendPushToUser()` has no role filter at all, and the earlier "announcement audience excluded coach/admin" bug (2026-08-05, above) was confirmed still fixed. The generic error message was real but unhelpful — `lib/notifications/sendPush.js` threw `error.message` from a `FunctionsHttpError`, which is always that same generic string; the real reason lives in `error.context`'s response body and was never read. Fixed the same way `register.js` already had to (see that file's own header comment) — `extractFunctionErrorMessage()` now reads the real body. With the real message surfaced, the actual cause was `send-push`'s own "Invalid or expired session" check (`callerClient.auth.getUser()` rejecting her JWT) — resolved by a hard refresh of the stale localhost tab, not a code bug. Worth remembering as a class: a generic Edge Function error message should always be suspected of hiding the real reason before concluding "it's broken" — check `error.context` first.

## Coach<->member messaging bubbles + admin kill switch (2026-08-07/08)

Real ask: persistent floating message access on both apps, plus — once shipped and clicked through — an admin off-switch, since Terra wasn't sure messaging was ready to go live yet: "adds some complexity on where do we watch messages... until I figure that out I need to be able to turn it off," plus an optional finer split ("turn on messaging for just specific memberships"). Also relabeled `CoachShell.js`'s web sidebar link from "My Training" to "Member View" in the same pass, matching the native `more.js` row that had already been relabeled earlier but the web sidebar was missed.

**Floating bubbles, both apps.** New `components/FloatingMessageBubble.js` (member) — a small circle pinned above the tab bar on every `(member)` screen (mounted in `app/(member)/_layout.js` as a sibling of `<Tabs>`); tapping it opens the same thread the header chat icon/`/messages` route reach, as a bottom-sheet `Modal` — closing it returns to wherever you were, no navigation involved. New `components/CoachMessageBubble.js` — same pattern, scoped to whichever client's page a coach is on, dropped onto the three "someone's screen" pages (`clients/[userId].js`, `nutrition/clients/[userId].js`, `spc/[userId].js`).

**Real bug found and fixed same day, from a direct device report.** The first version wrapped the *idle* button in an always-visible `<Modal transparent>` (`pointerEvents="box-none"` on its wrapping View) — the same technique already proven for `ToastHost`/`WebPushBanner`. On a real device this broke interaction entirely: "the only thing that works when you load that, is the bubble itself. like its overlaying the whole screen with a clear non clickable page" — a Modal presents as its own native overlay window, and `pointerEvents="box-none"` doesn't reliably let touches reach the screen underneath it (the tab bar included), unlike ToastHost/WebPushBanner, which are small and dismissible and had apparently never been tapped through in the exact spot they cover. Fixed in both components by dropping the Modal for the idle button entirely — it's now a plain `position:"absolute"` element, so only its own 52×52 footprint intercepts touches. The Modal is still used, deliberately, for the *opened* thread sheet — blocking the screen while it's open is the whole point there. `FloatingMessageBubble` specifically has to render *after* `<Tabs>` in `_layout.js` (not before) so it paints on top of the tab bar — later JSX = later paint = on top for overlapping siblings, since it isn't nested inside a `Tabs.Screen` and so gets no `BottomTabBarHeightContext` to size itself against (approximated instead with a fixed `insets.bottom + 74` offset). `CoachMessageBubble` doesn't need that — it's rendered inside the screen's own content area (a sibling of that page's `ScrollView`, inside `<CoachShell>`), which native's Tabs navigator already sizes to exclude the tab bar.

Member Settings gained a "Messaging" card (under Notifications) with a device-local "Show message bubble" toggle (`lib/messageBubblePref.js`, AsyncStorage, no migration) — confirmed with Terra this doesn't need to sync across devices. Turning it off doesn't remove messaging outright — the header chat icon and `/messages` route are left alone as a fallback.

**Admin kill switch + audience, next-day follow-up.** New `lib/programming/messagingSettings.js` — two `core.settings` rows (`messaging_enabled` boolean, default `true`; `messaging_audience` jsonb array of scope keys, default `["all"]`) with `getMessagingSettings()`/`setMessagingEnabled()`/`setMessagingAudience()`, same shape as the existing `NOTIFICATION_TOGGLES` pattern on `app/(coach)/settings.js`. `matchesMessagingAudience(audience, scopes)` is the pure match check; `deriveMessagingScopes()` turns already-loaded membership data (group program ids + spc/nutrition active booleans) into the same scope-key shape, and `getMessagingScopesForUser(userId)`/`isMessagingEnabledForUser(userId)` do the same from scratch for callers with no membership data already loaded.

New **Settings → Messaging** tab (admin-only): the master toggle, then an audience list — "Everyone" (exclusive; checking it collapses to `["all"]` and dims/disables the rest) or any mix of Nutrition/SPC/each group program (`listGroupPrograms()`, so a newly-created program like "Look Like You Lift" shows up automatically, no hardcoding).

**Every messaging entry point respects this, not just the two bubbles**: both floating bubbles (checked against the specific member/client being viewed, not the coach's own memberships), the header chat icon + `/messages` route (member), the existing inline "Messages" card on the group client profile (`clients/[userId].js`, reuses that page's already-loaded `assignments`/`spcClient`/`nutritionClient` instead of a second scope-resolving fetch), and the coach Messages inbox — nav item (`CoachShell.js`'s sidebar/drawer, and native's `more.js`) plus the route itself (`app/(coach)/messages/index.js`, showing a plain "Messaging is currently turned off" message if reached directly) — gated on the **master switch only**, not audience, since the inbox is a cross-client aggregate view rather than one specific membership's affordance.

**Verification**: the Modal-freeze bug and its fix were confirmed directly by Terra on a real device ("Bingo. its perfect."). The kill switch/audience settings themselves are bundle-checked only (`npx expo export -p web`, clean) — not yet clicked through.

## Payroll module — replaces the standalone Glide payroll app (2026-08-07)

Terra runs payroll for ~13 coaches out of a separate Glide app (a Google Sheet export, `Payroll and Program Tracker.xlsx`, plus screenshots, dropped into `Payroll /` at the repo root — the whole point of Kova is consolidating every gym-ops app into one login, and this is that next module). Before writing any code, the Glide export was reverse-engineered directly: its `Amt_Total` column is a computed field that doesn't survive export, so the real pay formula was rebuilt from the rate tables and verified line-by-line against a real Payroll Report screenshot (Abbi's Jul 23–Aug 5, 2026 period: Group $125, Programs $195, Admin $95.40, SPC $584, Other $287.50, Total $1,286.90 — matched to the penny) — and confirmed again against `lib/payroll/calc.js` itself via a real Node test run against the actual historical rows before trusting the code.

**Real, currently-live bugs found in the Glide data, not hypothetical ones** — all fixed by design, not just noted: (1) `CustomPayrollRequests` and `PayEntries` were two tables kept in sync by hand — a coach requests, an admin approves, then someone re-types the approved number into `PayEntries` as a second manual step. Cross-matching all 44 requests against all 44 custom pay entries found a real $200 gap: Terra's Owner Pay for the Apr 30–May 13, 2026 period was approved at $2,200 but the entry that actually got paid was only $2,000. (2) Two `OtherType` values used in real entries (`"Cleaning + BS"`, `"BWA"`) don't exist in the rate table at all — remapped to `"Cleaning"`/`"BWA Programming"` on import, treated as typos per Terra's confirmation. (3) The "1:1 Nutrition" billing tracker was fully disconnected — every row had a blank pay period, so it never fed into anyone's pay at all.

**Confirmed pay formula**: `GroupSessions×$25`, `ProgramsWritten×$15`, `AdminHours×$18`, `WelcomeSessions×$40`, `StrategySessions×$10`, `OpsHours×$23` (Ops Hours: only Lauren today, gated by the new `can_log_ops_hours` flag below). `OtherType` line items are `OtherQty (default 1) × OtherRates.rate`. SPC pay is a **flat rate per session, tiered by that session's attendee count** (0→$10, 1→$25, 2→$37, 3→$54, 4→$71), not per-attendee — capped at 4 attendees (every real historical session capped there too, confirmed before building). `Custom_Amt` is a free dollar amount bypassing every rate table.

**New `payroll` schema** (migration `0036_payroll_schema.sql`, **run and confirmed live** 2026-08-07) — `pay_periods`, `core_rates`, `other_rates`, `spc_tiers`, `pay_entries`, `custom_requests`, `nutrition_assignments`, `finalizations`. Three deliberate departures from a naive Glide port, all driven directly by Terra's own feedback on the first plan draft:

**Real bug found on the first live run, before any data existed**: `pay_entries`' RLS policies reference `payroll.finalizations` in an `EXISTS` subquery, but the file originally defined `finalizations` much later — Postgres resolves every table a `CREATE POLICY` references at creation time, so the whole migration failed partway through with `relation "payroll.finalizations" does not exist` (Supabase's SQL Editor runs a script as one transaction, so the failure rolled back everything cleanly — nothing partial was left behind). Fixed by moving the entire `finalizations` table + its RLS + the `finalize_own_period()` RPC to before `pay_entries` in the file, then wrote a small Python script to statically walk the whole migration line-by-line and confirm no other `payroll.*` object is referenced before it's defined — worth re-running that same check (see git history around this date for the script) if this migration is ever restructured again.

- **Pay periods are computed, not manually maintained.** Glide required Terra to hand-seed every period row and run a separate daily job just to flip Open/Closed — she flagged this as something to build smarter, not port as-is. `payroll.pay_periods` is keyed by the natural key `start_date` (no surrogate id, no pre-seeding) and only holds real per-period *state* (`closed`/`closed_at`/`closed_by`); every one of the ~30 real historical Glide periods lands exactly 14 days apart, so `lib/payroll/periods.js` derives any date's period from one anchor (`core.settings.payroll_period_anchor_date`, `2025-10-02`) + a fixed 14-day cadence — same "compute a recurring cycle from an anchor" pattern already used by `lib/nutrition/weekCycle.js`. `payroll.ensure_pay_period()` (security-definer RPC) lazily upserts the stub row the first time anything actually references a period.
- **The entry form filters itself per coach**, based on existing permission flags — not every coach does SPC/programming work, matching direct feedback ("only some coaches do spc, only some do nutrition, only some do programming... just to make their screen look better, we could filter some of these out"). SPC toggle+attendees and Programs Written are gated on `can_view_spc` (in the real historical data, every `Programs Written` entry's note is an SPC client name); Ops Hours is gated on a new `core.users.can_log_ops_hours` boolean (`0036`, same admin-settable-toggle shape as `can_view_spc`/`can_view_nutrition`/`can_view_exercise_library` from `0015` — mirrors Glide's per-user `Manager` flag, which today only Lauren has). Group/Admin/Welcome/Strategy/Other/Custom stay universal.
- **Every coach — not just admin — sees their own pay history**, with a period picker to look back through past periods (`app/(coach)/payroll/report.js`/`.web.js`) — direct correction after the first draft scoped this admin-only; it directly mirrors the real Glide "Payroll Report" screen shown to a coach. Admin additionally gets an "All Employees" section (the wide grid from the Glide admin screenshot — `report.web.js` renders it as a real horizontally-scrolling table; `report.js`'s native/generic fallback is a plain card list).

**Custom requests unify request + pay** (fixes hole #1): `payroll.custom_requests.pay_entry_id` links a request to the `pay_entries` row created the moment it's approved (`lib/payroll/requests.js`'s `approveRequest()`) — one action, no re-typing, no drift possible. Not a DB transaction (this codebase's established convention is plain sequential writes, not stored procedures for multi-step actions) — if the second write fails, the `pay_entries` row is harmlessly orphaned rather than the request silently staying unpaid.

**1:1 Nutrition rebuilt against real clients** (fixes hole #3), and reworked twice more from Terra's own follow-up feedback mid-session. Final shape: its own tab (`app/(coach)/payroll/nutrition.js`, shown only when `can_view_nutrition`) where a coach picks a client from a real dropdown of their own active nutrition clients (new `listClientsForCoach(coachId)` in `lib/nutrition/clients.js` — no such per-coach filter existed before) instead of typing a name, and sets a billing-day-of-month once per client (`payroll.nutrition_assignments`, no formal cross-schema FK into `public.clients` per this repo's standing convention of not FK-ing into the shared standalone-app tables — just a plain `client_id` uuid, snapshotted `client_name`/`coach_name` for the same retention reasons as everything else in this schema). The **finalize flow** (`components/payroll/FinalizeModal.js`) is where the real automation lives: it auto-detects every assignment whose billing day falls inside the current period (`assignmentsDueInPeriod()`) and requires the coach to explicitly confirm each one before it counts — "so they can't say oh I must have missed it" — with a real warning (and default-unchecked) on any client whose live `public.clients.status !== "active"`, so a paused/cancelled client doesn't quietly still generate pay. Confirmed rows become `$100` `pay_entries` (`source: "nutrition_billing"`) created atomically alongside the finalize itself.

**Finalize/lock/close — a genuinely new three-layer hierarchy, not in Glide at all** (`PayEntries.Locked` existed in the Glide schema but was never once used in 2,161 real rows). Per Terra's explicit ask ("I want a button that locks in that pay period... for audit purposes... it's not changing"):
1. **Per-coach finalize** (`payroll.finalize_own_period()`, security-definer RPC — the *only* write path for a coach onto `payroll.finalizations`, since RLS can't restrict which column a plain UPDATE touches and a coach must never be able to set their own `reopened_at` to self-unlock). Locks that coach's own entries; admin can reopen (plain table write, same "admin reopens" shape as `programming.nutrition_checkin_reopens`).
2. **Admin hard-close** (`app/(coach)/payroll/periods.js`'s "Close pay period" button, `confirmClosePayPeriod()` warns by name who hasn't finalized yet as an informed override, not a silent one) — sets `pay_periods.closed = true`. RLS enforces this as a genuine hard stop: **nobody, including admin, can write to a closed period through the app afterward** — a real post-close correction is a manual DB action outside the app, same standing precedent as every other irreversible-action decision in this codebase.
3. **Deadline reminders** — new `supabase/functions/scan-payroll-deadline-reminders/index.ts` (structured identically to `scan-spc-alerts`: `CRON_SECRET` header auth, `--no-verify-jwt` deploy, service-role client, `sendPushToUser` from the shared `expoPush.ts`) pushes any coach with no finalization yet once the deadline passes. **Superseded 2026-08-12 — see "Payroll deadline reminder was firing a week early" below for the current schedule and settings keys**; as originally built it gated on `payroll_deadline_weekday`/`payroll_deadline_time` and polled every 15 minutes. **Deployed and running**: the function is live, migration `0038_payroll_deadline_cron.sql` is run (registers the cron job, letting the function itself gate on the real deadline window, same "poll cheap, gate inside the function" shape as `announcement-scan`), and the `x-cron-secret` placeholder was filled with the real project `CRON_SECRET` before running. Worth remembering for next time a project secret needs re-checking: `supabase secrets list` only ever shows a SHA-256 digest per secret, never the plaintext (confirmed directly this session — a pasted "value" from that command turned out to be a 64-hex-char hash, not a real key, when checked against what a real VAPID/CRON secret actually looks like) — there's no way to read a secret's real value back out once set, only rotate it.

**Historical import — built as a re-runnable script, not a one-time migration**, per direct ask: Terra is staying on Glide for a while and will hand over new exports periodically. `scripts/payroll_import.py` reads the xlsx directly (`openpyxl`, same approach used to analyze the export in the first place) and emits idempotent SQL: `pay_entries` rows reuse Glide's own `EntryID` as their primary key (`ON CONFLICT (id) DO UPDATE`), so re-running against a later export is a genuine upsert, not a duplicate-insert risk. `custom_requests` has no stable id in the source data at all, so it dedupes on a composite unique index (`staff_email, pay_period_start, description, amount_requested` — `0036`) instead — a real, documented limitation (an exact duplicate request could theoretically collide and get skipped), not a guaranteed key. **Two real bugs caught and fixed before this was trusted** — one from static review, one from an actual failed run against the live project:
1. The first version of the script only attached the `ON CONFLICT` clause to the *last* of 11 batched `pay_entries` INSERT statements (2,161 rows batched 200-at-a-time) — every earlier batch would have 23505'd on any re-run. Caught before Terra ever ran it, by static file inspection. Fixed so every batch is now a fully independent, self-contained idempotent statement.
2. **`0037` actually failed on Terra's first live run**: `ERROR: 21000: ON CONFLICT DO UPDATE command cannot affect row a second time`. Root cause: 3 `EntryID`s appear **twice** in the raw Glide export itself — genuine duplicate rows (confirmed by pulling both copies directly: identical date/coach/content, only Glide's internal hidden Row ID differs), not a script bug. Since `pay_entries.id` reuses `EntryID` as the primary key, two rows sharing an id inside the *same* INSERT statement collide with each other, which `ON CONFLICT DO UPDATE` can't resolve (it only handles conflicts against rows that already existed before the statement ran). Fixed by deduping on `EntryID` during generation (keep first occurrence, log a warning for each dropped duplicate) — 2,161 raw rows → 2,158 imported. Re-verified after the fix (no live DB in this environment, so verification is static): rebuilt the batch-duplicate-id check and the SQL-comment-aware quote/paren-balance check from scratch against the regenerated file, both clean.

Real import rules applied: the `Cleaning + BS`/`BWA` typo remap, Glide's `''`-vs-`null` inconsistency normalized across every numeric column, `SPC_Attendees`' `'N/A'` string → real `null`, one orphaned pay-period reference (`pp_2022_12_25` → `pp_2025_12_25`) corrected, and **everything imported as-is including test/junk rows** (`"sms test"`, `"Test"` $50, etc.) — Terra's explicit call, full historical accuracy over cleanliness. One request row — a Strategy Session **for client Melissa Benson**, submitted by **coach Kelsie Neidner** (`krneidner@gmail.com`) — has no resolvable `PayPeriodID` at all and was skipped; flagged for Terra to re-enter by hand if still relevant. **Read that pairing carefully: the name in a request's description is the CLIENT, the email is the COACH.** An earlier session read this line as one person and reported Kelsie's 41 unattributed pay entries as belonging to Melissa Benson, who is a separate, active member with her own account and zero payroll rows. `payroll.pay_entries.staff_name` carries the coach's real name on every row — read that column, never a description or a note, before naming anyone. The 4 real rows in the disconnected `"11 Nutrition"` tab (Sam/Liza/Sarah/Lori, coach Abby) were deliberately **not** auto-imported into `nutrition_assignments` — matching bare first names to real `public.clients` rows isn't safely resolvable offline with no live DB access; Terra needs to re-add these 4 by hand through the new Nutrition tab.

`0037_payroll_seed_data.sql` **has been run against the live project** (2,158 pay entries, 43 custom requests, 23 historical pay periods).

**Access/nav**: Payroll is a normal (non-permission-gated) `CoachShell` nav item — every coach logs their own hours, unlike the optional SPC/Nutrition/Exercise Library modules — with an in-page `PayrollTabBar` (`components/PayrollTabBar.js`) connecting its 5 sub-routes (`My Entries`/`Requests`/`1:1 Nutrition`/`Report`/`Pay Periods`, the last admin-only) since `CoachShell` only ever shows one "Payroll" entry. Native reaches it via `more.js` (no permission gate, same as Messages) plus a registered `href: null` route; `app/(coach)/payroll/_layout.js` wraps the folder in a `Stack` for the same reason `blocks/_layout.js` does — without it, every nested route flattens into its own top-level native tab.

**Two real stale-closure bugs caught and fixed before this was considered done**, both the same shape: a `useFocusEffect`'s inner `useCallback` had an incomplete dependency array (`[userId]` only, or `[]`), so on refocus it read `selectedPeriod` from whichever render *first* created the closure — permanently stale — silently resetting a coach's/admin's manually-picked pay period back to the current one every time they navigated away and back to the Report or Pay Periods screen. Fixed in both `lib/payroll/useOwnReport.js` and `app/(coach)/payroll/periods.js` with a ref that's updated everywhere `selectedPeriod` changes, read inside the focus-effect instead of the closure variable.

**Fully live as of 2026-08-07** — all four migrations run in order (`0036` → `0037` → `0038` → `0039`), `payroll` added to Project Settings > API > Exposed schemas, `NOTIFY pgrst, 'reload schema'` sent, `scan-payroll-deadline-reminders` deployed, and the `payroll-deadline-reminder-scan` cron job registered with a real `CRON_SECRET`. Getting here took **three** real bugs found and fixed against the actual live project, not just in theory — the `finalizations`-ordering bug and the duplicate-`EntryID` batching bug above, plus a third caught right at the end: `0036` granted table/sequence privileges on `payroll` but never `GRANT USAGE ON SCHEMA payroll` itself, so even with Exposed Schemas checked and every table grant/RLS policy correct, every query still failed with `permission denied for schema payroll` — the exact bug class `0003_schema_grants.sql` exists to prevent for the original three schemas, missed here despite that direct precedent sitting in the same repo. Fixed by `0039_payroll_schema_usage_grant.sql` (and backported into `0036` itself so a fresh setup elsewhere won't repeat it). **Verified**: the pay formula against real historical data (Node test, matched to the penny) and a full `npx expo export -p web` (clean, zero errors, every payroll route present) after every batch of changes — standard bar for this codebase. **Confirmed working by Terra directly** (logged in and used the real thing, not just bundle-checked — same login limitation as every other feature in this file means this environment still can't do that itself) — she flagged it needs further refinement before calling it fully done, specifics not yet gathered as of this writing. Worth a follow-up pass covering: what exactly needs work (ask directly rather than assuming), the full finalize → reopen → close hierarchy end to end, and confirming a deadline-reminder push actually reaches a coach's phone.

**That follow-up happened the same week — see "Payroll redesign: tile-based entry, admin/staff view split, audit-locked closed periods" below.** The entry screen, the Report tab, the admin nav structure (this section's `PayrollTabBar`/5-sub-routes description above is now specifically the *pre-redesign* shape), and the close-period flow were all rebuilt; the rate formula, `payroll` schema, and historical import documented in this section are untouched and still accurate.

## Text alert when Apple's App Review account signs in (2026-08-07)

Direct ask while a build was sitting "Waiting for Review": a way to know the instant Apple's reviewer actually logs into `review@kovastrength.com` (the demo account handed to Apple in App Store Connect's review notes), rather than only finding out once a verdict email arrives.

**New Postgres trigger on `auth.users`** (migration `0035_review_signin_notify.sql`, **run**, confirmed live 2026-08-07) — fires `after update of last_sign_in_at`, scoped to `new.email = 'review@kovastrength.com'`. `last_sign_in_at` only changes on a genuine sign-in (password/OTP/OAuth grant), not on the routine background token refresh every session goes through roughly hourly, so this can't spam on its own. Calls the new `notify-review-signin` Edge Function via `net.http_post` (`pg_net`, already installed for the announcement/SPC-alert cron jobs), which texts Terra via GHL's Conversations API — the same call `request-registration-code` already makes — using her own GHL contact id (`Y5bLtvYia5p7cF86alWt`, hardcoded in the function; this is a single personal notification; not a general-purpose feature).

**Auth is its own dedicated secret (`REVIEW_SIGNIN_SECRET`), not `CRON_SECRET`** — the CLI can *set* a function secret but can't read an already-set one back, and the trigger's SQL needs the literal value to send as a header (Postgres has no way to reference an Edge Function's env var from inside a trigger body). A fresh secret was generated instead and set via `supabase secrets set`.

**A real near-miss on secret hygiene, caught before anything was committed**: the first draft of `0035`'s SQL embedded the actual `REVIEW_SIGNIN_SECRET` value in plaintext (needed to actually run it against the live project). Terra caught this before the commit happened — the committed version now carries a placeholder (`REPLACE_WITH_THE_REVIEW_SIGNIN_SECRET_VALUE`), same convention as `0025_announcement_push_cron.sql`'s `CRON_SECRET` placeholder — the real value was substituted only in the copy actually run via `supabase db query -f`, never saved back to the file. The live trigger function's source in the database still has the literal secret baked in (unavoidable — there's no cleaner way to get a secret into a `pg_net` call from SQL), but that's normal/expected, not a repo-hygiene issue; only the git-tracked file needed fixing.

**Deployed and verified end-to-end this session** (not just bundle-checked) — this session had an authenticated Supabase CLI and EAS CLI, both confirmed working live: the function was deployed, the secret was set, the migration was run directly via `supabase db query -f` (the mutating write was blocked once by the auto-mode classifier as too high-risk to run unattended, same as the messaging-follow-ups session — proceeded once Terra explicitly confirmed in chat), and a direct `curl` against the deployed function with the real trigger secret returned a clean `200 {"sent":true}` and landed a real text on Terra's phone. The trigger itself (real Apple sign-in → real text) hasn't been observed firing yet as of this writing — Apple hadn't signed in again since it went live.

**Same session, unrelated but concurrent**: while "Waiting for Review," Terra removed that submission from review herself (not an Apple rejection — a developer-initiated "Remove from Review," which just returns the version to an editable draft with no review-history penalty) so a newer build could be swapped in, since a week of real bug fixes (sign-out-too-often, Dynamic Type layout breakage, a keyboard covering input fields, etc.) had shipped since the original build went up. `eas build --platform ios --profile production --auto-submit --non-interactive` built and uploaded build 17 in one step (`--auto-submit` chains build → App Store Connect upload). Re-attaching the new build to the App Store version and re-submitting is a manual App Store Connect step with no CLI/API access from this environment — same standing limitation as everything else in this file that requires clicking through Apple's own web UI.

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

## Nutrition check-in: multiple-choice questions, Zoom booking via GHL calendar, editable "check-in available" notification (2026-08-08)

Three-part ask, all built same session:

**Multiple-choice check-in questions + a booking trigger** — the "Loom or Zoom" question was free text like every other check-in question; the ask was to make it (and any future question like it) a real radio-button choice, with one option able to open a scheduler. Migration `0042_checkin_question_choices.sql` (**run**) adds `question_type`/`options`/`booking_option` to `public.checkin_template_questions`/`public.client_checkin_questions` — **these are the standalone Nutrition Tracker app's live `public.*` tables** (confirmed by checking `lib/nutrition/checkin.js`'s calls, which use the plain `supabase` client with no `.schema()` override — the `nutrition.*` versions from migration 0005 are the dead placeholder schema), so this follows the same additive/backward-compatible pattern as 0031/0033. `copyTemplateToClient` now carries the new columns over into a client's own copy, same as `question_text`/`position`.

`QuestionListEditor.js` (shared by all 4 question-list editors in the app) gained an opt-in `choicesEnabled` prop: when editing a question, a "Multiple choice" toggle reveals an options list (add/remove) plus a per-option radio marking it the "opens Zoom scheduler" trigger. Only wired on for the two **check-in** editors (`settings.js`'s template editor, `ClientSettingsModal.js`'s per-client editor) — the questionnaire editors are untouched. This changed `onUpdate`'s contract app-wide: it's now always called with a fields object (`{question_text, question_type, options, booking_option}`) instead of a bare string, so all 4 `onUpdate` handlers (2 checkin, 2 questionnaire) were simplified to plain passthroughs (`(id, fields) => updateXQuestion(id, fields)`) rather than branching by caller.

`app/(member)/nutrition/checkin.js` renders a `single_choice` question as real radio buttons (`ChoiceQuestion`) instead of a `TextInput`, in both the live and coach-reopened-week forms. On successful submit, if the member's answer matches that question's `booking_option`, a new `ZoomSchedulerModal` opens automatically.

**Real GHL calendar booking, not a stub** — confirmed live via a disposable diagnostic Edge Function (deployed, curled once, deleted same session, same pattern as the 2026-08-07 Web Push `npm:web-push` import check) that Terra's updated GHL Private Integration Token can read calendar `t7fAF1sImGuso1im6UR6` ("Nutrition Check In", round-robin, 30-min slots) — both calendar details and real free-slots came back clean. Two new Edge Functions, both JWT-verified (default deploy, same auth pattern as `ensure-nutrition-coach` — resolve the caller via their own Authorization header, not a passed-in userId): `get-checkin-booking-slots` (proxies GHL's free-slots API for the next 14 days) and `book-checkin-session` (looks up the caller's stored `ghl_contact_id` from `core.users`, fetches the calendar's real `slotDuration` rather than hardcoding it, then POSTs a real appointment to GHL's create-appointment endpoint). New `lib/nutrition/checkinBooking.js` client wrappers + `components/nutrition/ZoomSchedulerModal.js` (a real slot picker, grouped by day, Boise-local time formatting derived from the ISO string's own UTC offset rather than the device's local zone).

**"Check-in available" notification made editable, moved into Settings' renamed "Nutrition" tab** — the Settings sub-tab `templates` is now labeled "Nutrition" (was "Nutrition Templates") since it now covers more than just the two question templates. The notification's title/body/send-weekday/send-time were previously hardcoded in `scan-nutrition-checkin-available` and fired on a fixed `0 15 * * 0` (Sunday) cron; they're now `core.settings` rows edited from a new card on that tab (day-of-week pill row + a quarter-hour time picker, `NativePickerField` on native / a real `<select>` on web — same pattern as `announcements/index.js`'s own schedule picker). The Edge Function now polls every 15 minutes and gates on the configured weekday/time itself (`0043_checkin_available_notification_polling.sql`, **run**), with a new `nutrition_checkin_available_last_sent_date` setting as an idempotency guard so it doesn't refire on every poll for the rest of the matched day — same "poll cheap, gate inside the function" shape as `scan-payroll-deadline-reminders`, but needed its own last-sent guard since (unlike a payroll nag, which naturally stops once a coach finalizes) nothing else would otherwise end the matching window. The now-redundant entry was removed from the Notifications tab's `NOTIFICATION_TOGGLES` list.

**Deployed this session** (Supabase CLI was authenticated throughout): `get-checkin-booking-slots`, `book-checkin-session` (new), and `scan-nutrition-checkin-available` (redeployed with the new content/timing/idempotency logic). **Migrations `0042` and `0043` have both been run** (Terra ran them directly) — confirmed live via a direct schema query (`question_type`/`options`/`booking_option` exist on both `public.checkin_template_questions` and `public.client_checkin_questions`).

**Real test data wired up, and a real bug found along the way.** The actual live "Preference: Zoom call or Loom video this week?" question was found on the shared template *and* on both Terra's and Dustin's own per-client copies (all three converted to `single_choice`, options `["Zoom","Loom"]`, `booking_option: "Zoom"`, via a direct `db query --linked` UPDATE, same live-write access as the messaging/payroll sessions). Neither `dustin@kovastrength.com` nor `terra@kovastrength.com` had a `ghl_contact_id` on file (neither came in through the GHL import), so booking would've failed for both — Terra had two personal-email GHL contacts (`dsmout3@gmail.com`, `tsmout1@gmail.com`) she'd used to test the standalone app, and asked to tie those real contact IDs onto the two Kova staff accounts instead. Looking those up needed a GHL Contacts read scope the Private Integration Token didn't have yet (confirmed via a disposable diagnostic function, same 401-then-retry pattern as the calendar check) — Terra added it, and the lookup then resolved `dsmout3@gmail.com` → `Y5bLtvYia5p7cF86alWt` ("dustin smout") and `tsmout1@gmail.com` → `EbMFGktHgaGkoHNJnMfm` ("terra smout"). **`Y5bLtvYia5p7cF86alWt` was already hardcoded in `supabase/functions/notify-review-signin/index.ts` as `TERRA_GHL_CONTACT_ID`** (see "Text alert when Apple's App Review account signs in" above) — it's actually Dustin's contact, not Terra's, meaning that Apple-review-signin text alert has likely been going to Dustin's phone the whole time, not Terra's. **Left as-is per Terra's explicit call** ("leave it on dustin's account") — not a bug fix she wanted made. Setting `EbMFGktHgaGkoHNJnMfm` onto `terra@kovastrength.com` first hit a unique-constraint conflict — a leftover `core.users`/`auth.users` row for `tsmout1@gmail.com` itself (a separate real account, not deleted despite Terra having removed `dsmout3@gmail.com`'s auth account) already held that contact id. Per Terra's call, that leftover account was left in place, just cleared of the `ghl_contact_id` so it could move to `terra@kovastrength.com`. Both `core.users` rows now carry real, verified contact IDs. **Superseded 2026-08-09 for Dustin's half** — `Y5bLtvYia5p7cF86alWt` was moved off `dustin@kovastrength.com` onto a re-imported `dsmout3@gmail.com` member account, see "GHL contact collision silently breaks registration" below; `dustin@kovastrength.com` now has a null `ghl_contact_id` (so Zoom check-in booking won't work from that staff account), `terra@kovastrength.com` is unchanged.

**Real bug found and fixed from Terra's own click-through: the Finalize Check-In button gave zero feedback when the form wasn't fully answered.** It was hard-`disabled` whenever `!canFinalize`, so tapping it while questions were still blank did nothing at all — read as "the button isn't working," not as "you're not done yet." Fixed: the button is no longer `disabled` by readiness (only while an in-flight submit is `submitting`, to prevent a double-post) — it's just dimmed via inline `style={{opacity:0.5}}` when not ready, and both `handleSubmit`/`handleReopenSubmit` now check readiness themselves before doing anything, showing a specific message (`buildReadinessMessage` — "Before finalizing, answer the N remaining questions in the check-in form" and/or "upload this week's progress photos") via the same `submitError`/`reopenSubmitError` text that already rendered above the button. Confirmed working by Terra clicking through it directly on `localhost`.

**Verification is real for the pieces above, not the usual bundle-checked-only caveat** — the radio-button conversion, the ghl_contact_id tie-ins, and the Finalize readiness-message fix were all confirmed by Terra clicking through the actual app. **Still unverified**: actually creating a real GHL appointment through the scheduler (write access was never test-fired — read access is confirmed, but a real booking has a real side effect worth Terra trying herself now that both her and Dustin's accounts have real contact IDs), and whether an edited notification title/body/time on the new Nutrition-tab card actually changes what goes out.

## Payroll redesign: tile-based entry, admin/staff view split, audit-locked closed periods (2026-08-08)

Direct follow-up to the "Payroll module" build above — confirmed via Terra clicking through it that it "needs further refinement before calling it fully done" (see that section's last line). This session got the specifics: the entry screen read as "a spreadsheet" she wanted made graphical, and admin had no separated view from a coach's own entries. This is a near-total UI rebuild on top of the same schema/calc layer from the original build (`lib/payroll/calc.js`'s `computeEntryBreakdown`/`computeTotals`, `lib/payroll/entries.js`'s `createEntry`/`updateEntry`, the pay-period math) — none of that needed to change, only how a coach interacts with it.

**"My Entries" rebuilt as a date-scoped tile grid**, replacing the old single flat form entirely (`app/(coach)/payroll/entries.js` is the new screen; `app/(coach)/payroll/index.js` — the old My Entries route — is repurposed as the admin mode picker below, so this isn't a rename, the two files' jobs diverged). A centered date tile at the top (MM-DD-YYYY) flanked by day-step arrows, tap the tile to open a bounded month calendar (forked from `components/nutrition/DateCalendarPicker.js`'s grid math rather than overloading its assign/unassign semantics — this one's semantics are "select an in-range date and close," with dates outside the current pay period disabled and a dot marking dates that already have entries) — dates are freely reopenable, no locking, no page-level Submit. Below: Group/Programs Written are plain +/- counters; Welcome/Strategy use the same counter but tapping the checkmark opens a names popup with N boxes (N = the counter's value); Admin/Ops Hours open an hour:minute stepper (15-minute steps, converted to decimal on save); SPC and Other are independently **repeatable per date** — each Save creates a new row rather than overwriting one, with a small numbered badge (top-right of the tile) opening a list of everything logged so far to review/edit; Custom stays single-per-date.

**Every tile's checkmark is the save action itself** — hollow while a value is uncommitted, tapping it (or, for popup-driven tiles, the popup's own Save button) commits immediately and fills it solid. No bulk "Submit" anywhere; this is what makes free date-reopening possible without a half-saved-state concept. **Superseded 2026-08-11** — the checkmark is now a pure status indicator and a single sticky Submit button per day fills them all in; `upsertCustomForDate` and the Custom tile are gone too. See "Payroll entry: day-level submit, custom pay moved entirely to Requests" below. The `pay_entries`/`partitionDayEntries` data model described in the rest of this paragraph is unchanged. **Data model, and why zero migration was needed for the repeatable SPC/Other case**: `payroll.pay_entries` already allowed one row to hold just the SPC or Other fields with everything else null, and `computeTotals` already summed across however many rows share a date — so "log a second SPC session for the same day" is simply a second row, no schema change, just a different UI flow creating multiple rows instead of one. New `lib/payroll/dayEntries.js` (`upsertCoreEntryFields`/`createSpcSession`/`createOtherItem`/`upsertCustomForDate`, all thin wrappers over the existing `createEntry`/`updateEntry`) and `lib/payroll/calc.js`'s new `partitionDayEntries(rows)` (splits one date's full row set into `{core, spcSessions, otherItems, custom}` by elimination — `core` is whichever row has null `spc_session`/`other_type`/`custom_amt`) are the only new data-access surface this needed. One real schema addition: `strategy_notes text` on `pay_entries`, mirroring the already-existing-but-previously-unused `welcome_notes` column — both now actually get written (newline-joined names) by the Welcome/Strategy popups.

**Visual**: `lib/theme.js` gained `colors.canvas = "#faf8f6"` (a real token now, not just an inline hex repeated in bottom sheets) as the background on every payroll screen. Tiles are soft peach (`#fdf6f2`/`#f0ddd2` border) while unconfirmed, sage (`#eef1e7`/`#4d6142` border) once confirmed — reusing the app's own existing peach-card and `statusColors.onTrack` tones, not new colors, per explicit "soft, matching" feedback. The checkmark itself is the exact round olive icon already shipped on My Fitness's exercise-completion cards, repositioned to half-overlap the tile's bottom edge — this needed its own small white circular backdrop behind the icon (`components/payroll/PayrollTile.js`'s `TileCheckmark`), or the tile's own border line visibly cut straight through the middle of it, caught and fixed from direct feedback ("looks ugly... needs to be behind the checkmark"). Finalize was originally a small link in the header; moved to a full-width button at the bottom of the tile grid per direct ask ("its weird where it is").

**Admin gets a fully separate mode**, not a 5th tab mixed into the staff view — landing on `/(coach)/payroll` as an admin now shows a Staff View / Admin View picker (`app/(coach)/payroll/index.js`); Staff View is the identical 4-tab experience any coach gets (My Entries/Requests/1:1 Nutrition/Report — an admin logs their own hours the same way). Admin View is a new route tree (`app/(coach)/payroll/admin/`) with its own tab bar (`components/AdminPayrollTabBar.js`): Requests/Pay Periods/Report/Settings. This is why the old admin "All employees" section bolted onto the bottom of the staff Report tab is gone — it fully duplicated what Admin View's own Report tab now does, and having both was exactly the "my report and the staff report on the same page" the ask was to eliminate. **`app/(coach)/payroll/periods.js` is deleted** — its finalize-status-list/close-button content moved to `admin/periods.js`, its rate-editing content moved to a new `admin/settings.js`.

**Closing a period now does real audit work, not just a boolean flip.** Before closing, it checks `listPendingRequestsForPeriod` — any pending custom request blocks the close outright (a hard stop, distinct from the pre-existing "N coaches haven't finalized" warning, which stays override-able). On successful close: computes Owner Pay (sum of admin-role entries) and Staff Pay (everyone else) via the existing `computeTotalsByStaff`, stores both on the period row, auto-downloads a CSV of every entry (`lib/payroll/csvExport.js` — plain string-building, no new dependency; web-only for v1, native shows a toast pointing at the web admin view since this repo has no `expo-file-system`/`expo-sharing` dependency to build a native download path on), and reveals an inline Taxes Paid field the admin can fill in any time after — the closed-periods list shows Owner/Staff/Taxes plus a live-computed Grand Total, each row expandable into that period's full per-staff report.

**Real design decision: closed periods now permanently freeze their own rates.** `pay_entries` only ever stores raw quantities (`group_sessions=3`) — dollars are always computed live from whatever the *current* rate tables say, which is exactly right for an open period (a rate change should be retroactive within it, confirmed with Terra) but wrong for a closed one, which is supposed to be locked for audit forever. New `payroll.closed_period_rate_snapshots` (one row per period, a full jsonb copy of `core_rates`/`other_rates`/`spc_tiers` captured at close time) plus `lib/payroll/rates.js`'s `getRateMapsForPeriod(periodRow)` — every report screen now routes through this instead of always calling `listAllRates()` live, so a rate edit today can never silently reprice a period that closed last month. This was flagged as a real judgment call before building (a simpler alternative — trust only the stored Owner/Staff totals, let the drill-down recompute live — would've been less plumbing but could visibly disagree with the stored total after a later rate edit) and Terra picked the full-snapshot approach explicitly.

**Rates moved to a dedicated Settings tab** (`admin/settings.js`), off Pay Periods. `core_rates`/`spc_tiers` stay edit-only (both are fixed, CHECK-constrained sets tied 1:1 to specific tiles — adding/removing one doesn't make sense without also changing the entry UI). `other_rates` gets full CRUD: Add (the first real caller of `createOtherRate`, which existed in `lib/payroll/rates.js` since the original build but was dead code until now), Edit, Archive/Restore (the existing `active` column, already filtered correctly everywhere it's read). Every rate save now goes through a new `confirmRateChange()` (`lib/confirmDialog.js`) explaining the retroactive-within-open-period behavior before it commits.

**Report tab** (`components/payroll/PayrollReportPieces.js`'s `CategoryBreakdown`) gained a real drill-down: every category row is now tappable, opening a date-sorted list of every entry that contributed to that total (new `entriesForCategory()` in `calc.js`) — this is also what backs Admin View's per-coach popup on its own Report tab (tapping a coach row opens the same `CategoryBreakdown`, scoped to their entries, nested drill-down included for free since it's the same component). Report also gained its own Finalize button with the **exact required confirmation copy** ("I've reviewed my payroll information and confirm that it's accurate to the best of my knowledge. By clicking Submit Payroll...") — this replaced `confirmFinalizePayroll()`'s previous generic wording in `lib/confirmDialog.js`, so both the Report tab's button and the pre-existing My Entries header entry point (kept, funnels through the same modal) show identical copy.

**1:1 Nutrition's add-client flow rebuilt** — the old client-picker `<select>`/pill-row was "hard to make work" per direct feedback. Now every one of a coach's nutrition clients without a billing day assigned just shows up as a plain row (name / day input / checkbox) at the top of the page; checking the box with a valid day commits immediately and the client drops into the existing assigned-roster list below, unchanged. No picker at all.

**Real native-only bug found and fixed the same day, from actual dev-server use**: the "Other" type field's native fallback (RN has no `<select>`) was a wrapping pill row of all 19 `other_rates` types — reported back as "terrible" once actually seen on the mobile dev server. Swapped for a tap-to-open modal list (`components/NativePickerField.js`, **extracted** from a near-identical local component already living in `app/(coach)/announcements/index.js`'s date/time pickers — that file now imports the shared version instead of duplicating it) — same interaction the announcement scheduler already used, just reused instead of reinvented.

**Also wires up `can_log_ops_hours`** in Settings → Team as a real toggle — the column and its gating logic existed since the original build (`0036`), but had no admin-facing UI to change it at all, same gap the original section's own text flagged. Same shape as the other three module toggles (`updateCoachPermissions` gained a 4th param, `defaultValue: false` since this one — unlike the other three — defaults off).

**Ops Hours toggle correction, worth remembering**: the Settings → Team toggle array's items now each carry their own `defaultValue` (SPC/Nutrition/Exercise Library still default `true`, matching their DB column defaults; Ops Hours defaults `false`, matching *its* DB column default) — the old code hardcoded `?? true` for every toggle, which would've been silently wrong for this one specifically.

**Migration `0041_payroll_redesign.sql`** (`strategy_notes` on `pay_entries`; `owner_pay`/`staff_pay`/`taxes_paid` on `pay_periods`; new `closed_period_rate_snapshots` table) — **written and committed, not yet run against the live project as of this writing.** Needs the usual SQL Editor run + `NOTIFY pgrst, 'reload schema'` before any of this is live.

**Verification**: `npx expo export -p web` stayed clean after every phase and after every follow-up fix (checkmark backdrop, Finalize placement, tile colors, the NativePickerField swap). The tile grid's visual design (checkmark positioning, solid-state border/badge colors) was actually screenshotted via the same documented technique used elsewhere in this file — temporarily mounting the components on the unauthenticated `login.js` screen with fake data, screenshotting through the Browser pane, reverting immediately after — not just reasoned about from code. **Not verified**: a real end-to-end click-through of the whole flow (multi-session logging, reopening a past date, the admin close/CSV/tax flow, a rate-change edit) — same standing login limitation as everywhere else in this file — and the native picker swap specifically has no simulator/device confirmation this session, worth a real check next time the dev server's in hand.

## One-tap "Refresh now" on announcements, and the nutrition check-in-available notification repointed through it (2026-08-08)

Prompted by a real ops need: Terra shipped a functional change to the nutrition check-in flow and had no way to get PWA users off stale cached JS other than manually texting people (what she used to do before push/announcements existed). Two asks, scoped down in real time mid-build after a first, broader "generic recurring announcements" design was replaced by a much smaller one once Terra clarified what she actually wanted:

**`requires_reload` — a one-tap "Refresh now" button, lives on the Announcements page only.** Migration `0044_announcement_requires_reload.sql` (**run**, confirmed live) adds `programming.announcements.requires_reload` (boolean, default `false`). The compose form (`app/(coach)/announcements/index.js`) gained a checkbox ("Requires a refresh to take effect..."); `createAnnouncement()` (`lib/programming/announcements.js`) passes it straight through. `AnnouncementModal.js` renders a real "Refresh now" (`window.location.reload()`, web-only — a native rebuild can't be pushed by a page reload) plus a lighter "I'll do it later" dismiss-only option, instead of the plain "Got it" button, whenever the flag is set; `AnnouncementChecker.js`'s new `handleRefresh` awaits `acknowledgeAnnouncement()` before reloading (not fire-and-forget — a page reload cancels any in-flight request, so acknowledging first is what stops the same announcement from popping right back up post-reload). History rows show "· Refresh prompt" for past announcements that had it set.

**First design considered and rejected: a brand-new generic "recurring announcement" system** (its own `recurring_announcements` table, a weekday/time picker on the Announcements page, a new `scan-recurring-announcements` Edge Function spawning fresh one-shot rows). Dropped mid-build, before any of it was written, once Terra clarified the actual want: the one recurring case that mattered was the nutrition weekly check-in reminder, which **already** has a day/time/content editor (Settings → Nutrition, from the same day's earlier session) — building a second, parallel scheduling UI for the same concept was redundant. "Makes more sense being there" won.

**So instead: `scan-nutrition-checkin-available` now creates a real `programming.announcements` row (`target_type: "nutrition"`) each time it fires, rather than looping `sendPushToUser` directly.** Settings → Nutrition's day/time/title/body editor is completely untouched — same config, same cron cadence (15-minute poll, same idempotency-guard pattern as before). What changed is delivery: it gets the same in-app popup every other announcement gets (not just a push banner easy to miss) and a real entry in the Announcements page's History, for free, with zero new scheduling UI. The announcement row's `pushed_at` is stamped immediately at insert time (not left null) so `scan-announcements`' own 15-minute poll doesn't also try to push it a second time. The existing per-client `notify_checkin_available` opt-out is preserved exactly as before — it still only gates the push loop, not the announcement row itself, so an opted-out client still sees the in-app popup (an announcement's audience is deliberately "everyone active in that program," it has no known opt-out concept), just doesn't get pushed. **One small, known behavior widening worth remembering**: the old push loop excluded clients still mid-onboarding (`objective_tracking_approved_at is null`); the announcement's own audience match (`target_type: "nutrition"` → `public.clients.status === "active"`) has no equivalent onboarding filter, so a mid-onboarding client will now also see the in-app "check-in available" popup even though they have nothing to check in yet. Low-stakes, not fixed this session.

**Deployed live this session** (Supabase CLI authenticated): `0044` run and confirmed via schema query; `scan-nutrition-checkin-available` redeployed with `--no-verify-jwt`, confirmed still `verify_jwt: false` afterward (redeploying without the flag would silently re-enable JWT verification and break the cron trigger — checked, not assumed, same as prior sessions' own note about this). Did **not** test-fire the function directly — doing so risked a real push/announcement to real nutrition clients depending on today's configured send window, and this app's standing rule is no real client-facing sends without an explicit ask for that specific test.

**Not visually verified** — same standing login limitation as everywhere else in this file; `npx expo export -p web` stayed clean throughout. Worth a real click-through next time: the compose checkbox, the popup's Refresh-now/I'll-do-it-later pair actually reloading vs. dismissing, and confirming the next nutrition check-in-available firing shows up as a real popup + History row rather than just a push.

## Payroll polish pass: static tile heights, SPC/Other delete, Other field config, Finalize moved off My Entries, messaging-flicker fix (2026-08-08, later same day)

Real click-through feedback on the payroll redesign from the section above, plus one unrelated messaging bug spotted in the same pass:

- **Tile misalignment, root cause was "static size" all along**: `PayrollTile.js` used `minHeight: 108` — fine for a single tile, but two tiles side by side (Group/SPC, Welcome/Strategy, Admin/Ops) with genuinely different content heights (SPC's label+button+caption is taller than Group's label+counter) rendered at different actual heights via RN's row-stretch layout, so each tile's own `TileCheckmark` (pinned to *that tile's own* bottom edge) landed at a different vertical position — the exact bug in the screenshot. Fixed by replacing `minHeight` with a real exported `TILE_HEIGHT = 136` constant and a `height` prop (default `TILE_HEIGHT`, overridable — `PayrollCustomRow` passes `height={80}` for its shorter single-row tile) — confirmed by temporarily mounting two tiles on the unauthenticated `login.js` screen (reverted after) and screenshotting: checkmarks now line up exactly.
- **SPC (and Other) sessions are independently repeatable per date with no +/- counter to "delete by decrementing"** — there was genuinely no way to remove one. `EntryListPopup` (the badge-count "logged so far" list, shared by SPC and Other) gained a trash icon per row wired to the pre-existing-but-unused `deleteEntry`/`deleteDayEntry` (`lib/payroll/entries.js`/`dayEntries.js` — the function existed, nothing called it), behind a new `confirmDeletePayrollEntry()` in `lib/confirmDialog.js`. Also added a lighter "Delete this session/item" text button directly inside `SpcSessionPopup`/`OtherItemPopup`'s own edit view (new `SheetDeleteButton` in `PayrollBottomSheet.js`) so deleting doesn't require backing out to the list first.
- **Programs Written now matches Welcome/Strategy's names-popup pattern** — its checkmark used to just save the raw count with no names captured at all. Now opens the same `NamesListPopup` (one name box per unit counted), written to `pay_entries.program_notes` — a column that already existed in the `0036` schema (mirroring `welcome_notes`/`strategy_notes`) but was dead/unused until now.
- **"Other" line items: removed the pay rate from the type dropdown** (`PayrollOtherRow.js` — both the web `<select>` and native `NativePickerField` options used to show `"Type ($X.XX/unit)"`) per direct ask: a staff member can already see rates on their own Report tab, repeating them on the entry form was noise. **New per-type Quantity/Notes toggles** — migration `0045_other_rate_field_config.sql` (**not yet run**) adds `payroll.other_rates.has_qty`/`has_notes` (both default `true`, so every existing type keeps behaving exactly as before until an admin explicitly turns one off). Editable from two new inline checkboxes per row on Payroll → Admin → Settings' Other section (`FieldToggle` in `admin/settings.js`). `OtherItemPopup` now reads the matching `other_rates` row (passed in as a new `config` prop from `entries.js`, matched by `other_type`) and conditionally renders the Quantity field / Notes field — a type with `has_qty: false` always saves `qty: 1` without ever showing the field.
- **Custom tile's empty-state copy**: "Tap to add a custom amount" → "Tap to add a custom payroll request", per direct ask. (**Superseded 2026-08-11** — the Custom tile is deleted entirely; custom pay lives only on Requests now.)
- **Real functional bug: the "Finalize" button on My Entries actually finalized (locked) the pay period** — Terra's own words, "I was thinking that button was more of a save button." Every tile already autosaves the instant its own checkmark is tapped, so there was never anything left to "save" at the page level — removed the button and its `FinalizeModal` entirely from `entries.js` (replaced with a plain line pointing at the Report tab), leaving Finalize exclusively on the Report page's own already-existing Finalize button (`report.js`/`report.web.js`, unchanged) — which is what Terra explicitly wants: a coach has to look at the full period breakdown before finalizing, not just tap a button from the daily entry screen. **Deliberately did not add** the page-level "turns the whole background muted olive" save-confirmation Terra floated mid-message — she hedged it herself ("that might look weird though") and every tile already gives its own per-item olive-border/checkmark confirmation the instant it saves, which already covers "some sort of visual cue that says we got it." Worth revisiting if she still wants a page-wide cue after seeing this.
- **Unrelated but caught in the same pass: the "Messages" nav item flashed in and then disappeared on every single page load whenever an admin had messaging turned off.** Root cause: `CoachShell.js`'s sidebar/drawer and `app/(coach)/more.js`'s native row both defaulted `messagingEnabled` to `true` (intentionally, to avoid a flash for the common enabled case) and flipped to the real value once `getMessagingSettings()` resolved — but since `CoachShell` remounts fresh on every web page navigation, that meant the nav item genuinely appeared then vanished on every page load for anyone with it off, exactly as reported ("driving me nuts"). Fixed by defaulting both to `false` instead — same "hidden until confirmed" convention `FloatingMessageBubble`/`CoachMessageBubble`/My Week's own header chat icon already use. The one-off `app/(coach)/messages/index.js` route (shown only if the nav item's own link is followed, or a stale bookmark) still defaults `true` for its "off" message — left as-is since it's not reachable via a hidden nav item and wasn't the reported symptom.

**Verification**: `npx expo export -p web` clean (zero errors) after every change. Tile alignment fix was visually confirmed via a real screenshot (the login-screen mounting technique documented elsewhere in this file), not just reasoned about. Everything else is bundle-checked only — same standing login limitation as everywhere else in this file; worth a real click-through of the SPC/Other delete flow, the Programs Written names popup, the Other field-config toggles, and confirming the messaging nav item no longer flickers once `0045` is run.

**Same-day follow-up, two more rounds of direct feedback on this pass:**

- **Report tab's per-category drill-down now shows notes, if any were logged.** Tapping a category (Group, Strategy, Programs, SPC, Other, etc.) already opened a popup listing every date/quantity that summed to that total — it just never surfaced whichever free-text note was attached (client names for Welcome/Strategy/Programs, who-attended for SPC, a free note for Other). `lib/payroll/calc.js`'s `entriesForCategory()` gained a `CATEGORY_NOTES_FIELD` lookup (`strategy_notes`/`program_notes`/`welcome_notes`/`spc_notes`/`notes` respectively — Group/Admin/Ops have no notes concept at all, and Custom already shows its one text field as the row's own label, so neither needed an entry) and now returns each drill item's `notes` alongside its existing `quantityLabel`; `PayrollReportPieces.js`'s `CategoryBreakdown` renders it as a small italic line under the quantity, when present. **This carries over to Admin View's Report tab for free** — its per-coach drill-down (`admin/report.js`/`.web.js`) renders the exact same `CategoryBreakdown` component scoped to that coach's entries, so no separate change was needed there, confirmed by checking both files import it.
- **"Other" reworked again, per direct follow-up that the has_qty/has_notes split from the section above still felt off for quantity specifically**: "if there is a quantity its confusing... maybe to keep it the same [as notes]. If there is a qty then it appears and you can put it in. for notes, lets wait for the check box." So Quantity and Notes now genuinely diverge in interaction, not just in which fields a shared popup shows: `PayrollOtherRow.js` itself now grows an inline Quantity field (a plain `TextInput`, no popup) the instant a type with `has_qty` is picked from the dropdown — no waiting on anything. Notes are untouched: tapping the checkmark still opens `OtherItemPopup`, same as before, but **only if that type has notes configured at all** — a type with `has_qty` true and `has_notes` false now saves immediately on the checkmark tap with zero popup, since there'd be nothing left for a popup to collect once quantity's already been typed inline. `entries.js`'s new `handleConfirmOtherRow(type, qty)` is what makes that call (direct `createOtherItem` for no-notes types, `setOtherPopup({..., qty})` to still collect notes otherwise); `OtherItemPopup` gained a `hideQtyField` prop (true only for this brand-new-item-from-the-row flow, since the qty was already collected before the popup ever opens — editing an existing item via the list still shows the Quantity field there as before, since that flow has no inline field of its own to have already collected it). Visually confirmed via the login-screen mounting technique: selecting a has_qty/no-notes type shows the inline field and a console-logged direct confirm with the typed quantity; selecting a no-qty type shows no inline field at all.

## Ship-readiness audit pass (2026-08-09)

Full-app sweep per direct ask ("overall check... excess code... efficiencize... missed buttons... ready to ship"), run as three parallel audit agents (dead code / interactive wiring / efficiency-consistency) plus a live check of migrations, Edge Function deployments, and the original build plan. The good news first: **no orphaned handlers (the handleAddWarmup class of bug is gone), no buttons without onPress, no Alert.alert stragglers, no console.log/TODO debug leftovers, no dead files, no misplaced components in app/, no invalid Tailwind fractional spacing, and zero remaining `StyleSheet.absoluteFillObject` usages.** All 16 Edge Functions deployed with correct verify_jwt flags; migration ledger above corrected (0014/0020/0041/0045/0046 were all already live despite stale "not yet run" notes).

**Real bugs found and fixed:**
- **All three drag-to-reorder lib functions (`reorderWorkoutExercises`/`reorderSpcWorkoutExercises`/`reorderTemplateExercises`) never checked the Supabase error** — their `Promise.all` over per-row updates discarded each result, so the already-written `.catch(toastError)` handlers in all three web builders were dead branches: a failed reorder (RLS/offline) looked like success and silently reverted on next load. Each now throws on any row error.
- **The native SPC template editor (`app/(coach)/spc/templates/[templateId].js`) had zero error handling** — missed by the Round-2 toast sweep that hardened its `.web.js` sibling. All five write handlers now toast on failure, and the two optimistic deletes (exercise/warm-up) roll their row back into local state instead of leaving a phantom-deleted row. Its `adjustSets`/reps writes still don't maintain `rep_scheme` the way the web sibling does — **deliberately left alone**, that's the separate 0029/0030 session's active territory.
- **`CommentThread`'s post had try/finally with no catch** — a failed coach note showed nothing. Now toasts.
- **`checkAndAutoDraft()` was a serial per-client N+1** (`getLatestSpcBlock` in a loop) running on every SPC-dashboard *and* coach-Home load — now one batched `spc_blocks` query with the same newest-first/first-match semantics.
- **Stale-data fixes**: `more.js`'s messaging-toggle check, `clients/[userId].js`'s whole load, member `settings.js`'s assigned-coach fetch, and both payroll Report tabs' finalization/lock fetch all moved from mount-only `useEffect` to `useFocusEffect` (all are kept-mounted Tabs children; the payroll one additionally never re-ran because `useOwnReport` restores the same `selectedPeriod` on refocus).
- **Blast-radius isolation**: `clients/[userId].js` no longer blankets SPC+Nutrition+programming in one `Promise.all` — SPC/Nutrition now fetch via `allSettled` with a per-card inline error, and the enrollment `Switch` is *withheld* on error (a silently-null row would read "Not enrolled" and invite a wrong re-enroll toggle). `nutrition/clients/[userId].js`'s 10-way `Promise.all` split the same way: render-gating fetches stay strict, display-only ones (focus items, photos, check-in timeline, OT logs) are isolated.

**Excess code removed** (each verified 0 references before deletion): dead exports `listSpcClients`, `listRequestsForPeriod`, `listEntriesForDate`, `listPhotosByAngle`, `getPhotoSignedUrl` (singular), `setPhotoFrequency`/`clearPhotoFrequency`, `getNextIncompleteSpcWorkout`; 16 unused imports across 12 files; `PayrollTabBar`'s dead `t.adminOnly` filter (no tab defines that key). **Deliberately kept**: `lib/supabase/client.js`'s inert `nutrition` schema handle, `components/NumericInputAccessory.js` (documented no-op, 27 files still pass its ID harmlessly), `unsubscribeFromWebPush` (inverse of a live API — there's no UI to turn web push off yet, a real gap worth a Settings toggle someday), and `EXERCISE_TYPES` (the exercise-library area is the parallel 0029/0030 session's workspace).

**Known duplication, flagged not consolidated** (each copy works; merging them is churn with real divergence risk mid-parallel-session): `addDays` ×5 and `daysBetween` ×5 across lib files — the `daysBetween` copies have *three different* rounding/offset semantics (`Math.round` vs `Math.floor`, one `+1`), so any future consolidation must check each call site's intent, not just dedupe; calendar-grid math duplicated between `DateCalendarPicker`/`PayrollDatePicker`; `stripGroups`/tab-bar shells ×3; a few small formatters (`fmt` ×3 with different rounding, `pct` ×2, `groupByExercise` ×2, `extractFunctionErrorMessage` ×2, `snapshotStaff` ×2).

**Flagged for Terra, not built** (feature gaps, not cleanup): native SPC template editor has no "+ New exercise" (web does — native can attach but not create); native nutrition roster has no coach filter (web does, and native *SPC* does, so nutrition is the odd one out); `app/support.js` has no in-app entry point or back link (fine if it's only the App Store support URL); unused deps `expo-crypto`/`expo-linking`/`@expo/ngrok` could be dropped from package.json but weren't (npm reinstall fragility documented above isn't worth the risk for zero runtime benefit); Exercise Library renders unvirtualized (`ScrollView` + `.map`) — fine at current library size, worth a `FlatList` if it ever feels slow.

Verified: `npx expo export -p web` clean (zero errors/warnings) after all edits, and zero remaining references to every deleted export. **Not visually verified** — standing login limitation; the touched screens (client detail, payroll reports, native template editor, More tab) are worth a quick click-through.

## GHL contact collision silently breaks registration (2026-08-09)

Real report: re-importing `dsmout3@gmail.com` via the GHL "won" webhook appeared to work, but Register never texted a code. Diagnosed live (authenticated Supabase CLI) — **the webhook half genuinely did work; the failure was entirely in the second write.**

`import-client` does two writes: `auth.admin.createUser`, then an upsert onto `core.users` carrying `ghl_contact_id`. The auth row was created fine. The `core.users` upsert then failed with a unique violation — `core.users.ghl_contact_id` is `UNIQUE` (migration 0026), and the contact GHL sent (`Y5bLtvYia5p7cF86alWt`, which *is* dsmout3@gmail.com's own GHL contact) was already sitting on `dustin@kovastrength.com`'s row from the 2026-08-08 tie-in. So the function 500'd, **GHL's webhook action surfaces nothing on a non-2xx**, and the result was an `auth.users` row with no matching `core.users` row at all.

That orphan state is exactly what makes the symptom confusing: `request-registration-code` looks the member up in `core.users` by email, finds nothing, and — deliberately, for email-enumeration reasons — returns a uniform `{sent:true}` with no text sent and no error. **A silent "no code arrived" on Register almost always means no `core.users` row (or no `ghl_contact_id` on it), not an SMS/GHL problem** — check that before touching GHL scopes or the Conversations API.

Fixed by moving the contact per Terra's call: cleared `ghl_contact_id` off `dustin@kovastrength.com`, inserted the missing `core.users` row for `dsmout3@gmail.com` (role `member`) holding the contact. **Consequence, accepted deliberately**: `book-checkin-session` is the only thing that reads a caller's own `ghl_contact_id`, so `dustin@kovastrength.com` can no longer book a Zoom check-in through the nutrition flow. `notify-review-signin` is unaffected — it hardcodes the same id as a literal (`TERRA_GHL_CONTACT_ID`), it does not read the DB.

**Two real gaps this exposed, neither fixed (not asked for):** (1) `import-client` has no handling for a `ghl_contact_id` collision — it just 500s into a void, and since GHL doesn't surface that, every future collision will look like a successful import. Options if it ever comes up: retry the upsert without the contact id so at least a usable `core.users` row lands, or return 200 with a warning payload so GHL's log isn't blank. (2) Nothing in the app flags an `auth.users` row with no `core.users` row — an account in that state can't register, can't be found by the Clients list, and is invisible everywhere.

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

## Legacy Google Sheets tracker photo import + two onboarding bugs it exposed (2026-08-09)

Terra's pre-Kova nutrition clients each had a Google Sheets "tracker" (`tsmout1@gmail.com` Drive → `My Drive/Nutrition/Trackers_Macros`) holding their progress photos. **282 photos across 9 clients** were imported into the live `public.photos` table + `photos` storage bucket: Abbi Stauffer (9), Abby Thompson (24), Ashley Curry (50), Banesa Getsinger (2), Bonnie Horsburgh (42), Michelle Dodge (39), Rae Karanjia (17), Rita Cabrera (63), Roxy Franco (36). No schema change — this is pure data.

**How the trackers actually store photos** (worth knowing if more get imported — Lauren Bottelberghe's archived tracker and Terra's own were deliberately skipped):
- Google-native files never sync as real files through Drive for Desktop, and "make available offline" doesn't change that — a `.gsheet` is a 172-byte JSON stub containing `doc_id`. Read the stub to get the id.
- Export via `https://docs.google.com/spreadsheets/d/<id>/export?format=xlsx`. **These sheets are link-accessible with no auth at all** — plain `curl` works. That's convenient here and also a real privacy exposure (client progress photos reachable by URL); flagged to Terra, not yet tightened.
- Photos live on a `Progress Pics` sheet: column A = date, columns B/C/D = **Front/Back/Side** (that order, not front/side/back). Images export as `oneCellAnchor` entries in `xl/drawings/drawingN.xml` with exact `<xdr:col>`/`<xdr:row>` and **zero offsets**, so date+angle is an exact cell lookup, not an inference. Map worksheet → drawing via `xl/worksheets/_rels/sheetN.xml.rels`.
- Date cells are messy: Excel serials, `m/d/yy`, and text with weight notes appended (`10/12/25 | 154lb`, `8/14/25 est ~280`). Guard serials to a sane range — Banesa's sheet had a corrupt `6685457` (≈ year 20200), whose 3 photos were skipped rather than guessed at.
- **Always diff on `(client_id, date, angle)` before inserting.** These clients also use the standalone Nutrition Tracker app, which writes to this same `public.photos` table — 88 photos were already present and correctly skipped, including Banesa, who turned out to be 82/84 already migrated.

**`supabase storage` CLI gotchas, both hit for real**: it works off the logged-in CLI session (no service-role key needed) but requires `--experimental`. **`cp -r src ss:///photos/<id>` nests as `<id>/<id>/…` when the destination prefix already exists** — it does not merge, and it reports success either way; upload file-by-file with explicit destinations instead. **`rm` cannot delete at all** — it returns `{"deleted":[]}` with no error even for a file uploaded seconds earlier with the same credentials, so storage deletion has to happen through the Supabase dashboard.

**Two real bugs the import exposed, both fixed** — the import was the trigger, but neither was caused by bad import data:
- **`lib/nutrition/onboarding.js`** — `getOnboardingStatus` and `getOnboardingPhasesForClients` both asked *"does this client have any complete front/side/back set, ever?"* with no date scoping, so Abbi's 2023-2025 historical sets marked her Starting Photos phase complete while she was still mid-onboarding having taken none. New exported `photosSinceEngagement(photos, client)` scopes to photos dated on/after the client's `start_date`, falling back to the client row's `created_at`, then to no filtering if neither is set — so it can never hide a legitimate photo. **Anchored on `start_date` rather than `onboarding_sent_at` deliberately**: it's the earlier of the two, so a client who shoots their photos before the coach gets around to hitting Send still counts.
- **`app/(coach)/nutrition/clients/[userId]/onboarding/photos.js`** — a genuinely separate bug the first fix did *not* solve. That screen never reads the phase flag; it computes its own starting set as "the earliest date among all photos on file," so Abbi's oldest imported set still rendered as her starting photos. Now reuses the same `photosSinceEngagement()` so both paths share one definition, then takes the earliest date within the engagement. Also fixed a latent crash in the same file — the `loadError` Retry button used `Pressable` without importing it, so the error path would have thrown instead of offering a retry. **Lesson worth generalizing**: a "phase complete" flag and the screen that displays that phase's content can compute the same concept independently — fixing one doesn't fix the other, so grep for the concept, not just the flag.

Verified by SQL simulation across every not-yet-approved active client (only Abbi's phase changes, the other four are untouched) plus a clean `npx expo export -p web`. **Not click-tested** — standing login limitation.

## Settings → Program Defaults was writing to every core.settings row (2026-08-09)

Reported as "it's a mess" visually; turned out to be a real data-corruption bug underneath. `app/(coach)/settings.js`'s Program Defaults tab rendered `getSettings()`'s output directly — and `getSettings()` returns **every** row in `core.settings`, which is the generic key/value table shared by every admin setting in the app (messaging kill switch, payroll deadline/anchor date, specialty bars, the nutrition check-in notification's title/body/weekday/time, `notify_*` toggles). All 15 live rows rendered as single-line numeric `TextInput`s, so the tab showed raw keys, `specialty_bars` as `"[object Object]"`, and the check-in notification's multi-paragraph body squeezed into a number field.

**The save was the real problem**: `handleSaveAll` mapped over the same unfiltered list and wrote all 15 back through `Number(...)`-or-fall-back-to-string. Confirmed against the live table what that would have done — `specialty_bars` (jsonb array) → the string `"[object Object]"`, wiping the specialty-bar list the weight calculator reads; `messaging_enabled: false` → the **string** `"false"`, which is truthy, silently re-enabling messaging gym-wide; `notify_payroll_deadline_reminders` → a string instead of a boolean.

Fixed with an explicit `PROGRAM_DEFAULTS` whitelist (the 4 block-length/alert-lead-time keys this tab is actually for) driving both the render and the save — every other `core.settings` key is edited from the tab that understands it. Also: whole-number validation before saving (it was writing arbitrary strings into columns the rest of the app does arithmetic on), unit shown as a suffix beside each field instead of buried in the label, a line noting changes only affect future blocks, a documented per-key fallback so a key with no row yet shows its real default rather than blank, and a single-column layout below 768 (same breakpoint `CoachShell` uses).

**General lesson**: `core.settings` is a shared bag, not one feature's table — never render or write it wholesale. Any new settings surface should whitelist its own keys explicitly.

Also removed the SPC subtitle ("Your individual strength program") from My Week's SPC card per direct ask — added during the 2026-08-09 UX overhaul's Phase 4, unwanted. `ProgramCard`'s now-unused `subtitle` prop went with it. Screenshot-verified the rebuilt defaults card at desktop and mobile widths via the login-screen mount technique; `npx expo export -p web` clean.

## Deep-link 404s on refresh, the nagging update prompt, builder contrast (2026-08-09, later)

Five reports in one message, two of which needed real diagnosis rather than a UI change.

**Refreshing a deep URL 404'd** — e.g. `/clients/<uuid>`. Confirmed live with a plain `curl` against `app.kovastrength.com` before touching anything (`200` for `/clients`, `404` for `/clients/<uuid>`). Root cause: Expo's static web export writes a dynamic route to a file named **literally** `dist/clients/[userId].html`, and Vercel serves static files — no request path ever matches that name. Client-side navigation always worked because the router never asked the server; only a hard refresh/direct-link hit it. Fixed with explicit `rewrites` in `vercel.json`, one per dynamic route (11 of them, plus a `:step` rule covering the four `nutrition/clients/[userId]/onboarding/*` pages). Destinations keep the literal brackets (`/clients/[userId]`, not `.html`) because `cleanUrls: true` is what maps extensionless→`.html`, and a `.html` destination would collide with cleanUrls' own `.html`→extensionless redirect. **Vercel's routing order is redirects → filesystem → rewrites**, so these are a pure fallback and can't shadow a real static file — that's why `/spc/templates` still resolves to its own index rather than being eaten by the `/spc/:userId` rule. Re-enumerate with `find dist -name "*[[]*.html" | grep -v "^dist/("` and add a rule if a new dynamic route ever appears; nothing fails loudly if you forget, it just 404s on refresh.

**"The webapp constantly asks for a refresh"** — that's `components/AppUpdateChecker.js` (the stale-tab detector) working *correctly* and being unbearable about it. During a heavy-deploy stretch every prompt is a true positive, so the fix was quieting it, not making detection smarter: it had **no dismiss at all** (only a "Refresh" button, so it re-raised on every tab-return until you gave in), and — the "randomly asking" half — it called `window.location.reload()` **on its own** whenever the tab was backgrounded with the banner up, silently discarding anything half-typed. Now: a compact dismissible pill instead of a full-width bar, an ✕ that suppresses that specific script-src for good in that tab (a *newer* deploy still gets one prompt), no self-initiated reload ever, and a 15-minute poll instead of 5. **General lesson**: for a background nag, "is the signal accurate" and "is the interruption warranted" are separate questions — this one was 100% accurate and still wrong.

**Builder contrast + library filter** — every lift row in the group and SPC web builders now carries a 2px warm border (`#dcc9bf`) instead of a 1px `stone-200` hairline, with full terracotta + a `#fdf6f2` fill for superset members. New `components/SupersetConnector.js` replaces the 10px grey "+" glyph between rows with a real 26px circle, and it does double duty: white circle + `add` icon when unlinked, filled terracotta + `link` icon **plus a vertical spine** when linked (tap to unlink). The spine needs negative `top`/`bottom` to overhang the connector's own box — sized flush to the gap it's entirely hidden behind the circle, which is how the first version shipped and looked like nothing.

**New shared `components/ExerciseLibrarySidebar.js`** — all three web builders (group, SPC, SPC templates) had their own near-identical copy of the library column; extracted so the new grouping toggle lives in one place (net −642/+174 lines across the three). Adds a **Muscle group / Movement** toggle, section headers as real bordered rows with an item count and an 18px Ionicons chevron (the old `▸` was ~10px and unreadable), and **every section collapsed by default**. Anything with no value for the active grouping lands in a trailing "no movement pattern" bucket rather than silently vanishing — `movement_pattern` is optional on the exercise form, so that was a real disappearing-exercise risk, not a hypothetical.

**Real bug caught only by actually clicking it**: the first "all collapsed by default" implementation used a `null` sentinel for "never touched" and derived collapsed-ness from it. First click on any header created a Set containing just that key — which **collapsed the one you clicked and expanded every other section**. Rewritten to track the *expanded* set instead, so "all closed" is just an empty Set and no seeding from a bucket list (which changes when the grouping toggle flips) is needed. Verified via the standard login-screen-mount technique.

**Archived exercises showed up as pickable parents** in `ExerciseFormModal`'s "Variation of" dropdown. `app/(coach)/exercises/index.js` deliberately loads with `includeArchived: true` so its own "Show archived" toggle has something to show, and hands that same unfiltered list to the modal as `allExercises` — `parentOptions` filtered on type and parent-less-ness but never `is_active`. Also added a pinned ✕ in the modal's top-right corner (a sibling of the `ScrollView`, not inside it, so it doesn't scroll away), per direct ask.

**Not visually verified**: anything inside a real builder against real data — same standing login limitation as everywhere else in this file. The sidebar, connector, row borders, modal ✕ and the archived-parent filter were all screenshot/DOM-verified in isolation, and `npx expo export -p web` is clean. The `vercel.json` rewrites specifically **cannot** be verified without a deploy — worth a real refresh on a deep URL as soon as this ships.

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

## Nutrition coach-side pass: reorder, calories, photo scheduling, plan phases (2026-08-11)

Six asks from real coach use, plus one real bug found while investigating them.

**Shared reorder mechanism, built once and used three times.** New
`components/SortableList.js` + `.web.js` — `@dnd-kit` drag on web (the builders'
proven pattern: 4px activation distance so rows stay clickable, `pointerWithin`,
a *separate* small `⠿` handle rather than a whole-row drag), `▲`/`▼` on native
(`QuestionListEditor`'s pattern), one API: `renderItem(item, controls)` where
`controls` is a ready-made node the caller drops into its own row. **Nested
`DndContext` works** — verified by driving both an inner (phase items) and outer
(whole phases) drag in the same tree. Focus items got it via new
`reorderFocusItems` (`public.focus_items.position` already existed — verified live
as `integer NOT NULL`, no migration); `FocusChecklist` had to gain local state
mirrored from props, since it was purely controlled and a drop would visibly snap
back while the parent's full refetch resolved.

**Calories.** The Targets-tab modal already had them; the screen actually missing
them was the onboarding Tracking page (`onboarding/tracking.js`). Four files were
hand-rolling `4/4/9` — all collapsed onto `deriveCalories`. Week summary
(`WeekList`) gained **Weight, Calories, Protein, …** (Terra corrected the order
mid-session — calories second, not first) plus **Quality** after Sleep.
`sleep_quality` was already averaged by `summarizeWeek` and simply absent from
`METRIC_COLUMNS`; calories are stamped onto each day inside `summarizeWeek` via new
`loggedCalories` (distinguishes "logged nothing" from "logged zero", so a
weight-only row shows `—` instead of `0` and doesn't drag the average down).
`WeekDayTable` was dead (imported nowhere) and was deleted rather than left to drift.

**Real bug found and fixed first: a late check-in submitted *with* photos rendered
"⚠ Photos missing" to the coach.** The same requirement was evaluated against two
different windows — the coach filtered strictly to `week.start..week.end`, the
member gated on a rolling `today − 5 days`. That rolling window was never as
generous as it looked: a week only becomes current once it's over, so `today − 5`
could never reach back before `week.start`; it only clipped the week's own first
days while letting post-week photos count. By Saturday it had **zero overlap** with
the week being checked in on, so the client couldn't satisfy the gate with any
photo from that week, uploaded one dated after it, passed both member and submit
gates — and the coach's row then said photos were missing. New
`photosForRequirementWeek(photos, week)` in `photos.js` is now the single
definition, bounded `week.start … week.end + 6` (the covered week plus the filing
window it stays current for), used by the coach timeline, both member gates and the
server-side submit gate. The coach-reopened path is deliberately *not* routed
through it — it's filed long after its grace period and has its own documented rule.

**Photo scheduling reworked around "pick the Monday."** Coaches think in **check-in
Mondays** (the Monday they review it); everything stored is keyed to the Monday that
*starts* the covered week, 7 days earlier. New `checkinMondayForWeek` /
`weekStartForCheckinMonday` / `mondayOnOrAfter` in `weekCycle.js` convert **at UI
boundaries only** — nothing stored moves, so all five `isPhotoRequirementWeek` call
sites were untouched. The raw `YYYY-MM-DD` text field and its two quick-fills are
replaced by new `components/nutrition/MondayPicker.js`: a Monday-only month grid
(non-Mondays inert) that **dots every Monday the cadence will land on**, so the
resulting schedule is visible while picking. The one-off extra week moved into the
same picker, so `CheckinWeekTimeline`'s per-row "+ Require photos" is gone — with a
single-date column it silently *moved* the flag off whatever week held it.
`requirePhotosNextCheckin`/`clearPhotosNextCheckin` deleted with it. Grid math
extracted to `lib/monthGrid.js`, shared with `DateCalendarPicker`.

**Two corrections worth remembering.** (1) Snapping legacy non-Monday anchors
*backward* to the containing Monday — my first instinct — would have **shifted every
biweekly/monthly client's photo weeks by 7 days**. Forward-snap (first Monday on or
after) is provably a no-op for `floor((week − anchor)/7)`, so `mondayOnOrAfter` runs
on the picker's **read path** and no data migration was needed. (2) `formatDateMDY`
emits dashes, not slashes. Both verified by a real Node arithmetic run, not reasoning:
round-trip exactness, the picked Monday genuinely being the first required check-in at
all four cadences, the UI's dots exactly matching `isPhotoRequirementWeek`, and
forward-snap equivalence.

**Relabeling** is exactly two places, changed together because they're reachable from
the same screen: `CheckinWeekTimeline`'s row label and the Check-In tab's week
navigator, both now `MM-DD-YYYY check-in`. **Deliberately not relabeled**: `WeekList`,
member Weekly, `WeeklySnapshot`, and both member check-in labels — those are
calendar-week/daily-log surfaces (a different week series), where a check-in Monday
would be actively wrong.

**Notification** — answering "do we need to change it?": the function inserts **one
shared** announcement row and then loops **individual** pushes, so the photo reminder
is appended to the per-user push body only, for clients who actually owe photos
(`_shared/photoRequirement.ts`, the usual hand-synced client/server duplication;
ports `computeWeekWindows` rather than assuming Sunday, since the send weekday is
configurable). Editable as `nutrition_checkin_available_photo_line` on Settings →
Nutrition. **Known asymmetry**: only the push can be personalized — the in-app popup
keeps the generic body.

**Plan phases** (new) — `programming.nutrition_plan_phases` +
`nutrition_plan_phase_items` (migration `0050`, **run and verified**). Two levels: a
phase (title + optional note) holding bullet items. **Deliberately not dated** per
Terra — `position` *is* the timeline. Named `plan_phases` because "phase" is already
taken by the derived onboarding phases (`PhaseCard`/`computeOnboardingPhases`). Coach
UI is a card on the Dashboard tab beside Milestones (fetched in the page's **tier-3
isolated try/catch**, like milestones/reopens, so an unrun migration can't blank the
page); members see them on the Today card slider as **one "What we're working on" card
per phase, top three only** — stacking several into a single card didn't read at phone
width, so they follow the same one-slide-each shape as the milestone cards below them.
No status/completed flag in v1 — delete to retire.

**Everything about the phase card is edited in place — there is no form modal.** The
first pass used one and Terra rejected it: "+ New phase" now drops a blank card in
with the name field autofocused, and it becomes a real row the moment the name is
filled in (bullets need a `phase_id`, so they only appear once it's real). Title sits
at the very top in `colors.primaryOnWhite`. **Only whole cards drag** — bullets keep a
`position` as stable insertion order but are deliberately not draggable, so a drag is
never ambiguous about what it's moving; `reorderPhaseItems` was deleted with that
decision.

**Two real interaction lessons from this card, worth reusing:** (1) Bullets are added
via a **"+ Add bullet" button that opens a draft input**, not a permanent empty input
at the bottom of the list. The permanent-input version shipped first and Terra
reported it exactly right — "you hit enter, and then it pauses, loses the cursor
focus, and then it appears and you have to click it again": pressing Enter awaited
`addPhaseItem` *and* the parent's full refetch while the input was still mounted. The
draft now closes **before** the await, so nothing sits half-alive waiting on the round
trip. (2) **Enter fires `onSubmitEditing` and then `onBlur` as the field unmounts**, so
every save-on-blur field here guards with a `useRef` flag — not state, since both
handlers run before a `setState` would apply. Without it a single Enter added the
bullet twice.

**Real bug fixed in `TodayCardSlider` while adding those cards — worth knowing, because
the measurement was silently measuring its own output.** The slider sets its height to
the tallest slide measured via `onLayout`, but a flex row stretches children to the
container's cross-axis size by default, so each slide was being handed the ScrollView's
*current* height and `onLayout` reported exactly that straight back. The height could
therefore never grow past its first measurement, clipping any card taller than it — long
coach notes in practice, which is how Terra found it. Fixed with
`contentContainerStyle={{ alignItems: "flex-start" }}` so each slide sizes to its own
content; that one line is load-bearing, not cosmetic. Verified with a long note (height
grows from the 120 floor to the real content height, short cards keep their natural
height). Slide order is now focus → notes → phases → milestones → completed milestones.

`nutrition_plan_phases.label` (an optional free-text timeframe from the first pass) is
**live but no longer written or read** — the inline rework put the title at the very
top and left it no home. Kept rather than dropped: nullable, costs nothing, and it's
exactly the column a "timeframe" field would need if that comes back. Don't assume it
holds anything.

**Also**: `OptionPicker`/`OptionStepper` extracted (three hand-rolled copies of the
web-`<select>`/native-modal picker existed) and used for the new **date dropdown in
"Fix a day's photos"** — previously a bare `‹`/`›` stepper, which with the 282
imported Google-Sheets photos meant dozens of clicks to reach a date. That editor now
tracks the selected *date* rather than an index, and its list runs oldest-first so `‹`
steps back in time.

**Verification**: `npx expo export -p web` clean throughout; `SortableList` (both
drags, and that a row's own checkbox/edit/delete still work alongside the handle),
`MondayPicker` (non-Mondays inert, picking shifts the schedule and stores the anchor 7
days earlier) and `PlanPhases` (one handle per card and none on bullets, inline typing,
"+ Add bullet" opening a focused draft) all driven and screenshotted via the
login-screen harness, reverted after each. Phase-card drag specifically was confirmed
**by Terra in the real app** — the synthetic pointer-event technique reported it as not
working, which is a known-flaky bit of this tooling, not a code fault; trust a real
click-through over it. **Not verified**: the
redeployed Edge Function was never invoked — the smoke test was blocked, and it can't
be exercised without a real Sunday send. Worth a click-through of the settings modal
against a real client, and confirming the next Sunday push carries the photo line for
someone who owes photos and not for someone who doesn't.

## Check-in answer highlighting: three real selection bugs (2026-08-11)

Reported as "we lost our ability to highlight text" on the coach's Check-In tab.
Nothing had actually been removed — `components/nutrition/HighlightableAnswer.web.js`
was intact, correctly resolved as the `.web.js` variant, present in the **deployed**
bundle (checked by curling `app.kovastrength.com`'s real entry bundle and reading the
compiled function, not assuming), and the writes were landing — 8 of 11 rows in the
most recent check-in week had non-null highlights, and `public.checkin_responses`'
coach policy is a plain `is_coach()`, so RLS was never the gate either. Ruling those
four out first is what turned this from "something broke" into "the selection reader
has always had holes." All three fixes are in that one file; no schema, no deploy step.

1. **Releasing the drag past the end of the text did nothing** — the most likely thing
   Terra was actually hitting, and the reason it reads as a total loss rather than a
   quirk. `onMouseUp` was on the answer's own container `View`, but a mouse event fires
   on whatever is under the pointer **when the button is released** — drag across a
   sentence and let go a few pixels past the last word (or drift onto the next line)
   and the release target is the card, not the answer, so the handler never ran at all.
   Now a `document`-level `mouseup` listener; safe because every offset it computes is
   already clamped to this container's own text, so a global listener can't leak into a
   neighbouring answer (verified: a drag past answer 2's last word highlighted only
   answer 2).
2. **Highlighting over an existing highlight wiped it.** A drag starting *and* ending
   inside one already-highlighted `<span>` fires `mouseup` (adds the range) and then
   `click` on that span (removes it) — net effect, the highlight vanished. So the more
   an answer was already marked up, the more highlighting felt broken. A
   `justSelectedRef` set on a completed drag and cleared on the next `mousedown` makes
   the remove-click ignore the click that's merely the tail of a drag. (A drag that
   *crosses* spans never had this — the click event targets the common ancestor, so the
   span's own handler doesn't fire.)
3. **A boundary landing outside the answer bailed instead of clamping.** Starting the
   drag on the question label above, or ending it in the whitespace to the right, put
   one boundary on a neighbouring node and the old all-or-nothing `contains()` check did
   nothing. Now it tests intersection via `compareBoundaryPoints` and clamps the outside
   boundary to `0` / `text.length`.

**`compareBoundaryPoints`' constant names read source-to-this, and I got them backwards
first** — `END_TO_START` compares *this* range's **start** against the source's **end**;
`START_TO_END` compares this range's **end** against the source's **start**. Swapping
them made every in-text drag silently bail, which the harness caught immediately. Worth
re-deriving from the spec rather than from the name if this is ever touched again.

`textOffset` also switched from a hand-rolled `TreeWalker` to measuring a range from the
container's start to the boundary — same result on text nodes (verified: identical
offsets before and after), but it also handles an element-node boundary, which is what a
drag ending on whitespace produces.

**Verified by driving real mouse drags**, not reasoning: the check-in answers section was
mounted on the login screen with the real `CoachShell`/`ScrollView`/`SectionCard`
ancestors (standing harness technique, reverted after) and all four cases exercised with
the browser tool's actual drag — normal drag, release-past-the-end, re-drag inside an
existing highlight, and click-to-remove. `expo export -p web` clean. **Terra confirmed
working in the real app.**

**Still unexplained if it recurs**: no case was ever found where the text wouldn't
*visibly* select at all. If that specific symptom comes back, it's a different problem —
get browser and device before digging, since none of the above would cause it.

## Payroll entry: day-level submit, custom pay moved entirely to Requests (2026-08-11)

Five asks from real use of the tile-based entry screen built in the "Payroll redesign"
section above. The rate formula, `payroll` schema and historical import are untouched;
this is the entry/requests UI and one new table.

**The checkmark stopped being a save button.** It used to be per-tile: tap the checkmark,
that tile writes its row. Now data autosaves as it's entered (counter tiles debounce
~600ms after the last +/- tap; the popup-driven tiles still save on their own Save), and
**every checkmark stays hollow until one sticky Submit button at the bottom of the page
fills them all in at once**. The three states are now uniform across the whole screen:
`none` = nothing entered, `hollow` = entered and saved, `solid` = the day has been
submitted. Editing anything on a day that was already submitted clears the submission
again, so a solid checkmark always describes exactly what's saved *right now* rather than
"something here was submitted at some point."

**New `payroll.day_submissions`** (migration `0051`, **run and verified live** — table,
both FKs, `unique (user_id, entry_date)`, all 4 policies, grants, and a real REST call
returning `200 []` rather than PGRST205). One row per (coach, date); its presence is the
whole signal. Deliberately leaner than the sibling `payroll.finalizations` despite looking
similar: no `staff_name`/`staff_email` snapshot and `on delete cascade` rather than
`on delete set null` (0036's convention #3 exists because pay entries/requests/
finalizations are permanent audit data — a day submission is transient entry-screen state
that gets cleared again on the next edit, and `finalizations` remains the actual audit
record), and coaches write it directly rather than through a security-definer RPC
(`finalizations` needs one so a coach can't set their own `reopened_at`; this table has no
column a coach shouldn't be able to set). Guarded on closed periods only, not on
finalization — the grid is already hidden once a coach finalizes.

**The counter autosave is the fiddly part, and the traps are worth knowing before touching
it.** `lib/payroll/daySubmissions.js` + `entries.js`:
- The debounce effect **never cancels its timer in a cleanup** — a cleanup fires on every
  dep change, which would silently drop a change rather than save it. The scheduled write
  carries its own date/period/core-row, so it still lands on the right day even if the
  screen has moved on; a separate effect flushes the previous day's pending write when the
  date changes, and `useFocusEffect`'s cleanup flushes on leaving the screen.
- `counterDate` is **state, not a ref** — on the render right after a date change the four
  counters still hold the *previous* date's values while `partition.core` is already the
  new date's, so the diff is briefly bogus. A ref set by the resync effect flips too early
  (same commit) to guard against that; state flips in the same batch as the counters do.
- `coreRowRef` tracks the freshest core row outside render state, so a debounced write
  landing between renders can't read a stale "no core row yet" and insert a **second** core
  row for the same date. Two core rows would double-count that day's pay, since
  `computeTotals` sums every row.
- `persistDay` deliberately rethrows rather than toasting — every popup calling into it
  already reports its own failure and stays open with the user's input intact. The two
  non-popup callers add their own catch.

**Other changes, all from the same feedback round:**
- SPC caption is **"Add another session"**, not "N sessions logged" — the badge already
  carries the count, and repeating it buried the one thing that wasn't obvious: a day can
  hold more than one. Same treatment on the Other row ("Pick another type above to add
  another"), whose confirm control became an explicit **Add button**, since the checkmark
  can only mean one thing on this screen now.
- The names popups (Welcome/Strategy/Programs Written) moved off the checkmark onto a
  **"+ Add names"** line that also shows what's already entered — a better affordance than
  the checkmark ever was, since it says what it opens.
- **New `components/payroll/DaySubmittedCelebration.js`** — spring-in checkmark, 18
  brand-coloured confetti pieces, a rotating message ("Locked in.", "That's in the books.",
  …), the date and the day's total, auto-dismissing after 2.6s. Built on react-native's own
  `Animated` (this app's first use of it — the only other animation, `ZoomableImage`, uses
  reanimated); each confetti piece owns its own `Animated.Value` via a child component
  since hooks can't be created in a loop. Per the explicit ask: payroll's whole worry is
  not being sure your hours landed, and a toast wasn't enough of an answer.
- **Custom pay is off the entry screen entirely** — `PayrollCustomRow.js`,
  `CustomEntryPopup.js` and `upsertCustomForDate` are deleted. Requests is now its only
  home, so a custom amount and the money it turns into can't be entered in two places.
  Requests rebuilt as phone-friendly collapsible cards (new
  `components/payroll/ExpandableCard.js`): New request / Awaiting your approval (admin) /
  Your pending / Approved / Denied, each with a count pill, defaulting open only where
  there's something to see. `hasDayData` on the entry screen counts only what its own tiles
  collect, so an approved request landing on today's date doesn't light up "Submit this
  day" for a day the coach logged nothing on.
- **"Report" tab relabelled "Pay Stubs"** — label only, route stays `/payroll/report`.
  Admin View's own all-employee Report tab keeps its name.

**Two layout bugs caught by screenshotting at phone width, which the clean bundle did
not**: tiles with a caption sat lower than tiles without one, so labels and counters
didn't line up across a row (fixed with a shared `TileLayout` pinning label to the top,
control centred, caption to a fixed-height bottom slot — same fix as My Week's
`SessionBubble`; `PayrollTile` also now always reserves the checkmark's `paddingBottom`
whether or not it draws one); and "Add another session" measured **114px in a 113.5px
box**, truncating by half a pixel — fixed by tightening tile horizontal padding from 16 to
12 rather than shortening the copy. Both were found by measuring real
`getBoundingClientRect()`/`scrollWidth` in the browser, not by eyeballing the screenshot.

**Not verified**: the confetti actually moving. The preview pane runs hidden, so
`requestAnimationFrame` never fires and every animation sits frozen at frame 0 — confirmed
the 18 pieces render with the right colours and that the interpolations are wired up, but
not that they fall. (Worth remembering generally: **any animation is unverifiable through
the Browser pane for this reason** — the card's own spring also appeared "stuck
mid-animation" across several screenshots before settling.) Also unverified: the
autosave/submit round-trip against real data, and the Requests page with real requests.

## Coach web v2 design pass — phases 1 and 2, screens 01-09 (2026-08-12)

A new handoff (`design_handoff_coach_web_v2/` — README + `Kova Coach Web -
Dashboard.dc.html` + 25 screenshots) redesigns the **whole coach web app**, not
just its paint. Same "the HTML is a reference, never copied in" rule as every
prior handoff. **This session covered screens 01-09 only** (launchpad,
programming). Screens 10-25 — payroll close, settings matrix, clients, client
detail, the three SPC screens, and the nine nutrition-record tabs — are
untouched and are the next session's work; see "Still to do" at the end of this
section.

**The one idea**: the dashboard stopped being a report and became a launchpad.
Terra programs in the gaps between clients, so every screen answers *where was
I* before it answers anything else. Everything below follows from that.

**Confirmed with Terra before building**: weight is never prescribed (loads are
shown as history only, "because the girls need to know what they did last
time"); no session-duration estimate anywhere (the mock shows "~52 MIN" on the
builder but the README's own "No timing" decision wins, and nothing in the app
shows one today); **coach-scoping deliberately left alone** — the README wants
alerts scoped to a coach's own clients, but nothing in this app is coach-scoped
today and she chose not to open that up yet, so Needs You still shows every
coach the same list.

### Launchpad (01-03) — `app/(coach)/index.web.js` rebuilt

Resume card first, then permission-generated launch cards, then Needs You as a
real actionable list, then Today in the Gym, with the roster counts that used to
open the page demoted to one clickable strip at the bottom.

- **New `lib/programming/resume.js`** — the most recently edited group or SPC
  session by *this* coach, plus the rest of that block's unbuilt queue beside
  it. A nutrition-only coach with nothing programmed resumes into the check-in
  queue instead. Deliberately **not** filtered to drafts: a published session
  stays editable, and filtering would drop a coach to an empty state the moment
  they hit Publish, which is the opposite of resuming. Also deliberately does
  **not** reproduce the mock's "you drafted a carb change and didn't send it" —
  nothing stores a draft reply, and that line would be the screen lying.
- **New `lib/programming/launchpad.js`** — the card model. Cards are scored
  twice: `priority` decides what survives the cap of four (Pay always does),
  `order` decides how survivors read left to right. Produces exactly the three
  designed outcomes (admin: Program/Ship/Pay/Run-the-gym; coach+SPC:
  Program/Ship/Pay/SPC; nutrition coach: Review/Pay only).
  - **One real inference, flagged**: there is deliberately no
    `can_view_programs` flag (the README is explicit that seeing the grid isn't
    having a job in it), so the programming cards gate on
    `can_view_spc || can_view_exercise_library`. A coach who can manage neither
    is not the person building sessions. `programsSessions()` in that file is
    the single line to change if it reads wrong for a real coach.
- **New `lib/programming/gymToday.js`** — sessions logged, nutrition logged /
  active, new PRs, unread messages, quiet-7-days. Every figure is its own
  try/catch and **falls back to null, never 0** — a broken query must not be
  able to say "0 sessions logged", which is a number a coach would act on. The
  UI renders an em-dash for null.
- **New `countPersonalRecordsOn(date)`** in `exerciseStats.js` rather than in
  gymToday, specifically so it shares `PR_MIN_SESSIONS`/`topSetOf` with
  `getExerciseStats` — the member app and the coach dashboard must never
  disagree about what counts as a PR.
- Needs You reuses the existing `computeAttentionItems`/`filterDismissedItems`
  untouched; `decorateAttentionItems` only adds the per-row verb and severity
  ordering. Native's dashboard (`index.js`) is unchanged.

### Group Programs grid + finalize preflight (04-05)

**New `app/(coach)/blocks/index.web.js`** — native keeps the previous read-only
panel grid (`index.js`), same web/native split precedent as clients and SPC.

- Underline program tabs carrying roster counts (the pill row gave no sense of
  size and stopped reading as navigation past two programs).
- Block band with a stacked readiness bar. **`empty` beats `draft`** in the
  bucketing, because a published-but-empty session is worse than an unpublished
  full one and must not hide inside the published segment.
- Cells state title / lift count / superset count / warm-up / status, with
  "Draft · you were here" when this coach last touched it.
- **Multi-select with a bulk bar** (Publish, Duplicate into…, Clear lifts, "Esc
  to deselect" — and Esc genuinely works, there's a real keydown listener).
  Replaces the old click-source-then-click-targets copy mode, which only ever
  did one thing. "Duplicate into…" only lights up at exactly one selection —
  duplicating *from* several sources has no meaning.
- **New `components/FinalizeBlockModal.js`** — must-fix separated from worth-a-
  look, every line jumps to its own fix, the button names the consequence
  ("Publish 4 and finalize") or what's blocking it ("Fix 1 first").
  **Deliberately does not claim finalizing "locks the block's dates"** the way
  the mock's footnote does — nothing in this schema locks a block, and a button
  that said so would be lying. Finalize = publish every remaining draft.
- **New `lib/programming/blockReadiness.js`** — `getBlockReadiness`,
  `listActiveBlockReadiness`, and `buildFinalizeChecks`. The checks are
  arithmetic only, never a judgement about whether the programming is any good:
  empty sessions (blocker), untitled sessions, sessions well below the block's
  own **median** lift count (a fixed threshold would nag forever in whichever
  program it doesn't suit), and one movement pattern dominating a week.
- **New `listSessionSummaries(workoutIds)`** and `clearWorkoutContent(ids)` in
  `workouts.js`. The lighter `listWorkoutExercisesForWorkouts` stays as-is —
  native's grid and SPC still use it.

### Session builder (06) — `builder/[workoutId].web.js` rebuilt

One dense line per lift; only the lift being touched expands, so the shape of
the session stays visible while editing a detail of it. Replaces the previous
layout where six lifts meant scrolling past forty permanently-open form fields.

- Per-set reps table with a `+` in its header; **rest as chips**; tempo as four
  single-digit boxes instead of a free string; note-to-member; superset
  link/break as one toggle. Warm-up is a fixed **2×3 grid of six slots** rather
  than a growing list — the empty slots are the prompt.
- Right rail: pattern balance for the week (current session + siblings) and
  **last week's version of this same session** with a copy-in, so a coach
  programs against what they wrote rather than from memory. New
  `getSameSessionLastWeek()` in `workouts.js`.
- Header carries a real **save-state light** (Saved / Saving… / Not saved) —
  every write here is optimistic-then-persist, so that light is the only thing
  telling a coach the round trip landed.
- **Rest stays a `text` column, deliberately.** README data-note 1 asks for
  integer seconds; converting the column across all four exercise tables would
  have to reinterpret years of free-text ("60-90s", "2 min"). Instead every
  write from this screen is a canonical seconds string, which is exactly what
  the member timer's `parseRestSeconds` already parses — and legacy values keep
  working. `formatRest` shows 60s/90s/2:00/3:00 (seconds under two minutes,
  clock notation only for whole minutes from 2:00 up) because that's how
  coaches say it.
- **Kept, though the mock drops it**: `CommentThread` at the bottom of the right
  rail. Block notes are coach-to-coach and the *native* builder still shows
  them, so removing it here would mean a note written on a phone is invisible on
  the platform where the work actually happens.

### Exercise library, merge, duplicate check (07-09)

- **New `app/(coach)/exercises/index.web.js`** — table with usage counts, video
  coverage (Linked / **Missing** in red when the exercise is actually used /
  None when it isn't), DUPLICATE? flags on the lesser-used half of each pair,
  filter chips including No video / Never used / Archived, and the duplicate
  banner as a doorway. Native keeps the existing card list (`index.js`).
  **Deliberately no EQUIPMENT column**: the mock has one and
  `programming.exercises` has no equipment field. Rendering an empty column for
  every entry would be worse than omitting it; adding one is a real feature
  (migration + form field + tagging the whole library), not a design pass.
- **New `app/(coach)/exercises/merge.js`** — merge any two by name (typeahead,
  not a `<select>` of the whole library), worked suggestions below, dismissed
  pairs listed at the bottom with Undo. Direction is never guessed: the entry
  with more history survives, and the page says which before you commit.
- **New `lib/programming/exerciseMerge.js`** — `mergeExercises` repoints all
  nine reference tables plus `parent_exercise_id`, then **archives** the retired
  entry rather than deleting it. Sequential plain writes, not a transaction
  (this repo's standing convention); every step is idempotent, so a partial
  merge is finished by re-running it rather than corrupting anything.
  `REFERENCE_TABLES` is deliberately colocated with the merge — a future
  feature that adds a reference and forgets this list would silently orphan
  rows.

**The duplicate detector's first rule was wrong, and testing against the real
library is what caught it.** Substring containment ("one name contains the
other") is the obvious rule and produced **35 suggestions from 83 real
exercises**, nearly all genuinely different lifts: Goblet Squat vs Squat,
Inverted Row vs Row, Split Squat vs Squat, Barbell Bench Press vs Bench Press. A
merge page that mostly suggests wrong merges is worse than no merge page — one
accepted suggestion silently folds a real lift's history into another. Rewritten
to identical-after-normalisation / same-words-reordered / one-small-edit
(similarity ≥ 0.88), with an abbreviation expansion table (db→dumbbell,
rdl→romanian deadlift, …) so the motivating case still works. Re-run against the
real library: **1 pair, and it's real — there are two rows both named "Glute
Bridge"**. A ten-case should/shouldn't-match test all passes (script left in the
session scratchpad; the cases are worth re-testing if this rule is ever
loosened). Note this means the README's own example dismissal (Standing Calf
Raise / Seated Calf Raise) is never even suggested now.

- **`components/ExerciseFormModal.js`**: the live duplicate check already
  existed but was passive grey text ("Possibly the same as: X") — it told you
  about the problem without giving you a way out of it. Now a real card with the
  match's usage and video status plus **"Use that one"** (new optional
  `onUseExisting` prop) and **"Keep both"**. "Keep both" is per-open state, not
  stored — pairs worth remembering forever get dismissed on the Merge page,
  which has a real table behind it.

### Migrations (both run and verified)

- **`0052_workout_edit_tracking.sql`** — `last_edited_by` on `group_workouts`
  and `spc_workouts`, plus triggers. Done as **triggers rather than app-side
  writes** on purpose: the ~10 mutating functions in `workouts.js`/
  `spcWorkouts.js` don't receive the editing coach's id, threading it through
  every one is churn a future function could forget, and a trigger can't be
  forgotten. `updated_at` previously only moved on status/title changes — adding
  or reordering a lift left it untouched, so a session someone spent twenty
  minutes on still read as last-touched at creation. **No backfill**:
  `last_edited_by` starts null everywhere, which honestly means "no resume
  target yet" — so **the resume card reads "Start where the gaps are" for
  everyone until each coach edits one session.**
- **`0053_exercise_merge_dismissals.sql`** — pairs kept separate. Stored in
  canonical id order (CHECK + unique index) so a pair can't be dismissed twice
  by being named the other way round.

### Verification

Every screen was screenshot-verified against the mock via the standing
login-screen harness technique (mounted, screenshotted, reverted each time —
`git status` confirmed clean after each). `npx expo export -p web` clean after
every phase. The duplicate detector was tested against **real** exercise data
pulled from the live DB, which is what caught the containment bug. **Not
verified**: any of it behind a real login — same standing limitation as
everywhere else in this file. Worth Terra's click-through, especially the grid's
bulk bar, the builder's expand/collapse and rest chips, and a real merge.

### Still to do — nothing

Screens 10-13 landed in phase 4, 14-16 in phase 3, and 17-25 in phase 5
(below). The handoff's 25 screens are all built.

## Coach web v2 — phase 4, business + people (screens 10-13) (2026-08-12)

Three migrations, all **run and verified live** this session.

**Screen 11 — Settings → Team is a permission matrix.** New
`components/StaffPermissionMatrix.js` (web ≥1024px only; native and the
phone-width PWA keep the per-coach card list, which reads fine in one
column). The four flags live in one exported `PERMISSION_COLUMNS` used by
both layouts, so they can't drift on which flags exist or what each
defaults to — SPC/Nutrition/Exercise Library default on (0015), Ops Hours
defaults off (0036). Admin rows render checked-but-inert rather than blank:
admin genuinely has every module, and an empty cell would read as "no
access". The two "+ Add coach"/"+ Add admin" buttons collapsed to one
"+ Add staff" — `AddStaffModal` has had its own role picker since it was
built, so the second entry point only ever pre-selected a value the modal
already asked for. The Settings page's 640px cap widens to 1060 for the
Team tab only.

**Screen 10 — payroll close is review → approve/send back → close.**
Migration `0055_payroll_review.sql` adds `approved_at`/`approved_by`/
`sent_back_at`/`sent_back_by`/`send_back_note` to `payroll.finalizations`
and replaces `finalize_own_period()` so a re-submit clears them. State is
**derived from timestamp comparison, not a status column** (`reviewState()`
in `lib/payroll/finalizations.js`) — that's what makes a pre-0055 row read
correctly as "submitted, nobody's looked yet", and what returns a
sent-back coach to Submitted with no extra clearing step to forget.

**The load-bearing detail: sending back also writes `reopened_at`.**
`pay_entries`' four write policies (0036) gate on the finalized/reopened
comparison alone, so a send-back that only set `sent_back_at` would be
purely cosmetic — the coach reads "fix your Ops hours" and is still locked
out of editing them. Rather than widen four RLS policies to know about a
second unlock column, `sendBackFinalization` writes both stamps in one
update. A send-back genuinely *is* a reopen, just one carrying a reason.
No new policies were needed at all: 0036's "admin manage finalizations" is
already `for all` and already scoped to an open period.

`admin/periods.js` rebuilt as the review table (eight category columns
carrying counts/hours, a Pay column, per-row expand into a
chronological line-item list, approve/send-back/nudge/undo) and
`admin/closed.js` is new — "This period" and "Closed periods" split into
separate tabs because a growing list of finished periods under a table
this dense buried the thing you came to do. Closed rows also gained a
re-downloadable CSV (rebuilt at that period's frozen rates), since the
close flow's own auto-download is easy to miss. **Close is a real gate**:
disabled until every row resolves and every custom request is decided, and
the band says which — the old version disabled nothing and only told you
what was wrong after you clicked. Admin tab bar is now This period /
Requests / Closed periods / Report / Settings; deliberately no "My hours"
tab (the mock has one, but an admin logging their own hours goes through
the Staff View mode picker, which is the whole point of that split).

**Screen 12 — clients roster is a real table.** New
`components/ClientRosterTable.js` (Client / Program / Last session / This
week / Nutrition / Needs), filter chips carrying counts (including Quiet
7+ days and Check-in due) replacing the old dropdowns, default sort
longest-quiet-first. `Needs` is the one column that's an action, in
priority order: an unassigned client needs a program before anything else
means much, and a long-quiet client needs a nudge before a check-in
reminder helps.

Migration `0056_roster_last_session.sql` adds
`programming.get_last_session_dates(uuid[])`. This app's convention is
"fetch the rows, group in JS" because supabase-js can't express DISTINCT
ON — that works where the row count is bounded, and it isn't here (~150
clients × years of sessions for 150 dates). **Deliberately not security
definer**: `session_completions` already has a staff-read policy, a stable
SQL function runs with the caller's rights, so RLS does the access control
and there's nothing to escalate.

**Real bug caught by a screenshot**: a client who joined Aug 1 rendered
"Since Jul 2023". Both `toISOString().slice(0,10)` and
`toLocaleDateString` on a raw timestamptz shift the date for anyone west
of UTC — the same class this file already warns about. `sinceLabel` now
goes through `dateInBoise` and reads the month off that date string.

**Screen 13 — client detail's "your four" plus tabs.** Migration
`0057_client_notes_and_limitations.sql` adds `programming.client_notes`
(editable/deletable — a note is a living scratchpad, unlike
`client_messages`, which is an immutable log) and
`programming.client_limitations` (`area` / `guidance` / `severity`, two
named values so the rust-vs-amber tone can't drift). **Both are staff-only
in every direction — no member policy at all, not even select.** These are
the coach's working notes and a clinical-adjacent shorthand written for a
coach's eye, not something authored for the client to read. Neither fit
anywhere existing: `program_comments` is block-scoped (a goal like "225
squat by December" outlives any block) and `client_messages` is a
conversation *with* the client.

The old two-panel `SnapshotPanel` is replaced by four equal cards
(Programming / Nutrition & check-in / Your notes / Limitations), stacking
below 1100px. Programming's "Current vs Behind" is arithmetic only — it
means a real missed-session flag exists, never "hasn't trained in a
while", because a client on holiday isn't behind and the card can't tell
the difference. Nutrition's numbers come from a new
`lib/nutrition/clientSnapshot.js` rather than `getNutritionRoster()`,
which fetches every client's logs to build the roster and is wildly
disproportionate for one client.

The page's seven-card vertical scroll became a tab strip: **Training
history / Lift progress / Upcoming / Programs / Messages**. Lift progress
is genuinely new coach-side and reads `getExerciseStats` — the same
function the member's own My History uses, so the PR rule (3 sessions
before eligible, then any increase) can't disagree between what she sees
and what her coach sees. **Deviation from the mock, deliberate**: its
"Nutrition" and "Check-ins & photos" tabs aren't built here — both already
have full dedicated screens under `/(coach)/nutrition/clients/[userId]`
that these tabs would duplicate badly, and those screens are exactly what
phase 5 (17-25) redesigns. The four cards link out to them instead.

Limitations are surfaced read-only at the top of the **SPC builder's**
right rail (`spc/builder/[workoutId].web.js`) — they're a constraint on
what you're about to write, so they read before the balance and last-week
panels. SPC only, not the group builder: a group block is shared across a
whole program, so there's no single client whose limitations apply.
Editing stays on the client's page, where the coach has the context.

**Verification**: `npx expo export -p web` clean after every batch. The
permission matrix, the payroll review table (including the send-back note
panel), the roster table, and the four cards were each rendered and
screenshotted against fake data via the standing login-screen harness,
reverted after (`git status` clean on `login.js` each time). All three
migrations verified by direct schema query.

### Phase 4 follow-up — Terra's click-through, all root-caused against real data

Every one of these reproduced against Bob Getsinger's real rows or the real
Aug 6 pay period before being touched. **Two "did you change my data?"
questions both answered no, with evidence** — worth the pattern: query the
DB and read `updated_at`/`last_edited_by` rather than asserting innocence.
His SPC session titles ("Session A") were last written 2026-08-07, days
before the pass, and the literal string appears nowhere in the codebase
except an unrelated placeholder; `spc_clients.sessions_per_week` is 3 and
nothing in this app writes it outside the SPC page's own control.

- **Programming card said "no active block" for a client who had one.**
  Bob is SPC-only, and the card built its rows purely from *group*
  memberships. SPC blocks are in there now, and each membership row links
  to its own block — one shared "open the block" button can't say which it
  means for a client holding both.
- **Upcoming was empty for a client with sessions coming.** `upcomingSpc
  Sessions` looked only at the *current* block week; Bob had finalized all
  three of week 1 the same evening, so it was correctly empty for that week
  while a fully published week 2 sat there. Now covers this week and next,
  matching what `upcomingGroupSessions` already did.
- **Training history showed one long mismatched exercise list per row.**
  `programming.logs` has no workout reference, so `listLogsForDate` returns
  *everything* logged that calendar day — three sessions finalized in one
  evening meant all three rows listed all fifteen lifts. Each session now
  filters to the exercises it actually programs (new
  `exerciseIdsForCompletion`). Honest residual: a lift programmed in two
  sessions completed the same day still shows under both, because the log
  genuinely can't say which. Fixing that properly needs a session reference
  on `logs`, not a smarter query.
- **Session labels retitled** to `SPC - Week 1 session 1` (hyphen, not an
  em dash, per direct ask), with the coach's own name for the session
  demoted to the second line after the date. The key change is that the
  label is built purely from program + week + session — a title is separate
  data and can never masquerade as the session's identity, so clearing one
  leaves no ghost. Applied to Upcoming too; that surfaced a duplicate
  "This week", so undated SPC sessions now carry a `when` field for the
  right-hand column and the meta line just says "Any day".
- **Payroll per-staff rows didn't sum to the footer** ($310 of rows under a
  $919 footer). Rows grouped on `user_id` alone, silently dropping every
  imported Glide entry that only carries `staff_email` — five real coaches,
  $238, counted in the total and shown on nobody's row. Now grouped on
  `user_id ?? staff_email` (the key `computeTotalsByStaff` always used),
  unmatched emails get their own labelled row, and **the footer sums the
  rows themselves** so the two can't drift again whatever edge case turns
  up next.
- **Close is no longer blocked by un-submitted coaches** — payroll goes out
  on payday regardless, so that's a warning naming exactly who you're
  closing over, accepted in the confirm dialog. The only true blocker left
  is an undecided custom request, because approving one *creates a pay
  entry* and closing first would strand that money. The running "Close
  unlocks when…" line is gone; Nudge is gone.
- **Review table re-laid out.** Detail dropdown is Date · Category · Qty ·
  Notes · Total, with an Other line's type and count leading the Notes cell
  (a `$30` row under a category called "Other" told a coach nothing) — done
  locally rather than by changing the shared `entriesForCategory` labeller,
  since the Report tab's drill-down wants the type in its Qty slot. On the
  main rows, status sits above the total, the total is last, and actions
  moved to their own column — with buttons sharing the money column, a row
  with actions and one without pushed their totals to different x
  positions. Two things only measurement caught: the button pair needed 196
  not 168px, and **every row sat 3px right of the header/footer because a
  `borderLeftWidth` accent consumes layout width in RN** — header and
  footer now carry a matching transparent gutter. Verified by reading real
  `getBoundingClientRect().right` values: all five main-line totals land on
  one edge.
- **Clients list defaults to name**, and the client page carries clickable
  membership pills next to the name.

**Also fixed a phase-3 regression**: the SPC block grid's ⧉ click-to-copy
flow lived only in `spc/[userId].js`, so adding a `[userId].web.js` sibling
silently removed it from the platform where programming actually happens —
native had it the whole time. Rebuilt on web with the same vocabulary
(source / selected / eligible, "Click to paste here" on empties, sticky
confirm bar, overwrite confirm counting only tiles that'd lose something).
**Worth watching for whenever a `.web.js` sibling is added to a page that
already had behaviour** — same shape as the old warm-up-picker bug.

**Not verified**: any of it behind a real login — standing limitation.
Worth Terra's click-through, especially a real approve/send-back round trip
(does the sent-back coach actually get their entries back?), the roster's
Quiet/Check-in-due chips against real data, and adding a note and a
limitation.

## Coach web v2 — phase 3, the SPC screens (2026-08-12)

Screens **14-16** plus the carried-over builder port. Two commits: `7e72092`
(builders) and `f61f981` (screens).

**A stale note in this file, corrected.** The previous section said SPC needed
the builder "adapted for SPC's per-week workout rows … progression lives in
`spc_exercise_weeks` columns". That table was **dropped in migration 0016** —
SPC was rearchitected then to one `spc_workouts` row per (block, week, session)
with a flat prescription on the exercise row, structurally identical to
`group_workout_exercises`. Verified against the live schema, not just the
migration. The port was therefore near 1:1, not an adaptation.

**All three builders now share one implementation.** Rather than port the v2
layout twice more, the pieces moved into `components/builder/SessionBuilderParts.js`
(warm-up grid, set table, tempo digits, rest chips, the sortable lift row,
balance/last-week rails, `formatRest`/`schemeLabel`/superset-letter helpers) and
group, SPC and templates compose them. Same reasoning as `ExerciseLibrarySidebar`,
extracted out of the same three files for the same reason. The group builder's
refactor is a pure move — no behaviour change. **What differs is passed in, not
forked**: `showTempo`, `showSuperset`, and the warm-up grid's `editable` flag.
Templates switch off all three (no member visibility, supersets deliberately
excluded from templates in 0030, and `template_warmups` has no sets/reps columns
at all).

**Migration `0054_spc_tempo.sql` — additive, nullable, no backfill.** 0016
deliberately left tempo off SPC ("different program families"), but that
reasoning eroded from both ends: 0047 gave group a `rest` column, and the v2
handoff's session read-out shows tempo on an SPC lift explicitly. **Run and
verified live this session.**

**Also found**: `updateTemplateWarmup` was imported by the template web builder
but never exported from `lib/programming/templates.js`. It resolved to
`undefined` and nothing ever called it — a dead import, not a live bug. Gone
now. Separately, `coach_initials`/`touched_date` (added to
`spc_workout_exercises` by 0016) **are not in the live schema** — checked
directly. Nothing in the app references them, so this is harmless, but don't
trust 0016's text on those two columns.

**New data layers.** `lib/programming/spcRoster.js`'s `getSpcRosterDetail()` —
one batched pass giving each client their current block, coverage, last session
and a single derived next step. `lib/programming/spcBlockDetail.js`'s
`getSpcBlockDetail()` + `buildSessionReadout()` — shared by screens 15 and 16 so
the grid's set counts and the read-out's own can't disagree.

**The known join gap, worth understanding before trusting any set count**:
`programming.logs` has no workout id. A log row records (user, exercise, date,
set) and nothing about which session it belonged to, so a logged session's sets
are matched by **the date it was finalized on** — the same simplification
`lib/history.js`'s day timeline already documents. It's safe here in a way it
isn't everywhere: SPC clients train 1-4× a week and two SPC sessions finalized
on one calendar day is rare. If that stops being true, `logs` needs a real
session reference — not a smarter query.

**Two things deliberately not built as drawn.** (1) The mock shows "Paused ·
Since Jul 14" — `spc_clients` records `status` but never when it changed (only
`created_at` exists, verified live), and dating a pause from the row's creation
would be wrong. It would need a real `status_changed_at` column to be true, so
it's left out rather than faked; the coach's own note carries the why. (2)
Status / assigned coach / sessions-per-week aren't in the v2 mock at all (it
shows them as plain text) but have no other home on web, so they stay editable
in the client page's Notes rail rather than being dropped from the redesign.

**Screen 15's SPC-specific state model**: five cell states, and the distinction
that matters is between "she hasn't done it yet" and "she isn't going to" — a
published session whose week has *fully* passed without a completion is
`skipped`, not pending. Adherence is measured against what has actually come
due, not the whole block, so a block in week 2 of 6 isn't 33% adherent.

**Verification is real for the rendering, not bundle-checked-only.** The
read-out, roster rows, block band and all six cell states were rendered against
fake data via the standing login-screen harness (`ClientRow`/`BlockBand`/
`SessionCell` temporarily exported, reverted after; `git diff` on `login.js`
confirmed clean). The read-out's arithmetic was checked against the actual
output — 16 sets, 18,890 lb volume, 15 of 16 sets hitting target, all correct by
hand. **That caught two real bugs a clean bundle did not**: rest rendering as
raw `120` where the builder formats it `2:00`, and "Build next block" wrapping
to two lines in a column 3px too narrow (measured via `getBoundingClientRect`,
not eyeballed). **Not verified**: any of it against real data behind a login —
standing limitation. Worth Terra's click-through, especially the roster's
coverage column against a real block and the read-out opened from a real logged
session.

## Payroll deadline reminder was firing a week early (2026-08-12)

Terra: *"we are a week off. Its firing today, and it should be next wednesday."*
Real bug, not a misconfigured setting. `scan-payroll-deadline-reminders` gated
on `payroll_deadline_weekday` (3 = Wednesday) **alone**, with no awareness of
where the pay period actually was — so it fired on the Wednesday in the middle
of every 14-day period too, a full week before anything was due. Pay periods
run Thursday → Wednesday (the anchor, `2025-10-02`, is a Thursday), so every
period *ends* on a Wednesday and the every-Wednesday version looked plausible
right up until you noticed it going off twice as often as payroll is run.

**Fix: both reminders are anchored to the period's own boundary, never to a
weekday.** `payroll_deadline_weekday` is deleted, not just ignored. Two windows,
which by construction can never land on the same calendar day (the follow-up day
*is* the next period's first day) — that's why one `payroll_deadline_reminder_last_sent`
string (`"<periodStart>:<stage>"`) is enough to keep both idempotent:

| Stage | When | Targets |
|---|---|---|
| `final` | period's last day, ≥ `payroll_deadline_time` (20:00) | that period |
| `followup` | next day, ≥ `payroll_deadline_followup_time` (12:00) | the period that just ended |

**The follow-up's target period is the trap here.** On the follow-up day
`computePeriodStart(today)` returns the *new* period, but `finalizations` rows
are keyed by `pay_period_start` — so it has to walk back 14 days, or it would
scan a period nobody could possibly have finalized yet and remind everyone.

**Cron is hourly (`0 * * * *`), and deliberately not two fixed-time entries.**
pg_cron schedules are UTC; Boise moves between UTC-6 and UTC-7, so a fixed-UTC
cron is an hour off half the year — and an hour *early* means the function's
Boise-time gate fails and no reminder goes out at all that day. Hourly poll +
in-function Boise gate lands on the right hour year-round. A tighter
`0 * * * 4` (Thursdays UTC only) would cover both windows today but silently
couples the cron expression to the two time settings, which have no UI and get
hand-edited — rejected for that.

**Verified live**, not bundle-checked: function redeployed (v3, `verify_jwt:
false` confirmed preserved), migration run, and the cron job's own command fired
once by hand — the deployed function returned `{"skipped":true,"reason":"outside
both reminder windows","today":"2026-08-12","thisPeriodStart":"2026-08-06",
"thisPeriodEnd":"2026-08-19"}`. The two windows were also simulated across a
full period in Node before deploying. Firing a job without exposing its secret:
`do $$ declare cmd text; begin select command into cmd from cron.job where
jobname='…'; execute cmd; end $$;` then read `net._http_response` — reusable for
any `pg_net` cron job.

**Collateral worth knowing**: the old function had *no* idempotency guard at
all, so on any Wednesday past 17:00 it re-pushed every unfinalized coach on
every 15-minute poll. On the day this was found that was ~5 duplicate pushes
between 17:00 and 18:12 Boise. The new guard makes each stage fire once.

**Admin UI, same session**: new `components/payroll/DeadlineReminderCard.js`
leads Payroll → Admin → Settings (above Rates — it's short, and the Other
section below ends in a long archived list that would bury it), backed by new
`lib/payroll/deadlineReminder.js`. On/off `Switch` + both times. Deliberately
**not** added to Settings → Program Defaults, which whitelists its own four keys
precisely because rendering that shared table wholesale once corrupted unrelated
rows (see "Settings → Program Defaults was writing to every core.settings row").

- **The toggle commits on flip; the two times batch behind Save.** A half-typed
  schedule shouldn't go live, but an off switch should take effect immediately.
  The toggle is optimistic with a rollback on failure.
- **Hour granularity only (24 options), not the quarter-hour `TIME_OPTIONS`
  `settings.js` uses.** The cron polls on the hour, so offering `:15` would be a
  false promise — a 20:15 setting would really fire at 21:00. Same honesty
  reasoning as that quarter-hour list, which matches its own 15-minute poll.
- `describeNextReminders()` shows the two real dates under the pickers. Its one
  subtlety: **the first day of a period is also the follow-up day for the period
  that just ended**, so on that day the two lines legitimately describe different
  periods — returned date-sorted so it doesn't read as the follow-up preceding
  the deadline it follows.
- **Screenshot-verified** at desktop and mobile widths via the login-screen
  harness (reverted, `git diff` confirmed clean), enabled and collapsed states
  both. The unauthenticated harness also exercised the failure path for real:
  the RLS rejection surfaced the true error in a toast and the optimistic switch
  rolled back. **Not verified**: a real admin actually saving — needs a login.

## Coach web v2 — phase 5, the nutrition client record (screens 17-25)  (2026-08-12)

The last phase of the handoff. Nine screens: the module home plus the eight
tabs of one client's record. One migration (`0059`, **not yet run**), two new
lib modules, thirteen new components, seven deleted.

**Screen 17 — the module home is a queue, not a roster.** It used to be
filter chips over a table of everyone, which answers "who do I have" — a
question a coach opening this page already knows the answer to. Now the
status that's genuinely waiting on her opens with its clients listed and
everything else is one collapsed line carrying its count, next to a preview
pane for whoever is selected. Same data, same statuses (`rosterStatus` is
untouched), different question.

- `lib/nutrition/queue.js`'s `getQueuePreview(userId)` is scoped to ONE
  client deliberately and is **not** folded into `getNutritionRoster` —
  that already fetches logs for all ~31 clients to compute the tiles, and
  pulling a week of macros, a target and photo URLs for every one of them
  so a single pane can render would throw 30/31 of it away.
- `components/nutrition/QueueList.js` (left rail) and `QueuePreview.js`
  (right pane). The preview has **no finalize button**, on purpose:
  completing a check-in means reading her answers, and a one-click "done"
  next to a summary invites clearing the queue without doing that.
- **"+ Enrol client" is new as an entry point, not as a feature** —
  `createOrReactivateClient` already existed, buried on a switch on the
  client's *programming* page, which is the wrong place to look when
  you're standing in the nutrition module.

**Screen 18 — the Onboarding tab is gated on FIRST TARGETS, not the
approval stamp.** Those come apart in a real, previously-patched-over way: a
pre-existing standalone-app client switched on in Kova is already approved
with no target, which used to give her a full set of tabs all measuring her
against nothing (the 2026-08-03 fix bolted a "No target set yet" banner onto
every tab instead). The tab now appears whenever `targets.length === 0` and
disappears the moment a target exists. The mock's second button ("Ask her
for more") is replaced by Kova's real one, **Close out onboarding** — the
case that actually comes up is a client who finishes two of three and
stalls, and without it there is no way forward.

**Screen 19 — Dashboard absorbs Trends**, which is gone as a separate tab: a
coach looking at a weight trend is already asking what the macros were
doing, and making that a tab switch meant the two were never on screen
together. One range control governs the weight chart and all four small
charts (handoff note 8); the **macro rings stay pinned to 7 days whatever
the range says**, because a 6-month macro average is not a number anyone
should act on and putting it under the same picker invites exactly that.
New `WeightBarChart.js` (bars, not a line — weigh-ins are discrete daily
readings with real gaps, and a line interpolates straight through a missed
day as though it were measured; bars from the current target's effective
date render clay, so the chart says "this is the stretch under the numbers
she's on now" without a second legend) and `MetricSparkTiles.js`.

**Screen 20 — Weeks is one row per week, opening into its seven days**
(`WeekRows.js`), replacing the flat metric grid. A target change is drawn
BETWEEN the two weeks it separates, not on either of them — the point is
that everything above the line was measured against different numbers.

**Screen 21 — Plan.** `nutrition_plan_phases` gets a coach-set
`status` (migration 0059), reversing 0050's "position is the timeline, delete
to retire" decision. Order and status turned out to be **different facts**:
order says which phase comes next, status says which one she's actually in,
and those diverge the moment two themes run side by side or a phase is
parked. It also means a finished phase stops reading as upcoming without
being deleted, which used to throw away the history of what she'd worked
through. Deliberately a free column, not derived — "the first not-done phase
is the current one" is tempting and wrong.

**Screen 22 — Check-In pairs every answer against last week**
(`lib/nutrition/checkinAnswers.js` + `CheckinAnswerList.js`). Answers
matching word-for-word fold behind one count line so what moved is what's on
screen. `HERS ONLY` marks a question not in the gym template, matched on
question text — a client's copy is physical, not a live join
(`copyTemplateToClient`), so text is the only identifier the two share.
**When the template fails to load the badge is suppressed entirely rather
than defaulted**: silently badging all 18 questions as client-specific is
worse than badging none. The right rail pairs the LIVE game plan with the
focus items FROZEN at submission — showing today's list against last week's
answers had the coach marking her against goals that didn't exist yet.

**Screen 23 — Photos, compare-first** (`PhotoCompareRail.js`, distinct from
`PhotoCompare.js`, which the member tab and the compare tool keep). The
handoff's perf requirement (note 7) is the whole design: the browse rail is
TEXT — dates and weights already in hand from the `photos` rows — and only
the two compared images are ever signed. The legend doubles as the control
(pick a side, then pick a date) because a bare date click would have to
guess which pane you meant.

**Screen 24 — Targets** (`TargetsEditor.js` + `TargetHistoryTable.js`, both
superseding `NewTargetForm`/`TargetsHistory`). History now shows what
*moved* rather than each row's absolute numbers, via a new `diffTargets` in
`lib/nutrition/targets.js`. **Two deliberate deviations**: the mock's
"Recalculate calories from macros" button is dropped — calories are never a
stored column, always Atwater factors over the three macros, so the box
already recalculates as you type and a button would imply an override that
can't exist; and fibre/steps/sleep are kept below the four the mock draws,
because they're real target columns and losing them to a redesign that
simply didn't picture them would be a regression.

**Screen 25 — Settings moves off the gear icon onto a tab**
(`ClientSettingsPanel.js`). `ClientSettingsModal.js` is deleted, not kept
alongside. Name and phone survive even though the mock's Client card only
draws start date / coach / status — same reasoning as the targets above.

**Real bug found by verification, not by review — and it would have shipped.**
`PhotoCompareRail` fired **244 signed-URL requests** where it should have
fired one, on the very screen whose entire purpose is not doing that. The
effect computed "which paths still need signing" as *paths with no entry in
`urls`* — correct-looking, and an infinite loop the moment signing yields a
null URL for a path (which Supabase does per-path for an object that no
longer exists): the write lands, the key is still falsy, the effect re-runs
forever. Now tracked in a ref of attempted paths. **The first fix had the
same bug in slower motion** — clearing the mark on failure to allow a retry
meant a hard failure re-signed on every render; a blank frame until reload
beats a request per render. `NutritionCheckinTab`'s thumbnail fetch had the
identical shape arrived at from the other direction (effect keyed on a
`photos` array the parent rebuilds every render) and was fixed with it.
**Worth remembering as a class: an effect that derives "still needed" from
the state it writes will loop whenever the write doesn't satisfy the
predicate.** Neither instance is visible in a bundle check or a screenshot —
only counting real requests found them.

**Deleted after verifying zero references**: `ClientSettingsModal`,
`NewTargetForm`, `TargetsHistory`, `OnboardingStepper`, `WeeklySnapshot`,
`TrendTiles`, `WeekComparison`. `MacroPills.js` stays despite its own
component being unused — `TargetField` imports its `MACRO_STYLES` palette.
`WeekList.js` stays for `enumerateRecentWeeks`; its table component is now
rendered nowhere.

**Verification.** `npx expo export -p web` clean after every batch. The
rings (stroke colours checked against the ±10% band in the DOM, not
eyeballed), weight chart, spark tiles, week rows with their expanded day
table and target-change divider, the targets editor and history, the
check-in metric strip and answer list with its collapse toggle, the queue
rail, the photo rail, and the plan-phase badges were all rendered against
fake data via the login-screen harness and screenshotted; the harness was
reverted and `git diff` on `login.js` confirmed clean. **Not verified**: any
of it behind a real login (standing limitation). **Migration 0059 is run**,
so the Plan tab is fully live — all 16 existing phases read `planned` (no
badge) until a coach sets one, which is the intended no-backfill behaviour.
Worth Terra's click-through, especially the queue's preview against a real
week, a real target save, and the Settings tab now that it's a tab.


### Phase 5 follow-up — Terra's click-through (2026-08-12)

Sizing and onboarding fixes from real use. Several are the same root cause
wearing different hats: **a component that guesses its own size from the
window instead of measuring what it is actually inside.**

- **Dashboard charts didn't grow with their card.** `chartWidth` was computed
  from `useWindowDimensions` minus a hand-subtracted sidebar, page padding and
  rail — wrong (the sidebar is 232px, not the 320 guessed) *and* capped at
  1180, so the card kept growing while the chart stayed put. Now measured with
  `onLayout` on the chart's own container. **Guessing a child's width from the
  window is the bug; measure the parent.**
- **Macro rings clustered left** — each column now `flex: 1` so the row
  spreads across whatever card holds it (`minWidth` is the wrap point, not the
  width).
- **The Weeks day table sat narrower than the target bars above it** in the
  same card — fixed-width columns became `flex` + `minWidth`, inside a
  `ScrollView` with `contentContainerStyle: { flexGrow: 1 }` and a
  `TABLE_MIN_WIDTH` floor, so it fills when there's room and scrolls when
  there isn't.
- **Check-in: the rings card was shorter than the photos beside it** — `flex:
  1` on the Cards themselves, not just their wrappers, and the rings centre in
  the height the photos set.
- **Photos, twice.** First pass: unbounded 3:4 panes worked out ~550px wide
  and ~730px tall on a desktop card, taller than the viewport, pushing the
  rail below off screen. Capping the width fixed that and made them tiny on a
  big monitor. Now **height leads** — the pair fills the window minus a
  `CHROME_HEIGHT` constant — and width follows from the ratio, clamped so two
  still fit side by side. The date pill on each photo is now that side's
  picker (tap it, get every date on file with its weight); the legend
  selector, chip rail and year toggle are gone with it. "Manage photos" moved
  into `ManagePhotosModal` so the compare area gets the whole window.
- **Targets copy**: dropped "for your history, not shown to her", placeholder
  is now "What changed and why", and the "Every change is stamped on the
  Weeks tab too" footnote is gone.
- **Settings was badly broken and it's a footgun this repo has hit before**:
  the Client card rendered as a sliver with every label stacked one letter per
  line. Cause is `flex: 0`, which react-native-web compiles to `flex: 0 1 0%`
  — the 0% basis collapses the explicit width to nothing. Use
  `flexGrow: 0, flexShrink: 0, width: N`; **never bare `flex: 0` alongside a
  width.** Also: the photo-cadence calendar opened on today rather than the
  selected Monday, because `MondayPicker` reads its month from `value` on
  first render only and the value was arriving a tick later from an effect —
  now seeded synchronously in `useState`.

**Onboarding**, from a separate round of the same click-through:

- **The client record now opens on the Onboarding tab** for a client who is
  onboarding. Tab state starts `null` ("not chosen") so the default can depend
  on data that hasn't loaded at `useState` time.
- **The hero counted a skipped step as done** — "One of three done" for a
  client who had submitted nothing. Objective tracking is optional per client
  and `computeOnboardingPhases` marks it complete when zero days are assigned;
  the hero now counts only the steps actually being asked of her, so that
  client reads "None of two done".
- **"Close out onboarding" left the tab behind.** The tab was gated on first
  targets (the handoff's wording) rather than on approval, so closing out and
  not immediately saving a target left it sitting there looking like the
  action hadn't taken. **Now gated on `objective_tracking_approved_at`** —
  exactly what close-out sets. The approved-but-target-less case that gate was
  protecting against is covered by the restored "No target set yet" banner,
  which is a better fit anyway: she isn't onboarding, she just needs numbers.

**Verified** by screenshot at 1440×900, 1280×680 and 1440×1000: rings and day
table filling their cards, the Settings client card rendering properly with
the calendar on the right month, the photo panes tracking window height, the
date-pill picker opening and actually swapping the pane (header recomputed to
"23 weeks apart · −4.2 lb"), and the Manage photos modal. **Tooling note:** the
Browser pane's `resize_window` changes the viewport *without* dispatching a
`resize` event to the page, so anything driven by window size looks frozen
under test — a manually dispatched `resize` updated it instantly. Don't
diagnose a live-resize bug from that tool alone.


### Phase 5 follow-up, round 2 (2026-08-12)

- **Targets**: "Fibre" → **Fiber** (US spelling, matching every other label).
  Fiber/Steps/Sleep are now the same width as Protein/Carbs/Fat — both rows
  are four flex columns and the second row's fourth slot is an empty spacer,
  rather than three fields splitting the space four had. The sleep unit ("h")
  was rendering outside its box: **an `<input>` will not shrink below its
  intrinsic content width in react-native-web without `minWidth: 0`**, which
  shoves a sibling out past the border. Identical failure to the member v5
  pass's sleep tile — worth grepping for whenever a unit or suffix escapes its
  container.
- **Check-in shows every answer, every week.** The fold-the-unchanged-behind-
  a-count behaviour is gone (`splitAnswers` deleted with it, along with the
  now-unused `unchanged`/`blank` fields) — reading the whole check-in is the
  job, and deciding for the coach which parts deserve her time isn't this
  screen's call.
- **Focus and game plan are editable on the Check-In tab until it's
  finalized**, then frozen. Revising them IS the review, so both stay live
  while the coach works; **`finalizeCheckin` now re-captures them onto the
  response row** and the rail switches to "Game plan that week" / "Focus that
  week", read-only. `targets_snapshot` is deliberately NOT re-captured: a
  target set during review takes effect going forward via its own
  `effective_date`, so overwriting the week's snapshot would retroactively
  claim she was working to numbers that didn't exist yet.
- **No photos, no photos box** — the target card takes the full row instead of
  sitting next to a card whose only content was "none came in". Photos aren't
  policed here, so their absence isn't news.

Screenshot-verified at 1440×950: Fiber spelling and equal field widths with
the unit inside the box, all five answers rendering (including one identical
to last week), the editable rail on an open check-in and the frozen
"that week" rail on a finalized one, and the full-width target card with no
photos.


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


## House rule: every disabled button must dim (2026-08-13)

**`disabled:opacity-50` does nothing. Never use it.** NativeWind sets
`aria-disabled` but leaves computed opacity at 1 — measured in the browser,
not inferred. A disabled button therefore rendered fully saturated, so it
read as "tapping does nothing" rather than "you're not done yet." That is
the same bug class as the nutrition Finalize button (see the check-in
section above), and it had spread to 34 buttons across the app.

**The rule for any new button:** if it takes a `disabled` prop, it dims
itself with a real inline style. Two shapes, both fine:

```jsx
// no existing style
<Pressable onPress={save} disabled={busy} style={{ opacity: busy ? 0.5 : 1 }}>

// existing style — merge, don't replace
<Pressable disabled={d} style={{ opacity: d ? 0.5 : 1, backgroundColor: colors.primary }}>
```

When a call site already dims for its own reason, put the `disabled`
dimming **first** in a style array so the existing rule still wins:
`style={[{ opacity: busy ? 0.5 : 1 }, !ready ? { opacity: 0.5 } : undefined]}`
— RN merges left to right. That's what keeps the member check-in Finalize
button (deliberately *not* disabled by readiness, so tapping explains what's
missing) behaving exactly as before.

**This was deliberately NOT done as a Babel plugin**, unlike
`noAutofillPlugin.js`/`maxFontSizeMultiplierPlugin.js`, and the idea should
not be revived without re-reading this. 83 `Pressable`s take `disabled`, and
the prop carries at least three different meanings:
1. **unavailable** — missing info, or a boundary (`atTop`, `clampedPage <= 1`,
   `i === 0` on a reorder arrow). Dimming is right.
2. **busy** — `saving`/`submitting`/`uploading`. Dimming is right, and doubles
   as progress feedback.
3. **inert by design, but must still look normal.** Dimming is *wrong* here:
   `StaffPermissionMatrix`'s `disabled={isAdmin}` (an admin's checkboxes are
   checked-but-inert; dimming makes full access read as no access — the exact
   thing that design decision avoided), `RatingSquares`' `disabled={readOnly}`
   (a coach viewing a submitted rating; dimming makes real data look invalid),
   `MondayPicker`'s `disabled={!selectable}`, `AttentionAlerts`' `disabled={clear}`
   ("nothing needs attention" is a *good* state, not an unavailable one).

Some sites also already dim a **child** view, which no static transform can
see — `PermissionCheckbox` returns a plain `View` (not a Pressable) when
disabled, and its inner Pressable's box carries `opacity: saving ? 0.5 : 1`,
so an automatic wrapper-level dim would multiply to 0.25.

So the 34 conversions were scoped to elements that already carried
`disabled:opacity-50` — the author had already declared the intent, so
nothing had to be guessed — via a throwaway Babel codemod that located nodes
and applied precise text splices (whole-file regeneration would have
reformatted everything). None of the category-3 sites carried the class, so
none were touched. Verified: the object shape is runtime-confirmed on
login/register/reset-password (opacity 0.5 → 1 as conditions are met); the
two array-merge cases in `checkin.js` were checked by inspection across every
branch. Clean `expo export -p web`, and zero `disabled:opacity-50` left
outside explanatory comments.


## Announcement graphics + a member Events tab (2026-08-13)

Two deliverables from one ask: attach a Canva export to an announcement, and
a members' Events tab for bring-a-friend days, class registrations, and
supplement/merch orders. Plan at
`/Users/Dustin/.claude/plans/events-tab-and-announcement-graphics.md`.

**Decisions confirmed with Terra before building**: order forms are *items with
options* (S/M/L, Vanilla/Chocolate), not bare item+qty and not a priced
catalog; **admin only** composes; publishing *optionally* announces (a
per-event checkbox); events **auto-hide when they close**.

**There is deliberately NO on/off switch for the Events tab.** Terra's own
call once auto-hide was on the table — "i dont need the master switch."
`useHasEvents` (`lib/programming/useEventsAccess.js`) makes the tab exist
exactly while a live event is targeted at that member; unpublishing is the
emergency brake for taking something down before its date, which is why every
live row on the admin list carries a one-tap "Take down". The hook defaults
**hidden** while loading and on error — the opposite of `useHasFitness`, and
for a real reason: hiding My Fitness takes a tab from someone who genuinely
trains, whereas Events is additive, empty most weeks, and has the
announcement/push as its actual notification channel.

**Graphics live in a new PUBLIC `graphics` bucket** (migration `0060`, created
in SQL rather than by hand), separate from nutrition's private `photos`. A
poster is for the whole gym, signed URLs expire out from under a card that
stays on screen, and a public URL is the only kind that could ever be embedded
in a push later — so **nothing client-specific may ever be written there**.
`lib/nutrition/imagePicker.js` moved to `lib/imagePicker.js` (it was never
nutrition-specific) and gained width/quality options: graphics run wider and
less compressed (1400px @ 0.85) because flat text on a solid background is the
worst case for JPEG ringing.

**Announce-on-publish reuses the announcement pipeline rather than adding
push infra.** "Also announce this" writes a normal `programming.announcements`
row carrying the same `image_path` plus a new `event_id`, then calls the
existing `pushAnnouncementNow` — so the event lands in Announcements history
for free, the popup gains a "View details" button, and the only server change
was one line in `_shared/announcementAudience.ts` adding `url:
/events/<id>` to the push payload (both `send-announcement` and
`scan-announcements` call that shared helper; both redeployed,
`scan-announcements` kept `--no-verify-jwt`, flags verified after). Announcing
is best-effort and separate from publishing: a push failure reads as "the
announcement didn't go out", never "publishing failed". `alsoAnnounce`
defaults **off** once `pushed_at` is set, so take-down-and-republish can't
notify everyone twice.

**Audience resolution was extracted** into `lib/programming/audience.js` and
shared with announcements rather than copied a third time.

**Four real bugs found by verification, not review** — all four survived a
clean `expo export`:
- **`maxHeight` fights `aspectRatio` in RN.** The box keeps its 100% width,
  clamps its height and breaks the ratio, so a 4:5 poster rendered in a
  landscape box with grey bars down both sides. A height budget has to be
  spent as a **width** cap (`maxWidth = budget × ratio`), which bounds height
  implicitly. Measured: 208×260 at ratio 0.800, and 146×260 for a 9:16.
- **`closesAt.slice(0, 10)`** printed a close date one day late — the same
  UTC-vs-Boise class this file already warns about. Uses `dateInBoise` now.
- **`colors` was never imported** into `app/(member)/index.js` for the new
  teaser. Metro doesn't resolve identifiers, so the bundle was clean and it
  would have thrown at render.
- **A failed graphic reserved a 260px grey box** above the announcement title.
  Renders nothing now.

**Two storage findings worth remembering**: `supabase storage rm
--experimental` still returns `{"deleted":[]}` and does not delete (already
noted in this file) — and the documented SQL fallback **no longer works
either**: deleting from `storage.objects` now raises `42501: Direct deletion
from storage tables is not allowed` from a `storage.protect_delete()` trigger.
Deleting a stored object needs the Storage API with a JWT that satisfies the
bucket's own RLS, i.e. the dashboard or a logged-in admin.

**Verification**: RLS was tested against the live DB by impersonating a real
member inside a rolled-back transaction (`set_config('request.jwt.claims')` +
`set local role authenticated`) — the member saw only the published,
not-yet-closed event, only that event's items (not a draft's), and none of
another member's responses. Both migrations are **run and verified**; PostgREST
returns `[]` rather than PGRST205. The announcement popup (with and without a
graphic, both aspect ratios, long-message overflow), the member event cards,
the order stepper, the choice question and the coach item editor were all
rendered and screenshotted, and the quantity stepper driven for real. **Not
verified**: anything behind a real login — the composer end-to-end, a real
publish, a real member order, and the CSV. Standing limitation.

**Same-day follow-up from Terra's first click-through** (migration `0062`,
**run and verified**): a sign-up event used to *always* ask how many guests
you're bringing, which baked "bring a friend day" into a response type she
also wants for registering people onto a program. `events.ask_guest_count`
makes that opt-in, defaulted **off** — bring-a-friend is the special case, not
the norm — and the copy went neutral with it ("Sign me up" / "Signed up", not
"I'm in" / "You're in"). Two knock-ons worth knowing: a bare sign-up now has
nothing to edit once submitted, so the submit button is replaced by a
confirmation card rather than an "Update" button that updates nothing
(`canEditResponse` gates this — true for any order, or a sign-up with guests
or extra questions); and an unasked guest count stores **null, not 0**, or a
program roster would read "On their own" against every name.
`events.cta_label` lets a link-out event's button say what it does
("Register") instead of always "Open" — generically named on purpose, so a
sign-up could use it later without another migration.

**Preview button on the composer** (same follow-up round). The point of a
preview is that it can't disagree with what members actually get, so the
member's view was **extracted rather than reimplemented**: new
`components/events/EventCard.js` (moved out of the member list screen) and
`components/events/EventDetailView.js` (moved out of the member detail
screen, now owning its own guests/answers/quantities form state, seeded from
`response`, with a `preview` prop that makes every control inert). The member
screens keep data loading and the API calls and render those two; the coach's
Preview modal renders the same two at a fixed 360px frame — a member view
stretched across a desktop card would misrepresent every line break and the
graphic's crop, which is most of what a preview is for. It builds its event
object from **live form state**, not the saved row, so unsaved edits show.
Caught one drift while looking at it: the list card hardcoded "Open" for a
link-out even when the button had been relabelled.

**Left for Terra**: two throwaway test graphics
(`graphics/announcements/test-4x5.jpg`, `test-9x16.jpg`) need deleting from
the Storage dashboard — see the storage note above for why neither the CLI nor
SQL can do it.

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

## Weeks tab: British spellings, week rings, note tap, and the real "everything
is Week 1" bug (2026-08-14)

Four reports off the coach's nutrition client record, plus a data correction
that came out of the third one.

**"programme"/"enrol" → "program"/"enroll".** Reported as "some French".
`weekOnProgramme` → `weekOnProgram` (3 call sites), the Weeks tab's "N weeks
on programme" header, and the Nutrition queue's "+ Enrol client" button,
empty state, modal title and toasts. **"programmed" is deliberately left
alone everywhere** — that's the correct US spelling of the verb, not a
British leftover, and "3 sets programmed" is not a typo.

**Every week reading "Week 1" — two causes, one code, one data.**
`weekOnProgram` clamped any date *before* the client's start date to 1. That
read fine for its original caller (which passes `today`), but the Weeks tab
numbered each row from the week's **start**, so for a client whose
`start_date` sat near today every displayed week ended before she began and
came back as Week 1. Ashley Curry showed three identical "Week 1" rows. Now:
the function returns **null** for a pre-start date, and the Weeks tab numbers
from the week's **end** — so the week that *contains* the start date is week
1, and a week that finished before she started gets no number and falls back
to its date. The two queue callers already handled null (` week ? ... : ""`),
so a future-start client now reads as "not started" rather than "week 1",
which is more honest.

**The data half: `start_date` was the GHL import date for most migrated
clients**, not their real start — Ashley's said 2026-08-06 while her photos
went back to 2025-02-12. Corrected 11 rows from their legacy Google Sheets
trackers (`GoogleDrive-tsmout1@gmail.com/My Drive/Nutrition/Trackers_Macros`,
still synced locally — no links needed), using each client's first genuinely
logged day, or `min(daily_logs.date)` where the tracker's logs were already
imported. **Only `start_date` was written; nothing else touched.** Rollback
SQL with every prior value was saved before applying.

| Client | was | now | | Client | was | now |
|---|---|---|---|---|---|---|
| Abbi Stauffer | 2026-08-02 | 2023-12-18 | | Rae Karanjia | `0026-07-22` | 2025-08-22 |
| Banesa Getsinger | 2026-07-11 | 2024-03-04 | | Roxy Franco | 2026-07-14 | 2025-11-03 |
| MIchelle Dodge | 2026-07-20 | 2024-10-07 | | Bob Getsinger | 2026-07-17 | 2026-01-23 |
| Rita Cabrera | 2026-08-03 | 2024-11-11 | | Abby Thompson | 2026-07-11 | 2026-02-02 |
| Ashley Curry | 2026-08-06 | 2024-12-16 | | Terra | 2026-08-04 | 2026-02-10 |
| Bonnie Horsburgh | 2026-07-20 | 2025-08-20 | | | | |

Rae's was **`0026-07-22`** — year 26, a separate typo found in passing.
Dates were only ever moved **backward**; clients whose `start_date` already
preceded their first log (signed up, started logging days later) were left
alone. All 11 are past onboarding, so moving the anchor back can't retro-
satisfy an onboarding phase via `photosSinceEngagement`.

**Tracker parsing produced wrong dates twice before it was right** — traps
now recorded in [[google_tracker_full_import]]: column layouts differ between
sheets (Rae's is shifted, so fixed indices read her Calories *formula*, which
carries a 0 on untouched days, as protein); **column A is not data** (it holds
`Establish 1` block labels and a `Weight / Start 154` caption that normalises
to exactly `weight`, so every block label read as a logged weight); and a
sheet can carry **several header rows with real data above the first one**
(Abbi's). Final values were checked row-by-row against the raw sheets rather
than trusted from the parser. Still open for Terra: Abbi at Week 139 logged
549 of ~972 days, so a break-and-restart may deserve a later anchor, and
Roxy/Rita/Bonnie each have a starting photo days-to-weeks before their first
log if "start" should mean first contact.

**Week-average bars → rings, with the target stated.** On the PWA the four
macro bars ran off the right edge: each needed ~96px, putting a hard 420px
floor under that row that no `flex-wrap` could shrink. Replaced with a ring
per macro (value inside, macro + `of {target}` beneath) in a fixed 62px
column, so all four fit in ~272px and wrap cleanly. Measured at 375px: page
scroll width equals client width, and **zero** elements overflow outside the
day table's own intentional horizontal scroller. The ring keeps the bar's
three-tone ±10% rule **including red**, deliberately NOT `MacroDial`'s
never-red rule — a finished week's average genuinely can be over target,
where an in-progress day is only ever "not there yet".

**Tapping a note never worked because it was never wired** — the Note cell was
plain `numberOfLines={1}` text with no press handler at all, so a long note
was unreadable from this table. Now a `Pressable` that opens it to full text,
with a chevron marking any day that has one, and the row switching to
`items-start` while open so the day's numbers sit on the note's first line.
Verified by driving a real tap: 16px → 60px, clamp removed.

Rings and the note tap were screenshot- and DOM-verified at 375px and 1440px
via the login-screen harness (reverted, `git diff` clean). `npx expo export -p
web` clean. **Not verified behind a real login** — standing limitation.

## Blocks start on Monday (2026-08-15)

**A training block's weeks and a calendar week are now the same seven days.**
They weren't: `currentWeekNumber` counts flat 7-day chunks from
`block_start_date`, while `sessionNumberForDate` assigns sessions by weekday
off each program's `session_days` (0011). Those only agree on a Monday start.
A mid-week start split one calendar week's sessions across two block weeks —
a Thursday-start block had Mon/Wed reading as week 1 while that same week's
Thursday was already week 2 — so sessions were quietly skipped or repeated.
**Neither piece was wrong on its own, which is why it never showed up as an
error anywhere.** 8 of 12 live blocks were affected.

**Snap direction is backward** (`mondayOnOrBefore`, new in `lib/boiseDate.js`
— the forward counterpart `mondayOnOrAfter` stays in `weekCycle.js`, anchoring
nutrition check-in cadences). Backward keeps a block covering the date it was
asked to cover instead of opening a gap. It's also what disturbed live clients
least, checked against the real rows before running: today's week number was
**unchanged for every block with sessions logged against it**. Forward would
have pushed four live clients back a week. The only block that shifted was the
Apple review demo account (Sunday start, week 1→2, nothing logged); Terra chose
one consistent rule over special-casing it.

**Nothing historical moved.** `session_completions` keys off the workout row
(plus `week_number` for SPC) and `logs` off `date_performed`, so no completed
session was rewritten — only the calendar→week-number mapping changed.

Enforced in four places, deliberately layered:
- **`createBlock` / `createSpcBlock`** snap the incoming date. A no-op for
  every gap-aware caller — blocks are whole weeks ending Sunday, so "day after
  the last block" is already a Monday.
- **`scan-spc-alerts`** carries its own copy of the snap (redeployed, v14,
  `verify_jwt: false` preserved). It inserts blocks server-side without going
  through the lib, so without this it would be the one path capable of hitting
  the constraint and silently stalling a client's next block.
- **`NewBlockModal`** replaces its free-text `YYYY-MM-DD` field with the
  Monday-only `MondayPicker`, so a bad date can't be typed. It also shows the
  resulting Mon–Sun range, which is how you'd catch a wrong length.
- **CHECK constraints** on both tables. The app-side snap exists so a coach
  never *sees* the error; the constraint is what actually guarantees it.

`MondayPicker` moved `components/nutrition/` → `components/` (two callers now,
one of them not nutrition). **Its opening month is seeded on first render
only** — `NewBlockModal` keys it on `visible` to force a remount, or reopening
the dialog lands on whatever month was last viewed.

Extending and rolling blocks add whole weeks, so those already preserved
alignment and needed no change.

**Verified**: dry-run in a rolled-back transaction before the real run;
`mondayOnOrBefore` exercised over 420 consecutive dates incl. both DST
boundaries (Sunday is the case worth watching — it snaps 6 days back, not 1
forward) with the lib and Edge-function copies agreeing on all of them; the
constraint confirmed to reject a Wednesday insert; clean `expo export -p web`
plus a Babel parse/scope pass (Metro resolves no identifiers, so a clean export
alone is weak evidence). The modal was driven for real in the browser — a
Wednesday click is inert, Mondays update the range, and the range tracks the
program's length. **Not verified**: any of it behind a real coach login.

## One home per setting: block length, sessions/week, session days (2026-08-15)

Prompted by "there is block settings in two places — which one is real?"
Answer: for group, **neither was fully real**. Settings → Program Defaults
carried `default_block_length_flagship_weeks` / `_bwa_weeks`, and **nothing
read either one.** They were hardcoded to two program names, which stopped
being the whole list the moment programs became coach-creatable — LLYL had no
key and could never have had one — and they had silently drifted: that tab
claimed Flagship was 6 weeks while blocks were being created at 4. Only
`_spc_weeks` and `alert_lead_time_days` were live.

**The rule now, one sentence per tier:**
- **Settings → Defaults** — gym-wide starting values. One `default_block_
  length_weeks` (replacing all three) plus the alert lead time.
- **⚙ {Program} settings** — what makes a program *that program*: name,
  sessions/week, session days. **No defaults live here.**
- **New block dialog** — this cycle: length, start date, rolling.

**Block length is no longer stored as a per-program default at all**, because
it was never really a setting: both the group and SPC dialogs already ask for
it every time. The stepper now seeds from **that program's or client's most
recent block** ("same as last time" — right nearly always, and it stays right
as a cycle length changes with nobody maintaining anything), falling back to
the one gym-wide default only for a first-ever block. New
`listLatestBlockLengthByProgram()` does that in one query, first-row-wins over
a newest-first order. SPC already seeded from the last block when *copying*;
it now does so for a blank block too, so both program types behave identically.

`group_programs.block_length_weeks` is **kept but no longer edited** — it's
`not null` with no DB default and remains `createBlock`'s last-resort
fallback, so `createGroupProgram` seeds it from the gym-wide default. The
three superseded `core.settings` rows are left inert, per this repo's
convention. The New block dialog's program chips stopped appending `(4wk)`,
which would now contradict the stepper below them.

**Real behaviour discovered while checking this, and the modal's copy was
wrong about it**: `session_days` is read **live** by the member screens
through `sessionNumberForDate`, so editing a program's days re-routes blocks
that are **already running** — while `sessions_per_week` is baked into the
session grid at `createBlock` time and so is genuinely future-only.
`updateGroupProgram`'s comment claimed future-only for everything. Both the
comment and the modal's subtitle now say which is which. Probably the desired
behaviour for days; it is just neither documented nor tested.

**Also worth knowing**: `sessions_per_week` means two different things under
one name — on `group_programs` it decides how many sessions get *programmed*
per week, on `client_program_assignments` it's how many a client is *expected
to attend*. Not renamed, but don't assume they're the same number.

**Follow-up the same day — the New block dialog shows what's taken.** The
grid's per-gap "Start new block" button used to create a block outright with a
computed date and no dialog (the band's own button already opened one), so a
coach never saw or could change the length or start. It opens the dialog now,
pre-selected to that program; `handleStartGapBlock`'s old gap-free date
arithmetic is gone because the dialog's own default lands on the same Monday.

`MondayPicker` gained `disabledDates`. The dialog passes every Monday a block
of the chosen length couldn't start on, and `markedDates` for the narrower set
that sit *inside* an existing block — so an occupied stretch reads as a filled
run with markers ("this week already has a block"), and a week that's free but
too close to the next block is simply unpickable. Both recompute as the length
changes, so lengthening a block greys out more Mondays. Picking one anyway is
impossible; if the length is raised until the *current* pick collides, the
range line turns into a red explanation and Create disables. `createBlock`'s
own overlap throw stays as the backstop — this just means a coach shouldn't
ever reach it. Start defaults to the first Monday from this week on that the
block actually fits, which for a program mid-block is the Monday after it
ends — still fully editable, which was the explicit ask.

**Verified**: clean `expo export -p web`, Babel parse/scope pass over all
touched files, and every dialog driven in the browser via a throwaway
`app/zz-harness.js` route — Flagship seeding to its last block's 6 rather than
its stale program column's 4, LLYL (no prior block) falling back to the gym
default 4 with a correct 4-week Mon–Sun range, clean program chips, and the ⚙
modal showing no length field. The taken/blocked calendar was checked against
Flagship's real block (07/20–08/30): Mondays 08/03–08/24 greyed and inert to a
click, 08/31 auto-selected, and raising the length to 10 weeks — enough to
reach a block queued in November — flipping the range line red and disabling
Create. **Not verified**: the Settings → Defaults tab itself, which needs an
admin login.

## Coaches set their own training; per-client question drift; hero-card permission leak (2026-08-18)

Three small things from one message, two of them worth remembering as classes.

**"Some clients still have the text field for the Zoom/Loom question."**
Not a code bug — a data-model fact: each client holds their **own copy** of
the check-in questions (`public.client_checkin_questions`), snapshotted from
the template at approval time by `copyTemplateToClient`. The 2026-08-08
conversion updated the template plus Terra's and Dustin's copies by hand, so
only clients approved *after* that (Liza, Sam, Sarah) got the radio version;
17 pre-existing clients still had text. Fixed with one direct UPDATE (type /
options / booking_option copied from the template row), no code change.
**General rule: any template edit — wording, add, remove, type — reaches new
clients only.** If Terra changes the template and wants it everywhere, sync
the per-client rows the same way; a "Push template to all clients" button on
Settings → Nutrition was offered and not yet asked for.

**Hero "pick up where you left off" showed a nutrition check-in to a coach
with no nutrition access** (Banesa's screenshot). `getCoachDashboardStats`
returns `nutritionReadyForCheckin` for everyone — the roster tile is
permission-agnostic — and `getLaunchpadExtras` passed it straight into
`getResumeTarget`, whose nutrition fallback fires whenever a coach has no
group/SPC edit yet. Now gated on admin-or-`can_view_nutrition` at that one
call site (`canSeeNutrition` in `lib/programming/launchpad.js`). Worth
checking whenever a permission-agnostic aggregate is fed into a per-coach
surface.

**New `app/(coach)/my-training.js`** — a coach sets their OWN group
memberships and SPC enrollment/frequency (sidebar "My Training" under Member
View, and native More). Until this, only an admin could set anyone's
memberships (via `clients/[userId].js`), and the admin's own "Manage own
training" link lives on the admin-only Settings page. **Nutrition is
deliberately absent from this screen — not disabled, absent** — per Terra:
coaches may not turn nutrition on for themselves. That's also why it isn't
just `clients/[userId].js` pointed at the caller's own id. Migration
`0065_staff_own_spc_enrollment.sql` (**run**) adds a self-row policy on
`spc_clients` (`user_id = auth.uid() and core.is_staff()`), because the
existing staff policy is `can_access_spc()` and a coach without the SPC
module would silently fail to enroll themself; group memberships were already
plain `is_staff()`. Enrolling assigns the coach as their own SPC coach.

Bundle + Babel scope pass clean; **not click-tested behind a coach login**
(standing limitation). Commit `d089d63`.

## SPC program printing matches the paper SPC TEMPLATE sheet (2026-08-18)

Terra's SPC coaches still hand-transcribe programs into a Google Sheet
("SPC TEMPLATE", `tsmout1@gmail.com` Drive → Team Kova/SPC, 146 client tabs
— export via the `.gsheet` stub's `doc_id`, same recipe as the tracker
imports). `app/(coach)/spc/print/[blockId].web.js` now reproduces that
template instead of a generic web table: header band (30pt, thick frame,
`NAME | session title` — see below), **Warm up** 1–6 with Sets/Reps/Notes, **Main Session** A/B/C with
E1/E2 superset letters, Sets/Reps/Rest, and blank **Week N / coach: / date:**
columns for handwriting. One Letter-landscape page per printed sheet,
`@page { size: letter landscape }`, rows flex to fill the page, main session
padded to at least 6 bordered rows like the paper.

**Weeks vs. columns — the one real design decision.** The paper assumes the
same lifts every week; the app's SPC weeks are independent rows. Weeks are
grouped into runs of identical exercise lists (`weekSignature`: lift ids +
order + superset pairing + warm-ups — sets/reps/rest deliberately excluded);
each run is one page whose week columns are exactly its weeks. A later week
in a run whose prescription differs gets a small "4 × 8,8,6,6 · 2:00" line at
the top of its column, leaving the space writable. Header started as the
client name only ("eventually titles or focus items"); the session title was
added the same night, below.

**Follow-up same day (Terra's click-through)**: the SPC client page's "Print
block" button now asks which **block** (newest first) then which **session**
via new `components/PrintBlockPickerModal.js` (fetches that block's sessions
itself — the page only holds the selected block's detail); Past blocks keeps
the older `PrintSessionPickerModal`. And her first "Save as PDF" came out
**blank** — inspected the file: made by **Safari** via the macOS dialog, Letter
landscape, one page, empty content stream. Cause: Expo's
`ScrollViewStyleReset` pins `html/body/#root` to `height:100%` with body
`overflow:hidden`; Chrome prints through that, Safari clips the printout to
the hidden box. `@media print` now forces `height:auto; overflow:visible` on
those three. Re-verified Chrome via headless print; **Safari confirmed by
Terra on the deployed site** — a real Save-as-PDF came out with content.

**Second follow-up, same night**: the Notes box beside the warm-ups is one
tall cell with no horizontal rules (the paper's is free space); warm-up
sets/reps fall back to the exercise's library `default_sets`/`default_reps`
when the session row is blank (`listSpcWarmups` now selects them). Terra's
"half the warm-ups have no sets/reps" was **data, not the print**: all 36
blank rows in the live table were Glute Bridge / Half Kneeling Hip Flexor
Strength / Quadruped T Spine Rotation, with nothing on the session AND no
library default — set the library default and every past sheet fills in.
**Why it looked like data**: the builder's `WarmupGrid` inputs had
placeholders `2` / `10/side` rendering in almost the same grey as a saved
value, so Bob's empty warm-ups read as "2 × 10/side" in the builder and
"missing" on paper. Placeholders are now `—` / `reps` in the app's ghost
`#d5cdc4`. **Header is now left-aligned `NAME | session title`** — the
builder's per-week "Name this session" title, first week in the run that has
one; name alone when none is set. **Name, bar and title share one font size**
(30pt, name bold only) — a 34pt name against a small bar/title read as three
things. `FitHeader` shrinks that one size (floor 16pt) until a long name +
long title fits the band instead of clipping. **The tiny borderless warm-up
sets/reps inputs in the builder are also why Terra thought those values were
"stuck"** — they're editable, just not obviously so; worth a visible box if it
comes up again.
**`@page` gotcha, verified via headless print**: `size: 11in 8.5in landscape`
made Chrome emit PORTRAIT (612×792); only `size: letter landscape` gives
792×612 — don't "make it explicit". Also fixed a print-only bug where a gap in
warm-up positions repeated one warm-up in two rows (rows now fill by sorted
index, never by stored position).

Flow otherwise unchanged (SPC client page / Past blocks → Print → pick
session), but both entry points now `window.open` the print view in a **new tab**, which
auto-launches the browser print dialog after a 400ms layout delay — the
preview is the PDF, "Save as PDF" is one click. No PDF library. The
`vercel.json` rewrite for `/spc/print/:blockId` already existed, so a fresh
tab load resolves. `PRINT_CSS` and `PrintPage` are exported from the route
file specifically so a harness can render the real stylesheet.

**Verified as a real PDF, not a screenshot** (and re-verified after every
follow-up above): headless Chrome
(`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
--headless=new --print-to-pdf=… http://localhost:8082/zz-harness`) against a
throwaway harness route produced a 792×612pt (Letter landscape) PDF, 2 pages
for a 4-week block whose week 3 changed, everything on-page. **That is the way
to verify any print layout here** — the Browser pane cannot print. Clean
`expo export`, Babel scope pass clean. **Confirmed live by Terra** (commit
`a46f052`, pushed 2026-08-18): printed a real client from the deployed site
in Safari, output correct.

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

## SPC Live Session Hub — gym-floor display + coach control (2026-08-20)

The 4-client SPC display screen from the original plan, built: a wall-mounted
1920×1080 touchscreen shows up to 4 SPC clients' sessions as side-by-side
vertical columns (like 4 phone screens, no page scroll), live-updating as sets
are logged from any device, and itself a touch input surface. Plan at
`~/.claude/plans/sparkling-splashing-allen.md`. Decisions made with Terra:
dedicated display account (NOT a coach login, NOT per-session pairing codes),
tap-a-lift-for-a-big-entry-pad input (no inline grid editing), and a new
per-client-per-LIFT coaching-note history ("killed this, go up in weight")
keyed on the raw `exercise_id` so it survives into next week/block.

**Migration `0071_spc_live_hub.sql` — RUN and verified live** (tables,
functions, 12 display policies, 2 widening policies all confirmed by direct
query; PostgREST returns `[]` not PGRST205). What it adds:
- `core.users.is_gym_display` + `core.is_gym_display()` — a boolean flag, not
  a new role enum value (ALTER TYPE ADD VALUE can't be used in the same
  transaction it's added in).
- `programming.hub_sessions` (open = `ended_at is null`; a partial unique
  index guarantees at most ONE open session ever) + `hub_session_clients`
  (up to 4 slots; `client_name` is a snapshot specifically so the display
  account needs no `core.users` read policy at all).
- `programming.exercise_coaching_notes` — per (user, exercise) note history;
  `exercise_id` nullable = a general note. Staff manage via `can_access_spc`,
  member reads own, display reads+inserts for hub-active clients.
- `programming.hub_active_client(uuid)` (definer helper used in every display
  policy), `hub_reorder_exercises(workout, items)` (position-only reorder —
  an UPDATE policy can't be column-scoped, so the RPC is the display's only
  write path onto `spc_workout_exercises`), `hub_end_session()` (lets the TV
  end a session; it has no UPDATE policy on hub_sessions).
- Display policies: for-all on `logs`/`session_completions`/
  `exercise_completions` gated `is_gym_display() AND hub_active_client(user_id)`,
  plus published-only reads of the SPC structure tables mirroring 0006's
  member shapes.
- **⚠ Deliberate widening, flagged in the approved plan**: `staff manage
  session completions` + `staff manage exercise completions` via `is_staff()`
  — staff were SELECT-only on both (0007/0040), which blocked a coach's phone
  from ticking lifts/finalizing on a client's behalf. Mirrors 0004's
  `staff manage logs`, which always allowed staff to write a client's sets.

**RLS was verified against the live DB before the migration was run for
real**: the entire migration plus 17 impersonation assertions ran in one
rolled-back script (`set_config('request.jwt.claims', ...)` + `set local role
authenticated`, final `raise exception` carrying the report — a useful trick:
`supabase db query` only prints the LAST statement's rows, but an exception's
message always surfaces, and it rolls everything back). All 17 passed: display
reads/writes exactly the hub-active client, is blocked (42501) on non-hub
clients and foreign-workout reorders, sees zero payroll rows and only its own
`core.users` row (pre-existing self-read policy — expected), can't update
hub_sessions directly but can end via the RPC; coach completions-widening
confirmed.

**Data layer**: `lib/programming/hub.js` (`startHubSession` ends any open one
first, `getOpenHubSession`, `endHubSession` → RPC, `fetchHubBoard` — the
3-second poll, 5-6 bounded queries regardless of client count, logs matched
purely on `spc_workout_id` per 0063, items built in the exact member-plan
shape so `schemeLabel`/`supersetLettersFor` work unmodified — and
`fetchHubWarmups`, fetched once per session, not per poll) +
`lib/programming/coachingNotes.js` (kept separate so the member bundle never
drags hub code). **Live sync is polling, deliberately not Supabase Realtime**
— the realtime publication has zero tables (verified live), no realtime infra
exists anywhere in the app, and member autosave is already debounced 900ms.

**Components** (`components/hub/`, shared by both surfaces — nothing imports
platform siblings): `useHubBoard.js` (the brain; poll-vs-edit merge via an
`editingRef` so a poll never stomps the lift being typed into — the pad holds
draft state, commits on Save, then an immediate out-of-band poll;
simultaneous phone+hub edits converge last-write-per-set, accepted),
`HubClientColumn.js` (compact lift rows with per-set chips, A1/A2 superset
letters precomputed per item id — a counter mutated during render hands out
wrong suffixes under list re-render, edit-order mode with up/down arrows,
finalized = olive column that never disappears; plain `.map` not FlatList —
sessions cap ~9 lifts and a FlatList nested in the coach page's ScrollView
would warn/break; internal ScrollView on TV scale only), `HubEntryPad.js`
(big keypad `HubNumberPad`, per-set boxes with TARGET ghosts, reps-only lifts
drop the LB column entirely, superset sibling chips switch lifts without
closing, member-notes → `logs.notes` convention, coaching-note field +
lazy history), `HubSessionSetup.js` (4 slots, roster picker, per-slot
resolution to first-incomplete-published via `getSpcRosterDetail`'s own
block/week, per-slot errors never block other slots), `HubLiveSession.js`
(the running-session wiring both screens render; phone width shows one
client at a time via SegmentedControl tabs), `HubBoard.js` (N flex columns).

**Routes**: new `app/(display)/` group (`_layout.js` gates on
`profile.is_gym_display`; `index.js` is the TV — idle "waiting" state polling
5s, top bar with clock + inline-confirm End button). `app/(coach)/spc/live.js`
(setup → running view, End session; universal file, no `.web.js` sibling).
Entry links: "Live session" button on the desktop SPC index header and a
"Live session →" link next to Templates on `SpcRosterMobile`. Gate edits:
`is_gym_display` added to BOTH AuthProvider profile selects (lines 78/122 —
miss one and the flag never reaches the router), `app/index.js` routes the
flag to `/(display)` before the role branches, and member + both coach
layouts redirect it away. No vercel.json change — all new routes are static.

**Member surfacing**: `plan.js`'s SPC detail effect batches
`listLatestCoachingNotes` in its own `.catch(() => new Map())` (a notes
failure never blanks the session) and attaches `coachingNote` per item;
`ExerciseCard` renders it as "From your coach: …" + date right under the
existing programmed "Coach note:" line — rides the item through SessionLogger
untouched.

**Verification**: migration + RLS proven live (above); `npx expo export -p
web` clean + Babel parse/scope pass over all 21 touched files; the 4-up board
(6/8/9 lifts, superset pair, reps-only lifts, one finalized client, coaching-
note dot), the entry pad (keypad typing, Next-advance, per-box olive fill,
superset chip switch to a reps-only layout, Save payload shape), the phone
column, and edit-order mode (arrows, first/last dimmed, move callback) were
all driven for real through a throwaway `app/zz-harness.js` at 1920×1080 and
390×844 (deleted after, `git status` clean). Page-scroll checked by DOM
measurement (scrollHeight == clientHeight at 4-up). **Not verified**: anything
behind a real login — standing limitation. The synthetic-click flakiness on
RNW Pressables hit again this session; the documented `dispatchEvent`
pointer-sequence fallback worked (note: an Ionicons pressable's `textContent`
is the glyph char, NOT "" — don't filter on empty text when hunting for one).

**Manual steps for Terra (one-time, in the migration header too)**:
1. Supabase Dashboard → Authentication → Add user `display@kovastrength.com`
   (strong password).
2. `insert into core.users (id, name, email, role) values ('<auth uid>',
   'Gym Display', 'display@kovastrength.com', 'member') on conflict (id) do
   nothing; update core.users set is_gym_display = true where email =
   'display@kovastrength.com';`
3. Sign the TV's browser in once at the normal login page — it routes itself
   to the board and stays signed in.

**Deferred v1** (per the approved plan): plate calculator inside the entry
pad, coaching-note history on the member side, group-program (non-SPC) hub
support. Worth a real click-through: start a session from a phone, confirm
the TV picks it up ≤5s, a phone-logged set appears on the TV ≤3s, a TV pad
write shows on the member's phone, reorder/finalize/end round-trip, and a
coaching note written at the TV showing on the member's card next session.

## First-run audit: 17 findings, 5 batches, all closed (2026-08-21)

An unbiased first-run walkthrough (brand-new member, then a coach checking a
client) produced 21 findings; 17 survived triage into a 5-batch plan. All are
now closed. **The audit and plan artifacts are the working documents** —
`~/.claude/projects/.../memory/first_run_audit_fix_plan.md` holds the live URLs
and per-item detail. What follows is only what stays useful afterwards.

**Batch 1 — auth email links.** Root cause was the Supabase email *templates*,
not the redirect allow-list: all three hardcoded `{{ .SiteURL }}/auth/confirm`
(a *Nutrition Tracker* route — 200 there, 404 on Kova) and never used
`{{ .ConfirmationURL }}`, so the app's `redirectTo` had never mattered for
email at all. Also why coach invites always landed on the old app. Fixed in
the dashboard; the management API 403s on `mailer_templates_*`.
**Sequencing trap:** templates before Site URL — flipping Site URL first moves
every auth email from a working page to a 404. **To test a redirect without
sending mail:** `GET /auth/v1/verify?token=bogus&type=recovery&redirect_to=<url>`
and read the `Location` header. `admin/generate_link` ignores `redirect_to`
entirely and `POST /auth/v1/recover` 200s for anything, so both are useless here.

**Batch 2 — de-gendered the coach copy.** Terra chose **drop the pronoun, not a
they/them swap** — that's the standing convention for any new coach-facing
string. `HERS ONLY` → `CUSTOM`, `hersOnly`/`hersOnlyCount` → `custom`/`customCount`.
Code comments were left alone (not user-facing).

**Scope user-facing copy with an AST pass, never grep** — grep over-reported by
more than half here (mostly code comments): `@babel/parser` + `@babel/traverse`,
visit `StringLiteral` / `JSXText` / `TemplateElement`, report
`p.node.loc.start.line`. Real count was **44 strings across 21 files**, not the
29/14 a grep-based estimate claimed. Reusable for any "find all copy matching X".

**Batch 3 — dynamic routes, and a build gate for them.** Three routes had no
`vercel.json` rewrite and 404'd on a fresh load or a refresh
(`/events/:eventId`, `/events/:eventId/responses`, `/spc/overview/:userId`);
the events one mattered most because event push notifications carry that exact
URL. **This bug class is silent by design** — client-side navigation never asks
the server, so a missing rewrite only breaks for someone following a link
straight in.

`scripts/check-vercel-rewrites.mjs` (`npm run check:routes`) walks a real
export for every dynamic route, builds the URL a member would actually request,
and fails with the exact rewrite line to paste; it also flags a rewrite whose
destination file no longer exists. It skips `(group)`-prefixed paths — those
are a file-layout artifact, not URLs. **It is wired into `"build"`**
(`expo export -p web && npm run check:routes`), which is what Vercel runs in
place of its own detected Expo command whenever a `build` script exists — so a
future dynamic route without a rewrite fails the deploy rather than shipping
broken. Mutation-tested in both directions; it passed on its first real deploy.
A failed build cannot take the site down: Vercel only points the domain at a
deployment that built.

**Don't call a Vercel deploy failed too early.** This one took several minutes
during which production kept serving the *previous* commit's bundle, which
reads exactly like a failure — I said so, and was wrong. Verify by re-checking.
The reliable probe: `curl -o /dev/null -w '%{http_code}'` against a dynamic
route, plus grepping the live entry bundle
(`curl <site>/<page>` → the `/_expo/static/js/web/entry-*.js` path) for a marker
string unique to the new commit.

**The gym-floor TV is a real `core.users` row** (`is_gym_display`, migration
0071, role `member`). It was showing on the Clients roster as a client called
"Gym Display", counting toward the unassigned tally, and sitting inside the
audience for every all-gym push. Filtered out of `listMembers()` and the
`"all"` branch of `_shared/announcementAudience.ts` — the other three audience
branches resolve through membership tables it isn't in. **Anything new that
enumerates members or push recipients needs the same filter.** Known and left
alone: CCrew's `listKovaUsers()` still offers it as a Kilo-attendance match.

**Batch 4 — `/register` and `/reset-password` are now one flow.** They had
drifted into 95% the same code and *the drift was the bug*: reset-password kept
picking up improvements register never got, so the screen a brand-new member
meets first was the worse of the two. `components/auth/CodeAuthFlow.js` is the
shared flow; the two screens are ~25 lines each, differing only in a `copy`
prop. 451 lines of duplication removed.
- **`request-registration-code` returns the same `{sent:true}` whether it
  texted a code, found no account, or refused inside its 45s cooldown** —
  deliberate, anti-enumeration. So a Resend inside that window would report
  success having done nothing; the button counts down instead, and is only
  pressable when it will actually act.
- The countdown tracks a **deadline** (`resendAt` + `Date.now()`), not a
  decrementing number: browsers throttle timers in a backgrounded tab, so a
  counter drifts behind real time. That's a *duration*, so plain `Date.now()`
  is correct and the `boiseDate` rules don't apply — commented in the file so a
  later pass doesn't "fix" it into `todayInBoise`.
- Both screens are reachable signed-out, so they can be **driven in a browser
  for real**. Use an address that matches no account (`…@example.invalid`,
  checked against `core.users` first) — the uniform response means nothing is
  sent and no real member is texted.

**Batch 5.** Announcement expiry (migration 0072, above; compose picker
defaults to **2 weeks**, counted from `send_at` not from now, `Never` still
available; `scan-announcements` skips expired rows). Clients page made usable
at phone width. Member Settings' two nutrition-only notification toggles are
gated on nutrition enrollment and the card hides when empty — **starts hidden
so it can't flash in and vanish, but a failed lookup shows it: a blip must
never hide a setting somebody genuinely has.** Showing a member their assigned
coach was declined, not built.

### Two things worth generalising from this pass

**A bare `flex-wrap` on a react-native-web row does nothing unless the row
itself can shrink.** RNW's `View` defaults to `flex-shrink: 0`, so a row of
buttons keeps its full intrinsic width, its own wrap never engages, and it runs
past the viewport — while `document.scrollWidth` stays put, so it can't even be
scrolled to. Bit twice in this pass (the nutrition header's "+ Enroll client",
then the Clients header) and both times the row *already had* `flex-wrap`, so
the obvious fix was not the fix. Add `flexShrink: 1` + `minWidth: 0`, and
**measure `getBoundingClientRect()` rather than eyeballing a screenshot** — the
overflow is invisible in one.

**An audit finding can be stale, and Terra questioning a premise is worth more
than the finding.** M-C3 claimed finishing a workout "empties the page". It
doesn't: `components/session/FinalizePlate.js` + `lib/finalizePlate.js` show a
full-screen plate with PRs, session volume and weekly progress, and a
"✓ No remaining sessions this week" card sits underneath. The audit had been
written against a reading of the screen that predated that handoff. Going and
reading the code turned a redesign question into a two-line bug fix: once the
last session is finalized nothing is `"ready"`, so `focus` resolves to null in
`plan.js` and SPC's empty-state lines rendered by default — a member finishing a
group workout got "Your SPC coach hasn't published this block yet" under her
done card. Now gated on `focus?.type === "spc" || groups.length === 0`.

## Database migrations

Flat-numbered SQL files in `supabase/migrations/`, applied manually via the Supabase SQL Editor — no CLI/DB-password access is wired up in this environment, same as the Nutrition Tracker app's workflow. **All of 0001-0004 have been run** against the live project as of this writing:

- `0001_core_users_settings.sql` — `core` schema, `users`, `settings`, `is_staff()`/`is_admin()`, bootstrap-admin RLS policy
- `0002_push_tokens.sql` — `core.push_tokens`
- `0003_schema_grants.sql` — **required after 0001**, and required again after any migration adds tables to a schema that isn't `public`. Supabase auto-grants `public` schema access to the `anon`/`authenticated` roles, but custom schemas need it explicitly (`grant usage on schema ... to anon, authenticated, service_role` + table grants) or every query 403s with "permission denied for schema X" even though RLS policies are otherwise correct. `alter default privileges` in this migration covers future tables *in that schema*, but 0004 still repeated the explicit grants defensively — do the same in future schema-adding migrations rather than assuming the default-privileges line has you covered.
- `0004_programming_group.sql` — `programming` schema: `exercises`, `group_programs` (seeded Flagship/BWA), `group_blocks`, `group_workouts`, `group_workout_warmups`, `group_workout_exercises`, `client_program_assignments`, `logs`, `program_comments` (group-only for now — will need an `alter table` + relaxed check constraint once SPC's `spc_blocks` exists in a later migration, per the plan's original note about sequencing SPC before the comments table).
- `0005_nutrition_core.sql` — **run against the live project.** `nutrition` schema: `nutrition_clients`, `targets` (insert-only/versioned), `daily_logs` (nullable macro columns by design — see "Bugs found and fixed"), `checkin_template_questions`, `client_checkin_questions`, `checkin_responses`.
- `0006_programming_spc.sql` — **run against the live project.** `programming` schema additions for SPC: `spc_clients`, `spc_blocks`, `spc_workouts` (one row per session, no `week_number` — unlike group, weeks live as columns), `spc_workout_warmups`, `spc_workout_exercises`, `spc_exercise_weeks` (per-week sets/reps/rest + app-stamped `coach_initials`/`touched_date`). Also widens `program_comments` with a nullable `spc_block_id` + a check constraint requiring exactly one of `group_block_id`/`spc_block_id`, per the note left in `0004`'s header.
- `0007_session_logging.sql` — **run against the live project.** Adds `set_number` to `programming.logs` (per-set logging) and new `programming.session_completions` table (finalize/completion tracking for both group and SPC sessions) — see the Design/UX pass section above for the full feature this enabled.
- `0008_one_off_workouts.sql` — **run against the live project.** `workout_templates`/`template_warmups`/`template_exercises` (reusable one-off content) and `one_off_workouts`/`one_off_warmups`/`one_off_exercises` (a template copied onto one specific client); widens `session_completions` (adds `one_off_workout_id`, three-way check constraint) and `logs.source` (adds `'one_off'`) — see the Design/UX pass section above.
- `0009_session_titles_and_frequency.sql` — **run against the live project.** Adds `title` to `group_workouts` and to `spc_workouts` (default-for-the-block title), new `spc_workout_week_titles` table (per-week title override), and `sessions_per_week` (smallint, 1-3, default 3) to `client_program_assignments` — see the "Today tab reworked into a weekly overview" section above.
- `0010_group_program_memberships.sql` — **run against the live project.** Drops `group_programs.name`'s CHECK whitelist; restructures `client_program_assignments` from one-row-per-client to one-row-per-membership (new `id` primary key, `group_program_id` now `NOT NULL`, `unique(user_id, group_program_id)` — deletes old null-`group_program_id` placeholder rows first); widens `logs.source`'s CHECK to add `'group'` — see the "Group programs: multi-membership" section above.
- `0011_group_program_session_days.sql` — **run against the live project.** Adds `group_programs.session_days` (jsonb, default `[[1,2],[3,4],[5,6]]`) — each program's own day-of-week → session-number map, replacing the previously-hardcoded-global Flagship/BWA Mon/Tue-Wed/Thu-Fri/Sat scheme. **Needs `NOTIFY pgrst, 'reload schema'` after running** — new columns need this same as new tables (confirmed the hard way earlier the same day with the SPC-titles bug).
- `0012_exercise_type.sql` — **run against the live project.** Adds `exercises.type` (`'lift'`/`'warmup'`, default `'lift'`), `exercises.default_sets`/`default_reps` (nullable, warm-up prefill), and drops `exercises.muscle_group`'s `NOT NULL` (not applicable to warm-ups). See "Coach web v1 design pass" below for the Exercise Library rework this backs.
- `0013_spc_alert_push_cron.sql` — **run against the live project.** Not a schema migration — registers a `pg_cron` job that calls the `scan-spc-alerts` Edge Function daily. See "Coach push notifications" below.
- `0014_nutrition_reminder_cron.sql` — **run**, confirmed live 2026-08-09 (`nutrition-reminders-scan` shows in `cron.job`). Not a schema migration — registers two more `pg_cron` jobs for the nutrition reminder functions, which were since rewritten to query `public.*` instead of the placeholder schema (redeployed) — see "Nutrition rebuilt against the standalone app's live tables" below.
- `0015_coach_permissions.sql` — **run against the live project.** Adds `core.users.can_view_spc`/`can_view_nutrition`/`can_view_exercise_library` (booleans, default `true`), three `core.can_access_*()` helper functions, and re-points every SPC/Nutrition/template "staff manage" RLS policy at them. See "Coach account permissions + dual-login" above.
- `0018_nutrition_coach_backfill.sql` — **run against the live project.** Not a `programming`/`core` migration — backfills `public.coaches` rows (the standalone Nutrition Tracker app's own table) for existing Kova coaches/admins. See "Nutrition rebuilt against the standalone app's live tables" below. (0016/0017 predate this session — SPC per-week/block-delete changes, not nutrition-related.)
- `0020_member_notification_prefs.sql` — **run**, confirmed live via direct schema query 2026-08-09. Adds `core.users.notify_daily_log_reminder`/`notify_checkin_available`/`notify_coach_messages` (booleans, default `true`) plus a narrow security-definer RPC (`core.update_own_notification_prefs`) for a member to write just those 3 columns on their own row. See "Design handoff v2" above. (0019 predates this session — dashboard dismissals, unrelated.)
- `0021_first_login_at.sql` — superseded by `0022` the same day, before this one was ever run against the live project. Safe to skip entirely, or run harmlessly if it's easier not to think about it (`0022`'s drops are `if exists`).
- `0022_login_activity.sql` — **run this one, not 0021.** Adds `core.get_login_activity(user_ids uuid[])`, a staff-only security-definer function reading `auth.users.last_sign_in_at` directly (and drops `0021`'s column/function first, in case that one did run). Backs the main Clients page's "Never signed in · Resend invite" indicator — see "Nutrition dashboard rework" above.
- `0023_nutrition_milestones.sql` — **run**, confirmed live via a direct schema query (`programming.nutrition_milestones` exists) in the 2026-08-04 later session. Adds `programming.nutrition_milestones` + `acknowledge_nutrition_milestone()` — see the nutrition coach-tools follow-up passes above.
- `0024_announcements.sql` — **run**, confirmed live the same way. Adds `programming.announcements` + `announcement_acknowledgments` (admin-manage, member-reads-due RLS). See "Gym-wide announcements + real push notifications finally unblocked" above.
- `0025_announcement_push_cron.sql` — **run**, confirmed live — `announcement-scan` shows in `select * from cron.job;`, firing every 15 minutes. Not a schema migration — registers the `pg_cron` job hitting `scan-announcements` so scheduled (not "send now") announcements still push once their time arrives.
- `0026_ghl_import_and_registration.sql` — **run.** Adds `core.users.ghl_contact_id` (nullable, unique) and `core.registration_codes` (hashed one-time codes, no RLS policies — service-role-only access). See "iOS push confirmed live, Universal Links, GHL import groundwork" above.
- `0027_milestone_emoji.sql` — **run.** Adds `programming.nutrition_milestones.emoji` (nullable text). See "Nutrition/mobile polish batch" above.
- `0028_checkin_reopen.sql` — **run**, confirmed live via direct schema query 2026-08-07 (was stale in this file as "not yet run"). Adds `programming.nutrition_checkin_reopens` (coach-granted late-filing window for one missed week). See "Coach can reopen a missed weekly check-in" above.
- `0032_client_messages.sql` — **run**, confirmed live via direct schema query 2026-08-07 (was stale in this file as "not yet run"). Adds `programming.client_messages` (one flat coach↔member thread per client, insert-only RLS). See "Quality audit & fix pass" (Round 4, feature 3) above. `0029_exercise_multiselect_and_variations.sql` and `0030_superset_and_rep_scheme.sql` are confirmed **not yet run** (checked live the same day) — being worked through a separate session, don't run them here. `0031_nutrition_onboarding_send.sql` is confirmed run, see its own section above.
- `0033_nutrition_coach_optional.sql` — **run**, confirmed live 2026-08-07. Touches the **shared** `public.*` schema, not `programming`/`core` — `alter table public.clients alter column coach_id drop not null`. See "Quality-audit follow-ups" (item 3) above.
- `0034_client_message_reads.sql` — **run**, confirmed live 2026-08-07. Adds `programming.client_message_reads` + `programming.mark_own_thread_read()` (unread tracking for the coach↔member thread). See "Quality-audit follow-ups" (item 4) above.
- `0035_review_signin_notify.sql` — **run**, confirmed live 2026-08-07. Adds a trigger on `auth.users` that texts Terra whenever `review@kovastrength.com` signs in. See "Text alert when Apple's App Review account signs in" above.
- `0036_payroll_schema.sql` — **run**, confirmed live 2026-08-07. Creates the whole `payroll` schema (`pay_periods`, `core_rates`, `other_rates`, `spc_tiers`, `pay_entries`, `custom_requests`, `nutrition_assignments`, `finalizations`) plus `core.users.can_log_ops_hours` and the `payroll_period_anchor_date`/`payroll_deadline_weekday`/`payroll_deadline_time`/`notify_payroll_deadline_reminders` `core.settings` rows. Had a real table-ordering bug on the first attempt (fixed same session — see "Payroll module" above) before this ran clean.
- `0037_payroll_seed_data.sql` — **run**, confirmed live 2026-08-07. Generated (not hand-written) by `scripts/payroll_import.py` from the real Glide export — 2,158 historical `pay_entries`, 43 `custom_requests`, 23 `pay_periods`. Failed once on a genuine duplicate-`EntryID` bug in the source data (fixed same session — see "Payroll module" above) before this ran clean. Re-running this same script against a future, newer Glide export is intentionally safe (idempotent upsert) — see "Payroll module" above for exactly how.
- `0038_payroll_deadline_cron.sql` — **run**, confirmed live 2026-08-07. Registers the `payroll-deadline-reminder-scan` pg_cron job hitting the deployed `scan-payroll-deadline-reminders` Edge Function, using the project's real `CRON_SECRET`. Originally every 15 minutes; rescheduled to hourly by `0058` (below).
- `0039_payroll_schema_usage_grant.sql` — **run**, confirmed live 2026-08-07. Patches a real bug in `0036`: it granted table/sequence privileges on `payroll` but never `GRANT USAGE ON SCHEMA payroll` itself — Postgres checks schema-level USAGE before table grants, so every payroll query failed with `permission denied for schema payroll` even after `payroll` was correctly checked under Exposed Schemas and RLS/table grants were all in place. Same exact bug class `0003` exists to fix for `core`/`programming`/`nutrition` — missed it this time despite that precedent. `0036` itself is also fixed going forward (includes the USAGE grant now) so a fresh setup elsewhere won't repeat this; `0039` is what actually fixed the already-live project.
- `0040_exercise_completions.sql` — **run**, confirmed by the user 2026-08-08. Adds `programming.exercise_completions` (per-exercise "mark complete" checkbox on My Fitness's focus logging view — same XOR-of-three + partial-unique-index pattern as `session_completions`, row existence = complete). See "My Week / My Fitness rework" above.
- `0041_payroll_redesign.sql` — **run**, confirmed live via direct schema query 2026-08-09. Adds `pay_entries.strategy_notes`, `pay_periods.owner_pay`/`staff_pay`/`taxes_paid`, and a new `payroll.closed_period_rate_snapshots` table. See "Payroll redesign: tile-based entry, admin/staff view split, audit-locked closed periods" above.
- `0042_checkin_question_choices.sql` — **run**, confirmed live via direct schema query. Adds `question_type`/`options`/`booking_option` to `public.checkin_template_questions`/`public.client_checkin_questions` (multiple-choice check-in questions + a Zoom-booking trigger). See "Nutrition check-in: multiple-choice questions, Zoom booking via GHL calendar" above.
- `0043_checkin_available_notification_polling.sql` — **run.** Not a schema migration — reschedules the `nutrition-checkin-available-scan` pg_cron job from a fixed weekly slot to a 15-minute poll.
- `0044_announcement_requires_reload.sql` — **run**, confirmed live via direct schema query. Adds `programming.announcements.requires_reload` (one-tap "Refresh now" button on the in-app announcement popup). See "One-tap 'Refresh now' on announcements, and the nutrition check-in-available notification repointed through it" above.
- `0045_other_rate_field_config.sql` — **run**, confirmed live via direct schema query 2026-08-09. Adds `payroll.other_rates.has_qty`/`has_notes` (both default `true`) — per-type admin toggles for which fields show on the "Other" entry popup. See "Payroll polish pass" above.
- `0046_gusto_employee_mapping.sql` — **run**, confirmed live 2026-08-09. Adds `core.users.gusto_employee_uuid` (nullable, unique) — the mapping the `payroll-to-gusto` Claude skill reads; not used by app code.
- `0050_nutrition_plan_phases.sql` — **run**, confirmed live 2026-08-11 (both tables + all four RLS policies verified by direct query, `NOTIFY pgrst, 'reload schema'` sent). Adds `programming.nutrition_plan_phases` + `nutrition_plan_phase_items` — the coach's undated, drag-ordered "what we're working on" map for a nutrition client, also shown to the member. Items carry no `user_id` of their own; the member read policy resolves ownership through the parent phase. See the section above. (`0048`/`0049` belong to the parallel exercise-library/block-length work, not this pass.)
- `0051_payroll_day_submissions.sql` — **run**, confirmed live 2026-08-11 (columns, both FKs, the `unique (user_id, entry_date)` the upsert's `onConflict` depends on, all 4 RLS policies, grants, and a real REST call returning `200 []` rather than PGRST205, `NOTIFY pgrst, 'reload schema'` sent). Adds `payroll.day_submissions` — one row per (coach, date) recording that the coach tapped Submit for that day on the payroll entry screen. See "Payroll entry: day-level submit" above for why it's deliberately leaner than `payroll.finalizations`.
- `0052_workout_edit_tracking.sql` — **run**, confirmed live 2026-08-12 (all six triggers verified in `pg_trigger`, and a rolled-back test UPDATE confirmed `updated_at` moves). Adds `last_edited_by` to `group_workouts`/`spc_workouts` plus BEFORE-UPDATE stamping and AFTER-INSERT/UPDATE/DELETE parent-touch triggers on the four content child tables. Backs the coach-web launchpad's resume card and the grid's "you were here" — see the coach web v2 section above for why this is triggers rather than app-side writes, and why there's no backfill.
- `0053_exercise_merge_dismissals.sql` — **run**, confirmed live 2026-08-12. Adds `programming.exercise_merge_dismissals` (pairs a coach has deliberately kept separate, canonical id order, reversible) behind the same `core.can_access_exercise_library()` gate as managing the library itself.
- `0054_spc_tempo.sql` — **run**, confirmed live 2026-08-12 (column verified by direct query, `NOTIFY pgrst, 'reload schema'` sent). Adds `tempo` (text, nullable) to `programming.spc_workout_exercises`. See the coach web v2 phase 3 section above for why 0016's "SPC doesn't get tempo" decision was reversed.
- `0055_payroll_review.sql` — **run**, confirmed live 2026-08-12 (all five columns verified by direct query). Adds `approved_at`/`approved_by`/`sent_back_at`/`sent_back_by`/`send_back_note` to `payroll.finalizations` and replaces `finalize_own_period()` so a re-submit clears them. No new RLS — 0036's `for all` admin policy already covers these. See the phase-4 section above for why a send-back must also write `reopened_at`.
- `0056_roster_last_session.sql` — **run**, confirmed live 2026-08-12. Adds `programming.get_last_session_dates(uuid[])` (DISTINCT ON, one row per client, unbounded lookback) for the Clients table's Last session column, its default sort, and the Quiet 7+ days chip. Deliberately caller-rights, not security definer.
- `0057_client_notes_and_limitations.sql` — **run**, confirmed live 2026-08-12 (both tables + both policies verified). Adds `programming.client_notes` and `programming.client_limitations`, staff-only in every direction — a member has no policy on either, not even select.
- `0058_payroll_deadline_schedule.sql` — **run**, confirmed live 2026-08-12. Not a schema migration — settings + cron config for the payroll deadline reminder: `payroll_deadline_time` → `20:00`, new `payroll_deadline_followup_time` → `12:00`, **deletes** the now-unread `payroll_deadline_weekday`, and reschedules the cron job to hourly. Uses `cron.alter_job` rather than `cron.schedule` specifically so the existing command (which holds the real `CRON_SECRET`) is preserved and no secret has to be pasted into a committed file — worth reusing whenever only a cron *schedule* needs changing. See the section below.
- `0059_plan_phase_status.sql` — **run**, confirmed live 2026-08-12 (column, `nutrition_plan_phases_status_check`, and all 16 existing rows reading `planned` verified by direct query; `NOTIFY pgrst, 'reload schema'` sent and confirmed with a real REST select). Adds `programming.nutrition_plan_phases.status` (`planned`/`now`/`done`, default `planned`, so every existing row keeps rendering exactly as it does today with no backfill). Reverses 0050's deliberate "no status flag" decision — see the phase-5 section below for why order and status turned out to be different facts. Needs `NOTIFY pgrst, 'reload schema'` after running.
- `0060_announcement_graphics.sql` — **run**, confirmed live 2026-08-13 (column, bucket, and all 4 storage policies verified by direct query). Adds `programming.announcements.image_path` plus the **public** `graphics` storage bucket and its admin-write/public-read policies. See the announcement-graphics section above for why this bucket is public where nutrition's `photos` is not.
- `0061_events.sql` — **run**, confirmed live 2026-08-13 (5 tables with the expected policy counts, plus a real REST select returning `[]` rather than PGRST205). Adds `programming.events` / `event_items` / `event_questions` / `event_responses` / `event_response_items`, and `announcements.event_id`. **Do not reorder this file** — the child tables' policies reference `programming.events` in an EXISTS subquery, and Postgres resolves those at CREATE POLICY time (the bug that broke 0036 in production). Uses `unique nulls not distinct` (Postgres 15+) on the response-items constraint so an options-less item can't accumulate duplicate rows.
- `0063_blocks_start_on_monday.sql` — **run**, confirmed live 2026-08-15 (0 non-Monday blocks remaining, both CHECK constraints present, and a Wednesday insert verified rejected). Snaps every existing `group_blocks`/`spc_blocks` row back to its week's Monday and adds `group_blocks_start_monday` / `spc_blocks_start_monday`. Carries its own rollback UPDATEs in a comment. See "Blocks start on Monday" below.
- `0062_event_signup_options.sql` — **run**, confirmed live 2026-08-13. Adds `programming.events.ask_guest_count` (boolean, default **false**) and `cta_label` (nullable). Both additive; every existing event keeps behaving as it did.
- `0064_exercise_tracks_weight.sql` — **run**, confirmed live 2026-08-17 (column present, `not null default true`). Adds `programming.exercises.tracks_weight` — false for bodyweight/rep-only lifts, which log reps with no weight box and are excluded from PR tracking. See the tweak-batch section below.
- `0065_staff_own_spc_enrollment.sql` — **run**, verified live 2026-08-18. Adds a self-row `for all` policy on `programming.spc_clients` so any staff member can enroll/unenroll *themself* regardless of their `can_view_spc` flag. See the 2026-08-18 section above.
- `0066_truecoach_imports.sql` — **run**, verified live 2026-08-18 (2 tables, trigger, 2 RPCs, `logs.truecoach_import_id`, `logs_source_check` widened). TrueCoach history staging + member linking. See the section above.
- `0071_spc_live_hub.sql` — **run**, verified live 2026-08-20 (3 tables, flag column, 3 functions, 12 display policies, 2 widening policies; PostgREST `[]` not PGRST205). SPC Live Session Hub + per-client-per-lift coaching notes + the staff completions-write widening. See its own section above.
- `0072_announcement_expiry.sql` — **run**, verified live 2026-08-21. Adds `programming.announcements.expires_at` (nullable; null = never expires, so every pre-existing row is unaffected) and rewrites the `members read due announcements` policy to `send_at <= now() and (expires_at is null or expires_at > now())`. Enforced in RLS deliberately, not in the app — an expired announcement stops existing for members the same way an unsent one already does. Next number is 0074.
- `0073_logs_unique_set.sql` — **run**, verified live 2026-08-21. De-duplicates `programming.logs` and adds `logs_unique_set_idx`, a `UNIQUE NULLS NOT DISTINCT` index over user, exercise, date, set number, all three session references, `week_number` and `truecoach_import_id`. `logResult()` was a hand-rolled select-then-update-or-insert with nothing backing it, so two racing autosaves both inserted the same set. **`NULLS NOT DISTINCT` is load-bearing** — every session column is null for a row with no session reference, and plain UNIQUE treats each of those as distinct, which would let the duplicates straight back through. **The key is wide on purpose**: two genuinely different sessions on one date must stay separate rows, and linking two TrueCoach imports to the same Kova lift (0066, in active use on five exercises) each materialises its own set rows. `ON CONFLICT` inference against a nulls-not-distinct index was verified on a throwaway table before the code was changed.
- **Numbering collision worth knowing about**: there are **two** files numbered `0063` — `0063_blocks_start_on_monday.sql` and `0063_logs_session_reference.sql`, committed separately (`52fdd72` and `b9140e9`) by parallel sessions. **Both are applied** (verified live 2026-08-17: the logs session-reference columns exist), so nothing is broken — but filename order no longer tells you what ran, and "the 0063 migration" is ambiguous.
- `0047_member_settings_read_and_group_rest.sql` — **run**, confirmed live 2026-08-09 (policy + column verified by direct query). Two fixes from the UX-overhaul plan: (a) a narrow member-read RLS policy on `core.settings` whitelisted to `messaging_enabled`/`messaging_audience` — before this, members couldn't read the messaging kill switch at all (staff-only select policy from 0001), so `getSetting`'s default `true` made the message bubble show for members even with messaging off gym-wide; (b) `group_workout_exercises.rest` — group was the only exercise table without a rest column (SPC/templates/one-offs all have one).

**After running any migration that adds new tables**, PostgREST's schema cache needs a nudge — it doesn't pick up new tables automatically. Run `NOTIFY pgrst, 'reload schema';` in the SQL Editor immediately after. If that doesn't seem to take effect, check the Data API settings page (Project Settings → API) for a manual reload button, or just wait a minute for PostgREST's own timer. This bit us once (see below) — mention it proactively next time rather than waiting for a "table not found" error to prompt it.

## Bugs found and fixed during Phase 1-3 build/test

Worth knowing about since they're the kind of thing that could resurface in a similar shape elsewhere in the codebase:

- **Missing table-level GRANTs on custom schemas** — see 0003 above. First real error hit: `permission denied for schema core` (Postgres code 42501).
- **PostgREST schema cache staleness** — `Could not find the table 'programming.exercises' in the schema cache` (PGRST205) right after running 0004, even though the table existed. Fixed by `NOTIFY pgrst, 'reload schema'`.
- **`getCurrentBlock`'s `.maybeSingle()` threw when two blocks for the same program both matched "today"** (happened naturally during testing once real elapsed time caught up to a second test block's start date) — this doesn't error loudly, it hangs the caller on an unhandled promise rejection since the member screens' `load()` functions didn't have a try/catch. Fixed in `lib/programming/memberPlan.js` with `.order("block_start_date", { ascending: false }).limit(1)` before `.maybeSingle()`, and added `try/catch` + an error state to both `app/(member)/index.js` and `app/(member)/plan.js` so a future unexpected failure surfaces a message instead of an infinite spinner.
- **`npm install` with `--legacy-peer-deps` repeatedly, silently dropped already-installed transitive dependencies from `node_modules`** (`babel-preset-expo`, `@expo/metro-runtime`, `react-native-worklets` each hit this at different points) even though `npm ls` still reported them as present in the logical tree. Symptom: Metro bundling fails with `Cannot find module 'X'` for a package you never touched. This is caused by the peer-dependency conflict between the pinned `react@19.2.3` and a newer `react-dom@19.2.7` that `expo-router`'s bundled `@expo/ui`/web-tooling pulls in transitively (`vaul`/`@radix-ui/*` — this is dev-only web-preview tooling inside expo-router itself, unrelated to anything this app actually uses). **If you hit a "module not found" error for a package that should already be installed**, don't chase it file-by-file — `rm -rf node_modules package-lock.json && npm install --legacy-peer-deps` from scratch reliably fixes it. Always verify critical packages are physically present after any install (`ls node_modules/<pkg>`), not just logically present per `npm ls`.
- **`react-native-reanimated@4` requires a separate `react-native-worklets` package** — it was split out in v4, unlike earlier versions where the worklets plugin shipped inside reanimated itself.
- **Metro was scanning `supabase/functions/**` (Deno Edge Functions, `.ts`)** and both (a) tripping Expo CLI's "are you using TypeScript?" auto-detection and (b) attempting to bundle a `.ts` file that isn't part of the app. Fixed with `config.resolver.blockList = [/supabase\/functions\/.*/]` in `metro.config.js`. `typescript` is still installed as a dependency (required once any `.ts` file exists anywhere in the project, even an unbundled Edge Function) but the app itself is plain JS.
- **Nutrition screens' initial load effects had no error handling** — before the nutrition migration was run, every nutrition screen's data-fetch threw (table not found), and since `useEffect`'s async IIFE had no `try/catch`, `setReady(true)` never ran and the screen hung on an infinite spinner instead of surfacing an error. Same class of bug as the `.maybeSingle()` issue above. Fixed by adding `try/catch` + a `loadError` state to all six nutrition screens (`app/(member)/nutrition/*`, `app/(coach)/nutrition/*`), matching the existing pattern in `app/(member)/index.js`/`plan.js`.
- **The SPC print view's week-column table headers used shorthand `<>...</>` fragments inside a `.map()` with the `key` prop placed on the children instead of the fragment itself** — shorthand fragments can't take props at all, so React silently dropped the keys and warned about it in the console (intermittently, since it's a dev-only warning). Fixed by switching to explicit `<Fragment key={...}>` from `react` in `app/(coach)/spc/print/[blockId].web.js`. Worth remembering as a general rule: any `.map()` that returns multiple sibling elements needs the explicit `Fragment` import with the key on the fragment, not shorthand `<>`.
- **A new cross-module `Promise.all` almost broke an already-working screen** — the first draft of the nutrition-assignment addition to `app/(coach)/clients/index.js` put the new `listNutritionClients()` call in the same `Promise.all` as the pre-existing `listMembers()`/`listAssignments()`/`listGroupPrograms()` calls. `Promise.all` is all-or-nothing: until migration 0005 was run, the nutrition call's failure would have taken down the entire Clients page, which has nothing to do with nutrition and was already working in production. Fixed by isolating the nutrition call in its own `try/catch` with an empty-array fallback, decoupled from the original `Promise.all`. Worth remembering as a general pattern: adding a new, not-yet-migrated data source to an existing screen's load function should never share a `Promise.all` with that screen's already-working calls.
- **The browser automation tool's composite drag gesture doesn't reliably trigger `dnd-kit`'s `PointerSensor`** — a single synthetic "drag" action doesn't fire enough intermediate `pointermove` events for the sensor's activation-distance check. Verified the real drag-and-drop code path works by dispatching a manual `pointerdown`/`pointermove`×N/`pointerup` sequence via `dispatchEvent` directly on the actual draggable/droppable DOM elements (not `elementFromPoint`, which can hit the wrong descendant). This is a testing-tool limitation, not an app bug — real mouse/touch input doesn't have this problem.

## Manual/deferred setup (not done in this environment)

- **`supabase/functions/send-push/index.ts`** — stale bullet, kept for history: it's actually deployed and live as of the "Coach push notifications (Phase 6)" section above, along with `scan-spc-alerts`. This line just never got updated when that happened.
- **Abandoned-session push reminder** (member starts logging a workout, doesn't tap Finalize within ~2 hours) is designed but not built — needs `session_completions.started_at`/`reminder_sent_at` columns, a new Edge Function to scan for them, and Supabase cron (`pg_cron`/`pg_net`, or the Dashboard's Cron Jobs UI) to invoke it on a schedule. Deferred by user request — ask before building.
- **`eas init`** — stale bullet, kept for history: it was already done by the time this was written (`app.json`'s `extra.eas.projectId`/`eas.json` already existed) — see the 2026-08-04 update in "Coach push notifications" above.
- **Apple Developer Program** — done as of 2026-08-04. Real APNs push credentials (`eas credentials`, needs Terra's own Apple ID login) and a fresh EAS build/TestFlight submit with the Push Notifications capability enabled are the remaining steps — see "Gym-wide announcements + real push notifications finally unblocked" above. Google Play Developer account still not set up.
- **iOS Universal Links configured (2026-08-04)** — see "iOS push confirmed live, Universal Links, GHL import groundwork" below for the full writeup. Android App Links (`assetlinks.json`) still not configured — needs the release keystore's SHA-256 fingerprint, only obtainable via an interactive `eas credentials -p android` session, and Google Play isn't set up yet anyway.
- **No simulator testing has happened** — everything verified via UI so far is the Expo web build, plus one physical-device run (see "Physical iOS device builds" below). The native `[workoutId].js` builder screen, native push, and the whole native auth deep-link flow are code-complete but visually unverified on-device beyond basic app launch.
- **Client onboarding via GHL + phone-OTP registration — the new-client half is fully built and verified as of 2026-08-04**, see "iOS push confirmed live, Universal Links, GHL import groundwork" above for the full writeup. Original design decisions, still standing:
  - Skip GHL-tag-driven auto-sync of program/frequency (2x Group, etc.) — decided not worth it: membership-type changes are infrequent enough that a coach's own toggle on the Clients page costs less than the ongoing risk of GLM tag names and this app's webhook parser drifting out of sync (a rename in GMS silently breaking or mis-setting someone's program). The two webhooks below (new client / cancellation) are still the plan.
  - **Won't be a plain SQL insert for either the "won" webhook or the planned bulk backfill of the existing ~140-200 members** — `auth.users` isn't writable via a normal `INSERT` (Supabase manages it internally: password hashing, required internal fields, triggers). Both need the Admin API (`auth.admin.createUser`, no email sent) — the webhook calls it one person at a time, the backfill is a one-time script that loops the same call over the existing member list. `core.users.id`'s FK to `auth.users.id` is *why* — a `core.users` row literally cannot exist without a real auth account behind it already.
  - **Registration verifies over phone/SMS via the GHL API, not email** — direct lesson from the standalone Nutrition Tracker app: email invites landed in spam and a real number of people never completed signup. **Correction from the original design**: Kova does *not* store a phone number at all — GoHighLevel's `/conversations/messages` send endpoint takes a `contactId`, not a raw phone number (confirmed against GHL's actual API), so `core.users.ghl_contact_id` (migration `0026`) is what gets stored instead. The rest of the flow: the "won" webhook silently creates the account (no email sent); member installs the app whenever, taps Register, types their email; backend looks up their `ghl_contact_id` and calls GHL's Conversations API to text a one-time code; member types the code in, sets a password. Still sidesteps the same original problem — a `https://app.kovastrength.com/set-password` email link can't do anything useful on a phone that doesn't have the app installed yet, which a code typed into the already-installed app avoids entirely.
  - **Built and verified end-to-end against the live project** (real GHL-fired webhook → real account → real SMS → real password → real sign-in, not just individually bundle-checked): `supabase/functions/import-client/index.ts` (the "won"/new-client webhook receiver — shared-secret header auth via `GHL_IMPORT_SECRET`, not JWT; create-or-find on `auth.users` same fallback pattern as `invite-staff`; upserts `core.users` with `ghl_contact_id`, preserving an existing role rather than downgrading it on re-import), `supabase/functions/request-registration-code/index.ts` (rate-limited to one live code per 45s per user, hashed + 10-minute expiry, uniform response regardless of whether the email/contact exists to avoid enumeration), `supabase/functions/verify-registration-code/index.ts` (attempt-limited to 5 tries, sets the password via the Admin API directly since there's no magic-link session to exchange here), migration `0026_ghl_import_and_registration.sql` (`ghl_contact_id` on `core.users`, `core.registration_codes` with zero RLS policies — every access goes through these two service-role Edge Functions, never a direct client query), and `app/(auth)/register.js` (email → code → password, linked from `login.js`).
  - **A real GHL Private Integration Token permissions gotcha, worth remembering**: the token needed a specific "send message" scope beyond the "Edit conversations"/"Edit conversation messages" scopes that looked like they should already cover it — GHL's own API returned a real `401 "The token is not authorized for this scope"` until that additional scope was added, diagnosed by curling GHL's API directly rather than guessing from the Edge Function's own deliberately-generic response.
  - **Still needed, none of it built**: a cancellation-tag webhook (archives — `core.users` has no archived/inactive concept yet either), and the one-time bulk-backfill script for the existing ~140-200 members (`import-client` could be called once per existing client, either via a GHL bulk workflow or a one-off script — the receiver itself needs no changes, it already handles being called for someone who already has an `auth.users` row from the standalone Nutrition Tracker app).

## Physical iOS device builds (USB via Xcode)

Done at least twice now from sessions that unusually had real Bash access to Dustin's actual Mac (not the normal sandboxed environment — see the "No DB credentials"/"No device/simulator access" notes below, which still hold for *typical* sessions, but apparently not every session — check for a connected device with `xcrun devicectl list devices` before assuming you don't have it). First time: got the app running on Dustin's iPhone (on the iOS 27 developer beta) via `npx expo run:ios --device` and Xcode. Worth knowing if this ever needs to happen again, either on this Mac or a new one:

- **iOS 27 beta needs Xcode 27 beta**, not the App Store's stable Xcode — download from `developer.apple.com/download/applications` (free Apple ID is enough) and install alongside stable Xcode as `/Applications/Xcode-beta.app` (don't overwrite the stable one). CLI builds need `DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer` exported so `xcodebuild`/`pod`/`xcrun` all target the beta toolchain instead of the default.
- **CocoaPods needs a real Ruby, not macOS's system Ruby** (2.6.10 here, ships with a `ffi`-native-extension version wall — no version of `ffi` newer than what's needed by current CocoaPods still supports Ruby < 3.0). Installed Homebrew, then `brew install cocoapods` — self-contained modern Ruby, doesn't touch the system one. Homebrew's own installer needs `sudo` (a real password prompt) — ask the user to run it themselves in Terminal; don't try to work around a partial/interrupted install with `git reset --hard` etc. inside `/opt/homebrew`, the harness's auto-mode classifier blocks destructive git ops outside the project directory anyway.
- **`pod install`/CocoaPods scripts need `LANG=en_US.UTF-8`/`LC_ALL=en_US.UTF-8` exported** — without it, CocoaPods' Ruby throws `Encoding::CompatibilityError` on `unicode_normalize` inside `pod install` itself.
- **A project path containing a space breaks multiple CocoaPods/RN build-phase scripts** — this repo lives at `/Users/Dustin/Claude Code/Programming` (space in `Claude Code`). Two real upstream bugs hit and fixed via `patch-package` (see `patches/expo-constants+57.0.6.patch`, reapplied automatically via the `postinstall` script): `node_modules/expo-constants/ios/EXConstants.podspec`'s script phase and `node_modules/expo-constants/scripts/get-app-config-ios.sh`'s `basename $PROJECT_DIR` both word-split on the space. A **third** instance of the same bug class lives in `ios/KovaStrength.xcodeproj/project.pbxproj` itself (the "Bundle React Native code and images" build phase's `` `"$NODE_BINARY" --print "..."` `` backtick invocation) — that one's *not* patch-package-able since it's inside the gitignored, prebuild-generated `ios/` folder. If `ios/` is ever regenerated (`expo prebuild --clean`, or deleting and rebuilding it), this exact fix needs reapplying: wrap the backtick expression in `\"..\"` so the resulting path stays one shell word. Search the pbxproj for `react-native-xcode.sh` to find it again.
- **iOS 27 beta hard-crashes any app without proper `UIScene` lifecycle adoption** (`EXC_BREAKPOINT`/`SIGTRAP` in `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke` — confirmed via a real device crash log pulled with `xcrun devicectl device copy from --domain-type systemCrashLogs`). This app's Expo-generated `AppDelegate.swift` used the legacy pattern (creates its own `UIWindow` directly in `didFinishLaunchingWithOptions`, no scene delegate at all) — this was almost certainly fine on stable iOS as of this writing, but iOS 27 beta enforces it as a hard crash, not a deprecation warning. Fixed with two layers, **only one of which is durable**:
  - **Durable** (in `app.json`, survives `expo prebuild`): `ios.infoPlist.UIApplicationSceneManifest` declares `UIApplicationSupportsMultipleScenes: false`.
  - **NOT durable** (hand-edited directly in the gitignored `ios/` folder, no Expo config plugin captures this): `ios/KovaStrength/SceneDelegate.swift` (new file — creates the `UIWindow` from the connecting `UIWindowScene` instead of `UIScreen.main.bounds`), `ios/KovaStrength/AppDelegate.swift` (window creation moved out of `didFinishLaunchingWithOptions` into the new scene delegate; added `application(_:configurationForConnecting:options:)`), `ios/KovaStrength/Info.plist`'s full `UISceneConfigurations` block (the `app.json` version above only sets `UIApplicationSupportsMultipleScenes` — the `UISceneConfigurationName`/`UISceneDelegateClassName` pointing at `SceneDelegate` only exists in the generated file directly), and the `project.pbxproj` registration of the new Swift file (`PBXBuildFile`/`PBXFileReference`/group/`PBXSourcesBuildPhase` entries — this project uses classic explicit file references, not Xcode's newer synchronized-folder groups, so new files never auto-attach). **If `ios/` is ever regenerated, this whole scene-delegate fix needs redoing** or the app will crash on launch on iOS 27+ again, even though `app.json` still looks correct. Worth turning into a real Expo config plugin (`withDangerousMod`/`withXcodeProject` from `@expo/config-plugins`) next time this comes up, so it survives prebuild like the Info.plist half already does.
- **Free/personal Apple ID signing teams don't support the Push Notifications capability** — had to remove it from Signing & Capabilities (Xcode GUI) for the personal-team automatic-signing build to produce a valid provisioning profile at all. Not an issue long-term since `send-push` isn't deployed yet anyway (see "Manual/deferred setup" below), but if push ever needs testing on a real device, that needs an actual paid Apple Developer Program membership.
- **A device only "trusts" a developer certificate until every app from that developer is removed from it** — deleting/reinstalling the app can silently reset this, surfacing as the exact same generic "invalid code signature, inadequate entitlements, or profile not explicitly trusted" launch error whether the real cause is (a) not trusted yet, (b) trust got reset by an app deletion, or (c) an actual signing/provisioning problem. Don't assume which one it is — check Settings → General → VPN & Device Management on the device.
- **Launch the app via Xcode's own Run button, not `xcrun devicectl device process launch` / `expo run:ios`'s CLI launch path**, at least for the very first run. Xcode's own launch sets up USB port-forwarding so the device's `localhost:8081` reaches the Mac's Metro bundler; launching via `devicectl` directly bypasses that, and the app fails with "No script URL provided... unsanitizedScriptURLString=(null)" trying to reach a Metro that's unreachable from the device's perspective.
- **Real crash logs are pullable without Xcode's GUI** via `xcrun devicectl device info files --device <udid> --domain-type systemCrashLogs --search <AppName>` to list them, then `xcrun devicectl device copy from --device <udid> --domain-type systemCrashLogs --source "<Name>.ips" --destination /tmp/crash.ips` to pull one. The `.ips` file is JSON (two concatenated JSON objects, header then body) — `python3 -c "import json; ..."` parses it cleanly; the crashing thread's symbolicated frames are usually enough to diagnose without needing a `.dSYM`/full symbolication pass. Note this only surfaces hard OS-level crashes (`EXC_BREAKPOINT`, `SIGABRT`, etc.) — a plain JS exception (e.g. "Cannot find native module X") shows as a red-screen/error-boundary error on-device and never produces an `.ips` file at all, so an empty or stale crash-log search doesn't mean nothing's wrong.
- **Adding a native (non-JS-only) dependency to `package.json` does NOT automatically reach an already-generated `ios/` folder.** Hit this for real 2026-08-02: `expo-image-picker`/`expo-image-manipulator`/`react-native-svg` were added to `package.json` during the nutrition rebuild, but nobody re-ran `pod install`, so `ios/Podfile.lock` stayed a day stale and didn't know those pods existed — every subsequent Xcode "Run" rebuilt the *same* binary still missing them, throwing a JS-catchable "Cannot find native module 'ExponentImagePicker'" the instant the photo picker (or `react-native-svg`, i.e. Trends) was used. Symptom looked exactly like a fresh-install-still-broken bug but wasn't — it was a stale `Pods/`. Fix: `cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`, then rebuild. **Separately**, `expo-image-picker`'s `app.json` plugin config (the `photosPermission`/`cameraPermission` strings) only gets written into `Info.plist` by a real `expo prebuild` run — since this project's `ios/Info.plist` is hand-maintained (see the scene-delegate note above, prebuild would wipe those fixes), those two keys (`NSPhotoLibraryUsageDescription`/`NSCameraUsageDescription`) had to be added by hand too, or the app would hard-crash (this one *would* produce a real `.ips`) the instant camera/photo-library access was actually requested, even after `pod install` fixed the linking. **Whenever a new native dependency is added going forward: `pod install` in `ios/`, and check whether its Expo config plugin writes anything to `Info.plist`/entitlements that needs hand-porting into the gitignored `ios/` folder** — same class of "not durable, doesn't survive without `expo prebuild`" issue as the scene-delegate fix.
- **Both Xcode installs plus simulator runtimes plus repeated `DerivedData` builds filled the disk to `ENOSPC` twice this session** — once so completely that even the harness's own Bash-output-capture file couldn't be written (every command failed, including `df -h`). Safe things to clear if this happens again: any leftover installer `.xip` in Downloads (already-extracted, multi-GB), `~/Library/Developer/Xcode/DerivedData` (fully regeneratable), and in Xcode's own Settings → Platforms / About This Mac → Storage → Developer panel — old **bridgeOS device-support entries for iOS builds the device is no longer on** (each is 10GB+; check the device's *current* build number first and keep only that one).

## Test accounts (real accounts in the live shared Supabase project, not mocks)

- **Admin**: `terra@kovastrength.com` — bootstraps automatically on first login via `EXPO_PUBLIC_ADMIN_EMAIL`.
- **Member**: `dustin@kovastrength.com` — same account Nutrition Tracker uses as its test client (shared `auth.users`, confirmed by a real "Invalid login credentials" response before he was linked here). Linked to a `core.users` profile via the admin-only "Link account" flow (`app/(coach)/clients/LinkMemberModal.js`) since there's no self-serve signup and the email-invite Edge Function isn't deployed yet — this manual-UUID-paste bridge is intentional interim scaffolding, described in the code comments in `lib/programming/clients.js`. Assigned to Flagship.
- Two test Flagship blocks exist in the live DB as of this writing (one starting 2026-07-21, one starting 2026-07-20) — both have Week 1 / Session 1 published with the same three exercises (Barbell Bench Press, Goblet Squat, Seated Cable Row) for manual testing. Real coach usage will eventually want these cleaned up; not urgent.
- Dustin's account now also has real `session_completions`/per-set `logs` test data from verifying the workout-logging rework above (a finalized group session and a finalized SPC session, both with per-set weights and a lift note) — useful for exercising History/Finalize/View-Block without needing to log fresh data first. His group-program assignment and block dates were being actively edited by the coach in a parallel session while this was built, so don't assume the specific program/dates mentioned elsewhere in this file are still current — check live.
- **Nutrition QA accounts** (dedicated synthetic accounts, kept separate from Terra's/Dustin's real accounts so repeated automated testing never touches them): `test1@kovastrength.com` (`role: member`) and `test2@kovastrength.com` (`role: coach`) — role was set directly via SQL (`update core.users set role = 'coach' where email = ...`) since the app's own "+ Link account" flow always creates `role: member` and has no coach-creation path (`linkMemberByAuthId` in `lib/programming/clients.js` hardcodes it). **Stale as of the 2026-08-02 nutrition rebuild**: test1's seeded target/daily-log/check-in data below lives in the now-dead placeholder `nutrition.*` schema, not `public.*` — it won't show up anywhere in the rebuilt nutrition module. Test2 got a real `public.coaches` row via the 0018 backfill migration (role was already `coach` in `core.users` when that ran), so test2 itself is fine to use as a nutrition coach; test1 needs a fresh `public.clients` row (via the normal Nutrition-toggle-on flow) before it has anything real to test with. Original seed, for reference: Test1 was assigned to nutrition, had an active target (P150/C140/F50/Fiber25, effective 2026-07-21), a finalized daily log, and a submitted+finalized weekly check-in — full core-loop verification was run against these two accounts against the old schema.

## Deployment

Not deployed anywhere yet — everything so far is local dev server only (`npx expo start --web`, port 8081, `.claude/launch.json` target `kova-strength-web`). No Vercel/EAS build has been attempted.

**Stale as of 2026-08-04**: the web build actually is live, at `app.kovastrength.com` (Vercel project `kovaapp`, git-connected to `main` — see "iOS push confirmed live, Universal Links, GHL import groundwork" above for the deploy mechanics and the "don't run `vercel --prod` directly" lesson). This line just never got updated when that happened.

## Web build is installable as a PWA (2026-08-04)

Prompted by Terra realizing clients like Roxy (see the check-in-reopen investigation above — Roxy turned out to have no `core.users` row, i.e. never linked into Kova at all) don't need to wait on App Store review to start using Kova — the already-live web build works today. It just wasn't set up to install cleanly: no manifest, no iOS meta tags, so "Add to Home Screen" would have produced a plain bookmark that opens in Safari chrome, not a real standalone app icon.

Added `app/+html.js` — Expo Router's static-export root-document override (only runs in Node during `expo export`, confirmed via `docs.expo.dev/router/web/static-rendering` since this SDK's docs can genuinely differ from memory, per this repo's own standing "Expo HAS CHANGED" rule) — with a `<link rel="manifest">`, `apple-touch-icon`, `theme-color`, and the `apple-mobile-web-app-*` meta tags iOS Safari specifically needs to launch without its address bar once added to the home screen (manifest.json's `display: "standalone"` alone isn't enough on iOS). `public/manifest.json` + `public/icon-192.png`/`icon-512.png`/`apple-touch-icon.png` (derived from the existing `assets/icon.png`, same source used for every other platform's icon) live in `public/`, the same static-passthrough directory the Universal Links `.well-known` file already uses.

Verified for real, not just bundle-checked: ran a real `npx expo export -p web` and confirmed the manifest link/icons/meta tags all land in the generated `dist/index.html`, served the export locally, and screenshotted the login screen rendering normally (no regression from the new root document).

## Coach payroll v1 design pass — staff screens (2026-08-14)

A handoff (`design_handoff_coach_payroll_v1/` — README + `Kova Coach
Payroll.dc.html` + 12 screenshots) restyles every payroll screen. Terra's
brief: *"keep all the functionality here, especially with the finalizing, but
i just want it to look good like the rest of the app does."* Phone-first,
because coaches log at the end of each day on a phone. **All 12 screens are
built** — staff (01-07) and admin (08-12), in that order, same session.
Nothing about how pay is calculated, submitted, finalized, approved or closed
changed — no migration, no Edge Function, no schema.

**All three of the handoff's own open questions were already answered by live
data**, checked against the database rather than assumed: `payroll.spc_tiers`
holds exactly five rows (0-4), so there is no "6 or more" tier to trim and
`SpcAttendeePicker` was already 0-4; the 0-attendee rate is a real **$10.00**,
not the `$0.00` placeholder drawn in screenshot 12; and `spc_notes` already
exists and already holds free text, so per-attendee names are newline-joined
into it with no migration, matching what `program_notes`/`welcome_notes`/
`strategy_notes` already do.

**One thing in the mock was deliberately NOT built.** Screenshot 12's rates
screen shows a "Deadline reminder — push this many days before the period
closes · [2] days" field. That setting does not exist and re-adding it would
be a regression: the reminder was rebuilt on 2026-08-12 (see that section)
because the weekday version fired a week early, and it now anchors to the
period boundary via `payroll_deadline_time` / `payroll_deadline_followup_time`
with no days-before concept. `DeadlineReminderCard` keeps its two time
pickers.

**Tile anatomy, the headline fix.** `PayrollTile` is rebuilt: label (+ count
chip) top-left, value bottom-left, control bottom-right, and one **always-
reserved** 15px caption line, at a static `TILE_HEIGHT = 112`. `TileCheckmark`
and its `paddingBottom: 28` reserve zone are gone — that floating badge, which
sat half off the tile edge on its own white backdrop circle purely so the
tile's border didn't cut through it, is what made the screen read as
unfinished. State is now carried by fill and border alone, three explicit
tones via `tileTone(state)` / `tileState(hasData, submitted)`: **empty**
(white / `#ece7e1`), **entered** (peach `#fdf6f2` / `#f0ddd2`), **submitted**
(sage `#eef1e7` / `#4d6142`, plus an inline 11px tick top-right). Both
non-empty tones already existed in the app. Measured after the rebuild: every
tile is exactly 112px and every value in a row shares a baseline **including
rows where one tile has a caption and the other doesn't** (Group/SPC, Admin/
Ops) — that mismatch was the original complaint.

**Three date mechanisms became one.** `PayrollDateNav` is now a five-day
window over the 14-day period; `PayrollDatePicker` and its bounded calendar
modal are deleted. Window rule is `clamp(selected - 2, 0, length - 5)`: pinned
at the period's start, riding the centre from day 3, drifting right over the
last two days so the strip finishes the period out rather than stranding it.
Dots carry submitted (olive) / entered (clay) state for the neighbouring days
for free.

**Sheets share one shell.** `PayrollBottomSheet` gained a grabber, an optional
subtitle (the day being edited), and a single full-width primary whose label
says what it will do (`Save 1h 30m`, `Finalize $928.50`) — previously each
sheet drew its own header and its own button, so none of them agreed. It's an
inset card rather than the member app's edge-to-edge sheet, per the mock;
still bottom-anchored and scrim-dismissed. New shared `SheetLabel` /
`SheetNameRow` / `SheetTextInput` so the names sheet and the SPC sheet can't
drift. Hours gained quick presets. **Two real interaction changes**: the names
sheet's rows ARE the count now (add a row and the tile's counter goes up,
delete one and it goes down — `onSave(joined, rowCount)`, mirrored back into
local state so the counter autosave doesn't then schedule a redundant write of
what was just saved), and SPC's 0-4 chips build that many optional name rows
with deleting a row decrementing the head count. Both verified by driving real
clicks: picking 4 built four rows, deleting one left three rows and chip 3.

**Four staff tabs became three.** `Log · Extra pay · My Pay`, equal width, no
ScrollView. `app/(coach)/payroll/requests.js` and `nutrition.js` are deleted,
merged into new **`extra.js`** with two segments — `can_view_nutrition` gates
the *segment*, so a coach without it sees Requests as the whole screen and
never an empty tab. The nutrition roster is only fetched once that segment is
actually opened. **The staff side renders no approval queue at all** now
(admins approve in Admin View → Requests, which was always the real home);
`listPendingRequests` went dead with it and was deleted.

**My Pay gets the one dark surface in the flow** — new `PayPeriodBand`
(period stepper, open/closed pill, `PAY THIS PERIOD`, the money at 38px, and a
progress bar). **The bar is elapsed period time, not days logged** — deliberate
per direct call: most coaches don't work every day, so a bar that filled with
submissions would imply a daily submit is owed and read as "behind" to someone
who simply wasn't rostered. It only renders for the period actually containing
today. `CategoryBreakdown` restyled to one hairline-divided row per category;
the drill-down popup is untouched, so the admin per-coach view that reuses it
came along for free.

**FinalizeModal is a sheet that restates what you're signing**, not a generic
"are you sure": the period in the title, every count as a line, the amount on
the button. The separate native `confirmFinalizePayroll` popup was **removed**
and its attestation copy moved verbatim into the sheet — it used to layer on
top of the modal, which meant the wording you were agreeing to only appeared
*after* you'd decided. `confirmFinalizePayroll` is deleted from
`lib/confirmDialog.js`. Also added an accurate line the old copy lacked: an
admin has to send the period back before anything in it can change.

**New `formatDateRange(start, end)` in `lib/formatDate.js`** — "Aug 6 – 19",
or "Jul 30 – Aug 12" across a month boundary. Three copies of this had
appeared in one session; `formatDateMD`'s MM/DD stays for the calendar grids,
where columns are tight. Split off the ISO string, never through `new Date`.

**A real bug the clean bundle did not catch, worth remembering as a class**:
`openEditOther` still called `setOtherListOpen` after that state was deleted
(the Other panel lists its items inline now, so there's no list popup to
close). `expo export` passed clean five times over it — **Metro does not
resolve identifiers**, exactly as this file's v5 notes warn. Found by running
a throwaway Babel `path.scope.globals` pass over every touched file; the only
other hit was `window` in `confirmDialog.js`, which is legitimately guarded.
Worth doing that sweep on any pass that deletes state or helpers.

### Admin screens (08-12)

**One grid, shared by both admin tables.** `StaffReviewRow` exports
`STAFF_WIDTH` (200) / `COL_WIDTH` / `PAY_WIDTH` (88) / `ACTION_WIDTH` (194) /
`CELL_GAP`, and `admin/closed.js`'s expanded breakdown now reuses them rather
than inventing its own — two admin tables of the same data reading
differently is worse than either being a few pixels wider. Status moved out
of the Pay column and under the staff name (with the avatar tinted to match),
which leaves Pay as money and nothing else. The review rail is a fixed
two-slot 194 = 96 + 8 + 90; a row with one action (`Waiting on Avery`,
`View note`, `Closed`) spans the full 194 rather than sitting at one end.

**Two measured deviations from the mock, both deliberate:**
- **`COL_WIDTH` is 66, not the mock's 58.** Measured in the browser: at
  9.5px bold with 0.9 letter-spacing, "PROGRAMS" renders **66px**, and at 58
  it ellipsised to `PROGRA…` (as did `WELCO…` and `STRATE…`). The mock gets
  away with 58 because a bare HTML div overflows silently; RN's
  `numberOfLines={1}` truncates instead.
- **`CELL_GAP` is 8, not 16.** The mock lays out six numeric columns
  (merging Admin+Ops into "HOURS", dropping Welcome and Strategy); those are
  real pay categories with their own rates, so all eight are kept. At gap 16
  the table came out *wider* than the version it replaces, which would have
  made the restyle a regression on the one axis that matters. At 8 it fits a
  1440 window without scrolling, and the horizontal ScrollView remains for
  narrower ones.

**A real 2px alignment bug, found by measuring rather than looking.** The
`tableWidth` formula summed the cells, the gaps and the card's 20px padding —
but not the card's own **1px border on each side**. So the row's content
needed 1090px in a 1088px box, and flex quietly shrank the one shrinkable
cell (the header/footer's staff `Text`; the rows' staff cell is a
non-shrinking `Pressable`), leaving the rows 2px right of the header and
footer. Invisible in a screenshot, obvious in
`getBoundingClientRect()`. After the fix all six Pay cells report a single
right edge and all six staff cells measure the full 200. **Worth remembering:
when a fixed-width table lives inside a bordered card, the border is part of
the width budget.**

**Requests regrouped by decision, not by period.** `admin/requests.js` split
"this period" vs "history"; a pending request from a *previous* fortnight
therefore sat under History, which is the one request that most needs
deciding — and an undecided request is also the only thing that hard-blocks
closing the period it belongs to. Now: `Waiting on you` (dark cards, three
across, amount repeated on the approve button because approving writes the
linked pay entry immediately) over a plain `Decided` table. A pending
request from another period names that period on its card; the common case
stays quiet. The Decided table shows `approved_amount` where it differs from
what was asked, since those can legitimately disagree.

**Closed periods read as receipts** — owner / staff / taxes / grand total
lead the row, with the taxes field **dashed while empty** so an unfilled
figure reads as outstanding rather than a real zero, and Save appearing only
once the value actually differs from what's stored. Expanding re-reads that
period at its frozen rates (unchanged behaviour) into the shared grid.

**Admin report: share bars replace the nine-column money grid.** That grid
needed a horizontal scroll to read and made comparing two people an exercise
in counting columns; a bar answers "who's carrying the load" with no
arithmetic, and the detail moved into a panel one click away whose category
rows still drill into individual entries. Sorted by pay, not name — bars only
read as a ranking if they're ordered. On web the breakdown is an **inline
side panel** (a sheet covers the list it's meant to be read against); native
keeps the bottom sheet, and gets the same bars. The panel also loads
`listFinalizationsForPeriod` to say whether the figure being read is approved
or still moving.

**Rates in three columns** (`RateCard`, `flexGrow/flexBasis 300/minWidth
280`), collapsing to two and then one as the window narrows — verified at
1440 and 900. The add-a-type form stacks instead of three inputs abreast
(unreadable at 300px) and hides behind the mock's `+ Add`, since adding a
type is rare next to editing one. **The mock's "push N days before the period
closes" field was NOT built** — see the deadline-reminder note above.

### Admin follow-ups from Terra's click-through

- **Admin View lands on This period, not Requests** (`payroll/index.js`) —
  reviewing and closing the open period is the job; requests are usually
  empty.
- **The table now grows with the window instead of sitting at a fixed
  width.** The ScrollView's content container is `flexGrow: 1` with
  `minWidth: minTableWidth`, so it fills a wide window and scrolls a narrow
  one; every numeric column stays fixed (the figures have to line up) and
  the staff column is the flexible one, so rows get **wider, not taller**.
  `STAFF_CELL` (`flexGrow 1 / flexBasis 200 / minWidth 200`) is spread into
  the header, every row and the footer — a fixed width on one and a flex on
  another is exactly how the grid drifts. Measured at 1600: card 1552, all
  three staff cells 620, Pay cells still on a single right edge. At 900: the
  card holds its 1132 minimum, staff back to 200, one horizontal scroller,
  page body does not overflow.
- **Closed periods' totals were showing $0.00 — real data, not a view
  bug.** `owner_pay`/`staff_pay` are written by the app's own close flow,
  and **all 22 closed periods are the historical Glide import**, closed by
  SQL rather than through the app (confirmed live: 22 closed periods, **0**
  rows in `closed_period_rate_snapshots`). So both columns are null on every
  one of them, and `Number(null) || 0` rendered that as a confident $0.00 on
  a period that plainly had entries. The Report tab looked fine because it
  computes live from entries. Now `closed.js` recomputes owner/staff from
  the entries whenever the stored value is missing — new
  `listEntriesForPeriods(starts)` fetches every period's entries in one `in`
  query, plus one `listStaff()` for the admin/coach split and one
  `listAllRates()` (no period has a snapshot, so `getRateMapsForPeriod`
  would fall back to live rates for all of them anyway). Two queries for the
  page rather than a pair per row. A recomputed row is labelled
  "recalculated from entries"; a figure that genuinely can't be derived
  shows "—", never a fabricated zero.
- **Report's dark band carries owner pay / staff pay / taxes / grand
  total.** Taxes are entered on Closed periods after a close, so an open
  period shows "—  set at close" rather than a $0.00 that would read as "no
  tax on this payroll".
- **Share bars got a category toggle, and then a second axis.** The list
  has two: `BY_COACH` (or a category key) puts one row per coach on screen;
  **`BY_TYPE` puts one row per pay type** — SPC, Group, Admin and the rest
  on the same bars as the coaches, which is what was actually wanted. Both
  read off the same `PAY_TYPES` table, once per coach for the per-coach
  views and once against the whole team's totals for by-type, so there's no
  extra query for any of it. The two axis pills sit ahead of a divider rule
  so they don't read as two more of the ten category options.
  - Picking anything re-sorts (bars only read as a ranking if ordered by
    what they draw), shows the count under the amount (a count is checkable
    in a way a dollar figure isn't), and the footer states that list's
    total. **Verified arithmetically**: the by-type rows summed to exactly
    the grand total, so they account for every dollar.
  - A pay type with nothing in it is dropped rather than carried as a
    permanent zero row; a genuine zero within a list draws no bar at all,
    as against the 2% floor used for small-but-real amounts.
  - **Tapping a type row drills into who did it** — which is exactly what
    that type's own pill shows, so the two views connect rather than sitting
    apart. In by-type mode the side panel widens to the whole team, which is
    the only place a category's entries can be read across everyone at once.

- **Two decimals, everywhere a payroll number renders.** New
  `formatQuantity` in `calc.js` sits next to `formatMoney` and handles every
  non-money figure: integers stay integers ("31", not "31.00"), a trailing
  zero is trimmed ("6.5", not "6.50"), and anything longer rounds to 2dp.
  **Not cosmetic** — 174 real imported entries carry non-quarter hours
  (0.15, 0.67, 1.08…), and summing those in floating point gives
  `10.680000000000001`, which is what a column of summed hours was actually
  rendering. Verified against the real values, not assumed. Routed through
  it: `StaffReviewRow`'s `Num`, the This-period footer, the closed-period
  breakdown, `CategoryBreakdown`'s counts, the report's bar counts, the
  Other row's `×qty`, and `calc.js`'s own `CATEGORY_LABELERS`. Money was
  already fine (`formatMoney` → `toLocaleString`), as were rate rows
  (`toFixed(2)`) and the CSV (raw stored `numeric(10,2)` values, which is
  what an export should carry).

**Not carried to native** (`admin/report.js`): the band's owner/staff/taxes
split and the share-mode toggle are web-only. Native's admin report is a
secondary surface — the handoff's own framing is that admin work happens at
a desk — and both would need a `listStaff()` fetch there for a screen that
isn't used that way. It keeps the dark total band and the share bars.

### Verification

`npx expo export -p web` clean after every batch, plus real click-through of
the staff side at 375px (tile grid in both states, day strip, all four
sheets, My Pay, finalize) and the admin side at 1440 and 900 (review table
with all four row states, approval cards, three-column rates). Done via a
**throwaway `app/zz-harness.js` route rather than mounting on `login.js`** —
safer for exactly the reason this file's teardown note gives: a top-level
route outside the auth/member/coach groups is reachable unauthenticated, and
deleting it can't leave sign-in broken. Deleted after; `git status` confirms
only intended files.

**Not verified**: anything behind a real login — standing limitation. Worth
Terra's click-through of a real day's autosave → submit → edit-clears-
submission round trip, the Extra pay merge against real requests, a real
finalize, and on the admin side a real approve / send-back / reopen round
trip and a period close.

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

## Member mobile v5 — conformance pass over the four nutrition tabs (2026-08-15)

Asked for "a new design pass, design_handoff_member_mobile_v5". **That handoff
was already built** (2026-08-10, its own section above) — so this was an audit
of all 12 screens against the README and a fix of what had drifted or never
quite landed, not a rebuild. Worth knowing if the same ask comes again: read
the built screens against the README first, because most of it is there. My
Week, My Fitness, both My History views and Settings were already conformant
and were left alone; everything below is the nutrition tabs plus one app-wide
sweep.

**Header parity.** Weekly, Check-In and Photos rendered a bare title, so
switching sub-tab silently dropped the gear and the 34px Kova mark that Today —
and every other member tab — carries. New `components/nutrition/NutritionTabHeader.js`
holds the title row plus the segmented control; the four screens render it
instead of four copies. It deliberately owns **no padding or safe-area inset**:
Today puts it in a fixed block above its own ScrollView while the other three
put it inside theirs, and each screen already handles that itself. Today passes
its date-stepper/LOGGED-badge row as `children`, which render between the title
and the tabs.

**Today's slider cards.** The coach's cards above the log (focus list, game
plan, plan phases, milestones, completed milestones) are the one thing the v5
mock doesn't draw at all — they were deliberately kept in the original pass
since nothing else surfaces what the coach wrote, and so they were still on the
pre-v5 `rounded-lg`/`border-stone-200` chrome and read as a different app
sitting on top of the one below them. New local `SliderCard` shares `LogCard`'s
shell, with the tinted ones (plan phase, milestone) passing their own palette
in rather than forking the component.

**Photos (5b).** `PhotoUpload`'s slot framing is the mock now: empty is
`#fdf1ea` on 1.5px dashed `#e0b6a5` at radius 16 with a 34px white `+` circle;
filled carries the olive `FRONT ✓` chip top-left alongside the existing clear-×.
The button says `Upload 2 photos` rather than a bare "Upload". **Two deliberate
deviations, both commented in the file**: the angle label stays *under* the slot
rather than inside it (the handoff keeps the pose illustrations, and they fill
the slot — a label on top of one can't be relied on to stay legible), and a
filled slot drops its caption entirely, since chip-plus-caption renders the word
twice. That second one was only obvious once screenshotted.

**Check-In (5a).** Task subtitles carry real state per the mock —
`Submitted | front, side, back`, `6 questions | 2 answered`, and a partial
`front in | side, back still needed` — instead of a bare "Submitted". The week
band picked up the same decorative bleeding circle My Week's hero has (the app's
two dark surfaces should read as one object). Finalize gets the primary CTA
shape, reads "Finalize check-in", and sits at 0.45 while blocked — still
deliberately **not** `disabled`, since tapping it is how a member finds out
what's missing (`buildReadinessMessage`).

**House-rule sweep, app-wide but member-only.** Rule 4 (`|` as the separator,
never `·` or an em-dash; empty values as an en dash `–`) had never actually been
applied. Fixed in `SessionHeroBar`'s eyebrow, `ExerciseCard`'s target and
"Last time" lines, the session-preview detail strings, several meta lines, and
the five `"—"` empty placeholders. **Deliberately not swept**: `RestTimerBar`,
whose `REST · {LIFT}` is specced by the later lift_v1 handoff, and every
coach-side surface (ActivityFeed, payroll, CoachHome, TargetsEditor…) — v5's own
scope line is "member only. Coach web is untouched by this pass."

**Real bug the bundle did not catch**: a `{/* … */}` comment placed directly in
a ternary's consequent slot — an expression position, not a children position —
is a hard syntax error, and `npx expo export -p web` reported clean over it
anyway. Found by running `@babel/parser` over every touched file (the same
throwaway scope-check the payroll pass used, which also confirms no unresolved
identifiers). **Reinforces the standing lesson: a clean export is weaker
evidence than it looks — Metro neither parses every file you touched nor
resolves identifiers.** Run the Babel pass on any batch of edits.

**Verification**: clean `expo export` after every batch, a Babel parse/scope
pass over all touched files, and the header, both photo-slot states, the
check-in band and task rows, and the slider-vs-log cards all rendered and
screenshotted at 390×844 through a throwaway `app/zz-harness.js` route (deleted
after; the top-level-route form is preferred over mounting on `login.js` for the
reason given in the payroll section). **Not verified**: anything behind a real
login — standing limitation. Worth Terra's own pass on a real photo upload and a
real check-in submit.

**Concurrent-session note, because it actually happened here**: a parallel
session committed mid-write (`d2ecefa`) with a broad `git add` and swept 7 of
this pass's in-flight files into its own commit. The right response is to
**check `git show HEAD:<file>` rather than assume** — the sweep survived intact
in six of them, and the two lines lost in `app/(member)/index.js` were in a code
path that commit had replaced outright, so there was nothing to reapply. See the
staging rule in the working notes below; it cuts both ways, and a file of yours
vanishing from `git status` means it was committed by someone else, not reverted.

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

## Blocks can be trimmed back: "End here" (2026-08-15)

Terra on the rigidity of blocks: no way to change their dates, end one early,
or undo an extend, and turning a rolling block off leaves the client stuck with
whatever weeks it already grew. Scoped down to the highest-value piece —
trimming the tail — after establishing what the schema actually allows.

**The two facts that decided the design**, both worth knowing before touching
blocks again:

1. **A block's weeks are materialised rows, but its dates are arithmetic.**
   `block_start_date` plus the week number *is* the calendar. So moving a block
   is nearly free (change the start date and everything shifts), while removing
   a week from the *middle* would either renumber everything after it — silently
   turning week 5's programming into week 4 — or leave a hole. Hence tail-only.
2. **Logged sets survive a deleted week; completion records don't.**
   `logs.group_workout_id`/`spc_workout_id`/`one_off_workout_id` are `ON DELETE
   SET NULL`, so her reps and weights persist (orphaned). But
   `session_completions` is `ON DELETE CASCADE`, so deleting a week destroys
   the record that she finished it — which is what My Week's counts, adherence
   and the missed-session flags all read. The damage is invisible until a
   completed week starts reading as missed.

New `trimGroupBlockTo(blockId, lastWeek)` / `trimSpcBlockTo(...)`. They delete
every week past `lastWeek`, set `block_length_weeks` and `block_end_date`, and
**force `auto_extend` off** — trimming a rolling block without stopping it
rolling is a no-op by the next scan, which would regrow exactly what was
removed. They **refuse rather than cascade**: if any session in the removed
weeks has a completion, the function throws naming the weeks and deletes
nothing. That guard has to live in app code — the constraint can't be relaxed
to `SET NULL`, since `session_completions` requires exactly one of its three
workout ids.

**UI: "End here" in a trailing column to the RIGHT of the session cells**, not
an ✕ and not in the week label — both Terra's calls. "End here" beats ✕ because
an ✕ reads as "delete this row", which is exactly the semantic we can't
support; and putting it after the last session cell means it reads left to
right as "everything below and to the right of this stops", which is what the
action actually does. The column is reserved on every row (and in the SPC
grid's session-header row) even where the button can't show, or the grid's
right edge would jump between rows. **"End here" on week N keeps week N and removes everything
after it**, so it can never delete the week being pointed at, and trimming a
runaway rolling block is one click rather than six. It renders only on weeks
that are the current week or later AND have something after them; the confirm
(`confirmEndBlockHere`) names the week count and the new end date, and mentions
rolling only when it applies.

**Deliberately desktop-only** (confirmed with Terra). Both grids are `.web.js`;
native shows the block overview instead and phone-width web now does too, so
End here isn't reachable from a phone. Not a gap to fix — trimming is a
restructuring action and restructuring happens at a desk.

**Not built, and worth remembering as the other half of this**: moving a block
(editing `block_start_date`), which is the cheap fix for "I started it in the
wrong week" and needs no migration either — the dates are all stored and
writable. Deleting an arbitrary middle week was explicitly rejected, not
deferred; every real case is a tail.

**Shipped broken once, worth remembering how.** The `useState` backing the
button's pending flag was added next to the handler that uses it, which on
`spc/[userId].web.js` is *below* the component's `if (!ready)` and
`if (loadError || !member)` early returns — so the hook ran on some renders and
not others: "Rendered more hooks than during the previous render." Two things
made it slip through: (1) `expo export`, the Babel scope pass and a bare route
load are all clean, because nothing is wrong until the page finishes loading
and re-renders down the full path; (2) the grep used to check for early returns
was `^  if (.*) return`, which only matches a single-line return and silently
missed both of these multi-line `if (…) {` / `return (` blocks — so the check
came back "no early returns" and was believed. **If a hook is added to an
existing component, put it with the other hooks at the top, and detect early
returns by scanning for a `return` at component-body indent, not by matching
`if … return` on one line.** Caught by reading the real error out of Terra's
browser, which named the file and line directly.

**Verified against real data rather than reasoned**: Dustin's SPC block (4
weeks, currently week 3, `auto_extend` false) — End here renders on week 3
alone, and a trim there would remove 2 week-4 sessions with
`completions_after_wk3 = 0`, so the guard passes and the block would end 08-21.
Read-only check, no mutation run. `expo export -p web` clean, Babel scope pass
clean. **Not click-tested** — both grids need a coach login.

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

## Nutrition dashboard goes to lines; onboarding becomes her first check-in (2026-08-18)

The rest of the 2026-08-17 batch. No migration — see below for why the one
that looked necessary wasn't.

**Charts are lines, default range 1m.** `TrendChart` (already the line chart
for member lift progress) gained `height` / `unit` / `sinceDate` /
`emptyMessage` and now draws the weight chart too; `WeightBarChart.js` is
deleted rather than left to rot. **This reverses that file's own deliberate
"bars, because a line interpolates straight through a missed day" decision —
Terra's explicit call, so don't fix it back.** The honesty it was protecting
is preserved another way: dots sit only on real readings, so a long straight
run between two distant dots still reads as two measurements rather than a
fortnight of daily data. `sinceDate` (the current target's effective date)
survives as a two-tone split — one neutral polyline, one clay, sharing the
boundary point so it's a colour change and not a break — which is the direct
translation of what the bar colouring meant. Dots are suppressed above 60
points, or 6m/1y render as a solid bead of ink; the hovered point still gets
its own. The four `MetricSparkTiles` are lines too.

**Real geometry bug caught by measuring, not looking**: the sparkline's
latest-reading dot sat at `x = width` with `r = 2.5` inside an SVG exactly
`width` wide, so half of it was clipped on every tile (measured `cx 140` in a
140px box). `sparkPoints` now insets by the dot radius on both axes. That
function is exported and pure specifically so it can be checked without
rendering.

**Sparklines measure their own width via `onLayout` but accept a `sparkWidth`
override.** ResizeObserver — which react-native-web implements `onLayout`
with — does not fire in the sandboxed preview browser, so without the
override there is no way to look at these before shipping them.

### The questionnaire as her first check-in

**No migration was needed, and the "open problem" was already solved.**
`public.questionnaire_responses` has had a `highlights jsonb NOT NULL DEFAULT
'{}'` column all along — identical in shape to `checkin_responses.highlights`
— and its RLS policy is a plain `coach can manage responses` (`ALL`,
`is_coach()`). It was already being *read* (`onboarding/questionnaire.js`
renders `response.highlights?.[i]`); it simply never had a writer. Added
`setQuestionnaireHighlights(userId, highlights)` to `coachClient.js` — keyed
by `client_id`, since that table has **no `id` column at all** (one response
per client), unlike `checkin_responses`.

New `components/nutrition/OnboardingCheckinView.js` renders on the Check-In
tab: questionnaire answers, starting photos, objective-tracking days, with
the tab's own Notes/Focus rail unchanged beside it so the whole review is one
screen to talk over. **The answers go through `CheckinAnswerList` rather than
a second copy of the markup** — highlighting has enough hard-won edge-case
handling in it (see `HighlightableAnswer.web.js`) that a parallel
implementation would drift; questionnaire answers just have `hasPrior` and
`hersOnly` false.

**Onboarding is deliberately NOT mapped onto the calendar week containing her
start date.** It has no `week_start` of its own, and inventing one would
collide with a real check-in filed that same week by anyone who started
mid-cycle. It sits at the bottom of the picker under "Where she started".

### The week selector

`CheckinWeekTimeline` gained optional `onSelectWeek` / `selectedWeekStart` /
`pastWeeks` / `onboardingEntry`. Without them it renders exactly as it always
did on the Settings tab, so that surface gains no tap target that goes
nowhere. New `CheckinWeekPicker.js` wraps it in a centred modal (coach
desktop-web convention) opened by pressing the Check-In tab's own date title.
Reusing the timeline means the statuses in the picker are the same ones the
Settings tab shows, from the same code — a second list would be a second
definition of "completed". Verified that the nested Reopen `Pressable` still
swallows its own press rather than also selecting the row.

### Three real bugs found while doing it

1. **Phantom missed check-ins — found by Terra on a real client.**
   `CheckinWeekTimeline` enumerated a flat N weeks back with no awareness of
   `client.start_date`, so every week before a client existed rendered as
   **Missed with a Reopen button**. Melissa Benson (started 2026-08-09) had
   four. The Weeks tab has always guarded against this via `maxWeeks`; this
   timeline never did. Now filtered to weeks whose **end** falls on or after
   `start_date` — the same "the week containing the start date is week 1"
   rule the Weeks tab numbers by, so the two screens agree on where her
   history begins. A week she actually filed a check-in for always shows
   regardless, so a data oddity can't strand real work out of reach.
2. **The picker listed 16 weeks while only 6 weeks of check-ins were
   loaded** (`TIMELINE_PAST_WEEKS`), which would have rendered a
   long-standing client's genuinely completed check-ins as Missed — with a
   Reopen next to them. `PICKER_PAST_WEEKS` is now exported from the picker
   and *is* the load window, so the two cannot drift. Stepping back beyond
   that window is still correct: the selected week's check-in is fetched
   individually by `getCheckinForWeek`, not read out of that array.
3. **"‹ Older" had no floor** — it just incremented `weekOffset` forever, so
   a coach could page back past onboarding into weeks the client never had.
   New `oldestWeekOffset` clamps it, and one step past her first real week
   now walks into **Onboarding** and stops there (Newer already steps back
   out of it), which makes the stepper a complete traversal of her history.
   Arithmetic verified against the real week helpers: Melissa clamps to
   offset 1 (exactly her two filed weeks), a 2024 client still reaches 86
   weeks, no `start_date` falls back to the picker depth rather than
   infinity, and a check-in dated before the recorded start date stays
   reachable.

**Also fixed in passing**: `NutritionOnboardingTab`'s starting-photos card
picked the earliest photo per angle from **all** photos with no
`photosSinceEngagement` filter — so the nine clients migrated off the Google
Sheets trackers were shown 2023/2024 photos as their starting set, the exact
bug already fixed in `onboarding/photos.js` but never in the tab's own copy.
Extracted to `components/nutrition/StartingPhotos.js`, scoped, and shared by
both screens so there is one definition of "her starting set".

**Verification**: clean `npx expo export -p web`, a Babel parse + scope pass
over all 11 touched files (a clean export alone does not resolve identifiers
— it has hidden a missing helper before), and real interaction through a
throwaway `app/zz-harness.js` route: a drag-select on a questionnaire answer
firing `onChangeHighlights(0, [[7,26]])` and rendering, week and onboarding
selection, Reopen not stealing the row's press, sparkline geometry read out
of the DOM, and the Melissa case re-rendered from her real row. **Not
click-tested behind a real login** — standing limitation.

## Backend audit: 12 findings closed (2026-08-21)

A full read-only audit of the Supabase project (schema, RLS, functions,
orchestration) cross-referenced against all four local repos, followed by an
approved fix pass. Full report:
https://claude.ai/code/artifact/365e64ad-d60e-4084-a5f9-d788e3e506c0 —
rollback SQL and evidence for every change are in `~/kova-audit-2026-08-21/`
(see its README for what each file undoes; the 107 storage files and 3 auth
accounts are the two changes that cannot be undone).

**The estate is in better shape than "grown organically" implies**, and this
is worth knowing before anyone plans a big cleanup: all 85 tables have RLS
enabled, there are **zero** blanket-`true` policies, none granted to `anon`,
every `SECURITY DEFINER` function pins `search_path`, and there are **zero
broken table references** in any repo. The identity layer — the risky part,
with three apps sharing one `auth.users` — has no orphans in either
direction. Naming is already consistent across all 688 columns.

**Fixed this pass** — `logs` duplicates (see 0073); a $247,132 approved pay
request that should have read $2,471.32 (only `approved_amount` was wrong;
`amount_requested` and the pay entry both already read correctly, so no money
moved); 1,140 `pay_entries` backfilled from `staff_email` to a real
`user_id`; `import-client`'s silent-500 collision path; five RLS policies
that anon could read; rate snapshots for all 22 closed periods; settings-key
drift; three junk auth accounts; three redundant indexes; a size/MIME cap on
the public `graphics` bucket; and 107 orphaned progress-photo files.

**Things worth carrying forward:**

- **`import-client` no longer 500s on a `ghl_contact_id` collision.** It lands
  a usable profile without the contact id and returns **200 with a warning
  payload**, because GHL's webhook action surfaces nothing on a non-2xx — a
  500 there is invisible, and used to leave an `auth.users` row with no
  `core.users` row, which is unregisterable and invisible on every screen.
  There is still **no import log or retry** (audit F8); Safety Fair's
  `public.entries` already does this properly (`ghl_sync_status`,
  `ghl_sync_error`, unique `dedupe_key`, a retry endpoint) and is the thing
  to copy rather than redesign.
- **Anon could read every announcement.** Four event/announcement policies
  plus `core.settings`' messaging keys gated on content state (`send_at <=
  now()`) with no caller check, and `to public` includes `anon`. Confirmed
  with a real unauthenticated request before fixing. **Standing rule: an RLS
  policy gates on the caller first, content state second.**
- **Closed pay periods now freeze their rates.** 21 of the 22 closed periods
  had no `closed_period_rate_snapshots` row (they were closed by SQL during
  the Glide import), so the report repriced them live at today's rates.
  Snapshots are now in place. `owner_pay`/`staff_pay` were deliberately left
  null — writing them would mean reimplementing the pay formula in SQL, and
  the report already recomputes from entries, now against frozen rates.
- **`payroll.finalizations` is still empty** — the submit → approve →
  send-back → close flow has never run on real data. Worth walking one live
  period before the next real payroll run.
- **Half of payroll history was keyed on an email string**, not a user. Now
  backfilled except 41 rows for **Kelsie Neidner**, a departed coach with no
  account of any kind — `core.users` has no inactive/archived state, so
  representing her would mean an *active* staff account. The `user_id ??
  staff_email` fallback in the admin report must stay for her alone.
- **`core.settings` is a shared bag** — one owner per key, whitelist your own
  keys, never render or write it wholesale. Three superseded block-length
  keys were renamed `zz_deprecated_*`; the key the UI actually reads
  (`default_block_length_weeks`) had no row at all and now does.
- **Storage deletes need the Storage API.** `supabase storage rm` reports
  success and deletes nothing, and direct deletes from `storage.objects` raise
  `42501` from a protection trigger. A `service_role` key **is** reachable via
  `supabase projects api-keys`, so a batch `DELETE /storage/v1/object/<bucket>`
  with a `{"prefixes":[...]}` body works — that is how the 107 orphans went.
- **Still open**: an import log with retry (F8), the dead `nutrition` schema
  and its unused `client.js` export (F13), a TrueCoach retention decision
  (F14 — `truecoach_import_sets` is 32 MB of a 63 MB database and 75% of it
  belongs to people who never registered), plus phone-format normalisation
  and ~12 hot unindexed FKs. Nine orphaned photo files remain by choice: five
  are real images with no duplicate, four are junk.

## Working notes for future sessions

- **No DB credentials available** in this environment — always ask the user to run new migration files in the Supabase SQL Editor, and proactively remind them about `NOTIFY pgrst, 'reload schema'` afterward rather than waiting for a confusing PGRST205 error to prompt the question. **Update 2026-08-04**: the Supabase CLI *was* authenticated in this particular session — `supabase functions deploy send-announcement` and `scan-announcements --no-verify-jwt` both succeeded directly, and `supabase secrets list` worked too (returns hashed values, not plaintext, so secrets still can't be read back). This is the same class of "don't assume the sandboxed limitation always holds — check first" exception as the physical-device session below. Still no direct Postgres access confirmed either way — migrations still went through the user's own SQL Editor this session, untested whether `supabase db push` or similar would also work.
- **No device/simulator access, normally** — native-only features (push, native builder screen, deep links) can be code-reviewed and bundle-checked (Metro will still catch syntax errors) but not visually verified. Say so plainly rather than implying they've been tested. One session was an exception (real Bash access to Dustin's actual Mac) — see "Physical iOS device builds" above for what that involved and what's durable vs. not.
- **Self-testing trick for auth**, mirroring Nutrition Tracker's pattern: a signed-in user's own `id`/`email` can be read straight out of `window.localStorage`'s `sb-<project-ref>-auth-token` entry via `javascript_tool` — this is how Dustin's UUID was retrieved to link his test account, without needing dashboard access.
- **Debugging network calls in the web preview**: `read_network_requests` doesn't reliably capture this app's Supabase calls. Instead, monkey-patch `window.fetch` via `javascript_tool` before triggering the action (must be done on the page *before* a client-side navigation, since a full page reload resets the patch), then inspect the captured `{url, status, body}` array afterward.
- **Commit straight to `main` — do not create a feature branch.** Every commit in this repo's history is on `main`, and Vercel's connected-repo auto-deploy watches `main`, so a branch just makes extra merge work for Terra. A generic "don't commit to the default branch" habit got applied once (2026-08-10, the v5 pass) and she flagged it immediately: *"im confused why you did it that way? never had that before."* Check `git log` for how this repo actually works before reaching for a default.
- **The iOS Simulator build tool is the reliable way to catch native-only bugs, and it's worth the ~2.5 minutes.** `mcp__Claude_Code_iOS_Simulator__build` against `ios/KovaStrength.xcworkspace` (scheme `KovaStrength`) produces a real simulator build; `control` launches and screenshots it. Combined with the standing login-screen harness trick (temporarily render the components under test on `app/(auth)/login.js` with fake data, revert after), this gives real native verification without needing to log in. This is what found the NativeWind `Pressable` style-function bug in the v5 pass after web verification had passed clean twice — see that section. **When a report is native-only and the web preview keeps passing, stop reasoning and go build it.**

- **`git push` is NOT reliably available even in a session where Supabase/Vercel/EAS CLIs are authenticated** — hit this for real 2026-08-07 (the Web Push session): `git push origin main` failed with `could not read Username for 'https://github.com': Device not configured` (no reachable `osxkeychain` entry for github.com, no `gh` CLI installed). Don't assume a push will succeed just because other tool auth has — commit locally, then explicitly tell the user the commit is local-only and ask them to push (or fix git credentials) rather than silently treating "committed" as "deployed." This matters more than usual for this project specifically, since Vercel's connected-repo auto-deploy is the *only* deploy path (see the "real Vercel-deploy lesson" note above) — a local-only commit means nothing shipped at all, not even a stale-but-present deploy.

- **Never commit unless Terra explicitly asks, and when you do, stage only the exact files you changed — never `git add -A`, `git add .`, or `git commit -a`.** Terra frequently runs **several sessions against this same working tree at once**, so at any moment another session may have unrelated files mid-edit, including throwaway test harnesses. Blanket staging sweeps them into your commit. This caused a real near-miss on 2026-08-10: a commit meant only for `lib/webAutofillSuppression.js` staged everything modified and picked up a temporary visual harness that had been mounted on `app/(auth)/login.js` (the standing preview trick documented above), plus two other files from a parallel session. That harness `return`s a static swatch page **before** the real login form — had it been pushed, every web user would have hit a dead sign-in screen. It was caught only because the other session went to revert its harness and found it already committed. Two habits prevent it: don't commit unasked, and always `git add <specific paths>`. Also worth a `git status` glance before committing — if files you never touched are modified, another session owns them, so leave them alone.

- **Prefer a throwaway top-level route over the login-screen harness.** A file
  like `app/zz-harness.js` (outside the `(auth)`/`(member)`/`(coach)` groups) is
  reachable unauthenticated exactly like `login.js`, renders whatever components
  you want to measure, and **deleting it cannot leave sign-in broken** — which is
  the entire failure mode of the trick below. Used this way on 2026-08-15 to
  measure `/register`'s code step without driving the real flow (which would have
  texted a real person). Same teardown discipline applies: delete it and check
  `git status` before committing.

- **The login-screen harness trick has a matching teardown obligation.** Mounting components on `app/(auth)/login.js` to preview them (documented above, genuinely useful and used repeatedly) leaves the sign-in screen broken until reverted. Back the file up first (`cp` to the scratchpad), revert immediately after screenshotting, and verify with `git diff -- "app/(auth)/login.js"` that it's actually clean — don't just assume the restore worked. The longer a harness sits on disk, the wider the window for a parallel session to commit it.
