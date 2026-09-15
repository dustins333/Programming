# History: SPC (client page, statuses, sessions model, printing, alternate programming, one-offs)

Moved verbatim out of CLAUDE.md on 2026-09-14 so it no longer loads into every session. Sections keep their original order. "Above"/"below" references inside may point at a section that now lives in another docs/ file; see the index in CLAUDE.md.

## SPC client page v2: the rail goes, and two things called COACH NOTES stop being one (2026-09-07)

A handoff (`design_handoff_spc_client_v2/` — README + `.dc.html` + 5
screenshots) simplifies the coach-web SPC client page. Written as a diff
against current source, so most of it is deletion. No migration, no deploy
step. Screens: `components/coach/spc/SpcClientPage.js`, `SpcSessionsTab.js`,
plus a new `ProgramNotes.js`.

**The right rail is gone, and that is what pays for everything else.** It held
NOTES and CLIENT SETTINGS at 280px beside a main column that was then ~850px
at 1440 — which is why the Sessions tab's two side-by-side panes were ~412px
each and every lift row in them wrapped. Full width measures **1141px** now.
Settings became its own tab; the thread became a fold-away row.

**The two COACH NOTES were never the same feature, which is the whole reason
nobody could tell them apart:**

| | what it is |
|---|---|
| `spc_clients.notes_goals_feedback` | one field on the client row. No author, no date, last write wins, true across every program. Now **KEEP IN MIND**, inside the goal hero. |
| `program_comments` (spcBlockId) | attributed, dated, appended, scoped to the block — and it follows the program into History when the program closes. Now **Notes**. |

Same label and the same grey-box-with-a-textarea on both is what made them
read as one thing rendered twice. Kept as two, relabelled, and given visibly
different shapes.

**`ProgramNotes.js` is a separate component from `CommentThread`, not a
variant of it.** CommentThread keeps its card for the builders and the group
pages; this is the same data in a row that folds away, with the byline *under*
the body rather than above it (these are read as a run of remarks — what was
said is what you scan, who said it is the footnote). It is mounted three
times: the foot of Overview's CURRENT PROGRAM card, its own white card on the
Sessions tab, and read-only on the peach ground inside a finished run in
History.

- **`NoteField` is exported from `CommentThread` and reused** rather than
  copied, so the fixed-height-no-autogrow rule (which this codebase has been
  bitten by three times) has one definition.
- **Open state is a pub-sub AsyncStorage pref** (`lib/spcNotesPref.js`), not
  local state. Two mounts of the same thread live on one page; opening it in
  one and finding it shut in the other would read as two different features,
  which is the exact confusion the pass exists to undo. Verified surviving a
  reload.
- Notes are fetched **on first open, not on mount** — two of these render on a
  page where the row is normally shut.

**History's note counts are batched, deliberately against the handoff's
suggestion.** It says one lazy query per expanded run, same as the sessions
expansion. But the count sits on *every collapsed row's* meta line
("6 weeks · 2 notes"), so lazy would be one query per row to draw a list
nobody has opened. New `listCommentsForBlocks({ spcBlockIds })` is one `.in()`
plus one names query, and it feeds both the counts and the bodies.

**Print is gone from this page entirely, and that is now correct rather than
a gap.** The handoff drops the Print tab and says "flag if that matters; it
wants to live somewhere." It looked like it did — that tab was the only route
to the paper sheet at desktop width, since the desktop SPC roster has none. A
Print button was built onto the name line for it, and then **Terra said the
paper workflow is retired: everything moved to the live hub.** So the button
came out again. Worth knowing before anyone re-adds one: `/spc/print/[blockId]`
still exists and still works, it is just not linked from here on purpose.

**One deviation from the mock, kept:** notes keep their **edit and delete**.
The mock draws neither; both have existed since 2026-08-21, and dropping them
would be a silent loss of function. Moved onto the byline row.

**Two corrections from Terra mid-build**, both applied: **"Enrolment" →
"Enrollment"** (US spelling; the mock has the British one, and this was the
last user-facing `Enrolment` in reachable code — the only other is the dead
legacy `spc/[userId].web.js` — same class as the 2026-08-14 programme/enrol
sweep), and **History → Programs drops "· built week by week"** from a run's
meta line. That line is weeks, then notes, and nothing else.

**Also removed, and one of them was a real query.** `ProgramDatesPanel`'s
`statusLine` went — and it turned out to be the only consumer of `loggedCount`,
which was fed by a `listSpcCompletionDetailsForWorkouts` call on **every load
of the Sessions tab**. `supersetFootnote` went too (the 3px olive left border
on a superset row was always carrying it). Overview lost RECENT PRS, LAST
SESSION, the quick links, and the banner's title and supporting line — every
sentence of which was on the two cards directly beneath it. `lastSessionAt`
and `describeLastSession` are now unreferenced from this page.

**`ClientGoalCard` gained a `wide` + `aside` branch**, not a set of
conditionals through the existing hero — four other callers render that one
and none of them should move. Only the goal column is pressable-to-edit in
wide mode: wrapping the whole band would put the aside's TextInput inside a
Pressable. A client with **no goal** still gets the band (with "Set a goal +"
where the goal goes), because the band also carries the aside — the narrow
card's dashed empty box has nowhere to put it.

**New `formatDateMDShort`** in `lib/formatDate.js` — "9/4", not "09/04", for a
small annotation hanging off something else. `formatDateMD` keeps its padding
for the calendar grids, where columns are fixed and dates line up under each
other. `SpcClientPage`'s `badgeDate`, which was the same function inlined, now
delegates to it.

**Known and unchanged**: the Settings *tab* is reachable at phone width where
the rail's card never was — a small gain, since a phone-width coach previously
had no way to change a client's frequency at all. The phone branch still
renders no goal card, so KEEP IN MIND is desktop-only; that was already true
of the field it replaces.

**Verification.** `npm run build` + `check:routes` clean; a Babel parse,
unresolved-identifier, unused-import **and missing-named-export** pass over
every touched file; and the whole page driven for real at 1440, 1024 and 390
through a throwaway `app/zz-spc.js` route. Exercised: the header band, the
trimmed banner, the Notes row opening and its count appearing, the byline
reading `9/4`, the Settings tab reading **Enrollment**, History's per-run note
counts (with a `weekly`-format block deliberately in the fixture, so the
removed "built week by week" would have shown if it were still there) and the
PROGRAM NOTES panel inside an expanded run, and the Sessions
panes — whose recessed ground was **measured**, not eyeballed (`#e7e0d6` /
`#dad2c6`, radius 14, padding 18, row `align-items: stretch`, panel stretching
to 522px against the taller column). At 1024 the hero wraps with no page
overflow; at 390 all four tabs fit with no truncation.

**The harness technique worth reusing**: rather than stubbing modules by
overwriting them, each was copied to `*.real.js` and replaced with
`export * from "./x.real"` plus explicit overrides — explicit exports shadow
star exports, so every pure helper and component stayed real and nothing could
be lost by a stub forgetting an export. Eleven modules, restored afterwards and
**md5-verified byte-identical**, then `git status` checked for strays.

**Not verified**: any of it behind a real login, and none of it on native
(the page is web-only — `[userId].js` renders `CoachSpcOverview` instead).
Worth Terra's pass: a real note added and edited, a real print, and the
Sessions tab against a client whose sessions actually load.

## Tempo removed, SPC program notes retired, phase on the photo pickers, and a photo that vibrated (2026-09-08)

Three asks in one sitting plus one bug reported mid-session. No migration,
no deploy step — all of it is client-side.

**TEMPO IS GONE**, from the builder and from every screen that displayed it
(`TempoDigits`, the collapsed row's column, the member's `ExerciseCard`, the
hub prescription line, `SpcSessionReadout`, and the item mappers that carried
it). Only **9 lifts in the whole library** ever had one, checked before
deciding. Removing only the input — which is what was literally asked — would
have left those 9 members looking at a cue no coach could edit or clear, so
the read surfaces went too. **The `tempo` columns are kept and unread**, the
standing convention here, so it reverts without a migration.

**SPC PROGRAM NOTES retired.** `programming.program_comments` scoped to an
`spc_block` is no longer read or written anywhere: the client page's Overview
and Sessions tabs, its History panel and per-run note counts, the native
builder, the mobile block overview and the legacy web page. `ProgramNotes.js`
and `lib/spcNotesPref.js` are deleted. **`listComments`/`addComment` now take
a `groupBlockId` and nothing else** — reintroducing an SPC note takes a
deliberate edit to `comments.js` rather than a stray prop, and
`listCommentsForBlocks` (SPC-only) went with it. A GROUP block keeps its
thread: it is shared across a whole program, so there is no one client whose
KEEP IN MIND could carry a note about it.

- **`KeepInMindField` is extracted out of `ClientContextBand`** so the phone
  frame, the native builder and the mobile overview render the SAME box
  rather than a lookalike — the phone frame has no goal hero, so without it
  removing the thread would have left it with no note field at all. It
  carries the seed-once (`value === undefined` means "not loaded") and
  unmount-flush rules that make it safe to mount anywhere.
- **The 11 existing rows are kept, unread, and were exported for Terra**
  (grouped by coach, plus a CSV; script + output in that session's
  scratchpad). Worth knowing what they were: **9 of the 11 sat on programs
  that were still running**, 8 written in the preceding 12 days, by four
  coaches — Lauren Bottelberghe (6, all warm-up substitutions written across
  her roster in one sitting), Abbi Stauffer (3), Ashley Mullett (1), Kristan
  Alford (1, written the day before the removal). So this was a live habit
  going dark, not an unused feature retiring. **Read `coach_id` for the
  author, never a name inside the note text** — one of them reads "game plan
  with Alicia", and Alicia is the client it is filed against.
- The gap this leaves, flagged and not solved: a **warm-up substitution** is
  neither a standing fact about the client (KEEP IN MIND) nor attached to a
  lift that exists in the session (EXERCISE NOTE). Six of the eleven were
  exactly that.

**WEEK PHASE ON THE PHOTO PICKERS.** New `phaseForDate` / `phaseLabelForDate`
in `weekPhases.js`: snap a photo's date back to its containing Monday and
read the marker covering it, so "Diet 3" on a photo and "Diet 3" down the
side of a week are one fact. **`mondayOnOrBefore`, NOT weekCycle's
`mondayOnOrAfter`** — that one anchors the photo-requirement cadence and
would push a Tuesday photo into the following week. Wired into the coach
client page's compare rail (a coloured chip, sharing the Weeks tab palette)
and the Photo Compare tool (part of the label STRING, because `OptionPicker`
is a real `<select>` on web where an option can only be text). **`phaseMarkers`
is a prop, never a fetch**, so the member's own Photos tab neither shows it
nor queries for it — `nutrition_week_phases` is staff-only and she could not
read it anyway.

### The compare photos vibrated, and it is a shape worth recognising

Reported as the photos on the coach client page's Photos tab jittering and
resizing continuously with nothing being touched. Not caused by that day's
changes — it had been there since the rail was built.

**`PhotoCompareRail` measured its own row with `onLayout` and derived the
photo HEIGHT from that measured WIDTH.** That is a feedback loop with a
scrollbar in it:

> taller panes → taller page → the ScrollView needs a vertical scrollbar →
> the row inside it is ~15px narrower → `onLayout` fires → narrower panes →
> **shorter** panes, because the height came from the width → the page fits
> → the scrollbar goes away → the row is 15px wider → repeat, forever.

The Photos tab falls into it easily because the photos are essentially the
whole height of the page, so it sits right on the scrollbar threshold.

**Fix: the host passes `availableWidth`, computed from the window** (less
CoachShell's sidebar and its own padding) rather than measured.
`window.innerWidth` INCLUDES the scrollbar and so cannot move when one
appears, which is what breaks the cycle — same approach, and the same trade
of a computed rather than measured width, as the sibling Photo Compare tool
page. The rail keeps no knowledge of the sidebar; it falls back to the raw
viewport when the prop is absent. **There is now no `onLayout` left in that
file.**

**Two durable lessons:**

- **Never derive a box's height from a measurement of its own width** (or
  vice versa) when that box's size can change whether the page scrolls. The
  scrollbar closes the loop. Reach for a computed width from
  `window.innerWidth`, which is scrollbar-independent, or let CSS do it in
  one pass with `flex` + `aspectRatio`.
- **This is the `onLayout`-is-a-ResizeObserver hazard cashing in.** Confirmed
  again this session: **0 ResizeObserver callbacks in 700ms** on a real
  element in the preview pane, so `onLayout` never fires there and the bug
  was not reproducible in a browser at all. Anything sized off `onLayout`
  cannot be checked before it ships — prefer deterministic geometry.

