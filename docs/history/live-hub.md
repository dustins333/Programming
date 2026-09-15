# History: SPC Live Hub (wall display, live sessions, board history)

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

## SPC Live Session Hub — gym-floor display + coach control (2026-08-20)

> **The UI in this section is superseded** by the 2026-08-22 design pass
> (`design_handoff_spc_hub_v1`, its own section below): `HubEntryPad.js` is
> deleted, both surfaces expand a lift in place with a docked keypad, and
> commit-on-Save became autosave. The data model, RLS, poll design and the
> setup flow described here are all still current.

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
pad *(done in the 2026-08-22 pass — it lives in the dock, not the pad)*,
coaching-note history on the member side, group-program (non-SPC) hub
support. Worth a real click-through: start a session from a phone, confirm
the TV picks it up ≤5s, a phone-logged set appears on the TV ≤3s, a TV pad
write shows on the member's phone, reorder/finalize/end round-trip, and a
coaching note written at the TV showing on the member's card next session.

## SPC Live Sessions: one screen, expand-then-pick, and a swipeable review deck (2026-08-28)

The hub had a real gap: after staging a session there was no way to *read*
what you'd staged, and the print-sheet block overview was wired into the
wrong step — it opened while PICKING clients, where it is far too heavy, and
was unreachable at review time, which is what it is for. Migration `0098` —
applied and verified live.

**The SPC hero is a doorway now, not a start button.** `SpcRosterMobile`'s
espresso block says **SPC Live Sessions** and leads to one screen carrying
both jobs. The separate "Stage a session for later" row is gone with the
whole staging state machine it drove (~6.3k chars: `StageTrayBar`,
`StageWhenSheet`, `StageTraySheet`, the `?staging=` param, seven handlers) —
that all lives on `app/(coach)/spc/live.js` now. Tapping a roster client
still opens the block overview; that was only ever wrong as a *picker*.

**The left segment is always "the thing you have", and only offers to BUILD
one while you have none:**

| | left | right |
|---|---|---|
| nothing staged, nothing running | Stage a session | Start now |
| something staged | Staged sessions | Start now |
| board running | Block overview | Logging |

Each staged row opens its clients' block overviews — reading a staged group
before 5am is the most common thing done here, and in the first pass it was
reachable only once a session was already **live**, which is exactly backwards.
The left tab is keyed `"left"`/`"start"` internally rather than by label, or
staging your first group would silently drop the coach onto "Start now" as
the left segment changed identity underneath them.

Building ANOTHER group is a **circle beside the title** (`StageAnotherButton`
→ `stagingAside`), shown only when the left side isn't already the picker —
which is exactly when there would otherwise be no way in. It carries its own
words: an unlabelled `+` next to a title could mean add a client, a block or
a session. Taking it replaces the selector with a back link, worded for where
it returns to. The first pass put this as an inline link under the staged
card and it read as part of whatever section happened to sit above it.

While a board runs the staged list sits above the two live views, because
"start the 6am" shouldn't depend on which of them you left open; otherwise it
IS the left tab. `useStagedSessions()` was lifted out of `StagedSessionsCard`
for this — the screen needs the count before it can decide what its own
selector says.

**Picking is expand-then-choose.** `HubClientPickList` used to select on the
NAME and reveal sessions afterwards, only if there were more than one — so a
coach committed to a client before seeing what that committed her to, and a
one-session client never showed her session at all. Now: tap a name to
expand, tap a session to pick, checkbox lands on the row. One extra tap, and
it puts the whole decision on screen. Sessions are full-width rounded rows,
not a wrapping chip row — real titles run to "Alicia SPC: Pull Ups +
Athleticism" and cannot sit beside a sibling on a phone.

**The count circle is the new number** (`loggedCount`, 0098): how many weeks
of the CURRENT block that session has been logged. SPC clients do sessions
out of order and miss them, so "Session 1 (3) · Session 2 (1)" is the
sentence a coach is actually reading — it says which one is behind, which
`completed` (this week only) cannot. Counted over the block, not all time: a
count spanning three blocks only says who has been here longest. Distinct
`week_number`, so a duplicated completion row still counts once. Purely
additive to the RPC — every existing caller is untouched.

**The eye is `SessionSheet`, deliberately not the block overview.** New
`components/hub/HubSessionPreviewSheet.js` opens the member's own session
sheet (`state="future"`, nothing loggable) — literally "the same one you
would see when clicking a session on my week". The print-sheet overview
answers "how has this block gone week by week", which is a review question,
not a scanning one. Passed as an optional `onPreview` prop, so the **wall's**
picker doesn't get it: a sheet over a sheet on a touchscreen at 5am is a
trap, not a preview.

**Date/time is asked at SAVE time**, not before you can add anyone — the
docked bar opens `StageWhenSheet` (now parameterised with
`heading`/`ctaLabel`/`busyLabel`/`initial`) once the coach knows who is on
it. Saving finalizes in one action: there is no half-built state to come
back to, so leaving it a draft would only mean a group that quietly never
appears at 5am. New `syncStagedClients()` diffs the picker's whole selection
against what's stored rather than clearing and rewriting, so a client who was
already on the group **keeps her slot** — the board renders positions in
order and people stand at the racks in that order. It mirrors
`addStagedClient`'s lowest-free rule when recording what it just took, or two
additions in one save would both be handed the same position.

**`SpcSessionPreview` split into a page + two wrappers.**
`SpcSessionPreviewPage` is the old body with no Modal and no staging props;
`SpcSessionPreview` (unchanged API) is Modal + one page; **new
`SpcSessionDeck`** is Modal + a `pagingEnabled` horizontal ScrollView of
pages, one client per screen, with arrows, "2 of 4", and dots. Each page
loads its own client — four opens four reads, which is the cost of real
week-by-week history and is bounded at four. Used for both a staged
group and the running board, and in both cases each page is **pinned** to the
one session that client is actually on (`onlySessionNumber`) — the session
tabs are dropped and a plain "Session 2 — Upper | Georgie" line takes their
place, since the tabs would otherwise re-offer a choice that was made last
night. There is deliberately **no fallback** when the pinned session isn't in
the block's current week: falling through to the first session would quietly
show a different workout than the card promised, so the page says it isn't
published instead. A staged group also passes its own date, so one staged
across a Monday warns about the right week. The in-body draft warning now keys on that
`targetWeek` rather than on today's.

### The staging sheet: an analog clock, and a day strip

`TimeStepper` (a pair of +/- steppers) and the day `<select>` are both gone.
Getting from 12:00 to 5:00 was five jabs, and a 14-row dropdown was the worst
possible way to say "tomorrow".

**New `components/ClockTimePicker.js`** — a real clock face. Tap an hour, the
face turns into minutes, tap a quarter; the result fills `HH : MM` boxes
underneath and either box takes you back to that half of the face, so a wrong
hour costs one tap rather than a restart. **Minutes are quarters only**,
because every consumer of a staged time runs on a 15-minute cadence and
offering `:07` would be a promise nothing keeps — the other eight five-minute
ticks are still drawn, since a face with four marks on it doesn't read as a
clock.

Three implementation notes worth keeping:
- **No SVG.** react-native-svg's web build turns `onPress` on a child element
  into RN touch-responder props that aren't real DOM attributes (this app has
  already hit `Unknown event handler property 'onResponderTerminate'` that
  way), and a face is only circles and text. Positions come from one
  `pointAt(angleDeg, radius)` helper, so the hand and the labels cannot
  disagree about where a value lives.
