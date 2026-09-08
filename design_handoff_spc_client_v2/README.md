# SPC client page — simplification pass (v2)

Changes to the coach-web SPC client page. Built against the current source, so
everything below is a **diff against what ships today**, not a new screen.

Touches:

- `components/coach/spc/SpcClientPage.js` — most of it
- `components/coach/spc/SpcSessionsTab.js` — pane framing only
- `components/CommentThread.js` — new mount points, no internal change
- `components/CoachShell.js` — untouched (mock includes it for context only)

Open `Kova Coach Web - SPC Client Page.dc.html` in a browser. Tabs, the Notes
rows, the Lifts/Programs segments and the program-run expansions are all live.
Everything else is static.

---

## 1. The right rail is gone

`SpcClientPage.js` desktop render currently ends in a two-column flex: main
column `flex:1` beside a `width:280` rail holding NOTES and CLIENT SETTINGS.

**Both moved. Delete the rail and the flex wrapper — the main column runs full
width.** At 1440 that takes the content column from ~850 to ~1156, which is
what makes the Sessions panes usable side by side (they were ~412 each and
every lift row wrapped).

Where the two went:

| Was in the rail | Now |
| --- | --- |
| `CommentThread` under a NOTES eyebrow | collapsed **Notes** row, twice (see §3) |
| CLIENT SETTINGS card | its own **Settings** tab (see §2) |

## 2. Print tab → Settings tab

`TABS` becomes `["Overview", "Sessions", "History", "Settings"]`. `PrintTab`
and its `onGoPrint` prop come out.

The settings card is the rail's card unchanged — enrolment select, assigned
coach select, sessions-a-week `SegmentedControl`, divider, "Turn SPC off" +
its subline — at `max-width: 440` instead of 280, with 20px padding and 14px
label gaps rather than 15/12. The `status === "inactive"` branch (the
"Turn SPC back on" copy) carries over as-is.

Print itself was dropped, not moved. The Overview quick-link to it went too
(§5), so there is currently **no route to the print sheet from this page** —
flag if that matters; it wants to live somewhere.

## 3. Notes: two things, now named differently

The page had two "COACH NOTES" and they are not the same thing:

- **`spcClient.notes_goals_feedback`** — one text field on the SPC client row.
  No author, no timestamp, last write wins, lives across every program.
- **`CommentThread spcBlockId`** — attributed, dated, appended, scoped to the
  current block and gone with it when the block closes.

Same label and the same grey-box-with-a-textarea treatment on both is what
made them read as one feature rendered twice. Kept as two, relabelled:

**Hero field → `KEEP IN MIND`.** Still inside the goal card, still
`notes_goals_feedback`, lock glyph unchanged. Standing facts about the client:
injuries, cues, what she responds to.

**Thread → `Notes`**, as a collapsed row, deliberately built in the idiom of
`SpcSessionsTab`'s `WarmupStrip`: label at `12.5 / 700 / #57534e`, count at
`12 / #a8a29e`, `chevron-down` at `#c9c4bd`, 11px/14px padding. Expanded it
shows each note (body `12.5 / #2a211c / 18px line`, byline
`Name | M/D` at `11 / 600 / #a8a29e`), then the compose field and a
right-aligned Add note.

It appears in **three** places, all the same thread:

1. **Overview**, at the foot of the CURRENT PROGRAM card, above the card's
   own padding edge (`border-top: 1px solid #f4f1ec; margin-top: 12px`).
2. **Sessions**, in the Current program column between the dates panel and the
   first session card — as its own white card, matching the session cards
   around it.
3. **History → Programs**, inside each finished run (§4).

One `open` state across 1 and 2 in the mock. In the real page they are
separate mounts of the same `spcBlockId`, so no shared state needed — but do
keep the expanded/collapsed preference per user if it's cheap; a coach who
lives in the notes will open it on every load.

## 4. Notes follow a program into History

`ProgramRuns` rows currently expand into their sessions. They now also carry
their notes: **note count on the meta line** (`6 weeks · 2 notes`) and a
`PROGRAM NOTES` block inside the expansion, on the peach ground
(`#fdf6f2`, top border `#f0ddd2`).

A run with none says "No notes on this program." rather than rendering an
empty box.

This is the whole point of keeping the thread block-scoped: write notes on the
live program, they stay attached to it when it closes. Needs a
`listComments` by block id for the runs being shown — one query for the
expanded run is fine, same lazy pattern the sessions expansion already uses.

**Known gap:** nothing promotes a note from a program thread up to Keep in
mind. If a note turns out to be permanently true, a coach has to retype it.
Worth a "pin to Keep in mind" action on a note eventually; not built here.

## 5. Overview, cut down

The status banner keeps its dot and its label and loses everything else:

