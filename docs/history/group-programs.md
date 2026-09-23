# History: group programs and blocks

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

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

## Push a trialed block to another program (2026-09-21)

**What it's for.** "Trial Group" is an ordinary group program with only coaches enrolled (dual-login, see coach-web.md). Coaches build a week there, run it on themselves in the gym and log it like any member, and once they're happy it becomes Group's next block. Before this, getting it across meant rebuilding or duplicating by hand. Terra's explicit calls: idea 1 of the options (trial stays its own program, with a push), **no overwriting**, fill the whole next block, coaches' trial logs are fine as real lifts, no trial notes panel, and definitely no "trial mode" inside the real program.

**How it works.** A **Push to…** button in the Group Programs header (web desktop, `app/(coach)/blocks/index.web.js`; shown **only on the trial program's tab**, per Terra: pushing only ever goes out of the trial and into another group type, never the other way. "Trial" is detected by name (`isTrialProgram`, `/trial/i`), since there's no flag column; renaming it hides the button, which fails safe. The lib refuses any other source, and the trial as a target, so it isn't only hidden in the UI) opens `components/PushBlockModal.js`. The rules live in `lib/programming/pushBlock.js`:
- **Source**: the selected program's blocks that have content, newest first (up to 4). An empty upcoming trial week isn't offered.
- **Target**: any other program with the **same sessions per week**. Others show greyed out with the reason; the lib throws too, before writing anything.
- **Where it lands, never overwriting**: a new block starting the Monday after the target's last block ends (or this Monday if nothing is running), length seeded from the target's last block. The one exception is a queued future block that is **entirely empty** (no lifts or warm-ups in any session): that one gets filled at its own dates and length, instead of a new block being stacked behind it. `planPush` works this out read-only so the dialog can show the dates, and `pushBlockToProgram` re-plans at write time in case something changed while the dialog was open.
- **Fill**: source weeks are laid in order and repeat when the target is longer. Trial blocks are one week, so that week fills all six, which is how Group is programmed anyway. Titles, warm-ups, lifts and coach education (`session_education`, keyed by session number, and skipped if the target block already has some) are copied. Inserts are bulk: one per table, not one per session.
- **Drafts by default**, with a "Publish now" option in the dialog.

**Real bug found on the way: every group copy dropped `tempo` and `rest`.** `copyWorkoutContent`'s inline column list predated those columns, so "Duplicate into…", "copy latest block" and Extend's copy-last-week all silently lost rest times. Live evidence: in the Group block of 8/24, week 1 has rest on all 16 lifts and weeks 2 to 6 have none (the member rest timer reads `rest`). The column lists are now shared `exerciseCopyFields`/`warmupCopyFields` helpers in `workouts.js`, used by both the old copy and the push. **Existing rows were not backfilled**; that's Terra's call.

**Verified**: `npm run build` clean; Babel parse, unresolved-identifier, unused-import and missing-named-export pass clean over all four touched files. The shipped `pushBlock.js` (plus the real `createBlock`) was run in Node via sucrase against an in-memory snapshot of the live `group_*` and `session_education` rows, with only `lib/supabase/client` swapped out: the 9/14 trial lands as Group 10/5 to 11/15 with 18 sessions matching the trial week exactly (rest included); 3x into 2x BWA is refused with no writes; existing Group blocks are untouched; a second push stacks at 11/16; publish works; an empty queued block gets filled with no extra block; and the 8/17 block's education note carries over. The dialog was rendered and driven on a throwaway `app/zz-harness.js` fed the same fake data (deleted afterwards). **Not driven**: the header button on the real signed-in page, and RLS on the real writes (coaches already create blocks and write `session_education` through these same tables).

## The trial bench replaces the week grid for the trial program (2026-09-22)

Follow-up to the push above, same day's thread. Terra's framing: the trial program is not a program that happens to be trialed, it is **the bench where coaches build the gym's next block**. It may run one week or three, they change it on the fly, and when it's ready it goes to a group. So "everything works the same (logging, block history) except the screen where they enter the program: no blocks, no set number of weeks, just the 1-3 sessions on the page."

**Migration 0134 — applied to the live project this session** (dry-run in a rolled-back transaction first, then `notify pgrst, 'reload schema'`, then confirmed `is_trial` parses through REST). Adds `group_programs.is_trial`, true for "Trial Group". `isTrialProgram()` reads the column and falls back to the old `/trial/i` name check **only** when the column is absent, which is the deploy-before-migration window. A "Trial bench" switch in the program settings modal turns it on or off.

**The model (`lib/programming/trial.js`).** Still an ordinary group block, because logging, `session_completions`, My Week and block history are all keyed to one. What makes it feel weekless is that the block is **rolling** (`auto_extend`): the nightly scan adds a week as the current one runs out, copying the last week forward with its published state, and the bench always edits **the week that covers today**. That is what lets a coach change a lift on Wednesday without rewriting what was logged last week: each week is its own rows.
- `getTrialState(program)` returns what's on the bench now, a trial queued for a later Monday (if they started the next one early), and the next Monday a trial could start.
- `startTrial()` creates a one-week rolling block and **publishes its sessions immediately** — the bench is coaches-only, a draft is invisible at the RLS layer, and what they build is what they walk out and lift. There is no finalize step here.
- `endTrial()` just stops the roll, so the block finishes out its week. A push does the same thing: **pushing closes the trial out**, nothing is deleted, and the trial stays in block history with everything logged against it.
- A new trial always starts on a **Monday** (the 0063 CHECK), so pushing mid-week means the next trial begins the following Monday. The bench says so rather than leaving it to be discovered.

**The screen (`components/coach/TrialWorkbench.js`)**, shown in place of the band + grid on the Group Programs page when the selected program is the trial. Session cards with their lifts (supersets share a left rule), "Build it"/"Edit" into the existing builder, and a banner that reads "Running since 09/14" / "Pushed already, so this one finishes 09/27" / "No trial on the bench" with "Start a trial". "+ New block" is hidden there; Push moved onto the bench.

**The push now sends ONE week**, the one on the bench, repeated across the target's weeks (`sourceWeekNumber`). Earlier weeks of a trial are the drafts they moved past, so shipping them would ship rejected work. The old multi-week cycling and the block picker are gone.

**Also fixed: the nightly roll flattened superset warm-ups.** `_shared/extendBlock.ts`'s `WARMUP_FIELDS` was missing `superset_group_id` (same class as the `tempo`/`rest` bug above, in the server-side copy). The deploy was blocked in-session (production deploys are refused there), so Terra ran `supabase functions deploy scan-spc-alerts` herself the same day; it is live.

**Live data change, at Terra's request:** the 9/14 trial (FALL HAUL / BOO-TY / BACK ATTACK) was rolled into the week of 9/21 and set rolling, so it is what's on the bench now. Done in SQL that mirrors `extendBlock.ts` exactly (week 2 copied from week 1 with `tempo`/`rest`/supersets, published), dry-run under `begin/rollback` first.

**Verified**: `npm run build` clean; parse + unresolved-identifier + unused-import + missing-export pass clean over all seven touched files. 24 checks of the shipped `trial.js`/`pushBlock.js` in Node against an in-memory snapshot of the live rows: the flag, the name fallback, a blank trial starting published and rolling, the bench reading the week that covers today (including after a roll), the push sending only the latest week, the trial stopping rolling and reporting its end date, the next Monday, and a queued next trial. The bench and the push dialog were rendered and driven on a throwaway `app/zz-harness.js` fed the same data, across all four states (running, closing, empty, queued-next) — deleted afterwards. **Not driven**: the real signed-in page and the real writes.
