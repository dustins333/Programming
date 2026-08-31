# SPC rework — design handoff v1

Kova Strength · small personal coaching. Coach surfaces are phone-first (installed PWA,
390px) with desktop web second. Member surfaces use bottom sheets, never centered dialogs.

Source of truth: `SPC Rework Artboards.dc.html` (open in a browser; the artboards are live
and interactive — tabs switch, rep fields dirty the Update bar, the Publish modal
recomputes, the roster table sorts and filters). Screenshots are captures of that file.

| File | Artboard |
| --- | --- |
| `01-client-page-desktop.png` | 1a · Client page frame, desktop |
| `02-overview-phone.png` | 1b · Overview tab, phone |
| `03-sessions-desktop.png` | 1c · Sessions tab, desktop |
| `04-publish-modal.png` | 1c · Publish modal |
| `05-sessions-phone-current.png` | 1d · Sessions tab, phone, Current |
| `06-sessions-phone-upcoming.png` | 1d · Sessions tab, phone, Upcoming empty state |
| `07-roster-statuses-phone.png` | 1e · Roster statuses, phone |
| `08-member-makeup-sheet.png` | 1f · Member make-up sheet |
| `09-roster-statuses-desktop.png` | 1g · Roster statuses, desktop table |

---

## 1. The model this design assumes

SPC programming has no week-by-week blocks and no week-grid builder.

- A client has **N session definitions**, where N is her sessions/week (usually 1–3).
- The **current program** is live to the member. The coach edits it in place; deliberate
  edits are committed with an **Update** button and go live immediately.
- The **upcoming program** is built in a separate space that is **always invisible to the
  member**. It autosaves. It becomes live only when the coach **publishes** it.
- Publishing asks for a **start Monday** and a **number of weeks**. On that date the new
  program becomes current and the old one **closes into History as a finished run**.
- A program can also be **Ongoing** (no end date) instead of a fixed week count.
- Statuses are **derived from the current program's end date**. Nothing is set by hand
  except Paused.

Confirmed against CLAUDE.md's "SPC simplification — spec locked, data layer live
(2026-08-30)" section. Four spec details worth carrying into the build, which the
artboards now reflect:

- **A not-yet-published upcoming program does NOT count as "on deck"** for status. A
  client with a drafted-but-unpublished program still goes Due soon / Due now.
- **Due now fires the moment the final week's expected sessions are all completed** — a
  1×/week client who finishes on Monday goes red that Monday, not at the end date.
- **An enrolled-never-programmed client is just red.** Pause her to silence it; that's the
  release valve, which is why 1e's row says so.
- **Make-ups are real second instances**, not edits: "Start a new one" maps to
  `startNewSpcSessionInstance()` (`instance` column added in `0102`), and a coach can do
  the same from the Live hub.

Two things the design leans on that are already enforced in the database (`0102`), not
just in the UI:

- An **upcoming program is genuinely invisible** — the member read policies gate on
  `block_start_date <= today in Boise`. The "Invisible to Maddie" labels are literally true.
- A **lapsed program keeps showing to the member forever** (no end-date gate, deliberate —
  better than a blank screen). Only the roster goes red. Nothing in these artboards should
  be read as hiding a lapsed program from her.

Terminology rules used throughout, and worth enforcing in the build:

- Never "Block 1 / Block 2". A finished program is a **date range**: "Aug 3 – Sep 13 · 6 weeks".
- The action is **Publish**, not push or send.
- The noun is **program**, not run or block, in all user-facing copy.
- No em dashes in copy.

⚠️ The spec and data layer use **run** and **push** internally (`publishSpcBlock` doubles
as Push; History holds "finished runs"). Terra's call for the UI is **program** and
**Publish**. Keep the internal names, change only what a coach reads.

---

## 2. Artboards

### 1a — Client page frame (desktop ~1280px) · `01-client-page-desktop.png`

Keeps the existing page structure from `app/(coach)/spc/[userId].web.js`:

- "‹ SPC" back link, then the identity row: 46px avatar (`#fdece5` / `#b23a22`), client name
  in Protest Strike 29px, espresso **SPC** pill, olive **Nutrition ›** pill, derived status
  pill, and "Coach: Terra · training 2× a week".
- Buttons: **Preview** and **Live session**.
- Hero is the real `ClientGoalCard` composite: solid clay (`#a46a57`) goal card with
  WORKING TOWARD eyebrow, bleeding circle, coach-side eye mark — and the private
  **COACH NOTES** panel attached underneath at `marginTop: -8` so the two read as one
  object (shared on top, private below).