**Verified by simulating the shipped formulas** across 21,385 combinations of
window width × window height × page chrome, since a browser repro was
impossible: **old = 168 oscillate**, over window widths 900–1480px (ordinary
laptop sizes) — at 900×720 with 340px of chrome the photo height alternates
**383px ↔ 373px forever**, several times a second. **New = 0.** Then rendered
for real at 1100×800 (height-bound, 353×471) and 900×1000 (width-bound,
287×383 — the same 383 the loop was flickering on): stable across 2s of
sampling at both, no horizontal overflow. Sim script is in that session's
scratchpad as `photo-rail-oscillation-sim.mjs`. **Terra confirmed the fix on
her own window.**

**Also removed** (her ask): the resting caption under the compare panes
("Tap either date to pick a different photo for that side…"). The Adjust
framing caption stays — dragging a guide line is genuinely not self-evident.
`CHROME_HEIGHT` was deliberately NOT tightened to reclaim the freed pixels:
a taller pane is a pane closer to needing a scrollbar, and slack costs
nothing.

**Not verified behind a real login** — standing limitation. Worth Terra's
pass on an SPC client at phone width, where KEEP IN MIND now stands alone.

## SPC follow-up: KEEP IN MIND everywhere, the builder is desktop-only, the exercise note gets its own line (2026-09-08)

Four asks off the same sitting, all UI. No migration, no deploy step.

**The mobile program overview** (`components/coach/SpcSessionPreview.js`, the
sheet the SPC roster opens, and the same page the review deck pages through)
loses its Print sheet button and its bottom button row. "Open client page" was
a full-width button under every lift; it is navigation, not the conclusion of
reading a session, so it is a **"Client page ›" link in the header** next to
the status pill. Measured at 375px: back link, pill and link all fit with 18px
to spare and no page overflow — and "Good to go" is the longest status label
there is, so nothing longer can push the link off.

**The bottom "Coach notes" box moves to the top as KEEP IN MIND**, collapsed,
directly under the goal banner. Two things were wrong with it: the name (the
block-scoped `program_comments` thread already owns "Notes" — see
`ProgramNotes.js` for why these two are not the same feature), and the end of
the screen. `spc_clients.notes_goals_feedback` is the injury, the cue, the
thing you need BEFORE you read the programming, not after every lift. Same
name, same lock glyph and same clay eyebrow as the desktop client page's
goal-hero aside, so a coach meets one thing called KEEP IN MIND rather than
two. **Collapsed still shows the first line** — a box that only says it has
something in it makes you tap to find out whether it matters.

**`getSpcSessionPreview` now returns `keepInMind` itself** rather than the
page reading it off the caller's `client` object. The roster row carries
`notesGoalsFeedback`; the review deck's clients are only `{userId, name,
sessionNumber}`, so sourcing it from the prop would have shown a coach's notes
on one route and silently not on the other. One indexed single-row read, its
own catch.

**The full builder is desktop-only now.** `SessionCard`'s "Full editor" button
(`SpcSessionsTab.js`) is gated on the `isDesktop` it was already being handed.
Add, remove and inline sets/reps stay at both widths, so a phone keeps
everything except the restructure — same call as every other builder in this
app. One real consequence: the **upcoming** pane passes `editable={false}`
because that program is built entirely in the editor, so on a phone it becomes
read-only. Its caption says so ("Build this one on a computer") rather than
leaving the absence to be discovered.

**The builder leads with the client, not the rail.** The goal card moved out
of the 268px right rail and onto the top of the session column as the full
`wide` band, carrying KEEP IN MIND in its `aside` — the two standing facts
about a client were in the narrowest column on screen, or on another page
entirely, while the session got the width. **`CommentThread` is gone from the
SPC builder's rail**
with it: it was the second notes box on a screen that now opens with KEEP IN
MIND, which is exactly the "one feature drawn twice" confusion the client-page
rebuild existed to undo. The thread still lives on that page's Sessions tab
(`ProgramNotesRow`). The **group** builder keeps its CommentThread — a group
block is shared, there is no one client whose goal belongs at the top of it.

**The exercise note leads the lift card.** In `SessionBuilderParts.js`'s
`SortableLift`, NOTE TO MEMBER was a small white box in the bottom-right
corner behind tempo. It is **EXERCISE NOTE** now, full width, directly under
the lift's own name, on peach (`#fdece5`) with a 3px `colors.primary` left
rule — the wall display's own language for it, so a coach who has read it on
the board recognises what she is typing into. Peach specifically, not the
softer `#fdf6f2`: a supersetted lift row is already filled with that one and
the field would be invisible inside it. Shared by all three builders, which is
the point — one name for one field.

**New `components/coach/spc/ClientContextBand.js` is that band, and it is one
component on purpose.** Terra's framing when she asked for it to be editable
in the builder too: *"That is a client specific object. So it shouldn't matter
what page you are on."* So the client page and the builder render the same
thing — same wording, same eye glyph, same ability to set a goal or update the
notes — rather than the builder getting a read-only lookalike. The client page
lost its inline copy (and its `notesDraft` state) to it. Two properties worth
keeping if this is ever touched:

- **`keepInMind === undefined` means "not loaded yet"**, distinct from null
  ("she has none"), and the editor seeds from the prop exactly ONCE per
  client. Both hosts re-run `load()` while the box can be open — the builder
  on every prev/next session, the client page after any save — and a re-seed
  there wipes whatever the coach is halfway through typing. Both get the
  undefined for free: a not-yet-loaded client row is null, and
  `null?.notes_goals_feedback` is undefined.
- **It saves on blur AND flushes on unmount.** Blur covers the ordinary case;
  the unmount flush covers leaving the page with the cursor still in the box.
  Coach notes have been lost to exactly that before (see GamePlan, 2026-08-28)
  on a field that only saved on an explicit action.

**"Save & go back" is "Send to {name}" now**, and the question that produced
it is worth keeping: *"in the top left corner there is just a back button. If
someone clicks that do they lose their progress?"* **No — nothing in this
builder is ever unsaved.** Every field writes on the keystroke through
`track()` (verified: no debounce, no buffer anywhere in the route or in
`SessionBuilderParts`; `TempoDigits` holds local digit state but emits on
every change), and the header's Saved/Saving light is reporting the real round
trip. The back arrow, and closing the tab, lose nothing.

The one thing the button did that the arrow doesn't is **send** — flip a
session with lifts from draft to published, which is the gate that lets the
client see it. So a brand-new session left by the arrow is fully saved and
still invisible to her. That case was already caught by the Sessions tab's "↑
Send N new sessions · built but not sent" banner, but the label was actively
misleading: it read as though the arrow beside it threw work away. The button
now says what it does — `Send to Rae` / `Sending…` when there is something
unsent, `Done` when the session is already live or empty — and **both the
label and the write read one `needsSending`**, so they cannot disagree about
whether there is anything to send. `needsSending` is declared above the
handler that closes over it and optional-chains `workout`, because the
component early-returns while that is still null.

**Deliberately NOT renamed on the hub or the member app**, where it still
reads "Coach note:". It is an *exercise note* when you write it and a *coach
note* when you receive it, and `HubLiftCard`'s own header says the wall and
the phone in her hand are worded identically on purpose. Flag it if that reads
wrong.

**The hub row grew a line, and reserving it is the load-bearing part.**
`RestingRow`'s coach note used to ride the prescription (`3 × 8-10 | Rest 2:00
| V-Handle`), which meant reading the instruction out of the middle of a run
of programming. It is its own line under it now — and `ROW_NOTE_H` is
**reserved whether or not the lift has a note**, because this column's whole
grid is fixed-height blocks so that "lift 3" sits at the same y in all four
columns. Verified by measurement, not eyeball: three rows, two with notes and
one without, all exactly **114px** with tops exactly 122 apart. Costs 16px a
row (98 → 114), i.e. about one lift of capacity in a full column, which the
scroller and the "N more lifts" row already handle.

**Verification**: `npm run build` + `check:routes` clean; a Babel parse,
unresolved-identifier, unused-import **and missing-named-export** pass over all
six touched files; and every piece driven for real through a throwaway
`app/zz-spc-harness.js` at 1280 and 375/420 (deleted; the three temporarily
exported/stubbed files restored and **md5-verified byte-identical**, `git
status` checked). Exercised: hub row heights above, the expanded lift card with
its note typed into and its computed style read back (`#fdece5`, 3px
`#a46a57`, 866px wide), the session card with and
without the editor button, and the sheet's header, collapsed preview and
expanded note. The band was driven separately with its two write paths
stubbed: it seeds from a stored value, a stale re-seed mid-edit does NOT wipe
the draft, blur writes exactly one `updateSpcClient` with the right payload,
an unchanged blur writes nothing, unmounting with unsaved text flushes it, and
the goal editor opens from the band and calls `setClientGoal`. **Not verified
behind a real login** — standing limitation. Worth Terra's pass: a real
client's sheet, and setting a goal from the builder.

**Harness gotcha, re-confirmed**: a programmatic `el.focus()` does not stick in
the hidden Browser pane (`document.activeElement` stayed BODY), so a following
`el.blur()` is a no-op and an onBlur save looks broken when it is fine.
Dispatch `new FocusEvent("blur")` on the node instead.

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

## SPC statuses go derived — phase 1 of the SPC calendar rework (2026-08-29)

First of four passes off a spec written the same day:
https://claude.ai/code/artifact/c8b94401-77a4-4783-a3f8-9b8d700cc9ad — read it
before starting phase 2. **Scope is SPC only**; group programs are untouched.

**The framing that produced it, worth not relitigating.** Two ideas were
proposed and rejected by Terra before the real design landed, and both are
tempting enough to come back: (1) treating a block as an undated **queue** the
client works through at her own pace — wrong, because SPC sessions are reserved
slots and a no-show burns one, so a week is a real business boundary, not an
artifact of date math; (2) modelling **credits/rollover/no-shows** in Kova at
all — wrong, because Kilo owns reservations and billing and Terra explicitly
does not want that tracked here. Weeks stay rigid. What changes is that a coach
can *nudge* a session between weeks, and that the roster stops lying.

**`programming.spc_clients.status` collapsed from five values to two**
(migration `0099`). The old set was the printed method verbatim —
`printed_ready` / `needs_printed` / `new_program_asap` / `coming_up_next_week` /
`paused`. Four of the five described things the data already knew; only
`paused` is real-world knowledge the app cannot infer. `isSpcActive()` reads
`status !== 'paused'` and needed no change, which is why the column was narrowed
rather than dropped.

**New `lib/programming/spcState.js` is the single definition** —
`deriveSpcState()`, `SPC_STATES`, `SPC_STATE_ORDER`, `NEXT_STEP`,
`SPC_ENROLLMENT_LABELS/TONES`. `lib/programming/spcStatus.js` is **deleted**.
Most of the logic already existed as `describeCoverage()` inside
`spcRoster.js`; it moved out whole (every reason string preserved verbatim) and
now returns a `state` key alongside the reason and next step, so the two roster
screens' chips, filters and sort all read one taxonomy.

**The finding that changed the design, and the reason to distrust the old
statuses generally.** Run against all 76 real SPC clients: the stored status
said **44 were "Printed & Ready"**, while **51 have never had a single block
written for them, ever**. An `spc_clients` row is created by the enrolment
toggle whether or not anyone ever programmed for that person (migration
`0084`'s header found the same thing from the other end and excluded them from
the hub picker for it). Bucketing those 51 as urgent would have shipped a
roster worse than the one it replaced — 51 red rows burying the 12 that matter.
So there is a seventh state, **`neverStarted`** ("Not started", quiet tone,
`NEXT_STEP.start`), gated on a new `everScheduled` input meaning "this client
has had at least one real non-draft block, ever". It defaults **true** so a
caller that doesn't know keeps the older, louder behaviour rather than silently
going quiet. Live roster now: 1 draft to send, 11 unfinished, 10 on track, 51
not started, 3 paused — **12 actionable, not 62.**

**Same fix applied to `coachDashboard.js`'s `spcIssues`**, which renders on
Coach Home as "N need attention" and would have counted all 51 (a pre-existing
bug, not one this pass introduced — `currentBlock` was already null for them).
Now gated on `everScheduled` too.

**Two genuinely dead things deleted**, both computed and exported and read by
nothing: `coachDashboard.js`'s `spcByStatus`, and `dashboardStatusTiles.js`'s
`spcRosterRoute()`. Worth grepping for consumers before preserving behaviour in
a refactor — half the "status" surface turned out to be unreachable.

