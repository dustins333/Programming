# History: coach web (design passes, dashboard, clients, exercise library, builders, permissions, documents, Coach Prep)

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

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

## Coach account permissions + dual-login (staff-as-client) (2026-08-01)

Two asks from the same conversation, scoped deliberately narrow: skip building GHL-tag-driven program automation (agreed not worth the ongoing tag/parser-drift maintenance for how infrequently membership type actually changes — new-client and cancellation *webhooks* are still the plan, just not yet built this session) and instead build (1) admin-configurable per-coach module access and (2) letting a coach/admin account also be a real training client under the same login.

**Per-coach module toggles.** `core.users` gained three booleans (migration `0015_coach_permissions.sql`, **run against the live project**): `can_view_spc`, `can_view_nutrition`, `can_view_exercise_library`, all defaulting `true` so no existing coach's access changes until an admin flips one off. This is account-level, not per-client scoping — `core.is_staff()`'s "all coaches see all clients" design (0001's comment) is untouched. Three new security-definer functions (`core.can_access_spc()` / `_nutrition()` / `_exercise_library()`) encapsulate "admin always passes, coach passes only if their own flag is on," and every SPC/Nutrition/template "staff manage" RLS policy (0004/0005/0006/0008/0009) was switched from a bare `core.is_staff()` check to the matching `can_access_*()` call — real enforcement, not just hidden nav. Two deliberate scope decisions: `programming.exercises`' **read** policy stays plain `is_staff()` (every workout builder needs to read the library regardless of a coach's own toggle, or building group/SPC workouts would break for them — only the insert/update "manage the library" policies are gated), and `one_off_workouts`/`warmups`/`exercises` are **not** gated by `can_view_spc` even though `workout_templates`/`template_*` are — one-offs are reached from a client's own detail page regardless of program, templates' management entry point lives under the SPC nav section per its own build notes.

Nav visibility mirrors the RLS gating (`AuthProvider.js`'s profile fetch now selects the three flags): `CoachShell.js`'s sidebar (web) and `app/(coach)/_layout.js`'s Tabs (native, Nutrition is a direct tab there) filter on the same `can_view_*` flags, and `programs.js` (SPC row)/`more.js` (Exercise Library row) filter their rows the same way — admin always sees everything.

**Team management UI.** `app/(coach)/settings.js` gained a "Team" section (admin-only, same as the rest of that page): lists every coach/admin (`listCoaches()`), each coach row gets the three module `Switch`es (`updateCoachPermissions()` in `clients.js`) — admin rows show "Full access" instead, since the toggles don't apply to them. "+ Add coach"/"+ Add admin" open new `components/AddStaffModal.js` (name/email/role), which calls new `inviteStaffMember()` → new Edge Function **`supabase/functions/invite-staff/index.ts`** (deployed). That function is admin-only (checked server-side, not just left to RLS — there's no RLS equivalent for creating an `auth.users` row), calls `auth.admin.inviteUserByEmail()` (sends the actual "set your password" email), and — since this project's auth is shared with the Nutrition Tracker app — falls back to finding an existing `auth.users` row by email (via `admin.listUsers()`, no direct getUserByEmail in the admin API) if the invite errors as already-registered, so promoting an existing Nutrition Tracker login to coach works the same as a brand-new hire. Upserts the `core.users` row on `id` afterward so re-inviting an existing profile only touches name/email/role, leaving that person's permission flags as they were.

**Dual-login.** A coach/admin is also a real training client now, per explicit ask — same login sees their coach dashboard by default and can switch into the exact same member experience any client uses. This turned out to need no new data model at all: `client_program_assignments`/`spc_clients`/`nutrition_clients` were never actually restricted to `role: 'member'` rows, and `app/(coach)/clients/[userId].js` (the existing per-client program-assignment page) has no role assumptions anywhere in it — confirmed by grep before relying on it. So a coach's own training is just set up via that same page (`Settings` → Team → "Manage own training →" links straight to `/(coach)/clients/{their own id}`, reusing it as-is), and the only real work was the routing: `app/(member)/_layout.js`'s old hard redirect-away-if-not-member is now redirect-away-only-if-no-profile — staff are let through — and a staff-only "Coaching" tab (`app/(member)/back-to-coaching.js`, a plain `<Redirect href="/(coach)" />`, hidden via `href: null` for plain members) is the way back. Entry points: `CoachShell.js` (web sidebar) and `app/(coach)/more.js` (native) both gained a "My Training" link to `/(member)`. Member-side empty states ("not assigned to a program yet") already handled a client with nothing set up gracefully, so a coach who hasn't set up their own training yet sees exactly that, not an error.

**Migration 0015 is run and `invite-staff` is deployed.** Still **not visually verified** — same login limitation as everywhere else in this file (no password entry in this environment); bundle-checked only (fresh `expo start --web` on a scratch port, clean compile, no console errors on the reachable unauthenticated screens). Worth a manual pass: add a coach, flip a toggle off and confirm the nav item + underlying data both actually disappear for that account, and click through "My Training" → "Coaching" both directions. The invite email's `kovastrength://set-password` link also needs a real test — the app isn't published anywhere yet, so it's untested whether that link does anything useful on a device that doesn't already have the app installed (this is the same gap that later prompted the phone-OTP onboarding discussion below).

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

## Add Coach dialog: existing-client search + a real `import-client`/`invite-staff` bug found migrating the first 12 nutrition clients (2026-08-06)

**Add Coach/Admin dialog gained an existing-client picker.** Prompted by a design question, not a bug: coaches are added one at a time by an admin, and some are already Kova clients (or already have an account from the shared-auth standalone Nutrition Tracker app). `invite-staff` already handled this correctly — `inviteUserByEmail` fails as already-registered, falls back to finding the existing `auth.users` row by email, and upserts `core.users` onto that same id rather than duplicating — but the admin had to type the person's exact existing email by hand for that fallback to find the right account, with a mistyped email silently creating a second orphaned account instead. `components/AddStaffModal.js` now has an "Existing client (optional)" search box (name-only match, not email — an admin is far more likely to recognize a name) backed by `listMembers()`; picking a result locks the Name/Email fields and shows a "Promoting existing client X — same login, no new account" banner, with a "Change" link back to manual entry. Purely a fill-the-form safety net — `invite-staff` itself is still what does the actual matching and promoting.

**Real bug found and fixed migrating Terra's first 12 existing nutrition clients into Kova via the GHL "won" webhook.** The plan (confirmed correct, see the "iOS push confirmed live, Universal Links, GHL import groundwork" section) was: fire the GHL trigger on each existing client → `import-client` finds their existing `auth.users` account by email and creates a `core.users` row on it → coach flips their Nutrition switch on, which reactivates their existing `public.clients` row in place, no data migration needed since Kova reads the same live table. The first attempt (bulk GHL action, then a per-contact tag trigger) produced zero new rows and no visible error in GHL's own logs. Diagnosed live, with this session's authenticated Supabase CLI (`supabase db query --linked` reads/writes the real project directly) and direct `curl` calls against the deployed function — same "curl the API directly to get the real error text" technique used for the original GHL scope issue:

- Ruled out the shared secret and endpoint URL first (a direct curl with Terra's actual configured header value returned a clean `200` and created a real row).
- Ruled out "all 12 firing at once" as a cause — fired 12 genuinely concurrent requests at the live function myself; all 12 returned `200` with no throttling or race condition.
- The real cause only showed up testing against an email that **already had an existing `auth.users` account** (every one of the 12 real clients, unlike the throwaway test emails above, and unlike Cozeth — who worked on the first try specifically because she had no prior account at all, so never hit this code path): `auth.admin.createUser`'s real duplicate-email error text is *"A user with this email address has already been registered"* — note "already **been** registered." Both `import-client` and `invite-staff` had a regex (`/already registered|already exists|email_exists/i`) written against the wrong exact phrasing, missing the word "been," so the intended existing-user fallback never triggered — every real (non-first-time) import 500'd instead of finding and promoting the existing account. Fixed to `/already.*registered|already exists|email_exists/i` in both files (found and fixed in `import-client` first, then defensively applied the same fix to `invite-staff` — same underlying Auth API, same error text, same bug shape, not independently confirmed broken but not worth leaving as a landmine).
- Redeployed both functions live this session (`supabase functions deploy import-client --no-verify-jwt` / `invite-staff`), re-tested against a real affected client (Abbi Stauffer) to confirm the fix, then Terra re-ran the real trigger on all 12 — confirmed via direct DB query that all 12 landed with real `ghl_contact_id`s and (for the 11 who already had nutrition data) `status: active` reactivated in place. One of the 12 (Dustin Smout) turned out to have no prior `public.clients` row at all — a genuinely new nutrition client, not a migration — so he still needs the normal "Send to client" onboarding gate, unlike the other 11 whose full history was already sitting there waiting.

**Worth remembering for any future "already registered" duplicate-account handling in this codebase**: match on `/already.*registered/`, not `/already registered/` — confirmed against Supabase's real Auth Admin API error text this session, not assumed.

## Coach web sidebar gets a real mobile nav (2026-08-07, same day)

Real report from Terra after pushing the session above: signing into a coach profile on the installed home-screen PWA still opened in standalone mode (no Safari address bar came back — that part was never broken), but showed the desktop coach sidebar squished onto a phone-width screen. Investigated first, since nothing in the pushed diff touched the PWA manifest, Universal Links config, or any routing/redirect logic — confirmed via `git diff --stat` against the previous deployed commit. Root cause: `CoachShell.js` (wraps every coach web screen) has never had any responsive/width logic at all, going back to the original "Coach web v1 design pass" — it's rendered a fixed 232px sidebar unconditionally on *any* web viewport, phone or desktop, since it was built. Not a regression from the session above; just newly noticed, and worth building for real since the PWA is genuinely useful during testing (instant deploy via `git push`, no App Store review) even though the long-term plan is the native app for on-the-go coach use.

**Fix, not a workaround**: `CoachShell.js` now branches on `useWindowDimensions()` against a new `MOBILE_BREAKPOINT = 768` (matching this project's own preview-tooling mobile/tablet/desktop convention). At or above it: the original persistent sidebar, byte-identical to before. Below it: a compact header (hamburger + logo, safe-area-aware via `insets.top`) with a slide-in drawer (`Modal`, tap-scrim-to-close) showing the exact same nav content. The choice is by viewport width, not by trying to detect "is this the PWA" — there's no reliable way to detect that distinction from JS, and it wouldn't be the right signal anyway (a desktop browser resized narrow should get the compact nav too, a phone in landscape-tablet-width shouldn't be forced into a cramped drawer). Full-bleed screens that already skip `CoachShell` (the workout builders) are unaffected either way.

**Real layout bug caught and fixed during the same pass**: the first refactor (extracting the nav-item list into a shared `NavList` component so the sidebar and the new drawer render identical content instead of duplicating ~50 lines twice) accidentally dropped the flex-spacer that pins "Sign out" + the profile name to the bottom of the sidebar — wrapping `NavList`'s output in an extra `<View style={{flex:1}}>` at the call site made the *whole block* fill remaining height without redistributing space *within* it, so the footer would have floated up directly under the nav items instead of sitting at the bottom. Fixed by moving the flex-spacer *inside* `NavList` itself, between the items block and the footer block, as one of three direct children of a Fragment — since a Fragment doesn't introduce a layout boundary, those three children become direct flex items of whichever real container renders `<NavList/>` (the 232px sidebar `View` or the drawer's `Pressable`), so the footer pins to the bottom of either one the same way the original single-file sidebar did.

**Actually visually verified, not just bundle-checked** — this session had no other way to reach a coach-only component without logging in (still can't, no password entry in this environment), so used the same documented technique as the 2026-08-05 calendar-picker work: temporarily mounted `<CoachShell>` on the unauthenticated `login.js` screen, reverted immediately after. Confirmed via the Browser pane at both a 375px mobile viewport and a real desktop width: the mobile header/hamburger renders, the drawer opens and closes (scrim tap), nav items and "Sign out" render with the footer correctly pinned to the bottom in the drawer, and the desktop sidebar is visually unchanged from before. **Tooling note worth remembering**: this session's synthetic clicks via the `computer` tool's `left_click` action reliably timed out ("Browser pane is currently hidden") when targeting react-native-web `Pressable`s inside this app, for reasons not fully diagnosed — dispatching a manual `pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click` event sequence directly on the target element via `javascript_tool` worked reliably instead, same fallback technique already documented elsewhere in this file for `dnd-kit` drag gestures. Also worth remembering: a raw coordinate guessed from *looking at* a screenshot can be wrong even when the reported "Screenshot size" matches the real viewport exactly — the first click attempts missed the hamburger icon by clicking a few pixels below its actual bounding box; recomputing the target's real `getBoundingClientRect()` via `elementFromPoint`/JS before clicking resolved it, same "re-derive from a known reference point" lesson as the earlier calendar-picker session.

## Settings → Program Defaults was writing to every core.settings row (2026-08-09)

Reported as "it's a mess" visually; turned out to be a real data-corruption bug underneath. `app/(coach)/settings.js`'s Program Defaults tab rendered `getSettings()`'s output directly — and `getSettings()` returns **every** row in `core.settings`, which is the generic key/value table shared by every admin setting in the app (messaging kill switch, payroll deadline/anchor date, specialty bars, the nutrition check-in notification's title/body/weekday/time, `notify_*` toggles). All 15 live rows rendered as single-line numeric `TextInput`s, so the tab showed raw keys, `specialty_bars` as `"[object Object]"`, and the check-in notification's multi-paragraph body squeezed into a number field.

**The save was the real problem**: `handleSaveAll` mapped over the same unfiltered list and wrote all 15 back through `Number(...)`-or-fall-back-to-string. Confirmed against the live table what that would have done — `specialty_bars` (jsonb array) → the string `"[object Object]"`, wiping the specialty-bar list the weight calculator reads; `messaging_enabled: false` → the **string** `"false"`, which is truthy, silently re-enabling messaging gym-wide; `notify_payroll_deadline_reminders` → a string instead of a boolean.

Fixed with an explicit `PROGRAM_DEFAULTS` whitelist (the 4 block-length/alert-lead-time keys this tab is actually for) driving both the render and the save — every other `core.settings` key is edited from the tab that understands it. Also: whole-number validation before saving (it was writing arbitrary strings into columns the rest of the app does arithmetic on), unit shown as a suffix beside each field instead of buried in the label, a line noting changes only affect future blocks, a documented per-key fallback so a key with no row yet shows its real default rather than blank, and a single-column layout below 768 (same breakpoint `CoachShell` uses).

**General lesson**: `core.settings` is a shared bag, not one feature's table — never render or write it wholesale. Any new settings surface should whitelist its own keys explicitly.

Also removed the SPC subtitle ("Your individual strength program") from My Week's SPC card per direct ask — added during the 2026-08-09 UX overhaul's Phase 4, unwanted. `ProgramCard`'s now-unused `subtitle` prop went with it. Screenshot-verified the rebuilt defaults card at desktop and mobile widths via the login-screen mount technique; `npx expo export -p web` clean.

## Deep-link 404s on refresh, the nagging update prompt, builder contrast (2026-08-09, later)

Five reports in one message, two of which needed real diagnosis rather than a UI change.

**Refreshing a deep URL 404'd** — e.g. `/clients/<uuid>`. Confirmed live with a plain `curl` against `app.kovastrength.com` before touching anything (`200` for `/clients`, `404` for `/clients/<uuid>`). Root cause: Expo's static web export writes a dynamic route to a file named **literally** `dist/clients/[userId].html`, and Vercel serves static files — no request path ever matches that name. Client-side navigation always worked because the router never asked the server; only a hard refresh/direct-link hit it. Fixed with explicit `rewrites` in `vercel.json`, one per dynamic route (11 of them, plus a `:step` rule covering the four `nutrition/clients/[userId]/onboarding/*` pages). Destinations keep the literal brackets (`/clients/[userId]`, not `.html`) because `cleanUrls: true` is what maps extensionless→`.html`, and a `.html` destination would collide with cleanUrls' own `.html`→extensionless redirect. **Vercel's routing order is redirects → filesystem → rewrites**, so these are a pure fallback and can't shadow a real static file — that's why `/spc/templates` still resolves to its own index rather than being eaten by the `/spc/:userId` rule. Re-enumerate with `find dist -name "*[[]*.html" | grep -v "^dist/("` and add a rule if a new dynamic route ever appears; nothing fails loudly if you forget, it just 404s on refresh.

**"The webapp constantly asks for a refresh"** — that's `components/AppUpdateChecker.js` (the stale-tab detector) working *correctly* and being unbearable about it. During a heavy-deploy stretch every prompt is a true positive, so the fix was quieting it, not making detection smarter: it had **no dismiss at all** (only a "Refresh" button, so it re-raised on every tab-return until you gave in), and — the "randomly asking" half — it called `window.location.reload()` **on its own** whenever the tab was backgrounded with the banner up, silently discarding anything half-typed. Now: a compact dismissible pill instead of a full-width bar, an ✕ that suppresses that specific script-src for good in that tab (a *newer* deploy still gets one prompt), no self-initiated reload ever, and a 15-minute poll instead of 5. **General lesson**: for a background nag, "is the signal accurate" and "is the interruption warranted" are separate questions — this one was 100% accurate and still wrong. **And a follow-up on 2026-09-07 found the signal was not always accurate after all — see the next section.**

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

## Exercise Library redesign — filters out of the way, form into four cards (2026-08-28)

A handoff (`design_handoff_exercise_library_v1/` — README + two `.dc.html`
prototypes + 8 screenshots) redesigns both library screens and the exercise
form. Same "the HTML is a reference, never copied in" rule as every prior
handoff. **No schema change, no migration, no new data call** — every value
already had a helper behind it.

**Where the handoff was**: inside `SPC Coach Overview Redesign.zip` at the repo
root, which is misnamed — it contains `design_handoff_exercise_library_v1/`,
nothing SPC. Worth checking a zip's contents rather than its name.

**Both screens opened with their filters instead of their content.** Mobile
stacked a segment, an archived toggle and eight muscle pills — three rows of
chrome before the first name. Web was worse: one flex-wrap row of ~20 chips
(All + 8 patterns + Warm-up + 8 muscle groups + 3 flags + Archived) that
wrapped to three lines, then three stacked full-width banners, so the table
started below the fold.

- **Web** now has three controls with three different jobs: a **segmented
  control** (Lifts / Warm-ups / Archived — the view you're in, not a filter),
  **two counted dropdowns** rendered only on the Lifts segment because neither
  applies to warm-ups, and three right-aligned **NEEDS ATTENTION** toggles.
  Attention is single-select (tapping the active one clears it), matching the
  prototype's own `flag: null` — a combinable set can't be read back off the
  screen. Three doorway banners became one row of three equal cards. Table
  columns and USED/VIDEO semantics are untouched.
- **Mobile** (`components/coach/ExerciseLibraryMobile.js`, new) is title +
  `+ New` → count line → segmented control → search + Filter → A–Z card list.
  Muscle groups and "Show archived" moved into a **filter bottom sheet** with
  live counts, and applied filters echo back as dismissable espresso tokens —
  the same pattern `SpcRosterMobile` already uses. Sheet counts are computed
  against the SEARCHED set, or it offers "Chest 5" and then shows one row.

**`index.web.js` had no mobile branch, and that was the real gap the handoff
exposed.** In practice everyone is on the installed PWA ([[project_everyone_is_on_the_pwa]]),
so a coach at phone width was getting the desktop table, and the new mobile
design would have been unreachable in production. It branches at
`MOBILE_BREAKPOINT` now onto the shared component, two components with a
branch between them — never importing the native sibling from the web file,
which self-resolves and crash-loops (the documented SPC-roster trap).

### The form: four cards, and the shell picks by WIDTH not platform

`components/ExerciseFormModal.js` keeps its name and API — all six call sites
(both library screens, the review queue, three web builders) needed **zero**
changes, because every new prop is optional. Inside, the ten fields are
grouped in the order a coach answers them: Identity (Type → Name → live
duplicate check) · Classification (Parent → Muscle → Pattern) · How it's
logged (Measured in → Weight → Default prescription) · Teaching (Cues →
Video). **"Measured in" now sits directly above the prescription and renames
the reps input** (REPS / TIME / DISTANCE) — previously you set the number
before saying what the number was. Archive moved off the list row to the foot
of the form as a quiet red action, via a new optional `onArchive` that returns
whether it archived so the form knows to close.

Extracted to `components/exercise/`: `tokens.js` (the handoff's surface greys,
which were repeated as literals across three files), `MuscleGroupPicker.js`,
and `ParentPicker.js` — the last replaces the raw web `<select>`, which
couldn't carry "+ New parent" inside the list it belongs to, so that action sat
underneath reading as unrelated to the field.

**The shell branches on width, not `Platform.OS`, and that distinction is the
one worth remembering.** The handoff says "mobile full-screen, web drawer",
which is true of the design and wrong as an implementation axis: the installed
PWA is a phone running the *web* build, so keying it to platform handed a coach
the new mobile library and then a 460px desktop drawer to edit from — caught by
actually loading the page at 390px, not by reading the code. `wide = width >=
MOBILE_BREAKPOINT` now drives the shell, the card-vs-continuous-column
grouping, and the parent picker's panel-vs-sheet. A tablet gets the drawer,
which is what it has room for.

**One measured fix**: "Track weight" clipped to "Track wei…" in the drawer's
Measured in / Weight row. The mock's 1 : 0.8 split was never going to hold —
measured in the browser, the two groups need near-identical width ("Distance"
51px × 3, "Track weight" 76px × 2). Equal flex plus a slightly tighter gap and
11px labels clears both, confirmed by reading `scrollWidth` vs the rendered box
for all five labels rather than eyeballing a screenshot.

**Deliberately not done**: the EQUIPMENT column the mock draws — there is no
equipment field on `programming.exercises`, and rendering an empty column for
every entry is worse than omitting it (same call as the previous pass). The
mobile filter sheet lists all eight muscle groups including zero counts, per
the handoff, where the web dropdown omits empties — the sheet's count is
information on a fixed list, the dropdown's absence is a filter that can only
ever show an empty table.

**Verification**: `npm run build` (export + route check) clean, a Babel parse +
unresolved-identifier + unused-import pass over all seven touched files, and
both screens driven for real in a browser at 1360px and 390px through a
throwaway `app/zz-exharness.js` route. Exercised: every segment, both
dropdowns (Legs → exactly the 5 legs lifts), the attention toggles, the filter
sheet end to end (footer "Show 5 exercises" then the list matching), the
duplicate banner with its usage meta, save gating and its 45% dim, the parent
panel and the parent bottom sheet, parent-pull leaving a hand-picked muscle
group alone, type-switching hiding what doesn't apply, and the reps label
following the unit (REPS → DISTANCE). Fixture data was supplied by temporarily
stubbing `listExercises`/`listExerciseUsageCounts`/`listExerciseParents`, both
files backed up first and restored **byte-identical** afterwards (md5 checked)
— worth reusing, it verifies the real screens rather than isolated copies.
**Not verified**: anything behind a real login, and none of it on native
(standing limitation). Worth Terra's pass on a real archive, a real "+ New
parent", and the three builders' "+ New" now opening as a drawer.

## The rosters remember where you were (2026-09-05)

Change the coach filter on SPC, open a client, come back, and you were on
the default filter at the top of the list again. Both SPC rosters already
guarded that filter against the refocus reload with a `coachDefaultApplied`
ref — **but a ref lives on the component instance, and on web pushing
`/spc/<userId>` unmounts the roster.** The ref went with it, the fresh
instance loaded, and `defaultCoachFilter` reapplied. Search, status chip,
sort and scroll position were lost the same way. The Clients roster had the
identical problem, and is fixed in the same pass. No migration; this is all
client-side.

**New `lib/rosterViewState.js` — an in-memory Map, deliberately NOT
AsyncStorage**, for two reasons worth keeping:

- It has to be readable **synchronously during the first render**. A filter
  restored a tick later paints the wrong list and then jumps, and an async
  read can't seed `useState` at all.
- **It should die on reload.** A reload is a fresh start, and a fresh start
  is exactly when "opens filtered to you" is the right behaviour. Persisting
  a coach filter across reloads would mean looking at someone else's roster
  days later with only a small token to explain why.

So: session memory, not storage. Losing all of it costs one tap. Keyed
rather than SPC-specific so the Clients roster can adopt it without a second
copy of the idea drifting away from this one, and cleared on sign-out next
to `clearAllScreenCaches`.

**Precedence, because a dashboard `?status=` link and a remembered view can
disagree.** The store keeps the raw status param it was last reconciled
against; a param that doesn't match it is a *fresh* deep link and outranks
everything remembered (and starts at the top of the list). Coming back from
a client's page re-enters on the same URL, which is not that. Desktop also
gained the reconcile effect the phone already had, so a second dashboard
link arriving without an unmount can't record a new param against the old
filter — which would make the *next* visit treat a genuine deep link as
already handled.

Also normalised the desktop coach filter from `"all"` to `null`, matching
the phone. `matchesCoachFilter` already treated them as one thing; sharing
the shape is what lets both widths remember one view instead of two that
drift, and the `<select>` keeps `"all"` as its option value.

**Scroll restore is driven by `onContentSizeChange`, not an effect on
mount.** The rows aren't laid out when the ScrollView first mounts, so a
`scrollTo` there clamps to whatever height exists at that instant and lands
somewhere arbitrary. `useRosterScrollRestore` waits for a content height at
least as tall as the saved offset, restores once, and **abandons the restore
the moment any scroll event arrives** — it clears its own pending flag
before calling `scrollTo`, so anything still arriving is the coach scrolling
for themselves and must not be yanked back.

### The Clients roster, same treatment

`app/(coach)/clients/index.web.js` keeps its chip, search, sort **and page**
across the round trip. Two things specific to it:

- **Its two deep-link params are collapsed into one key** (`?program=` and
  `?filter=`, joined as `"program|filter"`), because "is this a fresh link"
  has to be one question. The old pair of effects reapplied the param on
  every mount with no applied-ref at all, so a remembered chip would have
  been overridden on the way back from every client — the exact failure the
  precedence rule above exists to prevent.
- **The `setPage(1)`-on-filter-change effect had to skip its first run.** It
  fires on mount like any other effect, so it would have thrown away a
  restored page before it was ever painted. Changing a filter while mounted
  still resets to page 1, which is what that effect is for.

**The native Clients list (`index.js`) is deliberately untouched.** It's a
Tabs screen that stays mounted while a coach drills into a client, so its
state already survives; it also has a different filter model
(`programFilter` + `flaggedOnly` rather than one key), so sharing a stored
shape with the web list would mean normalising two UIs that genuinely
differ. Note the web file has no mobile branch, so the PWA renders it at
every width — which is why fixing web covers the phone too.

### A search looks at everyone

Searching inside the filter is the same as not finding her: a coach types a
name because she wants that person, and the whole reason to type it is
usually that she isn't in whatever slice is on screen. So on all three
rosters a non-empty search now bypasses every filter (SPC's coach filter and
status chips, Clients' chip).

The filters **stand down, they are not cleared** — clearing would make her
set them up again afterwards, and the whole point of the session memory
above is that she doesn't have to. While a search is running the filter
controls dim to 0.4 and go inert, the count line reads "N matches · filters
paused while you search", and the empty state says the search found nobody
rather than blaming the filters. Clearing the search puts everything back
exactly as it was. **Sort is deliberately left live** — it's a preference,
not a slice.

Inert is belt and braces, because the two mechanisms fail differently:
`pointerEvents: "none"` on a wrapper is what a real click hit-tests against,
and `disabled` on the Pressable is what actually stops onPress. The wrapper
alone is not enough on the phone's Filter button — RNW gives the inner Text
`pointer-events: auto`, so `elementFromPoint` still lands on it and the
click bubbles; the Pressable's own `disabled` (which RNW renders as
`aria-disabled` plus `pointer-events: none` on the pressable itself) is what
holds. Verified both ways on both.

**A synthetic `dispatchEvent` on an element bypasses hit-testing entirely**,
so it CANNOT be used to prove `pointer-events: none` blocks anything — it
fires the handler regardless, which is exactly what happened here and made
an inert control look live. Test it with `document.elementFromPoint` at the
control's own centre instead, and check the returned node isn't inside it.

### Two verification lessons

**Scroll events do not fire at all in the hidden Browser pane.** Measured:
setting `scrollTop` on a real scroller moved it to 500 and a plain
`addEventListener("scroll")` fired **zero** times. Same class as the rAF and
ResizeObserver gaps already recorded here, and it means anything driven by
`onScroll` or `onContentSizeChange` (RNW implements the latter as
`onLayout`, i.e. ResizeObserver) is unverifiable through that pane. The way
round it: render the real hook in a probe component that exposes its
returned handlers on `globalThis` and call them by hand — that still
exercises the shipped state machine and the real store, just not the
browser's delivery of the events.

**A ternary rendering the same component type in the same position does not
remount it.** The harness toggled `{mounted ? <Probe id="A"/> : <Probe
id="B"/>}` to simulate leaving and coming back; React reconciled by position
and type, reused the one instance, and only changed the prop — so the refs
never reinitialised and the restore looked broken when the code was fine.
Distinct `key`s force the real unmount. Worth remembering for any test of
mount-time behaviour.

**Also worth knowing about that pane**: it reported `window.innerWidth/
innerHeight` of **0** after a reload while collapsed, which makes every
measurement meaningless (a scroller read `clientHeight: 0` against
`scrollHeight: 4189`). Check `innerWidth` before trusting a measurement, and
`resize_window` to a real size first.

**Verified**: `npm run build` + `check:routes` clean, a Babel parse and
unresolved-identifier pass over every touched file, and both screens driven
for real through throwaway `app/zz-rosterharness.js` / `app/zz-clientsharness.js`
routes with their data layer and `useAuth` stubbed (harnesses deleted, every
stubbed file restored and md5-verified byte-identical). Exercised on SPC: the
coach filter, the search and a cleared filter all surviving an
unmount/remount at 1280 and 390, and a `?status=` arrival forcing the top of
the list while the coach filter still persists. On Clients: the chip, the
sort and page 2 all surviving the round trip; a `?filter=flagged` arrival
applying, then a hand-picked chip surviving a return on that same URL; and a
search typed while mounted still resetting to page 1. For the search
override: on SPC, filtering to one coach AND one status and then searching a
name belonging to neither still finds her, on both widths, with the controls
measurably unreachable and the count line saying so; on Clients, filtering to
Unassigned and searching an assigned client finds her; and clearing the
search restores both. And the shared hook's state machine end to end — saves on scroll, skips a too-short layout,
restores to exactly the saved offset once, never scrolls again on a later
layout pass, and abandons the restore if the coach scrolls first. **Not
verified behind a real login** — standing limitation.

## Coach dashboard redesign: the two views say the same thing (2026-09-06)

A handoff (`design_handoff_coach_dashboard/` — README + two `.dc.html`
prototypes + 3 screenshots) rebuilds both coach home screens. Same "the HTML
is a reference, never copied in" rule as every prior handoff. **No migration,
no new table, no new column** — every figure already had a query behind it.

**The premise, and the thing to protect going forward**: the phone and the
desktop had drifted. A figure on one was missing from the other, and where
both showed something they did not always mean the same thing — the desktop's
"TODAY IN THE GYM" was sessions / nutrition / PRs / unread while the phone's
band was sessions today / this week / girls in / girls not in. That happened
because each screen derived its own numbers inline. **`lib/programming/
dashboardModel.js` is now the single derivation** (SPC tiles, nutrition
tiles, group rows, quick-pick tiles, the payroll row, every subline), both
screens render it, and `components/coach/dashboard/*` is one set of
primitives where `wide` is the only difference between phone and desk. Adding
a figure to one view and not the other now takes deliberate effort.

**The four tap-through module cards are gone.** SPC / Nutrition / Group /
Library review were summary tiles that opened a detail sheet — you had to open
SPC to find out four people were behind. Each is an always-expanded section
now, modelled on the gym band, which is the one block Terra asked to leave
alone (it ships byte-identical on the phone; `wide` adds the desktop row).
**There is no collapse state and nothing to persist** — an explicit decision.

**Gating is absence, not disablement**, everywhere. A gated tile is not
rendered and its flex siblings stretch: a nutrition-only coach gets three
quick-pick tiles at a third of the width each rather than five with two dead
ones. Verified by driving `?role=nutrition` through the harness.

**Removed from the desktop, deliberately, and the code with them**: the
Resume hero (guessed at intent, usually wrong), the four launch cards (a menu
duplicating the sidebar) and the roster count chips. `lib/programming/
resume.js`, `buildLaunchCards` + its five card builders, `launchColumns`,
`listActiveBlockReadiness` and `components/coach/SessionsTodayModal.js` are
all deleted after verifying zero references. That takes `getResumeTarget`'s
whole query fan-out off every dashboard load — and it is why **nothing reads
`group_workouts.last_edited_by` (migration 0052) any more**. The desktop's
"sessions today" tile now opens the same `GymWeekModal` the phone does, which
is what made SessionsTodayModal dead.

**Deliberately NOT on the phone, and worth knowing before "fixing" it**: the
Needs You task list and the roster chips. The README's mobile order is an
explicit 11-item list with neither in it, and the sections carry the same
facts as tiles. **The one real loss is `unassignedCount`** ("3 clients not
enrolled in anything"), which now has no mobile home at all — flagged to
Terra rather than inventing a 12th block.

**Two places the two prototypes disagreed with each other, resolved toward
consistency** (which is the whole point of the pass): the nutrition tiles run
Logged today / Check-ins / Not seen on both, not the phone mock's Logged /
Not seen / Check-ins; and the mobile Library review row says "Library review"
rather than the mock's "· added by 3 coaches", because the author count needs
`listPendingExercises` and the phone should not pay two queries for a
subline.

**`colors.ink` (`#33251f`) and `colors.text` (`#2a211c`) are real tokens
now.** Both were repeated as literals in a dozen files; the handoff names
them as tokens. Added to `lib/theme.js` and used by the new code only — the
rest of the app was not swept.

**New, all cheap and all isolated**: `spcStates`/`spcNoCoach` and
`nutritionNotSeen` on `getCoachDashboardStats` (derived from rosters it
already fetches — no new query), `weekNumber`/`blockLengthWeeks` on the group
dashboard rows (already computed, previously thrown away), `stagedCount` on
`getLaunchpadExtras` (one indexed read, so the SPC action row can say
"2 staged for later" instead of a generic invitation), `pending` rows from
`usePendingDocuments` (already fetched, previously discarded), and
`lib/programming/useLibraryReview.js` — **reviewer-only and it does not query
at all for anyone else**, because a non-reviewer CAN read pending rows
(`is_staff()`) and would light up a section they cannot act on.

**`CoachShell` gained an optional `headerAccessory`** — the quick-pick row.
On mobile web it renders inside the app bar's own white container (the border
moved to the outer container so there is ONE border under the pair, not two);
on native, which has no app bar here at all, it becomes the same white block
pinned above the screen's ScrollView. Desktop ignores it — the sidebar
already carries every one of those destinations. Nothing else passes the prop.

**A tile that counts the gym must not open a list narrowed to one coach.**
The SPC roster opens filtered to "mine + unassigned" when a coach has clients
(`defaultCoachFilter`), so tapping "4 Due now" would have landed on a list
showing fewer than the number tapped. Both roster screens now treat **any**
dashboard deep link as suppressing that default, and `?status=` and the new
`?coach=` are one joined signature (`"status|coach"`), not two independent
questions — the same shape the Clients roster already uses for its own pair.
Asking separately is how a link that changes only the coach gets treated as
already handled. `?coach=` accepts only `mine`/`__unassigned`: an arbitrary
id would render an empty roster with no way to tell that from "you have no
SPC clients". `app/(coach)/spc/live.js` also learned `?staging=new`, the same
detour with nothing to load, so the desktop's "Stage another" works while a
board is already running.

### A real crash, and the check that would have caught it

`DashboardSheet` imported `TONE_INK` from `DashboardParts`, which does not
export it. **A missing named export is a valid identifier that is simply
`undefined` at runtime** — `expo export` is clean, a Babel parse is clean, an
unresolved-identifier pass is clean, and a screenshot looks fine right up
until something reads a property off it. It only surfaced by tapping a sheet
row that passes a `tone` (the nutrition-today rows do not), where
`AppErrorBoundary` named the component and the property exactly.

Worth adding to the standing verification bar for any pass that moves code
between modules: **walk every relative `import` and assert the source
actually exports each named specifier.** ~40 lines of `@babel/parser` +
`@babel/traverse` (collect `ExportNamedDeclaration`/`ExportAllDeclaration`/
`ExportDefaultDeclaration` names per file, resolve `./x` against
`x`/`x.js`/`x.web.js`/`x/index.js`, treat an unfollowable `export * from` as
"anything goes"). Run over the whole app it came back clean apart from this
one, so it is cheap to run broadly.

**Second lesson, from the same bug**: restoring a mid-session backup silently
reverted the fix, because the backup predated it. After restoring any stubbed
file, `git diff` it against HEAD rather than trusting the md5 — an md5 that
matches the backup proves only that the restore worked, not that the file is
the version you meant.

**Verification.** `npm run build` + `check:routes` clean; a Babel parse,
unresolved-identifier and unused-import pass over every touched file; the
missing-export sweep above across all of `app/`+`components/`+`lib/`; and
both screens driven for real at 1440×950 and 390×844 through a throwaway
`app/zz-dash.js` with the data hooks stubbed — admin, `?role=nutrition`, the
idle and running board states, both sheets at both widths (bottom sheet on
the phone, centred card on desktop), and all four SPC tiles measured as
exactly equal boxes (150×109, one top) with no horizontal page overflow. The
roster deep links were driven separately through `app/zz-roster.js`: no param
keeps the "mine + unassigned" default (3 of 4 rows), `?status=dueNow` shows
the gym-wide 2, `?coach=__unassigned` shows the 1. Harnesses deleted, every
stubbed file restored and confirmed identical to HEAD, console clean on a
**fresh** tab (the pane's log accumulates stale errors across HMR — the
earlier stubbed `useAuth` returned a new object per render and left hundreds
of "Maximum update depth" errors in the buffer that had nothing to do with
the shipped code).

**Not verified**: any of it behind a real login, and none of it on native —
standing limitation. Worth Terra's pass on the quick-pick row on a real
phone, a real "Due now" tap landing on the right roster, and the desktop's
Library review counts against the real library.

**Not built, and flagged rather than invented**: the app bar's **bell** icon
in the mock. There is no notifications screen in this app, so it would be a
button that goes nowhere.

## An RLS-filtered write reports success (2026-09-06)

"I turned test2's SPC off and she's still in the live board's picker." The
picker was right. Her row still read `status: 'active'` because the write
never landed, and nothing said so.

**The class, and it is not SPC-specific: an UPDATE that RLS filters out
affects zero rows and returns NO error.** `setSpcStatus` was a bare update
that only threw on a returned error, so the sequence was toggle reports
success, `load()` refetches, switch springs quietly back. Look away for that
second and it reads as if it took. Both `setSpcStatus` and `updateSpcClient`
now ask for the touched row back (`.select("user_id")`) and throw when none
comes; every call site already toasted on a throw. **Any bare
`.update().eq()` in this codebase has the same shape** and is worth the same
guard wherever a silent no-op would be mistaken for a save. The USING-clause
half of this is already noted under the 0094 work; this is what it looks like
from the app side.

Proving it cost nothing and is worth repeating: run the shipped function
against the live API with the **anon** key. RLS filters the row out, so it
exercises the exact zero-row path and cannot mutate anything.

**The off switch moved onto the SPC client page**, which partly reverses the
phase-3 note above ("turning SPC off entirely is the switch on her client
page"). That page was unreachable for the case that matters: test2 is a
*coach*, `listMembers()` filters to `role = 'member'`, so a coach's client
detail page is only reachable through Settings, Team, "Own training". The SPC
page is where the client actually lives, so it now carries a **Turn SPC off**
action, and the off state carries **Turn SPC back on** rather than pointing
elsewhere. `SPC_ENROLLMENT_LABELS` is still active/paused only, deliberately:
those two are a choice you make *between*, off is a thing you *do*, and a
select that archives the moment it changes gives no beat to change your mind.
`confirmTurnSpcOff` is the confirm.

Known and left alone: with SPC off the header pill still reads **Paused**,
because `deriveSpcState` maps `inactive` onto the paused shape so an off
client cannot shout "Due now" (0108). Only visible in the moment right after
switching off, since an inactive client drops off the SPC roster and the page
is then reachable only by direct link.

**Verification gotcha worth not rediscovering: never dispatch a bare
`TouchEvent` at react-native-web.** `new TouchEvent("touchstart",
{bubbles:true})` carries no `touches`, and RNW's responder system reads
`touch.force`, so it throws "Cannot read properties of undefined (reading
'force')" into LogBox and looks exactly like an app bug. Mouse/pointer events
alone are enough to drive a `Pressable`.

## Coach Prep: reading a block before it goes out (2026-08-22/23)

Coaches were meeting a new block for the first time on the gym floor. Two
surfaces: a **Coach ed** tab in the group session builder's right rail where
the notes are written, and a new **Coach Prep** coach tab where they're read
(program -> block -> session tabs -> the session overview and its education
in one column). Group only, by decision. Phone-first, because that's where a
coach reads it.

**Notes are keyed to (block, session_number), NOT to a `group_workouts` row**
(`programming.session_education`, migration 0079). You explain a block's lifts
once, so a note written on Session 1 shows for Session 1 every week of that
block; keying it to a workout would mean retyping the same coaching point six
times and a coach reading week 3 would see nothing. `exercise_id` is a
**pointer, not ownership** — the note isn't a property of the library exercise
— and it's `ON DELETE SET NULL` so archiving an exercise can never silently
bin something a coach typed. Staff-only RLS in every direction, no member
policy at all, same reasoning as `client_limitations` (0057).

**`scope` (0080) is only consulted when `exercise_id` is null.** 0079 encoded
"general" as a null exercise, which was unambiguous while there was one kind
of general; adding "the whole warm-up" made two. The rail writes `scope` back
to `'session'` whenever a specific exercise is picked, so clearing the
dropdown afterwards can't resurface a stale general. The constraint allows
`'exercises'` even though nothing offers it — Terra's call was that "the main
session in general" and "the whole session" are the same note, so adding it
later is UI-only.

**The dropdown reads in programmed order, not alphabetically**: `Whole
session` / `Warm-ups` (with "General — the whole warm-up" first inside that
group) / `Exercises`, sorted `(week, position, id)` and deduped on first
appearance — the earliest week's running order with anything introduced later
in the block appended. **The `id` tiebreak is load-bearing**: warm-up
positions genuinely collided before `nextPosition()` landed (600f0d3), and a
tie left to Postgres comes back in whatever order it feels like, which would
reshuffle the dropdown between loads. A warm-up saved as free text with no
exercise row can't be referenced at all — there's nothing to point at.

**Coach Prep shows one representative week** (earliest with lifts) and names
it on screen — the lifts belong to the session, the sets and reps belong to
one week. Drafts are drawn with a DRAFT chip, which is the whole point.
Session tabs come from what's in the block, not the program's current
`sessions_per_week`, since an older block carries the count it was built with.
`components/coach/SessionPrepView.js` is split out of the route specifically
so it can be rendered against fixed data in a harness.

**The builder rail is resizable** (`components/builder/RailResizer.js`,
web-only, raw `<div>`): 7px handle in place of the old border, drag,
double-click to reset, width in `localStorage`. **It clamps against the width
of the row it lives in, not the viewport** — the exercise library sits to the
left, so clamping on `window.innerWidth` let the rail reach 620px and squeezed
the session column to 365px, well under the 520px floor it claimed to
guarantee. Worth generalising: **clamp a resizable pane against its actual
container, and treat a measured width of 0 as "not laid out yet", never as
"unlimited room"**.

Files: `app/(coach)/prep/`, `components/builder/CoachEducationRail.js`,
`components/builder/RailResizer.js`, `components/coach/SessionPrepView.js`,
`lib/programming/sessionEducation.js`, plus block-wide reads appended to
`lib/programming/workouts.js`. **Not click-tested behind a real login** —
standing limitation; the path most worth a real pass is writing a general
warm-up note and confirming it lands on Prep.

## Builder tweak batch: one labeling language, warm-up supersets, template supersets, tempo-delete fix, picker "+ New", compact reps (2026-08-23/24)

A batch of direct asks about the web builders, all built and driven through a
throwaway harness (screenshots + real clicks). **Migration
`0085_warmup_and_template_supersets.sql` — run and verified live** (all 8 new
columns confirmed, `NOTIFY pgrst` sent): `superset_group_id` on all four
warm-up tables plus `template_exercises`/`one_off_exercises`, and `rep_scheme`
on `one_off_exercises` (0030 never gave one-offs either column, so a
template's per-set reps were silently flattened on assignment — fixed in
`createOneOffFromTemplate`, which now carries both, and warm-up copies in
`copyWorkoutContent`/`copySpcWorkoutContent` carry the warm-up pairing too).

- **One labeling language** (new `lib/programming/sessionLabels.js`, pure —
  no dnd-kit, safe for the member bundle): lifts are lettered, a superset
  consumes one letter and numbers its members (A, B1+B2, C); warm-ups are
  numbered with superset members REPEATING the shared number (3,4,5
  supersetted all read "3"), numbering continuing after the group. Applied to
  the builders (`SortableLift`'s circle shows the label; the old "SS A" pill
  and `SessionBuilderParts`' own `supersetLettersFor` are gone — the hub and
  `SpcSessionReadout` keep their separate copy in `spcBlockDetail.js`,
  deliberately untouched since that's the parallel live-SPC session's
  territory), the printed SPC sheet (`labelExercises` now wraps the shared
  helper; warm-up rows number with repeats and blank rows continue the
  sequence; `weekSignature` includes warm-up grouping so a mid-block re-pair
  splits pages), and the member app (`SessionLogger`'s numberLabel,
  `SessionSheetParts.buildGroups` — both were number+a/b before).
- **Warm-up grid is column-major** (1,2,3 down the left / 4,5,6 down the
  right — two real column Views, since flex-wrap order is row-major), sets/
  reps are real boxed inputs (the borderless ones read as static text,
  reported twice), and every cell but the first gets a **link toggle**
  ("superset with the previous warm-up") — chains of 3+ allowed, unlike lift
  pairs. Unlinking a member whose group would be left solo clears that one
  too; unlinking the middle of a 3-chain leaves the outer two paired
  (first-occurrence numbering keeps that consistent, verified).
- **Templates get supersets** — reverses 0030's deliberate exclusion per
  direct confirmation. `showSuperset={false}` removed, toggle wired via
  `updateTemplateExercise`, warm-up links via re-added
  `updateTemplateWarmup`. Tempo stays off templates (no column).
- **Tempo is deletable now** — the real bug: `TempoDigits` derived its boxes
  from the prop each render, so clearing a box zero-filled the saved value
  and the echo popped "0" straight back; all four boxes could never be blank
  at once, which was the only path to null. Now local state with an
  echo-guard reseed; emptying all four writes null (verified: change stream
  ends `tempo: null`, boxes stay blank). Partial clears still zero-fill the
  stored value.
- **Picker "+ New"** — `ExercisePickerModal` takes `onCreateNew(searchText)`;
  all three builders pass it gated on `role === "admin" ||
  can_view_exercise_library`. Opens `ExerciseFormModal` (new `initialName` —
  prefilled from the picker's search — and `submitLabel` "Save & insert");
  on save the exercise lands in the library AND the session in one go,
  routed by the TYPE actually saved (flipping the form to Warm-up mid-create
  inserts as a warm-up, not into the main session).
- **Reps entry defaults compact** — `SetTable` shows a Sets stepper × one
  Reps field + quick-pick chips (6-8 / 8-10 / 10-12 / 10-15, writing the
  range to every set — rep_scheme is text-per-set so ranges store fine)
  behind "Vary reps by set ⌄"; a lift whose sets already differ opens
  straight into the per-set table, and the collapse link only shows once
  they're uniform again (collapsing non-uniform sets would discard the
  variation).

**Not touched, deliberately**: the hub board and `SpcSessionReadout` (their
letter helper still letters only superset pairs), the native builders, and
`SessionPreviewModal`/`SessionDetailModal`'s plain comma-joined warm-up
lists. **Verified**: migration dry-run then applied live; clean `expo export`
×2; Babel parse/scope pass over all 15 touched files; harness-driven at
1280px — warm-up chain link/unlink with live numbering, tempo clear-to-null,
chips, compact↔per-set, picker + New carrying the search text. **Not
verified behind a real login** — standing limitation; worth a click-through
of a real superset warm-up showing on a member's phone and the printed sheet.

## Staff documents: SOPs and agreements, signed in-app (2026-08-25)

Coaches read and sign SOPs and employment agreements in the app. Migrations
`0092` (tables) and `0093` (rich text), both applied and verified live.

**Assignment is MANUAL, not derived from a coach's permission flags.** The
original ask was type-driven — "mark a coach as nutrition and the nutrition
SOP pops up for them" — but the only staff-type concept this app has is the
four `can_view_*` / `can_log_ops_hours` toggles (0015/0036), and those are
capability switches, not job titles. Tying "who signs what" to "what screens
you can see" would come apart the first time someone needs one without the
other. Terra's call: one admin page that assigns each document to specific
people. That also covers the individualized case (an agreement carrying one
person's rate) for free, which a type rule never could.

**Two version counters, and the difference between them is the whole design.**
`version` bumps on EVERY save, so each snapshot in `document_versions` is
distinct and a signature can point at the exact text agreed to.
`signature_required_since` only moves when the admin ticks "ask everyone to
sign again". A signature counts iff `signed_version >= signature_required_since`
— so a typo fix leaves everyone signed, a policy change re-pends it, and
neither writes over anyone's signature row. `isSignatureCurrent` /
`isPendingFor` in `lib/programming/documents.js` are the single definition of
both, and the badge count deliberately routes through the same
`getMyDocuments()` the list uses rather than a leaner count query — two
implementations of "pending" would eventually disagree and leave a badge
pointing at an empty list.

**Completed is built from SIGNATURES, never from assignments.** That asymmetry
is what makes "it stays there even if that type is turned off" true:
unassigning someone leaves their signature untouched, so the document keeps
showing under Completed with no assignment behind it. Archiving works the same
way — it pulls a retired SOP out of everyone's Pending without erasing it from
the Completed list of anyone who signed. Deleting is only offered while nothing
has been signed, since the FKs would happily cascade the record away.

**Signing** is a typed name plus a ticked attestation (`ATTESTATION` is
exported from `app/(coach)/documents/[documentId].js` so the wording can't
drift from what gets quoted). `typed_name` is stored as free text rather than
copied from `core.users.name` — the record should say what the person actually
wrote, and a profile name can change afterwards. Admin can delete a signature;
a coach has no update or delete policy on their own.

**Nav**: Documents sits in `CoachShell`'s **Coach** group, ungated (what a
coach sees is decided entirely by what's assigned to them). `NavRow` and
`GroupHeader` gained badges — the group header carries its children's total
**only while collapsed**, since expanded the row shows the same number a few
pixels below and repeating it reads as two separate things. At phone width the
whole nav is behind the hamburger, so that gets a dot instead.

### Rich text — read formatting from the STYLE, not the tag name

`lib/richText.js` is a pure-JS tokenizer (no DOM) shared by web and native, so
the two can't drift on what a document says. Sanitized on the way in and again
on the way out. It shipped broken twice before it was right, and each failure
is worth knowing:

- **Google Docs writes bold as `<span style="font-weight:700">`, never `<b>`**
  — and underline as `text-decoration:underline`, italic as `font-style`. The
  first version read formatting from tag names and stripped spans, so a Docs
  paste lost essentially everything. Formatting is now read from the inline
  style first and the tag name second.
- **The style has to be able to say NO.** A Docs paste wraps its entire body in
  `<b style="font-weight:normal">`. Trusting the tag there turns the whole
  document bold.
- **Docs nests a `<p>` inside every `<li>`.** That paragraph was starting its
  own block in `parseRichBlocks` and stealing the bullet's text, leaving an
  empty `<li>` that got filtered out — the bullets vanished entirely on native.
  Same treatment as a table cell now: inside a list item or a cell, a block tag
  is just line structure.
- **A Google SHEETS copy is a `<table>`** (and Docs embeds them), so tables are
  whitelisted, with `colspan`/`rowspan` the only attributes kept besides `href`
  — dropping them silently reshapes the grid. Each table is wrapped in its own
  `overflow-x` container on web so a wide sheet scrolls sideways on a phone
  instead of stretching the page; native renders it in a horizontal ScrollView.
- **`<meta>` in `DROP_CONTENT` ate an entire document.** The "skip ahead to the
  closing tag" branch ran to the end of the string for a void element, and a
  Google Docs paste opens with `<meta charset>`. Only tags that genuinely have
  a closing partner belong in that set.
- **A tag name must start with a letter**, or prose like `5 < 6 and a > b`
  parses "6" as a tag and everything up to the next `>` disappears.

**Two CSS facts, both found by measuring computed styles rather than reading
the stylesheet**: this app's base reset sets `list-style-type: none`, so
bullets need an explicit type or they render as bare indented text; and
Montserrat is loaded as a separate font FILE per weight, so `font-weight: 700`
alone renders at regular weight — bold needs the family naming the bold file.
Both apply to any raw HTML rendered into this app, not just documents.

**Editing is web-only.** `RichTextEditor.web.js` is a contenteditable div,
deliberately UNCONTROLLED — writing sanitized HTML back on every keystroke
sends the caret to the end of the document. `resetKey` re-seeds it (pass the
document id and version, never the value). Toolbar buttons use `onMouseDown`
with `preventDefault`, not `onPress`: a click steals focus from the editable
area first and collapses the selection the command is meant to act on.
`document.execCommand` is formally deprecated and still the only thing every
browser implements for this; the alternative is a Selection/Range
implementation of bold-a-partial-word. The native sibling is a **read-only
preview on purpose** — a plain TextInput would silently flatten a formatted
document's bullets the moment it saved, which is the bug the feature exists to
fix. `manage/[documentId].js` also tracks `bodyFormat` in state rather than
hardcoding `"html"` on save, so a title-only edit on native can't relabel an
untouched plain-text body as HTML.

**Not supported**: images.

**Verification**: 50 sanitizer tests across Word, Google Docs, Google Sheets
and hostile input (script tags, `onclick`, `javascript:` hrefs, malformed
markup); the RLS impersonation test above; a real Docs-shaped clipboard payload
driven in a browser through a throwaway `app/zz-harness.js` — paste, toolbar
bold on a live selection, and typing mid-document to confirm the caret holds.
**Not click-tested behind a real login** — standing limitation.

**Worth remembering from this one: a test can encode the bug.** The first pass
had a Google Docs case that PASSED while asserting the broken output — bold and
underline stripped, the whole document wrapped in `<b>`. Every suite was green
and the feature was visibly wrong. When a user says "still not right" and the
tests are passing, suspect the expectation before suspecting the report.

## Exercise library: everyone adds, reviewers approve (2026-08-27)

Gating creation on `can_view_exercise_library` (0015) meant a coach without
it had to interrupt a reviewer mid-session just to program a lift that
wasn't listed yet. **The flag stops meaning "may touch the library" and
starts meaning "reviews what everyone else added."** Creation is open to
all staff; the new entry is usable the same minute.

**Nothing about a member's view changes**, and that's the load-bearing
point: member RLS on every exercise embed keys on `is_active`, not on
review state, so a pending entry is already live in whatever session it
was built into. Approving is about the library's own consistency, not
about releasing anything.

**Migration `0094` — run.** `approved_at`/`approved_by` on
`programming.exercises`; null = waiting. A timestamp rather than a status
enum (two states, and "when was this signed off" is worth keeping either
way). All 155 existing rows are backfilled to their `created_at` so the
queue opens **empty** rather than with the entire library in it —
`approved_by` is deliberately left null on those, since writing a name
there would claim a review that never happened. A reviewer's own create
skips the queue (`approved: isLibraryReviewer(profile)`, passed at all
five `createExercise` call sites).

**The rules live in RLS, not the UI**, and both had to be expressed as
conditions on the *resulting row* — RLS cannot restrict which columns a
write touches, which is the same constraint behind
`core.update_own_notification_prefs` and `finalize_own_period`:
- insert = any staff, **but** `approved_at is null or can_access_exercise_library()`,
  or a non-reviewer could insert a pre-approved row and never appear in the queue;
- update = a reviewer for anything, **or** your own entry while it is still
  pending. The `approved_at is null` in the WITH CHECK is what stops that
  edit from being the thing that approves it.

Worth knowing about the two failure modes, they differ: a WITH CHECK
violation raises `42501`, while a USING-clause miss silently affects **0
rows**. Both were asserted.

**Editing in the queue does NOT approve.** Tidying and signing off are two
decisions, so the card stays put with its new values showing. Archiving is
the reject path and warns when the entry is already programmed somewhere
(archiving blanks its name out of a live session — the existing
`confirmArchiveExercise` note).

Surfaces: `app/(coach)/exercises/review.js` (universal file — cards, no
wide table, so no `.web.js` split needed), a `Library Review` sidebar row
+ native More row with a count badge, a `Needs review` chip and pill on
both library screens, a banner into the queue, and a line in
`ExerciseFormModal` telling a non-reviewer up front that their entry gets
reviewed — otherwise "needs review" appearing on it later reads as having
done something wrong. Team settings relabels the checkbox to **Library
Reviewer**; the column name is unchanged.

**Left alone deliberately**: `launchpad.js`'s `programsSessions()` and
`CoachHomeDesktop`'s `nutritionOnly` still infer "does programming" from
`can_view_spc || can_view_exercise_library`. There is still no
`can_view_programs` flag, and a reviewer is by definition deep enough in
the programming to be trusted curating it — so the inference survives the
rename. Comments updated at both sites.

### A warm-up and a lift can never merge

Both suggestions the detector produced against the real 155-entry library
were exactly this — `"Glute Bridge"` the warm-up vs the lift, and a
Lat Pulldown pair. Merging either folds one's history into the wrong half
of every builder's picker, which filters strictly on type. Now refused in
three places: `findDuplicateCandidates` skips cross-type pairs (2
suggestions before, **0** after), the manual "merge any two" typeahead
disables its button with an explanation, and `mergeExercises` reads both
types **back from the database** and throws — that last one matters
because the typeahead can name any two entries, so the suggestion list was
never the only way in. Every row that can show both kinds now carries a
`components/ExerciseTypePill.js` label.

### Sidebar active-row resolution is longest-match now

`/exercises` is a prefix of `/exercises/review`, so a per-row
`isActive()` check lit up **both**. `CoachShell`'s `NavList` now resolves
one winner across every visible row (`activeKeyFor`, longest stripped href
wins) instead of asking each row independently — fixed centrally so the
next route nested under an existing one can't reintroduce it.

**Verified**: migration dry-run then applied; 9 RLS assertions as a real
non-reviewer and a real reviewer in a rolled-back transaction; the
detector re-run against real library data; `mergeExercises` driven against
a stub client (cross-type refused with **zero** writes attempted, so a
partial merge is impossible); queue cards, merge rows and all three
sidebar states screenshotted through a throwaway `app/zz-harness.js`;
clean `expo export` + `check:routes` + a Babel scope pass over all 20
touched files. **Not verified behind a real login** — standing limitation.

## A parent is its own record now (2026-08-27)

Reported as three separate irritations, all one root cause: **"parent" was
never a thing.** It was `exercises.parent_exercise_id` — any exercise that
happened to have something pointing at it. So the "Variation of" picker had
to offer all 135 parent-less exercises (any one of them *could* become a
parent), and in the builder sidebar a parent row was a full-width
click-to-insert target with a 16px chevron beside it, so aiming for "show me
what's under this" regularly dropped the parent into the session instead.

Migration `0095` gives parents their own table. **A parent has no row in
`programming.exercises` at all**, so it cannot be programmed, logged,
picked, merged or counted in a PR — structural, not a filter a future query
can forget. That is the whole reason for a separate table rather than an
`is_group` flag on `exercises`: with a flag, all ~15 consumers
(`listExercises`, three builder sidebars, both pickers, merge, duplicate
detection, PR stats, member history) would each have to remember to exclude
it, and missing one puts a group in a member's history.

**The data is what forced the migration's shape — check it before assuming
a parent is just a header.** 15 of the 20 live parents are themselves
programmed into real sessions: Landmine Press carries 551 logged sets, Lat
Pulldown 164 across 30 sessions, RDL/OH Press/Bicep Curl/Bench Press are all
in current programs. So every **lift** head is migrated INTO its own parent
alongside its variations — the "Lat Pulldown" parent holds the Lat Pulldown
lift plus its two variations. The exercise id never changes, so sessions,
logs and PRs are untouched. Result: 18 parents, 66 exercises grouped, zero
variations orphaned.

Three real data problems the old model allowed, all resolved by the backfill
(and none of them reachable again):
- **A warm-up was parenting two lifts.** The warm-up "Glute Bridge" headed
  two real lifts. The form's picker filtered warm-ups out, so this predates
  that filter or came in via a merge. Only lift heads join a parent, so it
  keeps its variations without being a member of the group itself.
- **Two parents both named "Glute Bridge"** (the lift and that warm-up) —
  folded into one record by a `unique (lower(btrim(name)))` index, which is
  now what stops it recurring.
- **`RDL `** had a trailing space; trimmed on the way in.

Skipped deliberately: "Front Rack/Goblet Squat", whose only child is an
archived duplicate Squat. It is itself a variation of Squat and belongs
inside that parent, not heading one — so the backfill requires at least one
**active** child before creating a parent record.

**What changed in the app:**
- `lib/programming/exerciseParents.js` (new) — CRUD plus `setExerciseParent`.
  Deleting a parent is non-destructive by construction (`ON DELETE SET NULL`),
  which is why it needs no usage check the way archiving an exercise does.
- `groupExercisesByParent` → **`groupLibraryByParent(exercises, parents)`**,
  which returns one sorted list of entries mixing parents and unparented
  lifts. Each entry carries resolved tags, because bucketing a *parent*
  needs an answer too: its own tags win, and an untagged parent falls back to
  the union of its members' — so it can never drop out of every bucket. An
  exercise whose `parent_id` isn't in the passed list renders at the top
  level rather than vanishing.
- **Sidebar**: a parent is a terracotta header row with a leading chevron
  that *only* expands. There is no longer a small chevron to aim for beside a
  large insert target; everything clickable-to-insert is a leaf.
  `ExerciseLibrarySidebar` fetches parents itself, keyed on `library` — the
  three builders already replace that array when a new exercise is created,
  which is exactly when a "+ New parent" needs to appear, so no builder
  needed touching.
- **`ExerciseFormModal`**: "Variation of" → **"Parent"**, listing ~18 records
  instead of 135 exercises, with **"+ New parent"** inline. Inline because
  the moment you need one is the moment you're adding the variation —
  sending someone to another screen is how a variation gets saved unparented
  and never fixed. The modal self-fetches parents rather than being threaded
  through all six call sites. **This is also what makes the short list
  coherent**: filtering the old picker to "exercises that already have
  variations" would have meant an existing plain exercise could never become
  a parent without creating a duplicate of itself.
- **`app/(coach)/exercises/parents.js`** (new) — a "Manage parents →"
  doorway on the library page beside Merge, deliberately *not* a block on the
  review queue: that queue is a list that empties out, and a permanent
  management list under it stops "nothing waiting" being true at a glance.
  Reviewer-only, matching the RLS split (any coach can add a parent, only a
  reviewer renames or removes one). Inline rename guards the Enter-then-blur
  double-fire with a ref, not state — both handlers run before a `setState`
  applies.
- **`mergeExercises`**: the "move the retired entry's children across" step
  is gone (nothing hangs off an exercise now). Replaced with carrying the
  retired entry's `parent_id` onto the survivor **only when the survivor has
  none** — an existing grouping is a deliberate choice. Its `select` needed
  `parent_id` adding; without that the new code would have silently never
  fired, exactly the class this file already warns about.

`exercises.parent_exercise_id` is left populated and unread as the rollback
path, with a SQL `COMMENT` saying so. Nothing in the app reads it — verified
by grep.

**Verified**: migration dry-run in a rolled-back transaction before applying;
11 RLS assertions as a reviewer, a non-reviewer coach and a member (all
rolled back, confirmed no leftovers); `npm run build` + `check:routes` clean;
a Babel parse **and unresolved-identifier** pass over every touched file; and
the sidebar, the parent field and the manage card driven for real through a
throwaway `app/zz-harness.js` — clicking a parent expands it and inserts
**nothing**, a member still inserts, and a rename fires exactly once on
Enter. **Not verified**: any of it behind a real login (standing limitation),
or on native.

**Open, worth Terra's eye**: there is still an active "Glute Bridge" lift
with no variations sitting *outside* the "Glute Bridge" parent. Adopting it
by name match would have been guessing, so it was left alone — one click on
the manage screen or its own entry fixes it.

## A shared editor sent columns three of its five tables don't have (2026-09-08)

Reported on Ashley Mullet: add a question to her onboarding questionnaire
(fine), go out, come back, edit it, Save — *"could not find the booking column
option on the client questionaire."* Reproduced verbatim against the live API:
`PGRST204 Could not find the 'booking_option' column of
'client_questionnaire_questions' in the schema cache`. No migration; this is a
client-side fix.

**`QuestionListEditor` is shared by five question lists across three schemas,
and its `saveEdit` always sent all four keys** — `question_text`,
`question_type`, `options`, `booking_option` — whatever `choicesEnabled` said.
Its own header comment claimed callers not opting in "still receive an
equivalent object (just `{question_text}`)"; that was never true of the code.
Every handler passes the object straight into an `.update()`, and **PostgREST
rejects the whole write if the body names a column the table doesn't have,
regardless of the value** — `booking_option: null` fails exactly as a real
value would. Confirmed live against each table:

| editor | table | had | broken |
|---|---|---|---|
| check-in template | `public.checkin_template_questions` | all three (0042) | no |
| per-client check-in | `public.client_checkin_questions` | all three (0042) | no |
| questionnaire template | `public.questionnaire_template_questions` | none | **yes** |
| per-client questionnaire | `public.client_questionnaire_questions` | none | **yes** — Ashley's |
| event questions | `programming.event_questions` | type + options (0061) | **yes**, on `booking_option` |

So two surfaces nobody had reported were broken too: the questionnaire template
in Settings → Nutrition, and editing an event's extra questions.

**The fix splits one flag into two, because the two columns have different
reach**: `choicesEnabled` now gates `question_type` + `options`,
`bookingEnabled` gates `booking_option` alone. Events pass `choicesEnabled`
only — they have no booking column and no Zoom scheduler to trigger, so the
per-option radio and its "opens the Zoom scheduler" hint are gated on
`bookingEnabled` too and an event's options render as plain rows. The
questionnaires pass neither. **The flags are a statement about the target
table's columns, not only about which controls to show** — that is what the
comment now says, so the next caller added here has to answer the schema
question before it can render.

**Second latent bug found while testing the payload against the real tables**:
`options` was written as `null` for a non-choice question, but
`programming.event_questions.options` is `NOT NULL DEFAULT '[]'` (0061) where
the check-in tables' is nullable (0042) — so turning an event question back
from choice to text would have failed a not-null violation on a real row. It
writes `[]` now, which every reader already normalises to (`options || []`) and
which all three tables accept.

**Worth generalising: a component shared across tables must send the
intersection of what those tables have, and "it's null so it's harmless" is
wrong for PostgREST** — it validates column names when it builds the
statement, before values or RLS are considered. The failure is loud at runtime
and completely invisible to `npm run build` and a scope pass.

**Verification.** The exact error was reproduced and then cleared by curling
the live REST endpoint with the anon key against a nonexistent UUID (so zero
rows could change) — old payload `400 PGRST204`, new payload `204`, for both
`client_questionnaire_questions` and `event_questions`. Then the real component
was driven in a browser through a throwaway `app/zz-qharness.js` (deleted;
`git status` confirmed clean) in all three flag configurations, capturing what
`onUpdate` actually receives: questionnaire `{question_text}`, events
`+ question_type, options`, check-in `+ booking_option` — with the Zoom hint
present only on the check-in editor and the Multiple-choice toggle absent
entirely from the questionnaire. `npm run build` + `check:routes` clean, Babel
parse + unresolved-identifier pass clean over all five files. **Not verified
behind a real login** — standing limitation; worth Terra re-editing one of
Ashley's questions to confirm.

## Coaching tab icon: briefcase to clipboard (2026-09-21)

The staff-only "Coaching" tab in the member tab bar (`app/(member)/_layout.js`, `back-to-coaching`) used Ionicons `briefcase`; coaches did not like it, so it is now `clipboard` (outline when unfocused, filled when focused, same as every other tab). Other options considered: people, stopwatch (clashes with the rest timer), easel, swap-horizontal, return-up-back, grid.