- **The hand needs no transform-origin.** RN has no dependable one. It is a
  full-height column centred on the face whose bar occupies only the half
  above centre, so rotating the column turns the bar about the clock's centre
  and 0deg points at 12.
- **Every mode change goes through `goToMode()`**, which clears the pending
  face swap. Picking an hour waits `FACE_SWAP_MS` (220ms — long enough to
  watch the hour fill in and the hand swing to it, and deliberately short:
  450ms read as the picker hanging) before showing minutes, and without that
  cancellation a coach who tapped a digit box during the wait would be yanked
  onto the minute face a moment later. Verified: right after the tap the hour
  face is still up with the new hour already selected, later it is the minute
  face, and tapping the hour box in between leaves it on hours.

**New `DateStrip`** in `StagingTray` mirrors the member Weekly tab's day strip
— chevrons either side of seven chips — deliberately, because a coach already
reads that control on their own training tab. Forward-only from today with a
two-week horizon (what the dropdown offered), and it carries a written date
under it, since a day number alone can't say which month. Not extracted from
the member screen: that one's chips encode nutrition-log state (logged /
missed / future) that means nothing here, so this mirrors the pattern rather
than generalising a component into two unrelated data models.

**`StageWhenSheet`'s body is a ScrollView now, with the buttons outside it.**
The clock made the sheet tall enough that on a short phone its own `maxHeight`
would clip the bottom — which is where Save lives. Measured at 375x640: body
scrolls (449 visible / 523 content), and `Start staging` is not inside the
scroller and sits at 626 in a 640 viewport.

**Deleted with them**: `TimeStepper`, `Stepper`, `StepButton`, `WhenField`,
the quick-pick time presets, and `StageTrayBar`/`StageTraySheet` — the last
two had been dead since staging moved off the roster. `parseTime`/`buildTime`
moved to the picker.

### Three real react-native-web bugs, all found by measuring rather than looking

None were visible to a clean `expo export`, a clean scope pass, or a
screenshot.