**Traps hit, all of them worth remembering:**
- **A CHECK narrowing needs drop → update → add, in that order**, and a dry run
  is what proved it. Updating first fails (the new value is illegal under the
  old constraint); adding first fails (the old values are illegal under the new
  one). The `UPDATE` has to run with no check attached at all.
- **`supabase/functions/scan-spc-alerts` wrote `status: 'new_program_asap'`**
  and would have thrown on every nightly run the moment the constraint narrowed.
  **Deploy order matters**: the function went out *first* (it just stops writing
  a status), then the migration — so there was never a window where the
  deployed code violated the live constraint. Redeploying without
  `--no-verify-jwt` preserved `verify_jwt: false`; verified in
  `supabase functions list` afterwards rather than assumed.
- `coachDashboard.js`'s attention-item `signature: "new_program_asap"` is an
  **opaque key for `programming.dashboard_dismissals`** and deliberately keeps
  the old name — renaming it would silently un-dismiss every row a coach has
  already cleared.
- A `create table as` backup lands in an **exposed schema** with no RLS. The
  rollback table (`programming.zz_spc_status_backup_0099`, 76 rows, still
  present) had RLS enabled and grants revoked afterwards.

**Verification was unusually complete for this repo**: migration dry-run in a
rolled-back transaction; all 11 derivation branches exercised as unit cases;
`npm run build` + `check:routes` clean; a Babel parse **and**
unresolved-identifier pass over all 13 touched files; and — the one that found
the 51 — the shipped `deriveSpcState()` run against real live roster data
before *and* after applying, with matching results. **Still not click-tested
behind a real login** (standing limitation): worth Terra's pass on the two
roster screens' chips/filters/sort, the client-detail page's Enrolment control
(now a two-option select where five statuses used to be), and confirming Coach
Home's SPC attention card no longer counts the never-programmed.

**Phase 2 — dates stop being a trap — shipped the same day.** Two of the four
things it was specced to do turned out to be **already built**, found by reading
rather than trusting the spec: `scan-spc-alerts` has created drafts since 0089
(only the client-side twin hadn't), and every place a block's dates render was
already a range (`Aug 24 → Sep 20`), never a bare start date. What was real:

- **`checkAndAutoDraft()` is deleted, not fixed.** It was a client-side stand-in
  for a block-ending scan written when this app had no server cron. It has one
  now — `scan-spc-alerts`, nightly, job `spc-alert-scan`, verified firing and
  returning 200. Keeping both meant two implementations of one job and they had
  **already drifted**: the server one creates a draft, this one still created a
  live, dated block whose week 1 ran down while the coach wrote it. It also ran
  on every SPC-dashboard and coach-Home load, so a training block could be
  created as a side effect of somebody opening a page. Removed from three call
  sites.
- **New `moveSpcBlock(blockId, requestedStart)`** (`spcBlocks.js`) — slides a
  live block to a different Monday: snap, recompute `block_end_date` from the
  length, `assertNoOverlap(…, exceptBlockId)`, one update. Everything follows
  because a block's calendar is arithmetic off `block_start_date`, not stored
  per week. **Locked once she has trained in it**, and the check reads logged
  SETS (`countLoggedSetsForBlock`, one indexed count over
  `logs.spc_workout_id`) rather than finished sessions — logging autosaves per
  set, so a session she is part-way through counts and her calendar can't slide
  underneath her because nobody pressed Finalize.
- **New `components/MoveSpcBlockModal.js`**, reached from a "Move dates" link
  beside the date range on the SPC client page's block band. **The lock is
  checked on open, not on submit** — picking a date and only then being told you
  can't is a dead end. A failed count renders as locked, never as movable.
- **New `lib/programming/useBlockMondays.js`** — the taken/blocked-Monday
  arithmetic extracted out of `SendSpcBlockModal` so both dialogs share it.
  Two copies of "which Mondays would collide" is how a dialog ends up offering a
  date the write then refuses. `excludeBlockId` is what stops a block being
  treated as colliding with itself when it's the one being moved.

**Verified**: `npm run build` + route check clean, Babel parse and
unresolved-identifier pass over every touched file, and the dialog driven for
real through a throwaway `app/zz-harness.js` at both states — opens on the
block's current start and dims Move ("That's where it already starts"), a free
Monday enables it with the right new range, a Monday inside the neighbouring
block is genuinely **inert** rather than merely warned about, and the locked
state drops the calendar and the Move button entirely. The DB call was stubbed
for that via a temporary edit to `spcBlocks.js`, restored afterwards and
**md5-verified byte-identical**. Harness deleted; `git status` confirmed clean.

**Phase 3 — the calendar view — shipped the same day. No migration.** New
`components/coach/SpcBlockCalendar.js`: calendar weeks down the side, one bar
per session across, rendered by `CoachSpcOverview` — the phone view, which is
where coaches actually read this, and which also backs the native route and
the desktop **Preview** button.

**The desktop client page (`spc/[userId].web.js`) was deliberately not
touched.** The spec says the calendar "replaces the block grid", but that grid
is a *build* surface — copy mode, End here, click-to-open-the-builder — and the
calendar is a *read* surface. Rebuilding copy mode onto stacked bars is a real
rework of a 1372-line file with no way to click-test it from here, for no gain:
the desktop page already has a Preview button into `spc/overview/[userId]`,
which renders `CoachSpcOverview`, so the calendar is reachable at desktop width
anyway. Copy mode and End here survive by construction.

**The trap the spec warned about was real**: `CoachSpcOverview` mapped
`workout.status === "published" ? "done" : "missed"` — it was using the tile
states to mean *published / draft* and had never fetched a completion at all.
`listSpcCompletionDetailsForWorkouts` is now loaded in its own `.catch(() => new
Map())`, since a completions failure must degrade to "nothing finished yet",
never blank a block that is otherwise fine.

Five states, not four: the spec's `pending` / `done` / `pastOpen` /
`notWritten`, plus **`draft`** — a ghost that has something behind it, so a
coach can open it and see what's written. `notWritten` is a slot with no
workout row at all, which is why `slots` is `max(sessions_per_week, highest
session_number)`: taking it only from the written rows means an empty block
draws nothing, when "nothing is written" is exactly what it needs to say.
**The "past & still open" state renders with no action** — the "Do this week"
pill is phase 4, and a dead button is worse than none.

Two things worth knowing before touching the layout:

- **RN has no CSS grid, so the mock's auto-flow had to be reproduced by hand.**
  `packLines()` puts a full-width bar on its own line and lets consecutive done
  chips share one until their day slots collide — that is what makes a week
  "fill in left to right" instead of stacking two chips on two lines. It's
  exported and pure, same as `buildSpcCalendar`.
- **Yoga offsets an absolutely-positioned child by its parent's padding.** The
  today line is drawn over a container with no padding of its own, with the
  TODAY caption in normal flow above it — the first version put both inside one
  padded box and the line overflowed the bottom by exactly that padding.

**Deviations from the mock, both deliberate.** Its media query collapses the
day columns, the today line and the done chips' day placement below 620px —
i.e. the entire idea on the one surface that matters most. Measured instead:
with the week label stacked above the track, 390px leaves ~50px a column and a
done chip needs ~33px, so the seven columns are kept on the phone. And weeks
outside the ±2 scroll window get a quiet "Show all N weeks" expander rather
than being unreachable — "age out silently" is about not nagging, not about
losing the first half of a block.

**Verified for real.** `npm run build` + `check:routes` clean, a Babel parse +
unresolved-identifier + unused-import pass over both files, and the calendar
driven through a throwaway `app/zz-harness.js` at 390px and 1280px (deleted;
`git status` confirmed clean). Exercised: all five states, the done chips
sharing a line, the expander flipping both ways, a pending bar and a done chip
each reporting the right workout id on tap, and a ghost reporting nothing. The
timezone rule was checked with completions stamped in the Boise evening — a
UTC `.slice(0,10)` would have put all three chips on the following day, and
they land on Tue/Fri/Wed as intended. **Not verified**: anything behind a real
login, and none of it on native — the dashed bars are the thing to look at
there, since a fully-rounded dashed border can render solid on iOS (the states
carry redundant wording and colour for exactly that reason).

**Phase 4 — moving sessions — shipped the same day**, brought forward from
"later" because the calendar without it is a report rather than a tool.
**Migration `0101_spc_scheduled_week.sql` — run and verified live.**

**The split that everything else follows from**: `coalesce(scheduled_week,
week_number)` answers *which week is this session in*; the authored
`week_number` alone answers *which week is a completion or a log filed under*.
Conflating them files a completion somewhere nothing can find it, silently, and
you cannot tell from the outside. That is why `week_number` is never rewritten
(`session_completions` is keyed on it under a unique index) and why the print
sheet is deliberately left un-coalesced — paper prints the block as authored.

**The `weekNumber` parameter was the trap, and it was already being passed
wrong in two places.** `finalizeSpcSession` / `unfinalizeSpcSession` /
`getSpcCompletion` took the week from the caller, and `plan.js` and
`useHubBoard.js` both handed them the *displayed* week. Fine while nothing
could move; a live bug the moment something could. All three now resolve the
authored week off the workout row themselves (`authoredWeekFor`), and the
parameter is gone rather than deprecated — a param that must not be trusted
should not exist. Same fix applied to the `weekNumber` that rides along with
`spcWorkoutId` onto **log** rows (`plan.js`, `index.js`) and onto a hub slot
(`HubClientPickList` now takes the session's own week, not the client's
current calendar week).

Read sites coalesced: `listSpcWorkoutsForWeek` (the choke point for My Fitness,
My Week, `weeklyProgress` and `coachLogs` — one change covers all four),
`flags.js`'s `addSpcFlags` (a moved session isn't missed; one moved *in* is
genuinely due), the calendar itself, and `hub_startable_clients` in 0101, which
is what puts a make-up on the wall display. `trimSpcBlockTo` also clears a move
that would be stranded past the new end.

**Two clamps, not one.** A row-level CHECK can only say `>= 1` — the upper
bound lives on the parent block — so a `before insert or update ... when
(new.scheduled_week is not null)` trigger holds "a session stays inside its
block". The WHEN clause means ordinary builder saves, copies and bulk publishes
never pay for the lookup. `setSpcWorkoutScheduledWeek` checks the same bound
first so a coach gets a sentence instead of a constraint error, and writes
**null** when the target equals the authored week — so undoing a move leaves no
trace, matching the rule that the week a session came from shows nothing.

**Her own logging moves a session for free, with nothing written.** A `done`
bar is placed in the calendar week containing its `completed_at`, not in its
authored or scheduled week — so finalizing a week-2 session during week 3 lands
it in week 3, on the day she did it. No coach action, no member decision, no
RPC, no member write policy on `spc_workouts`. Falling out of this: a week can
legitimately have fewer bars than slots, and **a ghost is drawn only where
nothing was ever written for that slot** — a session authored there and moved
away leaves nothing, and a slot already holding a moved-in bar needs no ghost.

**Three files, because dnd-kit is DOM-only**: `spcCalendarModel.js` (pure, no
React), `spcCalendarParts.js` (the shapes), then `SpcBlockCalendar.js` (native)
and `.web.js` (drag). Neither platform file imports the other — a `.web.js`
importing its own sibling self-resolves and crash-loops. Web drags; native gets
long-press → a week picker, since a hand-rolled pan would need `onLayout`,
which cannot be verified from this environment at all (ResizeObserver never
fires in the preview pane). Both get the **"Do this week"** pill on a
past-and-still-open bar, which is ~95% of moves and needs no precision.

**Touch matters here and the sensor config is load-bearing.** `PointerSensor`
with `activationConstraint: { delay: 220, tolerance: 8 }` and
`touchAction: "manipulation"` — *not* `touch-action: none`. With a
hold-to-activate sensor the page must still scroll when a finger starts on a
bar, and this calendar is almost entirely bars. The delay is also what keeps a
short tap opening the session sheet.

**Real bug Terra caught live, worth remembering as a class:** dnd-kit's
`<DragOverlay>` renders `position: fixed` **and** subtracts the scroll offset of
every scrollable ancestor it finds. In this app the page scroller is a nested
RNW `ScrollView`, not the document (`app/+html.js` sets `body{overflow:hidden}`,
so every screen supplies its own). Measured: the card sat **exactly `scrollTop`
above the pointer** — invisible at the top of a page, badly wrong once scrolled,
while the drop target still followed the pointer correctly. Fixed by dropping
`DragOverlay` entirely for a preview portalled to `document.body` and positioned
from the pointer by hand, with the transform written straight to the node so a
`pointermove` never enters React's render path. **Any dnd-kit overlay in this
app is suspect for the same reason** — the document is never the scroller here.