- `banner.title` and `banner.line` — gone. Just the dot at 11px and the label
  at `22 / 700` in the tone's text colour, then `banner.cta` unchanged.
- **RECENT PRS card** — gone (`stats.personalRecords` is still needed for the
  PR badges in History → Lifts).
- **LAST SESSION card** — gone.
- **Print sheet / Live session quick links** — gone. Live session is in the
  header; Print has no home (§2).

Overview is now: banner → THIS WEEK → CURRENT PROGRAM (with Notes at its
foot). `describeLastSession` and the `lastSessionAt` prop are unused on this
tab afterwards.

## 6. Header

Was: avatar + name row + coach line + Live session button in a left column,
`ClientGoalCard` at `width: 380, flexGrow: 1` beside it, both top-aligned.
With the rail gone that left a short cluster next to a tall card and ~450px of
nothing between them.

Now stacked, three bands:

1. **Name line** — `Alicia Allen` (display, 34) + SPC pill + Live session
   button, all on one row, 12px gaps. Avatar dropped. Status pill dropped: it
   repeated the banner directly below it.
2. **Meta line** — `Abbi Stauffer · 1× a week` at `12.5 / #78716c`. Note this
   drops the "Coach:" prefix and "training".
3. **Goal hero, full width** — clay `#a46a57`, radius 16, 18/20 padding.
   WORKING TOWARD + eye glyph, goal at display 30/36 on the left; KEEP IN MIND
   + its field at `flex: 0 1 460px` on the right. Bleeding circle moved to
   `right: -40, top: -52, 180px` for the wider box.

The nutrition pill (`nutritionClient` → `Nutrition ›`) is not in the mock.
Keep it — it belongs on the name line after the SPC pill.

## 7. Sessions: the two panes read as different grounds

The panes were two equal columns on the same canvas with a 22px gap, which is
not enough signal for "live to her" vs "she cannot see this".

**Current program** stays on the open canvas, unchanged.

**Upcoming program** becomes a recessed panel: `background: #e7e0d6`,
`border: 1px solid #dad2c6`, radius 14, padding 18. Panes are
`align-items: stretch` so it holds its shape against the taller column.

A hairline divider was tried first and was invisible at this contrast. The
ground change is doing the work — one is out in the open, one is walled off.

Everything inside both panes is current source: `ProgramDatesPanel` (peach
`#fdf6f2` / `#f0ddd2`, STARTS read-only in `#f6f1ec`, ENDS tappable in white
with a chevron, "+ Add a week" dashed under it, Ongoing switch top-right),
`SessionCard` (round lift labels, collapsed Warm-up strip, editable
sets/reps/rest, "Full editor ›" pill, "+ Add exercise" at the foot), and the
"Nothing queued yet" empty state.

Two small cuts inside them:

- `ProgramDatesPanel`'s `statusLine` — removed.
- `supersetFootnote` — removed. The 3px olive left border on superset rows
  stays and carries it.

## 8. History

`HISTORY_SEGMENTS` and `LiftHistory` are as-shipped — search field, the
desktop LIFT / LAST / BEST / SESSIONS header, PR badges, the "Last logged …
| up N lb recently" subline. The mock's rows are collapsed only; the
expansion (`LiftProgressSection` + set-by-set) is not drawn.

---

## Tokens

Straight from `lib/theme.js`, nothing invented:

`primary #a46a57` · `primaryOnWhite #8a5140` · `ink #33251f` ·
`text #2a211c` · `muted #6f6862` · `hint #9a9187` ·
`coachCanvas #f1ece6` · `coachCardBorder #e1dad1`

Status tones: `needsAction` `#f4ede3` / `#8a5a2e` (this client) ·
`onTrack #eef1e7` / `#4d6142` · `urgent #fdece5` / `#b23a22`

Olive family: `#4d6142` `#8fb473` `#e3ead9` `#dbe8cf` `#f3f6ef`
Peach family: `#fdf6f2` `#f0ddd2` `#dcc9bf` `#e3d5cb` `#f6f1ec`
New in this pass: `#e7e0d6` / `#dad2c6` (the recessed Upcoming panel)

Type: Montserrat 400/500/600/700, Protest Strike for display. Icons are
Ionicons — the mock loads them from a CDN, the app has `@expo/vector-icons`.

## Files

```
Kova Coach Web - SPC Client Page.dc.html   the mock
support.js                                 runtime it needs
assets/kova-logo.jpg                       copied from assets/, as CoachShell uses it
screenshots/
  01-overview-notes-open.png
  02-sessions.png
  04-history-lifts.png
  05-history-programs-notes.png
  06-settings.png
```

Mock data is Alicia Allen, 1× a week, Due soon, on a 3-week program
Aug 24 – Sep 13 with weeks 1 and 2 logged. Today is Sep 7.