- Right rail, 280px, two **clearly separated** sections (36px apart, each with its own
  eyebrow): **NOTES** (coach-to-coach thread + an add-a-note field, then a CLIENT NOTES
  card of the member's own log notes, `Aug 26 · Back Squat`) and **CLIENT SETTINGS**
  (Status Active/Paused, Assigned coach, Sessions a week 1×–4×).
- **New:** the main column under the header is a tab strip — **Overview / Sessions /
  History / Print**. All four tabs are wired in the artboard.
  - History lists finished programs as date ranges + weeks + sessions logged + a one-line
    outcome note. No block names.
  - Print lists one sheet per session definition with Preview / Print.

### 1b — Overview tab (phone 390) · `02-overview-phone.png`

Per-client dashboard, top to bottom:

1. **Status banner** — derived pill, the single next step ("Nothing needed until Sep 14" /
   "Publish her next program" / "Program her now" / "Paused since Aug 10"), one supporting
   line, one CTA.
2. **This week** — logged vs. her target (1 of 2), with a chip per session definition.
3. **Current program timeline** — one row per week: week number, week-start date, one block
   per target session (filled = logged), and the count. Future weeks are dashed. The
   **upcoming program** appears after it when one is queued, dashed and quiet, with
   "She can't see it until Sep 14."
4. **Recent PRs**, **Last session** summary with the member's own note.
5. Quick links: **Print sheet** and **Live session**.

The status prop on the artboard flips this between all four states.

### 1c — Sessions tab (desktop) · `03-sessions-desktop.png`, `04-publish-modal.png`

Two panes side by side.

**Left — Current program**, badged LIVE TO MADDIE:
- Dates line: `Mon Aug 3 → [Sun Sep 13]` where the end date is an editable control
  (calendar icon), plus **+ Add a week** and an **Ongoing** toggle. Ongoing replaces the
  end date with "No end date", hides + Add a week, and the line becomes
  "Week 4 · runs until you set an end date".
- One card per session definition: lettered lift rows with editable sets × reps, rest, and
  a superset bracket on C1/C2 ("C1 + C2 run as a superset, rest after C2 only").
- **Dirty-state Update bar** appears at the bottom of the pane on any unsaved edit:
  "Update · 1 unsaved change" + "Changes go live to Maddie immediately." with Discard and
  a green Update. After Update: "Updated. Maddie sees this now."

**Right — Upcoming program**, quieter, dashed, badged INVISIBLE TO MADDIE:
- "Autosaves · last edit 2 min ago" — no save button anywhere in this pane.
- Empty state offers one tap: **Copy current program** (plus "or build from blank").
- Drafted state shows the sessions read-only-ish with per-session Edit, and flags what
  differs from current ("Front squat swapped in for weeks 1–2").
- **Publish** button opens the modal.

**Publish modal** (its own frame in the artboard set so it reads statically):
- STARTS MONDAY: three options. First is the clean hand-off — the Monday after her current
  program ends ("Sep 14 · when her program ends", the default). The other two deliberately
  interrupt the current program: "Aug 31 · next Monday" and "Sep 7 · in 2 weeks".
- HOW MANY WEEKS: 4 / 5 / 6 / 8.
- NEW PROGRAM summary recomputes live: "Sep 14 – Oct 25 · 6 weeks", and
  "Her current program stays live until Sun Sep 13 and closes into History on Sep 14."
- CTA: "Publish · starts Sep 14".

### 1d — Sessions tab (phone) · `05-sessions-phone-current.png`, `06-sessions-phone-upcoming.png`

Same content as 1c; the two panes become two sub-tabs, **Current / Upcoming**, with a dot
per tab (olive = live, grey = invisible). Current carries the same dates line, Ongoing
toggle and session cards; its Update bar is pinned to the bottom of the screen. Upcoming
carries the invisible banner, autosave line, the empty state with Copy current program,
and a pinned **Publish** button once something is drafted.

### 1e — Roster statuses (phone) · `07-roster-statuses-phone.png`

Row set showing all four pills in context. Each row: tone-tinted initials, client name,
status pill, a days-left / end-date line, and a next-step hint.

| Pill | Tone | When it applies | Row line |
| --- | --- | --- | --- |
| Good to go | olive `#eef1e7` / `#4d6142` | Program running, or ended with one queued | "13d left" |
| Due soon | amber `#f4ede3` / `#8a5a2e` | Final week of her program, nothing queued | "7d left · ends Sep 6" |
| Due now | red `#fdece5` / `#b23a22` | Final week's sessions all done, or program ended, or never programmed | "ends today" / "no program yet" |
| Paused | grey `#f1efed` / `#78716c` | `spc_clients.status = 'paused'` | "paused Aug 10" |

Footer states the rule: "Status comes from the current program's end date. No one sets it
by hand."

**Mapping from today's computed states** (`lib/programming/spcState.js`, 7 states → 4):

- `onTrack` → Good to go
- `needsNextBlock` while the program is still running → Due soon
- `needsNextBlock` after it ended, `noBlock`, `neverStarted` → Due now
- `paused` → Paused
- `draftToSend` and `unfinished` disappear: the upcoming space autosaves and is either
  published or not, so there is no "draft to send" and no half-published program.

⚠️ One deliberate departure to confirm: `spcState.js` gives `neverStarted` the quiet
`paused` tone on purpose ("so they don't bury the handful who genuinely need something").
The brief puts "never programmed at all" in red Due now, so Sarah Otte is red here. If the
migration-onto-the-app cohort is still large, keep it quiet instead.

### 1f — Member make-up sheet (phone) · `08-member-makeup-sheet.png`

The member taps a session she already logged this week. Bottom sheet, **22px top radius,
canvas background** (`#eceae6`), grabber, on a 34% espresso scrim:

- "You already logged Session 1 this week"
- "Both of these are normal. Pick whichever fits what you did today."
- **Update that session** — "Opens Wed Aug 26. Add a set, fix a weight."
- **Start a new one** — "A fresh copy to log, good for making up a week you missed."
- **Never mind**

Copy is warm and non-judgemental on purpose: a second logged copy of a session is a
feature (making up a missed week), not a warning. No red, no "are you sure".

### 1g — Roster statuses, desktop table · `09-roster-statuses-desktop.png`

The same four pills on the desktop roster (`app/(coach)/spc/index.web.js`). Structure is
kept: SPC wordmark + client count + "N run out this week", Live sessions / Templates
buttons, a chip row (All + the four states with counts, active chip goes espresso) and a
coach dropdown, then the table.

Toolbar is **search + the chips + the coach dropdown**, all narrowing the same set.
Columns are **CLIENT / CURRENT PROGRAM / STATUS / LAST SESSION / NEXT STEP**.

- **Sorted A–Z by name by default.** CLIENT and STATUS are the two sortable headers:
  clicking STATUS sorts by urgency (Due now → Due soon → Good to go → Paused, name as the
  tiebreak), clicking the active header flips direction. Same toggle the phone roster
  already uses; note this replaces the current desktop default of sort-by-time-remaining,
  which Terra asked to drop.
- Search matches on name only, and the chips and search compose (search then filter).
  Empty result reads "No clients match your search or filters."

- CURRENT BLOCK becomes **CURRENT PROGRAM**: a date range + a sub-line ("week 5 of 6",
  "final week", "ends today", "enrolled Aug 24"). No block label.
- **The COVERAGE column is gone.** With no per-week authoring there is no draft or empty
  session to count, so the stacked bar has nothing to measure. Status + reason take its
  place in that space.
- NEXT STEP keeps the real button and its three tones from `NEXT_STEP` in
  `spcState.js`: urgent = filled clay, needsAction = outlined, quiet = muted outline;
  nothing due renders as flat grey text.

⚠️ That file carries its own drifted copy of the status tones (`TONE_STYLES`:
`#fdf3e3`/`#8a6320`, `#e3ead9`, `#f1efec`). Delete it and read `theme.statusColors` —
the mobile roster already does, and these artboards use the canonical values.

---

## 3. Tokens

All colors come from `lib/theme.js` — no new values were invented.

- clay `colors.primary #a46a57`, clay-on-white `#8a5140`, espresso `#33251f`
- canvas `#faf8f6`, member canvas `#eceae6`, card `#fff`, card border `#ece7e1`,
  row divider `#f4f1ec`, input border `#e2ddd6`
- ink `#2a211c`, `muted #6f6862` for text that carries information,
  `#a8a29e` for eyebrows and decoration only, `hint #9a9187` for placeholders
- `statusColors` exactly as shipped: urgent / needsAction / onTrack / paused
- due amber `#c58a3a` (the dirty-state dot, matching `CELL_STATES.due`)
- Montserrat 400/500/600/700 + Protest Strike for display

## 4. Files this was built from

| Artboard | Repo files |
| --- | --- |
| 1a | `app/(coach)/spc/[userId].web.js`, `components/ClientGoalCard.js`, `lib/theme.js` |
| 1b, 1c, 1d | `app/(coach)/spc/[userId].web.js`, `app/(coach)/spc/print/[blockId].web.js`, `lib/programming/spcState.js`, `lib/theme.js` |
| 1e, 1g | `components/coach/SpcRosterMobile.js`, `app/(coach)/spc/index.web.js`, `lib/programming/spcState.js`, `lib/theme.js` |
| 1f | `lib/theme.js` |

## 5. Open questions for the build

1. ~~`neverStarted` tone~~ — **settled: red Due now**, per the locked spec ("an
   enrolled-never-programmed client is just red, pause her to silence it").
2. Publishing a program that starts before the current one ends shortens the current one.
   The modal says so in words; does it also need a confirm step, or is the sentence enough?
3. Ongoing programs have no end date, so they never produce Due soon / Due now. Should an
   ongoing program get a nudge after N weeks, or stay silent until the coach ends it?
4. History currently shows sessions-logged out of programmed. Confirm that's the number
   coaches want to scan, rather than adherence %.
5. `scan-spc-alerts` slims down to a due-soon/due-now status push (Terra kept the push).
   The Overview banner is the in-app half of that same message — worth keeping the two
   strings identical so a coach who taps the push lands on wording she already read.