**Verification**: migration dry-run in a rolled-back transaction (in-range move
ok, past-block-end rejected by the trigger, zero rejected by the CHECK, clear
ok) before applying, then column/constraint/trigger/function all confirmed by
query. 19 assertions against the pure model (moves leaving no trace, a
finalize-in-a-later-week landing on the right day, ghost suppression, the ±2
window, line packing, what is and isn't movable). And the drag driven for real
in a browser at 390px: hold-and-drag onto another week, the round trip back
clearing the move, a short tap still opening the session, the "Do this week"
pill, the native picker sheet, and the grab offset measured as a **constant
16px while scrolled 320px** — which is what proves the overlay fix. **Not
verified**: any of it behind a real login, and none of it on native.

**Still unbuilt from phase 4**: the member mirror on `plan-spc-block.js` (same
rows, no ghosts, no move affordance — hers is a record, the coach's is a to-do
list). Also known and deliberately not chased: the hub's *staging* path
(`hub_resolve_staged`) resolves by session number within the current week, so a
moved-in make-up can be started from the wall (0101 fixed that) but cannot yet
be pre-staged the night before.

## SPC simplification — spec locked, data layer live (2026-08-30)

**The whole SPC block model is being replaced.** Spec, locked with Terra
question-by-question over one session:
https://claude.ai/code/artifact/b53ad627-9a83-4c2b-acd7-c9d1bbe30639 — read it
before touching anything SPC. One sentence: a client has N session definitions
(edited live behind a deliberate **Update** button), an upcoming program built
invisibly in a second pane and **pushed** with a start Monday + length, and
statuses derived from the current run's end date. No per-week authoring, no
drafts-with-week-grids, no Block 1/2/3 — history is finished runs. This
supersedes the 4-phase calendar direction (phases 3–4 in local commit
`801b4ba` are not being finished; the commit should still be **pushed as-is**
— it carries a real completion-week bug fix and the 0101 migration file — and
the rework deletes the doomed UI on top).

Decisions worth not relitigating (each was asked explicitly): per-week
variation is gone entirely, changes are made on the fly not in advance; lapsed
runs keep showing to the member forever (better than a blank screen), the
roster just goes red; make-ups are real second **instances** of a session in
one week (member popup: "update it or start a new one?", coach can do the
same from the hub); a not-yet-pushed draft does NOT count as "on deck" for
statuses; **Due now** fires when the final week's expected sessions are all
completed (1x client finishing Monday goes red Monday) or the run has ended,
nothing queued — and an enrolled-never-programmed client is just red, pause
her to silence it; migration cutover happens **at a Monday boundary only**,
seeding each live client's new run from their current week's content; the
client page keeps its existing header (name/coach/frequency/goal hero/notes)
and right rail (Notes and Settings spaced apart) — tabs Overview / Sessions /
History / Print go in the main column. Design canvas comes before the UI
build (Terra runs it herself; the prompt was handed over 2026-08-30).

**What's live as of this session** (all verified, none of it user-visible
until format-aware UI ships — every existing block is `format='weekly'`):
- **Migration `0102_spc_sessions_format.sql` — run and verified.**
  `spc_blocks.format` (`'weekly'`/`'sessions'`, default `'weekly'` FOREVER —
  legacy writers incl. `scan-spc-alerts` insert without naming it, so a
  `'sessions'` default would mislabel their blocks); `instance` on
  `session_completions`/`exercise_completions` with the SPC partial unique
  indexes widened to include it; the three member read policies gain
  `block_start_date <= (now() at time zone 'America/Boise')::date` — an
  upcoming run is genuinely invisible, a lapsed one stays visible (no
  end-date gate, deliberate). **`logs` deliberately got NO instance column**:
  0073's unique-set index is what `logResult()`'s upsert infers against, and
  widening it would break every stale PWA tab's autosave mid-deploy — a
  same-day second instance of the same session shares that day's set rows.
  Dry-run caught a real test-validity trap: `dustin@kovastrength.com` is a
  COACH now, so impersonating him passes the staff policies and proves
  nothing about member RLS — use `test1@kovastrength.com` (member). Also hit
  a transient deadlock with live traffic on the first dry-run; `set local
  lock_timeout = '4s'` + retry is the pattern (an ALTER waiting on
  AccessExclusiveLock otherwise queues behind live reads and blocks new ones).
- **Lib primitives, all format-aware and inert for weekly blocks**:
  `schedule.js`'s `calendarWeekNumber()` (unclamped `currentWeekNumber` —
  floors at 1, never caps, verified over 7 cases incl. past-end weeks);
  `sessionCompletions.js`'s `spcCompletionWeek()` replaces `authoredWeekFor()`
  (weekly → authored week exactly as before; sessions → calendar week of the
  completion **date**, so backdated missed-session logs file under the week
  they happened — it accepts a bare `YYYY-MM-DD` without routing it through
  `new Date()`, which would shift it a day); `finalizeSpcSession` gained an
  `{instance}` option (default 1 = old behavior), plus new
  `startNewSpcSessionInstance()` and `listSpcCompletionInstances()`;
  `unfinalizeSpcSession` deletes the latest instance for the relevant week;
  `getCurrentSpcBlock` gained the lapsed fallback **gated on
  `format==='sessions'`** so no legacy client's months-dead block resurrects;
  `listSpcWorkoutsForWeek(blockId, week, block?)` returns all session rows
  for a sessions-format run (week doesn't filter), optional `block` param
  skips the format lookup; `createSpcBlock` takes `format` (sessions → one
  row per session, authored week 1); `publishSpcBlock` doubles as the
  sessions-format Push unchanged.
- Verified per house bar: dry-run + 3-assertion impersonation test as a real
  member (sees a current-dated run, cannot see a future-dated one, duplicate
  instance refused), post-apply schema query, `npm run build` clean, Babel
  parse/scope/unused-import pass clean, the `spc_blocks(format,
  block_start_date)` embed confirmed parsing via live PostgREST (200 `[]`).

**Design handoff arrived and the UI build happened the same day (2026-08-30,
later session)** — `design_handoff_spc_rework_v1/` (README + `.dc.html` + 9
screenshots; it arrived inside a zip named `SPC Coach Overview Redesign.zip`,
the SAME misleading name the exercise-library handoff used — check contents,
never the name). Read that README before touching any of this: it locks
terminology (**program** and **Publish** in every user-facing string, run/push
stay internal; no "Block 1/2/3" ever, finished programs are date ranges; no
em dashes in copy) and adds one concept the spec didn't have — **Ongoing
programs** (no end date, "runs until you set an end date"), built as an
active sessions-format block with `block_end_date` NULL (migration
`0103_spc_ongoing_programs.sql`, **run and verified** — relaxes 0089's
`spc_blocks_active_has_dates` for sessions format only). An ongoing program
never turns Due soon/Due now.

What shipped:
- **`spcState.js` v2** — FOUR derived states (`goodToGo`/`dueSoon`/`dueNow`/
  `paused`), Terra's completion-aware Due-now rule (final week's expected
  sessions all completed → red that day; `finalWeekDone` computed by the
  roster as SPC completions in the current Boise calendar week vs
  `sessions_per_week`), output now carries `clock` (date-derived meta line,
  independent of queue state) AND `reason` (the sentence). 11-case unit test
  against the shipped source passes. `monthDay()` exported (string ops, never
  `new Date()`).
- **Both rosters re-pilled**: `SpcRosterMobile` rows match mock 1e (pill
  beside name, red meta on Due now, reason sentence, "N need programming"
  header that deliberately EXCLUDES the never-programmed cohort so it doesn't
  read "53"); `spc/index.web.js` desktop table matches 1g (search + chips +
  coach compose, sortable CLIENT/STATUS, A–Z default replacing
  time-remaining, COVERAGE column gone, drifted `TONE_STYLES` deleted for
  `theme.statusColors`, CURRENT PROGRAM as date range). `getSpcRosterDetail`
  now sorts A–Z and returns `ongoing`/`thisWeekCount`/`enrolledAt`; both
  screens validate `?status=` params against `SPC_STATES` so old dashboard
  links with retired keys can't filter to zero rows.
- **The tabbed client page** — new `components/coach/spc/SpcClientPage.js`
  (frame both widths: desktop keeps identity row + goal hero + COACH NOTES +
  right rail with NOTES and CLIENT SETTINGS 36px apart; phone matches mock
  1b) + `SpcSessionsTab.js` (two panes desktop / Current-Upcoming sub-tabs
  phone; dirty-state Update bar batching sets/reps/rest commits; upcoming
  pane autosaves via the full builder with per-session Edit; Copy current
  program; + Add session; frequency-bump "+ Build Session N" dashed card;
  "+ Add a week" and the Ongoing toggle writing through new
  `setSpcProgramEnd()`; Publish modal per mock 04 — three Monday options with
  the clean hand-off default, weeks 4/5/6/8, live-recomputed summary
  including the shortens-current warning). Overview tab matches mock 02
  (status banner, This week chips, week-by-week timeline, queued upcoming
  card, recent PRs, last session); History = finished runs with logged
  counts; Print lists sessions → the existing print route.
  **`[userId].web.js` branches**: `hasLiveWeeklyWorld()` (live/queued/draft
  weekly block) keeps the legacy page until cutover; everyone else — including
  the 51 never-programmed and lapsed-weekly clients — gets the new page. The
  native route (`spc/[userId].js`) still renders `CoachSpcOverview`,
  deliberately untouched (everyone's on the PWA; also `SpcClientPage`'s
  desktop rail uses raw `<select>`, which would crash native at tablet width).
- **Member side**: `MakeupSessionSheet` (mock 1f) wired into My Week's
  `openSpcPreview` — an already-logged sessions-format session asks "update
  it or start a new one?"; Start a new one calls
  `startNewSpcSessionInstance()` up front (the instance exists immediately —
  her week counts it, and the logging screen's date derives from its
  completed_at) then deep-links to My Fitness. `finalizeSpcSession` now
  defaults to the week's LATEST instance (uniformly right for first
  finalize / re-finalize / post-make-up). **Both member SPC loaders
  (`index.js`, `plan.js`) branch to `calendarWeekNumber` for sessions-format
  blocks** — the clamped legacy math stops matching completions the week a
  run outlives its planned length.