- **A page inside a horizontal `pagingEnabled` ScrollView sizes to its own
  CONTENT unless you bound it, and then nothing inside it can scroll.**
  Measured on the real nesting: with the wrapper carrying only `width`, the
  page's vertical ScrollView came back `clientHeight === scrollHeight ===
  1460` — i.e. it had grown to fit everything and had nothing left to scroll
  — while the horizontal scroller's own `overflow-y: hidden` clipped whatever
  fell past the fold. Vertical scrolling was simply impossible on every deck
  page. Fixed with `height: "100%"` on **both** the page wrapper and the
  ScrollView's `contentContainerStyle` (the ScrollView's own `flex: 1` is what
  makes those percentages resolve): same structure then measures `363` vs
  `1460` and scrolls. **Rule: a child of a horizontal pager needs an explicit
  height, or its own scrollers are dead.**

- **A smooth programmatic scroll inside a `pagingEnabled` ScrollView is
  silently cancelled on web.** `pagingEnabled` compiles to `scroll-snap-type:
  x mandatory`, and RNW's `scrollTo({animated: true})` routes to
  `node.scroll({behavior:"smooth"})`. Measured directly on the real
  container: `behavior:"smooth"` → lands back at **0**; `behavior:"auto"` →
  lands exactly on **375**. The deck's arrows did nothing at all. Fixed with
  `animated: Platform.OS !== "web"` — native has no snap CSS and animates
  properly. **Rule: never pass `animated: true` to `scrollTo` on a
  paging-enabled ScrollView that runs on web.**
- **`onMomentumScrollEnd` never fires on react-native-web.** Confirmed in
  `node_modules/react-native-web/dist/exports/ScrollView/index.js`:
  `scrollResponderHandleMomentumScrollEnd` is only ever passed down as a prop
  to a `View`, and nothing on web emits it. A real swipe moved the pages and
  left the header naming the client you had just swiped away from. Use
  **`onScroll` + `scrollEventThrottle`** for pager index tracking — it fires
  on both platforms, and rounding flips the label at the halfway point, which
  is where a pager should change over.

**Verified**: migration dry-run in a rolled-back transaction and then applied,
with the RPC's real output read as a real coach (Terra's own row comes back
Session 1 (3) / Session 2 (1) — exactly the out-of-order signal it exists
for); `npm run build` + `check:routes` clean; a Babel parse, unresolved-
identifier AND unused-import pass over all 11 touched files; and the row,
selection, eye, arrows and swipe all driven for real at 375px through a
throwaway `app/zz-hubharness.js` (deleted; `git status` confirmed clean).
`HubClientRow` was extracted and exported for that harness — a real component
boundary, not a test seam. **Not verified behind a real login** — standing
limitation. Worth Terra's pass: stage a group end to end, reopen it with
Edit, and confirm the review deck's pages carry real blocks.


## A client added mid-board got no warm-ups (2026-09-02)

Two clients on the SPC board, one warm-up strip showing. Checked the data
first: Ashley Klink was on the board when it opened at 18:05:59, **Junyao
Chen was added 33 seconds later**, and Junyao has 5 warm-ups programmed. So
this was the fetch, not the programming.

`useHubBoard` fetched warm-ups **once per hub session, guarded on the session
id** — the comment said "warm-ups don't change mid-session", which is true and
is not the question. **Who is on the board does change**: a coach drops one
client into a free slot without restarting the session, so the session id
stays put, the guard blocks, and that client's strip is empty for the rest of
the board. The guard is now keyed on the **workout ids already fetched**, and
the result **merges** rather than replaces — this fetch only covers the new
slots, so replacing would blank everyone already on the board. Steady state
finds nothing missing and does nothing; a new session id resets the map so an
edited warm-up list is re-read.

**Worth generalising: "this data never changes" and "the set of rows I need
never grows" are different claims, and a cache guard has to be keyed on the
second.** Same shape as the phase-5 effect that looped by deriving "still
needed" from the state it wrote — both are a fetch guard asking the wrong
question.

**Second bug found in the same path, fixed with it.** `refreshSession` kept
object identity stable (so effects keyed on `hubSession` don't re-fire every
3s) by comparing `id` and `clients.LENGTH`. A coach swapping one client for
the next between two ticks of **another** device's poll leaves the count
unchanged — so that device held the old roster indefinitely, showing the
client who left and never the one who arrived, and `refreshBoard` kept reading
the departed client's workout. Compared on a real signature now
(`user_id:position:workoutId` per row). **A stability check on a collection
needs a signature, never a count.**

**Verified by driving the real hook**, not by reasoning: `getOpenHubSession` /
`fetchHubBoard` / `fetchHubWarmups` temporarily stubbed off a `globalThis`
fixture (backed up first, restored after, **md5-verified byte-identical**), a
throwaway `app/zz-hubwarm.js` rendering the hook's `warmups` and a call log as
JSON, then the roster stepped through five states in the browser: first load
fetches, mid-session add fetches **only** the new client and keeps the other,
ten seconds of steady polling adds no calls, a same-length swap updates the
roster and fetches the newcomer, and a new session id resets to one entry.

**Tooling note that cost a wrong "the poll loop died" conclusion**: the Browser
pane runs hidden, so its tab is backgrounded and **`setTimeout` throttles to
roughly once a minute** after a stretch of inactivity. A 3-second poll appears
to stop entirely and the DOM goes stale. Wait a full minute before concluding
a timer-driven loop is broken there — and note `javascript_tool` itself times
out at 45s, so the wait has to be split across two calls.

## LLYL goes on the live board (2026-08-30)

LLYL is four women (six enrolled, two testers) lifting the SAME program —
which is exactly why it was built as a group rather than four parallel SPC
clients, and why it will keep working that way as it grows. The ask was
narrow: put them on the gym-floor board. Their programming does not move.

**Opt-in per program**: `group_programs.hub_enabled`, default false, toggled
in the ⚙ program settings modal. A boolean, not a name test — this repo
already has a scar from `"Flagship"` hardcoded in the dashboard lookup.

**The timing mattered.** Until 0102/0105 landed the same day, SPC was also a
week grid and this would have been one shared code path. SPC is now
sessions-format, so **group revives 0104's WEEKLY arm**, which the cutover had
left with no users at all. The group arms are modelled on that arm, and the
SPC arms of `hub_startable_clients` are byte-identical to 0104's — verified by
diffing the extracted region against `pg_get_functiondef` output, which caught
two real hand-copy errors (`w.moved_from_week`, which does not exist, and a
missing `coalesce(w.scheduled_week, w.week_number)` from 0101). **Worth
reusing: when a migration says an arm is "byte-identical", pull the live
definition and actually diff it.**

**Three differences, each forced by the model** (all spelled out in 0106's
header):
1. Four clients share ONE `group_workouts` row. Everything per-client is keyed
   on `user_id`, so logging stays separate for free. What is shared is
   `position` — so **reorder is hidden for a group column** (the toggle stays,
   because dropping a client lives behind it; the icon becomes
   `person-remove-outline`), and `useHubBoard.moveLift` refuses as well.
2. **A group completion carries no week number** — 0040's check constraint
   requires it null, because the join row is already week-specific. SPC's
   sessions format went the opposite way and files under the calendar week.
   `sessionRefFor(entry)` in `lib/programming/hub.js` is the single place that
   decides; `hub_session_clients.week_number` is display-only for a group slot.
3. No ongoing programs, no lapsed fallback — both are sessions-format only
   (0103). **When a group block ends with nothing queued its members drop off
   the picker**, where a lapsed SPC run keeps running. LLYL's current block
   ends **2026-09-06**, so this will be seen within a week of shipping. Not a
   bug and deliberately not changed.

**Staging is deliberately excluded.** `hub_staged_clients` stores a session
NUMBER and resolves it against SPC at start time (0090/0091), so a group arm
would need a program reference on the staged row plus arms in
`hub_resolve_staged` and `hub_start_staged`. The picker takes
`allowPrograms` (default **true**, so the wall's own picker and add-mid-session
get segments without opting in) and staging passes `false`.

**The picker's segment**: SPC opens by default, one segment per `hub_enabled`
program present in the roster, built from the data. Selection moved from
`picked[userId]` to a composite `row.key` (`programKind:programId:userId`) —
someone who is both an SPC client and a group member is two rows with two
different sessions, and the old keying would have collided on the React key
and on the emitted slot. `SegmentedControl` gained a `dense` prop (trims
`mb-6` to `mb-2.5`; default unchanged).

**Real bug worth remembering: a policy ON a table cannot SELECT that table.**
The first display policy on `group_workouts` needed the board's block, which
meant reading `group_workouts` — infinite recursion, `42P17`, caught in the
RLS test rather than by review. Fixed with two security-definer predicates
(`hub_active_group_workout` / `hub_active_group_block`), the same pattern
`hub_active_client` exists for and 0096's header warns about from the other
direction. The block-wide one is what the lift-history strip needs; the
workout-scoped one gates exercises and warm-ups.

Display reads are **scoped to the block a board workout belongs to** —
tighter than the SPC equivalent, deliberately: the plain Group programme has
94 members, and a program-wide policy would open all of it to the wall the day
one of them lands on the board.

**Entry points**: a clay "Live session" pill on the Group Programs page — in
`CoachBlockOverview` (native + mobile web) and next to ⚙ settings on desktop —
rendered only when `hub_enabled`. It lands on `/(coach)/spc/live?program=<id>`,
which opens the Start now tab with that segment already selected. The address
stays `/spc/live` (Terra's call).

**`components/hub/HubSessionSetup.js` is dead** — nothing has imported it since
live.js grew its own `StagePicker` (2026-08-28). Kept in step with 0106 rather
than deleted, since deleting a working component is Terra's call.

**Verification**: 29 assertions against the live DB in rolled-back
transactions — the RPC's group arm against real LLYL rows, the `hub_enabled`
gate in both directions, `hub_group_workout_belongs_to` accepting a real
pairing and rejecting a non-member and a switched-off program, the display
reading the board workout and its whole block while blind to another program,
access evaporating when the board ends, a full write/read round trip on group
keys (log, tick, finalize, note — all four written exactly as the JS writes
them and read back with the queries `fetchHubBoard` runs), and both
constraints biting. The picker was driven in a browser through a throwaway
`app/zz-harness.js` with a stubbed roster (deleted; `lib/programming/hub.js`
restored and md5-verified byte-identical): segments render, filtering is
exact, a **mixed board** holds both kinds, and the emitted slot carries
`groupWorkoutId` with `spcWorkoutId` null. `npm run build` clean, Babel parse
+ unresolved-identifier + unused-import pass clean across the whole hub
surface.

**Not verified**: anything behind a real login, and nothing on the actual wall
display. Worth Terra's pass: turn LLYL on, start a board from the Group page
AND from the wall's own PIN picker, log a real set, and confirm the reorder
arrows are gone while dropping a client still works.

**Found while testing, worth knowing**: the LLYL girls already have real
`exercise_completions` and `logs` rows from the member app — the round-trip
test collided with them. So the board's read path will find real history from
day one, not an empty column.

## Live sessions get a front door, and a history you can write up later (2026-08-30)

Three asks in one pass, **no migration** — everything here already existed in
the schema and was simply never read back.

**The dashboard has a Live session strip.** `components/coach/LiveSessionStrip.js`
is one component rendered by both home screens so they can't drift, above the
Today band on mobile and above the resume card on desktop. It is live-state
aware because the two questions differ: with nothing running it is "get me to
the roster", with a board up it is "get me back to the one I am running" —
which is also how a coach finds out someone else already started one. Gated
on admin-or-`can_view_spc`, and `useOpenHubSession` swallows its own error, so
a coach RLS refuses never breaks the dashboard over one optional strip.

**It lands on `?tab=start`, not the screen's own default, and that is the
whole fix for "LLYL isn't there".** The complaint was real but it was never
the filter: `allowPrograms={mode === "start"}` — **staging is SPC-only and
always has been**, because a staged slot stores a session NUMBER resolved
against SPC on the morning it runs (0090/0091, and 0106's header says so).
Opening the screen cold lands on Stage, which is the one tab that cannot
offer a group program; arriving from Group Programs' "Live session" link
carries `?program=` and lands on Start now, which can. So it looked like the
tab appeared and disappeared depending on how you got in. Two changes: the
dashboard skips Stage entirely, and the Stage tab now **says** it is SPC-only
with a one-tap "Start an LLYL board now →" instead of leaving the absence to
be discovered. **An absent option reads as a bug; say why it is absent.**

**Past boards are reviewable and fully writable.** Ending a board only stamps
`hub_sessions.ended_at` — the row and its `hub_session_clients` snapshot stay,
and 0071's `staff manage hub_sessions` already let any SPC coach read them.
So this needed no schema at all, only:
- `fetchHubBoard(slots, dateOverride)` — the logs half was hardcoded to
  `todayInBoise()`, and a finished session's sets sit on the day it ran.
  Structure, completions and notes stay CURRENT state on purpose.
- `useHubBoard({ reviewSession })` — same hook, so sets/notes/ticks/finalize
  write exactly as they do live; it just stops polling for the open session
  and writes to the board's own date.
- `lib/programming/hubHistory.js` + `app/(coach)/spc/sessions/` (list +
  `[sessionId]`), reached from a third **History** segment on the live screen.
  **Originally idle-only, and that was wrong (fixed 2026-09-02).** Only one
  board can be open gym-wide (0071's partial unique index on `ended_at is
  null`), so the segment vanished the moment ANY coach started a board — a
  coach who ended her 7am and went to write it up was locked out because
  someone else had started the 8am, which is the normal shape of a morning
  here. It is now offered in both states, which is safe because it is a
  doorway rather than a pane: it navigates away instead of replacing the
  board. One `handleSegment` serves both states so it cannot be wired into one
  and silently missed in the other. Also linked as **Past boards** from the
  SPC roster (phone and desktop), so reaching it never depends on the live
  screen's own state.
  **Only clients who were ON the board appear** — the review screen builds its
  columns from the `hub_session_clients` snapshot. And the board is the only
  coach-side place a lift note can be written at all: the sole writers of
  `exercise_coaching_notes` are the hub and the member's own `SessionLogger`,
  so a client who trained without being added to a board has no note path. The detail screen renders the real `HubLiveSession` rather than a
  read-only lookalike — a second lift card is a second thing to keep in step.

Decisions taken with Terra: all coaches' boards with a "Just mine" filter (three
people run boards); sessions with **zero logged sets are hidden** (there are a
lot of four-second test boards in there); two days by default with "Show older"
paging back rather than a hard cutoff, since a window that loses last week is
worse than a list that scrolls; and a past board stays fully editable, because
finishing the write-up afterwards is the entire point.

**Real bug Terra caught on the first click-through, and it wasn't what it
looked like.** Sessions appeared with "16 sets logged", opened, and every card
was empty — she reasonably suspected the card's clear-on-focus behaviour. It
was the count: the first pass bucketed logs by (day, client) with no workout
in the key, so any set that client logged ANYWHERE that day counted toward
that board. Four of the six boards in the last two days had genuinely nothing
typed into them and were being let through on the strength of the client's
other training. Fixed by keying on (day, client, workout) — the count now
answers the same question the board itself will. **A "does this have data"
count and the screen it gates must read the same rows, or the gate is
decoration.** Verified in SQL against every board of the last nine days before
and after.

That diagnosis also surfaced something real about the boards themselves, worth
knowing rather than filed as a code note: those empty boards weren't idle
clients. C.J. logged 18 sets that day on SPC Session 1 while her board slot
pointed at a different workout, and Lindsey was put on a board three times as
an SPC slot while everything she logged was her GROUP session. The board and
the training diverged; nothing was typed into the board either time.

**The lift card's note field wraps now** (`HubLiftCard`) — it was a single-line
`TextInput` with a fixed 42px height, so a real rack-side note ran off the side
instead of wrapping. Now `multiline` at a **fixed** 72px (three lines) that
scrolls past that. Deliberately NOT auto-growing off `onContentSizeChange`: on
web that feeds back on itself, and this codebase has now been bitten by it
three separate times (CommentThread's NoteField, GamePlan, and ExerciseCard —
where it reached a real client as React #185 and a blank screen). Measured
after the change: box height stays 72 through a six-line note while
`scrollHeight` grows to 108, so there is no loop.

**Second report, and the more important one: "her data was there, then it was
gone."** Nothing was destroyed — checked the real rows first, and Rae's sets
were intact throughout. What she opened was the 08/27 board, which had TWO
clients on it: Victoria logged 18 sets, **Rae logged nothing**. The list row's
count is the SESSION total, so the row honestly said "18 sets" and then tapping
to Rae showed an empty column. Two fixes, because two different things were
misleading:

1. **Completions are now date-scoped in review mode too.** Rae trained the same
   session the *next* day (08/28) and her ticks are stamped 08/28 — but ticks
   were rendering as current state while sets were date-scoped, so the 08/27
   board showed a full column of checkmarks over empty boxes. That is what
   reads as "the data vanished". `completed_at` is never null on either
   completions table (verified live: 1043 + 238 rows, zero), so filtering
   can't hide a real completion. Live behaviour is unchanged — "a lift ticked
   yesterday is still ticked" is right on a running board and wrong on a
   finished one. Structure and notes deliberately stay current: a note added
   afterwards is the point of the screen.
2. **The review screen states per-client counts up front** ("Victoria 18 sets"
   / "Rae nothing logged") so an empty column is explained before she taps a
   name rather than after.

**Third report, and the one that needed a migration: back-to-back boards lost
people.** Terra's own hypothesis — Rae was pre-staged, didn't show, the coach
dropped her, and she lingered in history — turned out to be the *opposite* of
what was possible, and checking it is what found the real gap. The roster is
captured at **start** (`hub_start_session` / `hub_start_staged` write
`hub_session_clients`; staging keeps its own separate table), then mutated
live by add/remove, and never touched at end. And `hub_remove_client` did a
hard DELETE — so a dropped client left no trace at all. Rae appearing in
history was therefore proof she was on the board start to finish and simply
never logged; the real bug was the mirror image, and it bites the way coaches
actually work: one client finishes, she is dropped, the next is added into the
freed slot, and the woman who just trained for an hour disappears from that
board's record while her sets sit in `logs` attached to no board. Fixed by
0107 (above); the review screen now says "Victoria 9 sets · left 11:40 AM"
beside "Aishie 12 sets", so a swap reads as the sequence it was.

**Worth remembering as a shape**: a user's wrong theory can still be the thing
that finds the bug. Testing "does removal leave a trace?" answered her question
(no, so her theory was impossible) and simultaneously exposed a silent
data-completeness hole nobody had asked about.

**Generalisable**: when a screen reports on a past moment, every fact on it
has to be scoped to that moment or explicitly marked as current. Mixing the
two silently is worse than showing neither — a date-scoped number next to an
unscoped tick invents an event that never happened.

**The one fidelity limit, stated in the lib's header too**: `programming.logs`
carries no hub-session reference, so a past board shows "that client's sets for
that session on that day", not literally what was typed on that board. Two
boards on the same day with the same client on the same session would show
identical lifts. Same known join gap already documented for the day timeline;
fixing it properly means a session reference on `logs`, not a cleverer query.

**Real bug caught by looking rather than reasoning**: the review screen sat on
a spinner for a full ten seconds. `sessionRef.current` was assigned from state
during render, but in review mode the session arrives as a PROP via an effect —
so the poll effect's kickoff, running in that same commit, still saw `undefined`
and skipped the board fetch, leaving nothing until the first 10s tick. Fixed
with `sessionRef.current = reviewSession ?? hubSession`. **A ref fed only by
state is a tick behind a prop that arrives in the same commit** — worth
remembering for any hook that takes both.

Verified: `npm run build` + `check:routes` clean, a Babel parse /
unresolved-identifier / unused-import pass over all nine touched files, and the
strip (both states), the history list with its day grouping and coach filter,
the Stage banner switching tabs, `?tab=start`, and the review header all driven
at 390px through a throwaway `app/zz-harness.js` (deleted; the stubbed lib was
restored and md5-verified byte-identical). **Not verified behind a real login** —
standing limitation. Worth Terra's pass: open a real board she ran, confirm the
girls' lifts are there, and add a note to one.

### A finalized session stays editable in review (2026-09-06)

Terra opened a past board to add notes and found the finalized column washed
green with a "Make changes" button in the middle of it: the only way to write
one up was to undo the finalize and remember to put it back. Her words, and
they are the whole scope: *"shouldn't have to unfinalize to do so."*

**The lock was never about finalizing, it was about the wall.** A board anyone
walks past needs a done state readable from across the gym and safe from a
sleeve, which is what `HubFinalizedOverlay`'s own header says. Neither is true
of a board that finished this morning on a coach's phone, where finishing the
write-up is the only reason to open it at all. So review mode drops the wash
and keeps every other finalized marker — the olive bar, border and header tint
already render independently of it, and were carrying the state anyway.

The footer had to change with it: `Make changes` is a lie once nothing is
locked. It becomes a **`Finalized · still editable`** pill with undo demoted to
a quiet link, and `HubUndoFinalizeModal` gained an `editable` prop so the
dialog says the same thing. Without that, a coach who only wanted to leave a
note clears the mark for no reason. **A column that was never finalized keeps
its normal Finalize button** — reviewing a board where somebody forgot to tap
it is a real case.

**The flag is `useHubBoard`'s `reviewMode`, exposed for this and threaded
through `HubLiveSession`/`HubBoard` as `editableWhenFinalized` — NOT `scale`.**
The live coach phone is also `scale="phone"`, so keying off it would have
unlocked the running board too. The wall shares `HubClientColumn` with both.

**The collapse-on-finalize effect is deliberately unchanged**, and its comment
now says why it survives its own original reason. In review there is no wash to
strand an open card under, but collapsing is what cancels the 700ms debounce
and flushes a half-typed set. That also settles the one race Terra raised — a
client tapping Finalize on the board while a coach is mid-edit on her phone:
the poll's edit-freeze protects only `logsByExerciseId` for the lift being
typed into, so `finalized` comes through within ~3s, the effect fires, and the
pending sets AND note are written before the wash drops. Verified by reading
the merge in `refreshBoard`, not assumed. Nothing is lost; the card just shuts.

**Left alone by Terra's own call**: the live coach phone has the same friction
(finalize from your phone, then want to add a note). Her reasoning is that the
coach is standing at the board with the client, especially now the hub takes
the hardware keyboard sitting next to the touchscreen.

Verified at 375px through a throwaway `app/zz-hubreview.js` (deleted) against a
finalized column: expanding a lift works, typing a set fires `SAVE SETS` on the
debounce, collapsing fires `SAVE NOTE` with body and author, and toggling back
to live restores the wash with `elementFromPoint` over the lift returning
`FINALIZED`. `npm run build` + `check:routes` clean, scope pass clean. **Not
verified behind a real login** — standing limitation.

## The hub takes the keyboard next to the touchscreen (2026-08-31)

The gym floor screen has a real keyboard beside it and the girls use whichever
is closer, but only the note field accepted it — the set boxes are `PressFade`
tap targets driven by the docked keypad, not inputs. Now a hardware keyboard
types into the SAME active cell: digits and `.`, Backspace/Delete, Enter or Tab
for the dock's Next, and arrows to walk the grid. Touch is untouched and the
two compose (type 6 on the keyboard, tap 7 on the pad, the box reads 67).

**Deliberately a document-level listener (`lib/hubKeyboard.js`), not real
`<input>`s.** Focusing an input on the coach's phone pops the soft keyboard
over the card she is typing into, and a browser focus ring would be a second,
parallel idea of "which box is live" that could disagree with the active cell
already driving the dock's label. Web only; native is not wired up.

**Up to four columns can be expanded at once, so exactly one owns the
keyboard** — whichever was touched last. Each expanded column registers a
dispatcher and claims on expand, on every field tap, and on `+ Add set`. If the
owner collapses while one other column is still open, that one takes over
rather than the keys going nowhere. With nothing expanded, nothing is
`preventDefault`ed, so kiosk/browser shortcuts are unaffected. A keystroke
aimed at a real field (the note box, a search box) is left to that field via an
`activeElement` check.

**The real bug this pass found, and it is the file's own established
hazard:** `active` was read out of the render closure, so ArrowRight followed
by a digit inside one tick moved the caret and then typed into the box it had
just left — the arrows looked broken, and Tab-then-digit is genuinely reachable
with fast typing or key repeat. Fixed with an `activeRef` advanced by hand,
exactly the pattern `rowsRef`/`commitRows` already uses and for exactly the
same reason. `handleKey`/`handleNext` were switched to `rowsRef` in the same
pass — the touch keypad never exposed this because taps are slow.

**Verification note worth reusing: a fake `onSaveSets` will silently wipe what
you just typed.** The column's merge effect adopts the board's logs whenever
nothing is pending, so a harness whose save resolves without echoing the rows
back into `logsByExerciseId` looks exactly like "the keystroke didn't stick",
about 700ms later. It cost a round of wrong diagnosis; the harness has to
mimic the poll. Everything above was then driven for real at 1920x1080 through
a throwaway `app/zz-hubkbd.js` (deleted; `git status` confirmed clean) —
including the fast synchronous burst `1 2 Tab 1 3 5 Enter 1 0 Tab 9 5` landing
as 12/135 and 10/95. `npm run build` + `check:routes` clean, Babel parse and
unresolved-identifier pass clean. **Not verified behind a real login**, and not
on the wall display itself — worth Terra confirming on the actual board.

## The mobile pulse band, and "3 of 8" on the board (2026-09-02/03)

Two asks over two rounds, no migration, no deploy step — everything here is a
read over data that already exists.

### Four tiles, and every one of them opens its list

Coach mobile home's band is a 2x2 of **sessions today | sessions this week |
girls in this week | girls not in this week**. Volume and new PRs are gone:
both are outcomes of a day rather than a picture of one, and neither answers
what a coach standing on the floor is asking. The header dropped from "TODAY
IN THE GYM" to "IN THE GYM" so each figure can name its own window in its own
label.

**Two rules, deliberately, because the tiles answer two questions** (stated in
`gymWeek.js`'s header and in each sheet's own subtitle):

| | rule |
|---|---|
| Sessions | FINALIZED sessions. What "sessions logged" has always meant here. |
| Girls | anyone who was actually IN — finalized, or with real sets against a session she never finalized. |

The second rule exists entirely for the fourth tile. **"Girls not in this
week" is the one figure a coach acts on by picking up the phone, so a woman
who trained on Tuesday and forgot to tap Finalize must never appear on it.**
She lands on the "in this week" list instead, flagged "Trained, not finalized
yet", which is itself worth knowing. Seen + not-seen therefore equals the
training roster exactly.

**Finding her costs one narrow query.** The log check runs ONLY over roster
members with no completion this week — a short list of people who by
definition have few log rows. Running it over the whole roster would mean
pulling ~5,000 set rows onto a phone on every dashboard focus (measured: 2,063
rows by Wednesday of a live week, so a full week lands near
`listStartedSessionsSince`'s own 5,000 cap — worth knowing, since
`clientsRoster.js` already calls that path with a week window).

**The sheets render rows they are HANDED, never their own fetch.**
`getGymWeek` returns the counts and the four lists together, `getGymToday`
passes the whole payload through as `gym.week`, and `GymWeekModal` reads it.
A count and the list it opens have to be the same array — the board's own
"16 sets logged" row learned that the hard way. One `GymWeekModal` for all
four tiles, for the same reason: four near-identical modals is how two of
them end up disagreeing with the numbers above them.

Deliberate consequence: `gym.sessions` (which the desktop launchpad also
reads) is unchanged in meaning, but `SessionsTodayModal` — still used by
desktop — counts finalized AND started, so the desktop tile and its sheet can
still differ by a session. Mobile no longer uses it.

Also fixed in passing: `quietMemberCount` tested `status <> 'paused'`, so an
SPC client whose switch was turned off (0108's `inactive`) read as a quiet
training member forever.

### The board's session-run pill

Each client's card on the live board carries **"3 of 8"** beside her name:
which time through this session she is on, out of how many the block asks
for. An **ongoing** program (0103, no end date) reads **"3 of ∞"** rather than
borrowing a number off `block_length_weeks`, which is left populated but
unread while the end is null. Terra's reason for the whole thing — *"if it's
the first, the coaching will look very different than if it's their 10th."*

- **The numerator is times DONE, not the week number.** Distinct weeks with a
  completion, current block — the same definition 0098 gave the staging
  picker, so the two surfaces cannot disagree. So a client in week 4 who
  missed one reads "3 of 8", which is the honest number and says she is
  behind.
- **The current week counts whether or not she has finalized**, so it does not
  jump the instant somebody taps Finalize.
- A fresh block restarting at 1 is correct rather than a flaw: Session 1 of
  block B is not Session 1 of block A, and a first run through new programming
  genuinely is coached differently. First time reads clay, everything else
  neutral.
- **Zero extra queries.** `fetchHubBoard`'s `spcSessionComp` was already
  fetching every completion for those workout ids with no date filter, so the
  count is a client-side reduction over rows the 3-second poll already has.
  The block's length came free by widening the existing `spc_blocks` embed.
- **SPC sessions format only** (0102), where one `spc_workouts` row IS the
  session for the whole run and each completion carries its own week. A legacy
  weekly row could only ever answer 0 or 1. A GROUP column is left without a
  pill on purpose: it has one workout row per week, so counting across its
  block needs the sibling rows and a third query wave on a 3s poll — to
  restate the "Week 3" already in its header, since a group program's weeks
  are a shared calendar nobody works through out of order.
- Reviewing a past board counts it as of that day (`week_number <=
  completionWeek`), not as of now.

**The COMPLETE pill in the column header is gone** (Terra's call, and she was
right): a finalized column already carried the green wash over its session
body, a 6px olive bar, an olive border, an olive-tinted header and a footer
button flipped to "Make changes". COMPLETE was a fifth way of saying the same
thing, and the one competing with the client's name for width —
`HubFinalizedOverlay`'s own header says the wash exists precisely because a
small badge could not carry that signal across a gym.

**The header row is a width budget and the name has to win it.** With
COMPLETE there, name + run pill + the reorder icon clipped "Lauren
Bottelberghe" by a character at the narrow 463px four-up column and by four on
a phone, so the run pill used to hide on a finalized column. With COMPLETE
gone the header has the width, so **the count now stays put after Finalize**,
which is right anyway: "she has now done this 3 of 8 times" is exactly as true
afterwards as before.

### Verification

Both rounds driven through a throwaway `app/zz-hubcount.js` at 1400px and
390px with `PulseBand` temporarily exported (harness deleted, export reverted,
`git status` clean): every client name measured `scrollWidth ===
clientWidth` across six column variants, the band's four labels each on one
line at 390px, and all four sheets opened and read back (including the
"Trained, not finalized yet" row and the not-in list ordered longest-gone
first). `npm run build` + `check:routes` clean, plus a Babel parse,
unresolved-identifier and unused-import pass over all eight touched files.
Re-measured after dropping COMPLETE: every name uncropped on every column,
including a finalized "Lauren Bottelberghe" at both widths.

**Not verified behind a real login** — standing limitation. Worth Terra's pass
on a real board and against a real week's roster.

**Tooling note:** a synthetic tap on a react-native-web `Pressable` needed the
pointer/mouse sequence AND a touchstart/touchend pair dispatched after it —
touch events alone were ignored on a cold page load, and mouse events alone
never fired the press. Worth reaching for both together next time.

## The make-up option never worked from the wall or the prestage (2026-09-05)

Reported as clients not being able to start a second SPC session: it worked
from My Week and not from the coach's board or the SPC prestage. Two separate
causes, one fix. Migration `0117` — applied and verified live.

**The board was a hard 42501, every time.** `HubClientPickList` created the
second completion at PICK time, and the display account's only write policy on
`session_completions` is `is_gym_display() AND hub_active_client(user_id)` —
false for a client being picked, because she is not on the board yet. Proved
both directions against live data before touching anything: as the real display
account the identical insert **succeeds** for a client already on the board and
is **refused** for one who is not. The three instance-2 rows that do exist all
came from the member's own My Week sheet, which writes as the member — exactly
the split the coaches described.

**The prestage genuinely didn't offer it** (`allowRepeat={mode === "start"}`),
and for a good reason at the time: answering it wrote a completion on the spot,
so staging would have filed one against today's week for a session she had not
done yet.

**Both fall out of one change: the picker records the answer, it does not
write.** `newInstance` rides on the slot, and the completion is opened once she
is actually on the board — where the display's existing policy already permits
it, with no widening. That also killed a quieter bug: cancelling the picker used
to leave a phantom instance-2 completion behind, which My Week counts as a
session she never did.

**`programming.hub_open_makeup(user, workout, week)`** is the single definition,
called by `hub.js` after every board write (`startHubSession`,
`startHubSessionWithPin`, `addHubClient`) and by `hub_start_staged` for a
flagged staged row. Two properties are load-bearing:
- It requires the client to be on the OPEN board with THAT workout, so the
  display's reach is exactly `hub_active_client`'s rule plus the workout, not
  one row wider.
- **It does nothing, returning null, when she has no completion for that week.**
  That is what makes a stale staged answer harmless — a group staged on Sunday
  for Monday crosses a block week, where she has logged nothing, and the
  ordinary finalize creating instance 1 is right. Never invent a completion for
  a session she has not done: the board would open washed green and her week
  would count a session that never happened.

The week is a **parameter**, not re-derived in SQL. Every caller already holds
the authoritative value from the same RPC family (`hub_startable_clients` /
`hub_resolve_staged`), and the JS derives it in `spcCompletionWeek` — a fourth
copy of the block-week arithmetic is a fourth thing to drift.

**Staging persists the intent** (`hub_staged_clients.new_instance`, surfaced by
`hub_resolve_staged`, seeded back into the picker via `initialMakeups` so
reopening a group to change its time doesn't silently undo it). The row reads
"· doing it again" while a slot is flagged — on the Stage tab the completion is
hours away, and a flag nobody can see is a flag nobody can trust.

**Worth knowing about the board's `finalized`, which is NOT what this changed**:
`onBoardDay` only applies when `dateOverride` is set (review mode), so on a LIVE
board `finalized` means "any completion for this week", regardless of day. A
client who logged Monday already shows finalized on Thursday's board. Pre-existing,
and it is what makes the finalize-updates-the-latest-instance path correct.

**A stale note cost a wrong claim in the first draft of the migration header**:
"every instance is 1" was true of the last ten days' rows I happened to sample,
not of the table. `select instance, count(*) group by 1` found three real
make-ups. Count the whole column before asserting a feature has never been used.

### Follow-up the same day: the board ran the wrong session, and the cache decided

Two reports off the first real use, both real.

**The board opened the make-up already finished.** Nothing on a board slot said
WHICH completion it was running, and on a live board `finalized` means "any
completion for this week" — `onBoardDay` only applies in review mode, where a
date is passed. A make-up has an earlier completion for that week by
definition, so it always read as done, with every lift already ticked.
`hub_session_clients.instance` (migration `0118`) fixes it: `hub_open_makeup`
stamps the number on the slot, and `fetchHubBoard` scopes `finalized`, the
per-exercise ticks and both writes to it. `markSpcExerciseComplete` /
`unmarkSpcExerciseComplete` gained an `instance` parameter defaulting to 1, so
the member's own screen is untouched.

**`hub_open_makeup` no longer writes the completion at all** — that was the
other half of the green wash. It reserves the number; the row is written when
the coach finalizes, like every other board session. **The member's My Week
sheet still creates it up front, deliberately** — she is deep-linked straight
into logging and her week has to count it immediately. Don't "unify" these.

**Her My Week didn't ask, and the cause was `screenCache`.** The make-up gate
read `row.completed`, and My Week paints from cache, so a session finalized
since that snapshot still says "not done". Ashley's was finalized *on the
board*, so nothing she did on her own phone ever invalidated her cache — which
is why it was her and not Terra. `openSpcPreview` already re-reads the
completion from the network (its own comment says why); the decision moved to
after that read. **General shape worth remembering: a cached value is safe to
PAINT and unsafe to DECIDE on.** Anywhere a cached field gates a branch the
user cannot get back to, re-read first.

**The same-day limit, stated rather than papered over**: `programming.logs`
carries no instance (0102 — it is part of `logs_unique_set_idx`, and widening
that broke production once), so two sessions of the same lift on ONE day share
their set rows and the second overwrites the first. A make-up on a different
day — the actual use case — is unaffected, because the board reads logs by
date. The dialog now says so while the choice is still open.

**And 0118 alone did not fix it, for a reason worth generalising.** The app
stamped the slot's instance as a SECOND write, right after the slot was
created — and the board's own poll fell into that window. The certain case is
adding a client mid-session: `hub_add_client` inserts the slot at instance 1,
adding someone changes the roster so the poll refreshes on the spot and caches
instance 1, then the stamp lands and changes nothing the poll would notice,
because `clientsSignature` covered user/position/workout **but not instance**.
The board then held instance 1 for the rest of the session.

**A stability check must cover every field its consumer reads.** This is the
second time that exact function has been wrong (a count instead of a
signature, 2026-09-02) and the first fix did not generalise — a new field slid
straight past it. Migration `0119` also makes both slot-creating RPCs resolve
the instance themselves before returning, so there is no intermediate state to
observe rather than one that closes only if a poll happens to look again.

**Adding a defaulted parameter to an existing RPC creates a NEW overload, it
does not replace the old one.** Both then match the shorter call and PostgREST
has nothing to choose between them, so the old signature has to be dropped in
the same migration. A stale tab's shorter call lands on the new function and
takes the default, which is the property the default is for. `hub_start_session`
avoided this entirely by reading its new flag off the jsonb it already takes.

**Verified**: dry run rolled back and confirmed to leave nothing, then applied;
`hub_open_makeup` driven as the real display account (instance 2 then 3 for an
on-board client, refused off the board, null no-op when nothing is logged); the
whole staged path end to end as a real coach, rolled back; and the picker driven
in a browser through a throwaway `app/zz-mkharness.js` (deleted, and
`listStartableHubClients`' stub reverted) — the dialog fires, "start a new one"
emits the flag and marks the row, "put that session on the board" does not,
switching session and deselecting both clear it, a second client is unaffected,
and a double-tap through the Modal's fade-out no longer throws. **Not verified
behind a real login.**

## SPC Live Hub design pass — expand in place, dock the keypad (2026-08-22)

A handoff (`design_handoff_spc_hub_v1/` — README + `Kova SPC Live Hub -
Directions.dc.html` + 9 screenshots, direction **1a** decided) redesigns both
hub surfaces: the wall display (`app/(display)/index.js`) and the coach phone
(`app/(coach)/spc/live.js`). Same "the HTML is a reference, never copied in"
rule as every prior handoff. Migration `0076`, above, is part of it.

**`HubEntryPad.js` is deleted.** Tapping a lift now expands it IN PLACE
inside its own column with the keypad docked beneath it, on both surfaces —
there is no modal on either any more. New: `HubLiftCard.js` (the open card),
`HubDock.js`, `HubPlateCalc.js`, `HubLiftHistory.js`, `HubSetBubbles.js`,
`HubIdleScreen.js`.

**The keypad follows the focused box (2026-09-02).** Originally the dock
opened with the card and `active` always held a cell. Now `active` starts
**null** and "a cell is focused" and "the keypad is up" are one fact, not two:
expanding a lift shows no keypad, tapping a box opens it, and `⌄` clears the
highlight along with the dock (a lit box under no keypad claims to be the live
cell when nothing can type into it). The `Show keypad ⌃` bar is the way back.
Two things this had to preserve: `suggestedCell` keeps the "first box still
needing a number" seeding that used to run on expand, so summoning the keypad
still lands on the right box; and `ensureCell()` means a HARDWARE keystroke
opens a box rather than going nowhere, which is what keeps the keyboard beside
the touchscreen working as it did. Focusing the note field clears the cell too
— safe against the layout-moved-under-my-finger hazard only because the dock
sits BELOW the note, so nothing above it shifts. Every handler that reads
`activeRef.current` now has to tolerate null; `fieldLabel`/`dockLabel` do too.

**Real bug in the shared note box, found 2026-09-02: pressing Enter dropped to
line two and sprang straight back up.** The merge effect's "has this coach
started editing?" test compared `note.trim()` against the seed — which makes a
newline *invisible* to it. Typing Enter at the end of an existing note left the
two equal once trimmed, so the effect read the box as untouched and adopted the
remote copy back over it, wiping the newline on the very next render (`note` is
one of that effect's dependencies, so it fires on the keystroke). The guard now
compares EXACTLY, and `commitNote` stores the raw text as the seed so the guard
keeps recognising an in-progress edit. The trim in `commitNote`'s
duplicate-row check is still right; it answers a different question. **Worth
generalising: a "has the user edited this?" guard must never normalise, or
every whitespace-only edit is invisible to it.**

**The dock is one slot with three interchangeable occupants at the same
footprint** — keypad, plate calculator, block history — pinned bottom-right
of the column, all dismissable with the `⌄`. Its top border is 2px clay
matching the open card, which is what says "this keypad belongs to THAT
lift" on a wall four people are reading at once. This replaced a three-zone
card (sets | note | every week side by side) that only worked at a 900px
column, and widening one column means resizing its neighbours — so columns
would move whenever somebody tapped.

**Layout rules, all arithmetic rather than taste** (a column is 460px at 4
clients, 619 at 3, 463 at 1-2, with 992px of height inside it):

- **A column is only ever one of two widths.** 4 clients = 463, 3 fills
  (~620), 1-2 hold 463 and **centre**, with the clock taking the gap to
  their left (equal flex spacers both sides — measured: 729px margins at 1
  client, 491 at 2). Guarded on there actually being room, so a coach's
  narrower browser falls back to filling instead of overflowing; verified at
  900px, columns drop to 430 and the page stops overflowing.
- **Every other lift collapses to one line while a lift is open** — name,
  set summary, tick. Full rows are ~104px and five of them plus a usable
  card does not fit in 992 at any client count.
- **An overflowing column scrolls inside itself**, with a bottom fade and a
  pinned "N more lifts ⌄" row outside the scroll area. **No scrollbar**: a
  classic one consumes content width in the scrolling column only, which
  would render that client's cards ~19px narrower than its neighbours' on a
  four-up wall. The count comes from per-row `onLayout` offsets and degrades
  to a plain "More lifts ⌄" rather than risking a wrong number.

**Autosave replaced commit-on-Save**, because the design has no Save button
anywhere: sets persist on a 700ms debounce and again on collapse, matching
the member app. A `dirtyRef` means opening a lift to look at it and closing
it again writes nothing, and the debounce clears it so collapsing after a
write doesn't repeat it.

**`useHubBoard`'s poll freeze became a `Map` keyed by userId.** Two columns
can genuinely be expanded at once (a coach running four people moves between
two racks), so freezing "the one open lift" was wrong the moment a second
column opened. `clearEditing(userId)` clears one; no argument clears all.

**Resolving the handoff's flagged note merge** (it explicitly delegated
this): one store, `programming.exercise_coaching_notes`, scoped to (user,
exercise, workout, week). **Append-only** — the display has INSERT but no
UPDATE there (0071) — so "one note per lift per week" is read as *the newest
row for that week* rather than edited in place, and saving only inserts when
the text actually changed. The hub no longer writes `logs.notes` at all.
Known consequence: a note a client types into her own session log on her
phone does not appear on the board.

**Answers to the rest of the handoff's open questions**, decided rather than
sent back: "last completed week" is **the last week the lift was actually
logged**, not the previous week of the block — a skipped week is absent
rather than an empty row, since an empty "WEEK 2" is worse than the WEEK 1 a
coach can actually compare against; a finalized column gets a 6px olive bar
+ COMPLETE pill + outlined button, **not** a full wash (visual-pass v4's
border-and-fill rule); expanding the warm-up strip pushes the list down and
lets it scroll rather than forcing the open lift shut; note attribution is
uniformly a first name from the `author_name` snapshot.

**Recent bests on the idle board were Terra's call, taken explicitly**
(the handoff flagged them as needing it — member first names and numbers on
a wall in a shared room): build it, default **off**, admin toggle at
**Settings → Equipment → Gym display**. The gate is in the SQL, not the
client — see 0076.

**Regression this pass caused, found and fixed 2026-08-27.** Deleting
`HubEntryPad.js` dropped the one thing that rendered the coach's
per-exercise **note to member** (`spc_workout_exercises.notes`, written in
the builder's NOTE TO MEMBER field) — the old pad had it at line 245 and
nothing in the new components read it, so it was silently absent from the
board for five days. The data never stopped flowing: `hub.js` has always
put `notes` on every item, and its own comment says the shape exists so
`coachNoteFor` works unmodified. Nothing underneath needed fixing; it just
had no renderer.

Restored as a **read-only instruction**, never an editable field — that is
the whole distinction from the note TextInput near the bottom of the card,
which is the shared scratch note anyone can type at the rack. `HubLiftCard`
exports `coachInstruction(item)` as the single definition, and renders it
above the set rows on a clay left rule with **no fill**: on this board a
peach fill already means pressable (the history strip, the collapse
circle), so a tinted callout would read as a control. It sits above the
boxes because it is setup information — which attachment, which cue — and
is worth nothing once the first set has already been done wrong.

`HubClientColumn`'s **RestingRow** appends it to the prescription line in
clay (`3 × 8-12 | Rest 90s | V-Handle`) rather than giving it a line of its
own: those rows are fixed-height so the same lift lands at the same y in
every column, and a fourth line would break that for all four clients at
once. It truncates on a long note; the full text is one tap away on the
card. `CollapsedRow` (34px) deliberately gets nothing.

**The general shape worth remembering: a redesign that deletes a component
can silently drop a renderer while every query behind it keeps working.**
Nothing fails, nothing logs, and the bundle stays clean — the only symptom
is a coach saying "I thought that used to show up." When a surface is
rebuilt, diff what the deleted file rendered against what the new one does,
not just what data each one receives. The member logging screen was
unaffected throughout ([ExerciseCard.js:887](components/ExerciseCard.js:887)
renders the same value as `Coach note:`), which is exactly why the gap was
easy to miss.

**Deviations from the mock, deliberate:**
- The note field and the `+ Add set` / `Same as last` buttons stay on the
  **phone** card. The README says the phone should hold "sets + the history
  strip + the note affordance and nothing more", but its own problem table
  asks for those buttons, and dropping them means a coach cannot add a set
  from their phone at all. It fits at 390px — verified.
- The note field always sits **below** the sets, never beside them. The
  README's prose says beside at 3 clients, but its own screenshot of the
  3-client frame shows it below; the screenshot won.
- The idle screen's "a coach starts the board from their phone" line is
  **gone** (Terra's call) — the coaches know, and it was the one piece of
  admin copy on a screen the whole gym looks at.
- The idle screen is centred as a **group** (measured: 368px margins each
  side), not pushed to both edges; its stat column is only in the layout
  when it has a card in it, so a bare clock still centres properly.

**Verification** — driven through a throwaway `app/zz-harness.js` route at
1920×1080, 900 and 375 (deleted after, `git status` confirmed clean): the
four-up resting board, three columns expanded simultaneously, keypad typing →
Next → weight, the calculator (45+45+25+35 bar = 150, Insert lands it and
returns to the keypad), the history dock with two real weeks, both centred
widths measured to the pixel, the reps-only lift dropping its LB column *and*
dimming the Calculator pill, and callback instrumentation proving
open-and-close-with-no-edit writes nothing while typing writes exactly once.
Clean `expo export -p web` plus a Babel parse/scope pass after every batch.
**Not verified**: anything behind a real login, and none of it on native.
The one thing that most needs Terra's own pass is a real block's history
strip — fake weeks are all a logged-out harness can show.

**Tooling note**: the Browser pane's `resize_window` still does not deliver a
real resize event to the page, and a manually dispatched `new Event("resize")`
did NOT reach react-native-web's `useWindowDimensions` either — a width-
dependent branch tested that way reads as broken when it is fine. Reload at
the target width instead; that is also the real case for a wall display.