- **`publishSpcBlock` gained `{lengthWeeks, ongoing}`** and, for
  sessions-format publishes only, SHORTENS an overlapping current program to
  end the day before the new start (`endProgramsBefore`; the modal sentence
  is the confirmation, per the handoff's open question 2). Weekly publishes
  keep refuse-on-overlap. `assertNoOverlap` treats a NULL end as forever.
- **`scan-spc-alerts` v18 deployed** (`verify_jwt: false` confirmed): it now
  SKIPS sessions-format and null-end blocks entirely — without this it would
  have drafted a weekly grid behind a new-model client's ending run, flipping
  their page back to the legacy view. The due-soon/due-now status push it's
  supposed to become is still TODO.
- Small additions: `confirmRemoveLift`/`confirmOpenLiveEditor` (the full
  builder autosaves, so opening it on a LIVE session gets one honest
  warning), `listSpcWorkoutsForBlocks`, `addSpcSessionSlot`,
  `listSpcCompletionInstances`.

**Verified**: `npm run build` + Babel identifier pass clean throughout; the
Overview tab, publish modal (both the clean hand-off and the
shortens-current recompute, checked via DOM text), make-up sheet, roster rows
(all four tones) and Sessions empty states were all driven for real at 390px
through a throwaway `app/zz-harness.js` (deleted, tree checked). **Two real
bugs the harness caught that a clean bundle did not**: iterating a Map in
`countForWeek` yields entries not keys (`key.split is not a function` — the
AppErrorBoundary surfaced it beautifully), and **PressFade must NEVER be
handed a style array** — it spreads its style prop, and a spread array
becomes indexed keys that crash RNW's CSSStyleDeclaration ("Failed to set an
indexed property [0]"). Em-dash sweep done over all new user-facing copy per
the handoff rule. **Not verified behind a real login** — standing limitation.

**The cutover happened the same day (2026-08-30, later session) — every SPC
client is on the new model now.** Two more migrations, both run and verified:

**`0104_hub_sessions_format.sql`** made the two hub RPCs format-aware. They
resolved a session by matching a workout row's week against a computed current
week — exactly right for a weekly block, meaningless for a sessions run whose
rows are all authored week 1, so a converted client could not be put on the
board at all. Both now branch on `spc_blocks.format`:
- **Weekly is byte-identical**, and that was *proved*, not asserted: the dry run
  snapshotted the full result set of both functions before and after inside one
  rolled-back transaction and diffed them in both directions (0 rows changed
  for every client whose block is weekly-or-null, 0 staged rows changed).
- **Current-block resolution for sessions format mirrors `getCurrentSpcBlock`**
  — a null end date covers today (ongoing, 0103), and when nothing covers today
  the most recent run still counts (lapsed runs keep running, so a lapsed client
  must stay startable at the wall). It deliberately takes the most recent active
  block of ANY format and then requires it to be sessions-format, exactly as the
  JS does: a finished weekly block has genuinely finished.
- **The week each session hands back is the CALENDAR week, not the authored 1.**
  This is the load-bearing bit: the caller passes that value to
  `markSpcExerciseComplete`, and a sessions run files under the calendar week —
  handing back 1 would file the wall's per-exercise ticks in week 1 while the
  member's own phone read them out of the current week, and the two surfaces
  would silently disagree about what she had done. Session *finalize* is immune
  either way (`finalizeSpcSession` resolves the week off the row itself).
- **Real bug the dry run caught**: `select distinct user_id from sc` inside
  `hub_resolve_staged` is ambiguous against that function's own OUT parameter of
  the same name. Alias it (`sc.user_id as uid`).

**`fetchHubBoard`'s `finalized` had the mirror-image bug** and is fixed in the
same commit: it asked whether a completion exists *at all*, which is only the
same question as "this week" while the workout row is unique to its week. For a
sessions run it would have read as finalized forever after week 1. Now scoped
via a local `completionWeekFor()` (deliberately a local rather than importing
`spcCompletionWeek`, which does a round trip to fetch a row this function
already holds — the board polls every 3 seconds).

**Coach-side make-up from the hub** (Terra's locked ask): picking a session she
already logged this week opens a centered dialog — "Put that session on the
board" vs "Start a new one" (`startNewSpcSessionInstance`). Gated on a new
`allowRepeat` prop, passed by the three surfaces where the board is about to run
and deliberately **not** when staging a future group, where a new instance would
be filed against today's week. A `repeatAnswered` set stops deselect-and-reselect
quietly creating instances 3 and 4.

**`0105_spc_sessions_cutover.sql` — the cutover itself.** The rule from the
spec: *the current week becomes the truth*. Two shapes, decided per block by W,
its current week:
- **W = 1** (block started this Monday) — convert in place. Flip the format,
  delete the not-yet-reached `week_number > 1` rows, keep the block id, its
  dates and every completion.
- **W > 1** — a new run R starting this Monday, seeded by copying week W's
  content as week 1; the old block B is trimmed to end the day before and
  survives as the history of weeks 1..W-1. **Copying week W back onto week 1 in
  place would have silently rewritten the completions already filed against
  weeks 1..W-1**, which are keyed on the authored `week_number` — that is the
  whole reason for the second shape.
- Queued (future-dated) and draft weekly blocks convert in place.
- **Finished blocks are untouched.** History is a record of what she actually
  did, week by week; rewriting it would be rewriting the past. So ~10 weekly
  blocks remain and that is correct — the post-condition to check is
  `format='weekly' and (status='draft' or block_end_date >= today)` = 0.

**Three things move with her on the W > 1 path, and the third is the easy one to
forget**: `session_completions` for week W, `logs` from Monday onward, and
**`exercise_completions`** — which hang off the copied `spc_workout_exercises`
rows, not off the workout, so they need a per-lift old→new id map (the copy
loops one exercise at a time for exactly this reason; warm-ups don't, having no
completion of their own). Miss any one and a woman who trained on Saturday opens
the app on Sunday to a week that has reset itself.

**How it was verified, and this is the pattern worth reusing for any data
migration**: beyond the usual dry-run-then-apply, a second rolled-back run
snapshotted *per client* what this week looks like computed with the OLD rules,
ran the migration, recomputed the same question with the NEW rules, and required
equality — session numbers, statuses, per-session exercise and warm-up counts,
completions with their instance numbers, tick counts and log counts. **All 18
came out identical.** That invariant ("her current week does not reset") is the
actual requirement; counting rows moved is not.

Live outcome: 49 blocks converted in place (181 stale week rows dropped), 9 new
runs (17 sessions copied, 4 completions / 84 logs / 24 ticks remapped), **0
skipped**, 0 weekly blocks still in play, 0 sessions rows off week 1, and all 18
live clients resolving to a sessions run starting 2026-08-24. Rollback data is
in `programming.zz_blocks_backup_0105` / `zz_completions_backup_0105` /
`zz_logs_backup_0105` / `zz_exercise_completions_backup_0105`, plus
`zz_cutover_0105_log` which records per block what happened and the old→new run
mapping. All five have RLS enabled and grants revoked (the 0099 lesson: a plain
`create table as` lands in an exposed schema with no RLS).

**`hasLiveWeeklyWorld()` is now false for every client**, so everyone gets the
new tabbed page. Verified by query, not assumed.

**Still TODO** (none of it blocking; nothing here stops a client training):
1. Print route: a sessions-format run prints one week column; it should print
   the run's weeks. `plan-spc-block.js` (member "View full SPC block") likewise
   shows one week — degraded, not broken.
   **Member half DONE 2026-09-14.** It was worse than "degraded": members could
   not see or open any week they had already trained, which Terra reported as
   "they can only see an overview of the sessions, not their previous ones."
   The page now expands a sessions-format run into one card per calendar week
   (start through end date, or through this week for an ongoing/lapsed run),
   every session in every week, everything keyed on (workout, week) the way
   `spcBlockDetail.js` does it for the coach. Three week-1 traps fixed with it:
   the sheet's logged sets are cut to that week's date window
   (`listLogsForSession` has no week filter and returned every week's sets);
   "Update this session" hands My Fitness the calendar week rather than the
   authored 1 (it had always opened week 1 or the live week); and a back-logged
   completion is filed in local state under the week of the picked date, since
   `finalizeSpcSession` files it there. Ongoing programs drop "of N" from the
   hero. Weekly-format blocks take the old path unchanged. Verified:
   `npm run build` + `check:routes`, Babel parse/scope/unused-import/
   missing-export pass. **Not driven behind a login.** Print route still open.
2. `coachDashboard.js`'s `spcIssues`/attention items still use the old taxonomy
   internally; align with `deriveSpcState` v2.
3. The scan's replacement due-soon/due-now coach push (one per status change,
   wording identical to the Overview banner).
4. **Dead code, delete only after Terra's click-through**: the legacy branch in
   `spc/[userId].web.js` and everything it reaches — `CoachSpcOverview`,
   `spc/overview/[userId]`, `spc/history/[userId]`, the Move/Send/
   NewSpcBlockChoice modals, extend/trim/rolling. Unreachable as of the cutover
   but deliberately left standing until she has confirmed the new page.
5. The `zz_*_0105` backup tables can be dropped once the model has run for a
   while without incident.

## Ongoing programs broke every screen that reads a block (2026-08-30)

Reviewing a staged group showed **"invalid input syntax for type date:
null"** on one client's page. Three separate bugs, no migration.

**`.lte(col, null)` is not a no-op — it is an error.** supabase-js
serializes it as `date_performed=lte.null` and Postgres rejects it (22007).
`listBlockLogs` (`spcBlockDetail.js`) already guarded a null START date for
drafts; 0103 then made `block_end_date` nullable for an **Ongoing** program
and nobody added the matching end guard. Reproduced against the live
endpoint before touching anything and again after — the old shape 400s, the
new one 200s. **Worth generalising: any range filter written against a
column that later became nullable is a live bug, and it fails loudly at
runtime while `expo export` stays clean.**

Only one ongoing program existed, which is why only her page failed — but
this runs through `getSpcBlockDetail`, so it would have hit the SPC roster
preview, the board's Block overview and the client page for anyone set to
Ongoing.

**A drifted third copy of "which program is she on".**
`getSpcSessionPreview` rolled its own block picker testing `today <=
block_end_date` — false for null, so an ongoing program never matched the
covering branch and lost outright to any program queued behind it. It reads
the shared `resolveClientPrograms` (`spcState.js`) now, whose own comment
already records that the client page and the roster used to disagree "for a
third of the roster". That made **three** copies; the newest was the stale
one. Verified by running the real shipped resolver against her actual rows,
including the queued-program case the old code got wrong.

**A sessions-format run has no per-week status row.** The draft banner did
`statusByWeek[targetWeek]`, and all **84** sessions-format workouts sit at
week 1 (0105) — so any group staged into week 2+ of its run reported every
client as an unpublished draft. That is precisely the case staging exists
for (`targetDate` is there because a group staged for tomorrow can sit the
other side of a week boundary). The session row's own flag answers for every
week now, behind a `sessionsFormat` flag from the data layer.

**Two bugs on the staged card itself, one of them dangerous.**

- **Edit did nothing, every time.** `setIdleTab("stage")` looked right and
  could never win: `idleTab` is only ever compared against `"start"`, so
  anything else falls through to `leftKey` — which is `"staged"` whenever a
  group exists, i.e. always when you are editing one. It opens the staging
  **detour** (`stagingAside`) instead, which already had the seeded picker.
  A state key that is never read is invisible to the bundler, to the scope
  pass and to a screenshot; the only way to catch it is to trace what
  actually consumes the value.
- **Delete worked, but left the edit behind it.** Nothing cleared
  `?staging`, so the picker that appeared after a delete came up seeded with
  the deleted group behind a **"Save changes"** button that would have
  written to a row that no longer existed. Every exit from an edit
  (back link, Start now, delete) goes through one `clearEditing()` now, and
  `StagedSessionsCard` takes an `onDeleted` so the screen above can drop a
  group it was holding.

Reported as "delete seems to open the edit screen": it was the left segment
legitimately re-becoming "Stage a session" once the last group went, with
the stale seeding on top. That segment behaviour is the documented design
and was left alone.

**Still open, all in the SPC-model rework's territory rather than this
fix's**: `sessionState` calls a sessions-format run "skipped" once week 1's
calendar window passes; `flags.js` and `coachDashboard.js` carry the same
`today <= block_end_date` test, so an ongoing program is invisible to
missed-session flags; and an ongoing program still displays "Week 1 of 3"
despite having no end.

**Verified**: both query shapes curled against the live endpoint, the real
resolver run against her three real rows across four dates, the week-1
assumption confirmed across all 84 rows, `npm run build` + `check:routes`
clean, and a Babel parse + unresolved-identifier + unused-import pass over
all five files. **Not click-tested** — `live.js` needs a coach login, so the
Edit/Delete flow is reasoned from the render path, not driven. Worth Terra's
pass: Edit → seeded picker → Back, then Edit → Delete.

## A workout id stopped meaning a week, and two screens hadn't noticed (2026-08-31)

Reported as two things on the gym-floor board: a client in week 2 showed
every lift already ticked with a COMPLETE pill, and her "last time" strip
said *First time this block* — while her own phone showed last week's sets
fine. Both are one bug, and the coach's own framing ("they're the only 2 gals
I've coached on week 2") is its exact fingerprint.

**The root cause, which is a CLASS and not one query.** Under the weekly model
a `spc_workouts` row was one (block, week, session), so the workout id *was*
the week and any read could ignore `week_number`. Since the 0105 sessions
cutover that is false: one row spans the whole run, every row authored week 1,
and the week lives on the completion / note / log instead. Every read still
keyed on the workout id alone is therefore correct in week 1 and wrong from
week 2 forever after. **Whenever something SPC reads right in week 1 and wrong
later, this is the first thing to check.**

**The writers were all fine.** `spcCompletionWeek()`,
`listSpcExerciseCompletionsForItems`, `getCompletedSpcWorkoutIdsForWeek` and
`listSpcCompletionDetailsForWorkouts` are all week-aware and even document why
— which is why the member app was never affected. Swept every direct read of
`session_completions` / `exercise_completions`: only the two surfaces below.

**The live board** (`lib/programming/hub.js`, commit `40c12c8`) — green ticks,
the COMPLETE pill and "this week's note" all matched on the workout id, so
week 1's leaked forward. History was worse: `getLiftBlockHistory` fetched the
block's workouts and excluded "the one on screen", which under this format is
the only one, so it returned `[]` before ever querying a log.
- `fetchHubBoard` now resolves a `completionWeek` from the block the way
  `spcCompletionWeek` does and filters on it. **That wires in
  `completionWeekFor()`, which was dead in every commit it ever existed in** —
  this file previously claimed it was the fix for the `finalized` bug; it never
  was. Worth distrusting a note that says a helper is wired in: `grep` for a
  call site.
- The tick WRITE now uses that same resolved week, not the slot's stored one,
  so a board open past Boise midnight can't write to one week and read from
  another.
- `getLiftBlockHistory` groups on **(workout, week)** rather than the workout,
  resolving each logged day to its calendar week — which also keeps two
  sessions that share a lift apart, as the old grouping did by accident.
- **Nobody could clear the stale state either**: un-tick and un-finalize
  resolve the week themselves, found no week-2 row to delete, and the 3s poll
  put the checks straight back. A "stuck" control is worth tracing to the
  read/write week disagreeing before assuming the write is broken.

**The shared note store** (`lib/programming/coachingNotes.js`, same commit) —
`isSameSession` had the identical assumption **stated in a comment as fact**
("the workout id alone identifies the week... matching what the hub board
already does"). This one also reached the member's own lift card: week 1's note
seeded this week's box, and the real "here's what was said last time" line
never appeared. Fixed behind a `session.weekNumber == null` fallback so an
older caller keeps its note rather than losing it.

**The SPC client page** (`lib/programming/spcBlockDetail.js`, commit `4ca8e59`)
— same cause, and the bigger visible one: it built one grid entry per workout
row, so a four-week block drew a single **"Week 1"** line. Victoria Farrell did
session 1 on Aug 27 and again on Aug 31 and her page reported one arbitrary
date, **35 sets** (both weeks summed), and that session logged in every week.
A started sessions-format block is now **expanded into one entry per calendar
week** — the shape both screens were always built for and the shape a weekly
block still arrives in naturally, so nothing downstream needed teaching about
two models. That also settles the separately-known `sessionState` bug (it read
week 1's dates for every entry, so the rest of a block turned "skipped" the
moment week 1's window passed) and brings back **"End here"**, which needs a
row per week to sit on.
- A **draft** has no dates and is left unexpanded, keeping the send-a-draft
  preview a plain list of sessions.
- **Copy-between-tiles is withheld while expanded**: every week of a session
  shares one prescription now, so there is nothing to copy from week 1 into
  week 2 and the ⧉ would select every week at once. Each entry carries a `key`
  (`workoutId:week`) because several now share an `id` — the read-out's
  prev/next compared on `id` and would have walked back to the first week
  every step.

**Verification worth copying.** Both fixes are read-side only — no migration,
no deploy step. Beyond a clean `npm run build` and a Babel parse/scope pass:
every new PostgREST select was curled (200, not a PGRST200), and the real
question — *can week-scoping hide something legitimate?* — was answered against
live data rather than reasoned: all **159** sessions-format completion and note
rows agree with the week their own date implies, all **13** weekly-format
completions carry exactly their workout's own week (so the composite key can't
miss them), and all **57** dated blocks agree on derived weeks vs
`block_length_weeks` (so the grid and End here can't disagree). The shipped
`weekCountFor`/`weekWindow`/`sessionState` were then extracted verbatim and
driven against Victoria's and Emma's real blocks — 4 week rows each with its
own date and state, and an ongoing program stopping at the week it is in rather
than inventing a length.

**Blast radius when found**: 8 clients showing stale weeks that day, 17 already
at week 2, growing weekly. **Not click-tested behind a login** — standing
limitation. Worth Terra's pass: a week-2 client on the board (checks clear,
history strip shows last week), and a multi-week block's grid on the client
page.


## "Off" stops meaning "paused"; the dashboard stops crying wolf (2026-08-31)

Three reports, one migration (`0108`, applied and verified live).

**The SPC switch on a client's detail page wrote `status='paused'`, and
paused clients belong on the SPC roster.** So switching someone off left her
sitting there indefinitely, labelled as though she were coming back — which
is the opposite of what paused is for ("on hold, don't program her right
now" is a reminder a coach *wants*). A third value, **`inactive`**, splits
them: `getSpcRoster` and `getSpcRosterDetail` both exclude it at the query,
so it can't be forgotten per screen.

- The row is kept rather than deleted, and that is load-bearing:
  `spc_blocks.spc_client_id` references `spc_clients(user_id)` **on delete
  cascade**, so deleting the row would take every program she has ever been
  written with it.
- `isSpcActive()` (the member-facing gate) becomes `status === 'active'` —
  the same answer it gave before for both existing values. New
  `isSpcEnrolled()` is the coach-facing question, and the two are used
  deliberately differently on the client detail page: enrolment drives the
  switch, the frequency control and the SPC link; **active** drives the
  membership pill, the current-block row and the weekly session target.
- `SPC_ENROLLMENT_LABELS` deliberately still holds only active/paused — that
  select is the choice a coach makes *between*, once someone is an SPC
  client. Turning SPC off entirely is the switch on her client page, and
  offering it in two places is how a third half-state appears. The SPC page
  does handle arriving at an inactive client by direct link (a line, not a
  blank select), and `deriveSpcState` maps `inactive` to the paused shape so
  it can't shout "Due now" about someone nobody signed up.
- **Backfill: all four paused clients became inactive** (Terra's call). Until
  0108 the client-detail switch was the only way most people reached
  'paused', so the existing data means "switched off" far more often than
  "on hold". Prior values in `programming.zz_spc_status_backup_0108` (RLS on,
  grants revoked — the 0099 lesson).
- **The wall display's picker asked "not paused"**, which lets an inactive
  client straight through. `hub_startable_clients` is re-created verbatim
  from `pg_get_functiondef` with that one predicate flipped to
  `c.status = 'active'`, and the dry run diffed its full output before and
  after inside a rolled-back transaction: **61 rows, 0 lost, 0 gained.**

**Dashboard attention rows: 7 SPC alarms where 1 was real, and the cause was
a second definition of SPC state.** `coachDashboard.js` rolled its own —
"an unsent draft row exists" plus a days-until-end-vs-lead-time reckoning —
which had drifted hard from `deriveSpcState`. It fired for a client on an
**ongoing** program, for a **paused** client, and 26 days ahead of a program
with a month left, all on the strength of stale drafts left behind by
programs since published. Now `getSpcRosterDetail()` feeds it and the whole
predicate is **`nextStep === NEXT_STEP.publish`** — paused resolves to
`resume`, ongoing and queued-next both resolve to `none`, never-programmed
resolves to `start` (still excluded, same call 0084 made for the hub
picker). `spcNeedsNewProgram` and `spcIssues` are the same array now; they
were two overlapping ones, so a client could appear twice. A started draft
became context in the subtitle rather than the trigger. Verified by
extracting the shipped `deriveSpcState`/`resolveClientPrograms` and running
them against all 73 real roster rows: **6 rows, every one genuinely inside
its final week with nothing queued** — and it now catches those six, which
the draft-keyed version missed entirely. This closes the follow-up the SPC
rework left open ("align spcIssues with deriveSpcState v2").

**"LLYL is ongoing but still appearing" — `getGroupProgramDashboard` never
read `auto_extend`.** A rolling group block is grown a week at a time by
`scan-spc-alerts` nightly (it handles group rolling blocks in the same pass,
deliberately — group has no scan of its own), so "block ends in 6 days,
nothing queued to start after it" was the setting working, raised as an
alarm every day forever. It now returns `rolling` and the gap row filters on
it. **Group "ongoing" is `auto_extend`; SPC "ongoing" is a null
`block_end_date` (0103) — two different mechanisms, one word.** Coaches call
both ongoing, so the group control is relabelled from "Rolling" to
"Ongoing".

**And it was invisible.** The only place a coach could tell was the Ongoing
switch — which does not even live on this page; it is on **Block history**
(`blocks/history.js`, which lists every block, not just retired ones). Three
changes:

- The desktop block band carries an `ONGOING` pill instead of `RUNNING`,
  reads "07/27 → no end date · 6 weeks so far", and swaps "N days left in
  block" for "Ongoing — a week is added automatically".
- `CoachBlockOverview` (the phone/preview view) renders an olive note
  **directly under the current week card**, which is where a coach is
  looking when the question comes up, with a fallback at the end for a block
  that has no current week to hang it under.
- **The weeks an ongoing block hasn't grown into yet get a real panel**
  (`OngoingGapPanel`), not the dashed empty box a genuine gap gets. Those two
  were rendering identically, so the one program deliberately set to run
  forever looked exactly like the one nobody had scheduled anything for. It
  is the opposite of a gap: nothing is missing and there is nothing to do.
  Filled olive, infinity mark, the program named, and a link to Block history
  because that is where the switch to stop it actually is. A first pass also
  listed the upcoming weeks as ghost chips; Terra had them removed, so the
  panel is the statement alone.
- **The band no longer repeats "N sessions a week"** in its subtitle. The
  SESSION 1 / SESSION 2 column headers sit directly below it and already say
  so.

**Standing copy rule from this session: no em dashes, anywhere she reads.**
Her words: *"I never want em dashes. total ai sign."* Split the sentence, use
"so"/"and", or use the separators this app already has (`|` on member
screens, `·` on coach screens; `–` for an empty value). Saved as
[[feedback_never_use_em_dashes]]. There are ~306 pre-existing em dashes in
user-facing strings across ~137 files, flagged to her and not swept, since a
bare "—" placeholder needs a different fix from prose.

**Verified**: migration dry-run in a rolled-back transaction (plus the hub
function output diff above) before applying, then constraint/counts/backup
RLS/function body all confirmed by query; `npm run build` + `check:routes`
clean; a Babel parse + unresolved-identifier + unused-import pass over all
12 touched files; the attention rows simulated against real data; and all three
ongoing surfaces driven and screenshotted at 1280px through a throwaway
`app/zz-harness.js`, the gap panel at both a wide and a narrow grid width
(deleted afterwards, the `BlockBand`/`OngoingNote`/`OngoingGapPanel` exports
reverted, `git status` confirmed clean). **Not verified behind a real login** —
standing limitation. Worth Terra's pass: Addyson gone from the SPC list, the
dashboard down to the six real SPC rows with no LLYL row, and the ongoing
note on LLYL.

## SPC History: lifts, not just finished programs (2026-08-31)

Reported as "the History page only shows completed programs... i need to be
able to see the history of each lift." Both readings of "history" are real
and only one was there, so the tab is a two-way segment now: **Lifts**
(default) and **Programs** (the previous list, unchanged). No migration, no
new query on page load.

New `components/coach/spc/LiftHistory.js`. Every lift she has logged,
newest-logged first, with search, PR count, last set, best and session
count; tapping one expands **in place** into the trend chart, the best set,
and every session set by set with its note. A summary line would hide
exactly the case a coach is looking for, where the last set dropped off.

- **It costs no extra fetch on load.** The page already calls
  `getExerciseStats` for the Overview's PR strip, so the list is that data
  rendered a second way; only the per-lift detail is fetched, lazily, on
  first expand (`listLogsForExercise`, the same read the member's own
  history screen does) and cached per lift so flipping between two lifts
  does not refetch.
- **Nothing here is SPC-scoped, deliberately.** `programming.logs` carries
  no program reference, and a coach asking how a lift has moved wants every
  rep of it, not the slice inside one program.
- **`statsError` is now its own state.** It was `.catch(() => setStats(null))`,
  and null also means "still loading" - a failed fetch would have left the
  Lifts tab on a spinner that never resolved. `loadStats` also no longer
  clears `stats` first: `load()` re-runs on every focus, and blanking the
  list to a spinner each time is worse than showing the previous answer.
- **Husk rows are filtered out** (`reps` and `weight` both null). `logResult`
  updates an existing row even to null on purpose, so a set she typed into
  and cleared leaves a real row behind; a date with nothing real in it drops
  out entirely rather than rendering as a session of dashes. Same guard
  `ExerciseHistoryModal` and My History already apply, applied here too.
- **`LiftProgressSection` gained an optional `width`.** Its window-derived
  default (`min(windowWidth - 40, 560)`) overflowed the panel at phone width
  and clipped the last x-axis label. It is measured with `onLayout` now,
  behind a fallback sized to the narrowest real container - which is also
  the only value a preview browser ever sees, since react-native-web
  implements `onLayout` with a ResizeObserver and **ResizeObserver never
  fires in the sandboxed Browser pane** (re-confirmed this session: 0
  callbacks in 900ms). Verify the fallback, not the measured path.

`HistoryTab` is exported for the harness, same as `OverviewTab`.

**Verified**: `npm run build` + `check:routes` clean, a Babel parse /
unresolved-identifier / unused-import pass over all three touched files, and
the whole thing driven for real at 1280 and 390 through a throwaway
`app/zz-lifthist.js` route (deleted; `listLogsForExercise` was stubbed for
it and the file restored md5-identical afterwards) - expand, accordion
close, search including its no-match state, "Show all 12 sessions", the
reps-only lift dropping its weight column and its chart, the husk set
dropped from a session of three rows, both segments, and the error state
retrying back to a real list. **Not verified behind a real login** -
standing limitation.

## Alternate programming: one session, or sessions across weeks (2026-09-01)

Away/travel programming, asked for as "assign a week at a time". The design
turned on one thing worth not relitigating: **what a template is FOR and how
it gets assigned are two different axes.** Terra's own objection to the first
framing was that a trial session and a "welcome week" are not away
programming and must not be labelled as such, and a welcome week turned out
to be a **single session** despite the name. So a template's CATEGORY names
the purpose and the assign SHAPE is chosen separately. Buttons named
"one-off" and "away" would have meant assigning a welcome week through Away,
which is the same naming problem one level down.

**One-offs (0008) are completely unchanged. This is an addition.**

**Migration `0110` (run and verified).** `programming.template_categories`
replaces `workout_templates.category`'s two-value CHECK (the old text column
is left populated as the rollback path, per the 0095 convention);
`alternate_programs` / `alternate_sessions` / `alternate_warmups` /
`alternate_exercises`; and the completion tables widen from three session
types to four. **ONE alternate_sessions row per session for the whole run,
not one per (session, week)** - a week is a repeat, which is the shape SPC's
sessions format landed on in 0105, and it is why alternate completions carry
`week_number` where one-off completions don't.

**Migration `0112` is NOT run and must not be until the app deploys.** See
the index lesson below.

### The production break, and the lesson

0110 originally widened `logs_unique_set_idx` to include the new column. It
had to: two different away sessions logged on one day for the same lift and
set would otherwise collide. **Applying that broke production immediately.**
`logResult()` is a hybrid - a hand-rolled select-then-update, and on the
insert branch a real `ON CONFLICT` upsert **naming that index's nine columns
explicitly**. Postgres resolves a conflict column list against an index with
exactly those columns, so a ten-column index makes every already-loaded
browser tab fail `42P10` on its next new set. Confirmed by running the old
spec against the new index (it raised 42P10) rather than reasoning about it.
The index was restored within about eight minutes.

Three durable consequences:
1. **`logResult` is index-agnostic now.** Plain insert; a 23505 falls back to
   re-reading with the same session-scoped lookup and updating. The race
   guard 0073 added is preserved without naming a column list, so the index
   can change again with no coordinated deploy.
2. The widening moved to its own migration (`0112`) whose header states the
   ordering requirement.
3. **General rule: never widen a unique index that an `ON CONFLICT` column
   list names, in the same step as anything else.** A CLAUDE.md note claiming
   `logResult` was "hand-rolled, not ON CONFLICT" was stale and is what made
   this look safe. Grep the actual write before trusting a note about it.

### Decisions, all taken with Terra explicitly

- **Both programs show.** Her normal Flagship/SPC tile stays the whole time;
  it just cannot be reported missed. Not a replace.
- **The name is the coach's**, defaulting from the category, so a run reads
  "Italy trip" or "Welcome week" and never says away unless she typed it.
- **Missed-flag pausing is a checkbox per assignment**, ticked by default,
  not a property of the category (a deload happens while she is still in the
  gym).
- Away sessions themselves never flag, in either direction.
- Same sessions and same numbers every week; unfinished sessions stop showing
  on the end date; any client, not just SPC.
- **Start snaps to a Monday.** My Week renders Mon-Sun, so an offset run would
  straddle two of them and "Week 2 of 3" would disagree with her own screen.
  Enforced by a CHECK, same style as 0063.

### Where the shield lives

`lib/programming/flags.js` is the single place missed sessions are computed
for group and SPC, feeding the Clients roster Needs column, the flag pills
and the client detail's Current/Behind. Each flag now carries a **`checkDate`**
and `dropFlagsShieldedByAlternatePrograms` matches **per flag, not per
client** - the group scan is about this week, the SPC scan about the week
that just ended, so a client back on Monday must lose last week's SPC flag
while keeping this week's group one. The member's own block page
(`plan-block.js` + `BlockWeekCard`) has its own separate count; an away week
gets a **new quiet `away` tone naming the run**, deliberately NOT relabelled
"Complete" - she genuinely did not do those sessions.

### Files and surfaces

Library moved `app/(coach)/spc/templates/*` to `app/(coach)/templates/*` with
its own `_layout.js` Stack (the exercises/merge lesson: a folder with several
routes leaks as native tabs without one) and its own nav item; `vercel.json`
rewrite updated, `check:routes` gates it. `components/AssignOneOffModal.js`
deleted, superseded by `components/coach/AssignAlternateModal.js`.
`useFitnessAccess`, `plan.js`'s not-assigned early returns and My Week's
`hasTraining` all had to learn about away runs, or a member whose only
training is a travel week is told she has no program.

### Verification

13 RLS/constraint assertions in a rolled-back transaction then applied; 17
date-helper cases against the shipped source; 9 shield cases against the
shipped `dropFlagsShieldedByAlternatePrograms` with its query stubbed; and
**17 end-to-end assertions driving the real `assignAlternateProgram` against
real templates on the live database** (content copied verbatim, overlap
refused by name, per-week completions independent, delete cascades), cleaned
up after and confirmed zero rows left. Assign modal and all three week states
driven in a browser at 390px. `npm run build` clean. **Not verified behind a
real login.**

**Worth reusing: driving the shipped lib against the live DB with the service
role key** (`supabase projects api-keys`, pick `service_role`) by loading the
module source and injecting its `programming` client. That is what proved the
template copy is correct rather than assuming it. Run the script from the
repo root so `@supabase/supabase-js` resolves.


## A logged session that was never finalized (2026-09-02)

Terra: "I am struggling without being able to see a client's sessions... if
someone forgets to finalize, I can't see how many they have done." Four
commits, **no migration** — every fact needed already existed.

**The premise to keep**: `programming.logs` has carried `spc_workout_id` +
`week_number` since **0063**, stamped from the first keystroke, and that
migration's own header says why it is not a reference to
`session_completions`: *"a completion row only exists once the member taps
Finalize, but autosave writes logs continuously."* So the log row IS the
record and the completion is the confirmation. Nothing read the logs back as
evidence, so every coach surface treated a forgotten tap as a no-show. On the
day this was built, four clients had 14-18 sets against a session their page
drew as empty.

**Do not "fix" this with an auto-finalize or a nightly scan.** Both were
considered and rejected: neither can tell a finished session from an
abandoned one, and a coach looking at the sets can. Auto-finalize also
collides with the celebratory finalize on the live board (`c5bc2fa`) — it
would fire confetti mid-keystroke and then un-fire on a typo fix.

- **`lib/programming/spcSessionActivity.js`** is the single definition:
  `STARTED_SET_FLOOR = 2`, `isLoggedSet`, `sessionActivityState`,
  `activityKey`, `listSpcSessionActivity`. Three surfaces ask "has she
  started this"; three copies would drift the way five copies of `daysBetween`
  ended up with three rounding rules. **Two sets in the SESSION, not on one
  lift** — per-lift misses someone who did one set each on three lifts. Husk
  rows (`logResult` updates even to null) never count.
- **The pills on the client page were a tally, not sessions** — `target`
  slots with the first N filled. That is the whole reason nothing was
  clickable: there was no session behind a pill. It also drew a week where she
  did sessions 2 and 3 as though she had done 1 and 2. Now one entry per real
  session; **tapping the WEEK expands it**, not the pill (34x13 is far under
  44pt, and this file serves both widths). Every session is reachable
  whatever its state, so the floor only changes what a pill *claims*.
- **Finalizing on her behalf must use the day she TRAINED.**
  `finalizeSpcSession` resolves the completion's week from the timestamp it is
  given, so today's date files a week-2 session into today's week. Use
  `boiseInstantFrom(date, "12:00")`, never a bare `YYYY-MM-DD` (stored as UTC
  midnight, reads back as the previous evening).
  `unfinalizeSpcSession` gained the same optional `completedAt` — it resolved
  against today and so could not reopen a past week at all. Still a date, not
  a week number, so the rule that no caller supplies a raw week holds.
- **`SpcSessionReadout` had been unreachable since the 0105 cutover** — only
  ever wired to the legacy `[userId].web.js`, which `hasLiveWeeklyWorld` now
  returns false for on every client. It is the single destination from the
  Overview timeline, the History tab and (already) the legacy grid.
- **It was never only cosmetic**: `deriveSpcState`'s `finalWeekDone` counts
  completions, so a client who trained her whole final week and forgot to tap
  Finalize read as still working and the prompt to write her next program
  never fired.

**Three separate stale-model bugs found while doing it, all the same shape —
0105 made one `spc_workouts` row span a whole run, and code written against
0016's row-per-(block, week, session) is still out there:**
1. `buildSpcCalendar` placed each row in exactly one week, so **55 of 61 live
   sessions-format blocks** drew "not written yet" for every week after the
   first. `getSpcBlockDetail` got this expansion on 2026-08-31; the calendar
   never did. Expanding also means a bar's key must be `workoutId:week`, an
   expanded bar is **not** a moved bar (the authored week is always 1), and it
   is not movable (a move would shift every week's copy).
2. `describeCompletion` preferred the workout row's week, labelling every SPC
   session "Week 1" — wrong for **8 of 38** live completions. The completion's
   own `week_number` is resolved by `spcCompletionWeek` and is right under
   both models, so it leads now.
3. The readout's PR matching keyed on `loggedDate`, which is
   completion-derived and null for exactly the sessions this makes openable.

**Also**: the read-out was desktop-only until the client page started opening
it, and at phone width its four columns squeezed EXERCISE to ~40px — "Back
Squat" rendered "Bac k …" and a note came out one letter per line. It stacks
below `MOBILE_BREAKPOINT` now.

**Verification worth copying**: the SQL simulation of the feed's grouping
against the live database is what proved the blast radius (names, dates and
set counts for ~20 real sessions), and curling each new PostgREST select
confirmed it parses rather than 400s. **A `grep -E '"name"' | paste - - -` on
the CLI's JSON beats a clever regex** — a non-greedy `\[.*?\]` parser
reported "0 rows" for a query that had twenty, and nearly sent me chasing a
bug that did not exist.

**Not done, deliberately**: `listRecentSessionsForUser` (the "Recent sessions"
card on the group client profile) still reads completions only.

## Any program length, and no way to shorten a live one (2026-09-07)

The SPC publish/reschedule modal offered four lengths (4/5/6/8) plus Ongoing.
It now carries a dropdown of 1 to 12 weeks plus Ongoing beside those chips.
**The dropdown always reads the current value, so the chips are shortcuts
into it rather than a second control** and the two cannot disagree: tapping 6
makes it say "6 weeks", picking 3 lights no chip. No migration —
`block_length_weeks` is a plain smallint with no CHECK, and `publishSpcBlock`
/ `rescheduleSpcProgram` already took any `lengthWeeks`.

**The bug it surfaced was on the reschedule path**, which seeds from a
program's real length: the old code clamped that seed to those four values
and fell back to 6, so opening a 3-week program to change its dates showed 6
and would have silently doubled it on save. A block longer than 12 (a rolling
one grows a week at a time) now gets its own length appended to the list
rather than clamped away, the same idiom the start-date options already use
for "where it is now" — clamping it would shorten the program by accident.

`OptionPicker` moved `components/nutrition/` to `components/`; it is the house
dropdown pattern and already had a non-nutrition caller.

**The real gap, found straight afterwards: there was no way to shorten a live
SPC program at all.** A coach published Jodi Scott a 4-week program because 4
was the minimum on offer, and Terra needed it to be 1. The Sessions tab's
live-program controls were "+ Add a week" and the Ongoing toggle, both of
which only lengthen. The one control that shortens is "End here" on the
calendar grid, and that lives in `app/(coach)/spc/[userId].web.js`, the legacy
page, which `hasLiveWeeklyWorld()` has returned false for on every client
since the 0105 cutover. So it was unreachable. Worth remembering generally:
**the cutover left working controls stranded on that legacy page, so "the app
can already do X" needs checking against whether the screen X lives on is
still reachable.**

**Fixed the same day by rebuilding the Sessions tab's dates band as
`ProgramDatesPanel`** (the old one was a five-item flex-wrap row that read as
slapped together). Terra's own layout, after a couple of passes: Ongoing switch
top right, STARTS and ENDS as two equal boxes, and "+ Add a week" directly
under the ENDS box. The panel is peach (`#fdf6f2` / `#f0ddd2`) rather than a
white card, so it reads as chrome for the whole run instead of one more
session.

**STARTS is a read-out washed back toward the panel (`#f6f1ec`); ENDS is the
same box left white, with a chevron, and tapping it opens the list.** White is
what says "you can tap this" here, so the box that does nothing must not be
it. That shape was arrived at by building it wrong first: as a
`<select>`, whose closed text is necessarily its selected option's text, so a
list useful enough to pick from ("Sun Oct 4 · 4 weeks") made the two boxes read
as different kinds of thing. The date belongs in the field and the length it
would make belongs in the list you open. **The picker is a plain modal on both
platforms rather than a web `<select>`** for the same reason, and it doubles as
the ongoing case: an ongoing program's box says "No end date" and opens the
identical list, which is how it gets an end you actually choose — the Ongoing
toggle only restores whatever length it was stored with, which is a guess.

Picking IS the confirmation: every row states the total length it leaves, the
header says what does and doesn't change, and nothing is deleted either way (a
sessions-format program has one row per session for the whole run, 0105). A
`confirmShortenProgram` dialog was written and then dropped as friction. An
intermediate design with a separate "End early" button was also dropped —
having both a button and the field open the same list meant two affordances for
one action.

`endDateOptions` is exported and pure so it can be tested without rendering.
Its three constraints: never before the week in progress finishes (a
not-yet-started program's floor is its own first Sunday instead), never on or
after a program already queued behind it (`setSpcProgramEnd` would reject the
overlap anyway — better not to offer the date than explain the error), and
twelve Sundays from the soonest legal one, matching the publish dropdown's
range, with anything longer being what Ongoing is for. **The horizon is
measured from `earliest`, not from the start**, so a program that has been
running for months still offers twelve real dates ahead of it rather than a
list entirely in the past.

Jodi's block was corrected by hand instead (`block_end_date` 2026-10-04 to
2026-09-13, `block_length_weeks` 4 to 1 — precisely what `trimSpcBlockTo(id, 1)`
and `setSpcProgramEnd(id, '2026-09-13')` both compute). Safe because nothing
was logged against it, and because a sessions-format block has no per-week
workout rows for a trim to delete: all of them are authored week 1 (0105).

**Verified** by driving the modal at 375px and 1280px through a throwaway
`app/zz-weeks.js` route (deleted): chip and dropdown syncing both directions,
end dates and singular/plural across 1/3/11/12/ongoing, a 3-week and a 14-week
block each seeding to their real length, and the publish payload carrying
`lengthWeeks` as a number rather than the string a web `<select>` hands back —
`OptionPicker`'s web half returns `e.target.value`, so its option values have
to be strings on both platforms and be converted at the boundary. Not verified
behind a real login.

## One-off sessions from the SPC client page, and on the live board (2026-09-13)

Terra's ask: add a one-off session from the SPC client page's header, either
from a template or built new, and be able to run it on the live board. The
main reason it exists is **letting a prospect try SPC**. Migration `0128`,
applied and verified live.

**Decisions she made, worth not relitigating:** "also save as a template" is a
checkbox; a one-off does **not** count toward her SPC week; it stays open with
no date (the existing 0008 rule); finished ones go to History with their sets;
two open one-offs share one tab; at phone width only templates are offered (no
builder); removing lives on the Sessions tab, where all editing happens; the
phone Sessions tab is three sub-tabs, Current / One-off / Upcoming.

**The page.** "+ Add a session" sits in the header at both widths and opens
`components/coach/spc/AddOneOffModal.js` (choose, then template list or a name
+ checkbox). A template assignment is published immediately, same as the group
client page. **Build new creates a DRAFT** (`createBlankOneOff`), because it is
empty the moment it exists and a published empty one-off would sit on her My
Week. Overview gets a ONE-OFF SESSIONS card between THIS WEEK and CURRENT
PROGRAM; Sessions gets a "One-off sessions (n)" tab over the program column
that disappears when none are open; History gets a third "One-offs" segment
only once she has finished one. `listOneOffCompletionDetails` splits open from
finished.

**The builder is shared now.** `components/builder/FlatSessionBuilder.js` is
the old template web builder with its tables passed in as an `api` object, and
both `templates/[templateId].web.js` and the new
`one-offs/[oneOffId].web.js` are thin wrappers. A superset or warm-up fix lands
on both. The one-off wrapper adds an editable title, the template checkbox
(seeded from `?saveTemplate=1`), and a button that reads **Send to {name}**
while it is a draft and **Done** once published. The template copy
(`saveOneOffAsTemplate`) happens on the way out, once, and only if the session
has at least one lift. `one-offs/` has a `_layout.js` Stack and is registered
`href: null` in the coach Tabs, same trap as `exercises/merge`.
`one-offs/[oneOffId].js` is a native "build this on a computer" stub so the
route resolves.

**The board (0128).** A third slot kind, `one_off`, beside `spc` and `group`:
- `hub_session_clients.one_off_workout_id` and a three-way XOR check.
- `hub_one_off_belongs_to` / `hub_active_one_off_workout`, the same
  security-definer pair shape as 0106 (a policy on a table cannot select it).
- Display read policies on the three `one_off_*` tables. **Writes needed
  nothing**: the display's logs / completions / notes policies key on
  `hub_active_client(user_id)`, which already covers one-off rows.
- `hub_startable_clients()` gains a one-off arm **not gated on spc_clients** (a
  prospect has no SPC row). The SPC and group arms were generated from
  `pg_get_functiondef`, not retyped.
- `hub_add_client` gained `p_one_off_workout_id`, so the 5-arg overload is
  dropped in the same migration (the 0119 lesson). `hub_start_session` reads
  `oneOffWorkoutId` off the jsonb, no signature change.
- `week_number` is NOT NULL, so a one-off slot carries 1; the board branches on
  kind first and reports `weekNumber: null` for it.

In JS, `slotSession()` returns `kind: "one_off"` and every branch that used to
be `group ? … : spc` became three-way: `sessionRefFor`, `fetchHubWarmups`,
`fetchHubBoard` (its own four queries), the tick/finalize writers in
`useHubBoard` (new `unfinalizeOneOffSession`), `clientsSignature`, and
`hubHistory`'s set counts. **Reorder is SPC-only** (`canReorder = kind ===
"spc"`), since `hub_reorder_exercises` is. The picker gets a "One-offs" segment
last; its rows are never "between blocks", show no count circle and no preview
eye (the preview sheet reads SPC/group). Staging still excludes everything but
SPC.

**Verification.** Migration dry-run, then applied; then a rolled-back
end-to-end test as real accounts: a coach adds a one-off slot through the RPC,
the display reads that workout and its lifts and warm-ups but **zero** other
one-offs, the display writes a log, a tick and a finalize, the finished one-off
drops off the startable list, and `hub_one_off_belongs_to` rejects another
client's one-off. **A board was live during that test** (Terra's, 2 slots), so
the transaction ended it only inside itself and rolled back; confirmed still
open afterwards. `npm run build` + `check:routes` clean, and a parse /
unresolved-identifier / unused-import / missing-export pass over all 17 touched
files. Overview card, Sessions tabs at 1280 and 390, History segment, the
picker's segment emitting `{oneOffWorkoutId, weekNumber: 1}`, and the add
window were driven in a throwaway `app/zz-oneoff.js` (deleted; the stubbed
`hub.js` restored md5-identical). **Not verified**: the builder route itself
and a real board run, both behind a login. Worth Terra's pass: build a new
session, send it, start it on the wall, finish it, and find it in History.

## Preview next program: SPC gets the look-ahead, and both open for the whole final week (2026-09-13)

My Week's "Preview next block" row existed for group programs only, and only from 4pm on the block's final Sunday. Terra asked for SPC to get the same thing and for **both to show for the whole final week** (Monday to Sunday). Migration `0131`, applied and verified live.

**When it shows, both programs**: the current program has a real end date that falls this week, AND a published program starts the very next day. A gap between them, an ongoing SPC program (null end date, 0103) and a rolling group block all show nothing. `nextBlockPreviewIsDue(endDate, today)` in `lib/programming/nextBlockPreview.js` is now `end - 6 <= today <= end`; the 4pm `PREVIEW_OPENS_HOUR` rule is gone (`hourInBoise` is still exported, now unused).

**SPC**: new `getNextSpcProgramPreview({ userId, block, sessionsPerWeek })` in the same file. It resolves the next program with `getCurrentSpcBlock(userId, endDate + 1)` and then requires a different id AND `block_start_date === endDate + 1`, because that resolver's lapsed fallback can hand back the current program when nothing covers the next day. Rows are every published session (a sessions-format program has one row per session for the whole run), with no weekday captions, since SPC has no day-of-week routing. My Week's SPC loader fetches it only while the preview is due, in its own try/catch, and the SPC `ProgramCard` gets the same `NextBlockButton` labelled "Preview next program". `NextBlockSheet` gained `eyebrowLabel` ("Next program") and is passed `listSpcWorkoutExercises` as its loader; an ongoing next program's meta line reads "Ongoing program" instead of "Week 1 of N".

**Why the migration was needed**: 0102 made a queued SPC program's content unreadable to the member until its start date, so the preview could never load. 0131 widens that by exactly seven days, matching the preview window. The group side needed no RLS change (0004's member policy has no date gate).

**Verified**: dry run, then applied; impersonated a real member whose next program starts tomorrow and confirmed she reads its sessions, exercises and warm-ups but nothing starting more than seven days out; the date rule checked at the window's edges; `npm run build` + `check:routes` clean and an unresolved-identifier pass over the three touched files. **Not click-tested behind a real login.**

## Warm-up "Copy to..." in the SPC builder (2026-09-14)

The coaches asked to reuse a warm-up across a program's sessions. SPC only, not Group.

**Shape chosen: a one-time copy, not a shared/global warm-up.** Measured against live data first: of 30 SPC programs with warm-ups in more than one session, only 6 used identical moves in every session, 11 shared half or more, 8 shared some, 5 shared nothing. Coaches start from one warm-up and tweak it per session, so a live link would either silently change other sessions or need an "unlink" step. Under the sessions format a session repeats every week, so "across sessions" already means "across the program".

**Direction: "Copy to..." on the session you're in**, not "Copy from". You build the warm-up where you are and push it out once, rather than visiting every other session to pull it in.

- `WarmupGrid` (`components/builder/SessionBuilderParts.js`) gained an optional `headerAction` node beside "+ Add". Group, templates and one-offs don't pass it and render unchanged. SPC also passes `showAdd={false}`, removing the header's "+ Add" (Terra: ugly next to "Copy to..."). Nothing is lost: the empty slots' "+ Insert warm-up" opens the same picker, the library sidebar adds too, and "+ Add" already hid itself at six. "Copy to..." is drawn as a white bordered pill (same `PressFade` and `#d9d4cd` border as the header's Preview button, radius 99) so it reads as a button rather than a stray link.
- The SPC web builder shows "Copy to..." only when this session has warm-ups and the block has another session. It opens `components/coach/spc/CopyWarmupModal.js`: every other session, all ticked, each saying whether it already has a warm-up. Labels are "Session N" for sessions format, "Week W, Session N" for a weekly block.
- **Replace, not append** (Terra's call). `confirmReplaceWarmups` names the sessions that already have one before anything is deleted.
- `replaceSpcWarmups(toWorkoutIds, rows)` in `lib/programming/spcWorkouts.js` is deliberately **source-agnostic** so future **warm-up templates** can reuse it ("Use template" passes template rows; "Save as template" would be the reverse). It re-mints `superset_group_id` per target so a copy never makes two sessions share one superset id. It is delete-then-insert per session, not atomic, the same as `copySpcWorkoutContent`.

No migration. Native SPC builder not touched (coaches build on web).

**Verified**: `npm run build` + `check:routes` clean; Babel parse, unresolved-identifier and unused-import pass over all five touched files; the button and modal driven through a throwaway `app/zz-harness.js` (button renders beside "+ Add", both targets start ticked, unticking one relabels to "Copy to 1 session" and hands back only that id), harness deleted. **Not driven behind a real login**, so the actual database write has not been exercised end to end.
