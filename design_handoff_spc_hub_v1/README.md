# SPC Live Session Hub — design handoff v1

Surfaces: the wall display (`app/(display)/index.js`) and the coach phone
(`app/(coach)/spc/live.js`), plus the shared components in `components/hub/`.
Mockup: `Kova SPC Live Hub - Directions.dc.html` — a design reference only, never
copied in as markup.

Two directions are on the canvas for the expanded lift card. Everything after
them is the state set with **1a** applied.

---

## Decided: 1a, the open card

**1a is it.** It fits at every client count (measured, see *Density* below), and
it is the only version where a coach can look at the card and answer "what did
she do last week and what did we say about it" without touching anything. On a
screen four people are reading at once, a tap that only one of them knows about
is worth avoiding.

**1b, the tabbed card**, stays on the canvas as the fallback if the open card
ever tests as too busy. It is ~120px shorter and identical at one client or four.
Its cost: the note field and the older weeks are invisible until someone knows to
look, and a second control (tabs) appears on a card that already has a superset
switcher.

Both directions collapse the column's other lifts to one-line rows while a lift
is expanded. That was not optional — see *Density*.

---

## Density — the arithmetic that drove everything

Columns are `flex: 1` across 1920, capped at 463px for one- and two-client
sessions, so a column is **460px at 4 clients, 619 at 3, and 463 at 2 or 1**.
Vertical space is 992px inside a column (1080 − the 60px top bar − 28px of board
padding).

With a lift expanded, a column spends its height like this at 4 clients:

| | |
|---|---|
| client header | 62 |
| warm-up strip (collapsed) | 32 |
| four one-line lift rows | 175 |
| **expanded card** | **~340** |
| keypad dock | 226 |
| Finalize | 64 |

Three things came out of making that add up, and they are all real design
decisions rather than tuning:

1. **The other lifts collapse to one line.** Name, that lift's set summary, and
   its completion tick. Full rows (name + prescription + set chips) are ~104px
   each; five of them plus any usable card does not fit in 992 at any client
   count. This is why it is true in 1b as well.
2. **The keypad is a phone-shaped 3×4 pad in the column's bottom-right corner**
   — `1-2-3 / 4-5-6 / 7-8-9 / .-0-⌫`, keys 82×44 at four clients. Stacked
   number keys are what a hand expects; a wide flat bank of digits is not.
   Cornering it leaves the strip to its left for the three things that belong
   beside it: the label saying whose lift and which field is being typed into,
   the `▦ Calculator` pill, and `Next` — which now sits under the typing hand
   rather than across the bottom of the column. The dock's top border is 2px
   clay, matching the expanded card above it, so a keypad reads as belonging to
   that card and no other.
3. **The history changes form with the column width**, below.

Every column in the mockup was measured for overflow. All fit except Kelsey's
9-lift column in the 4-client frame, which is *meant* to overflow — that column
scrolls internally and nothing else on the board moves.

---

## Decided: the board's two widths

**A column is only ever one of two widths.** One and two clients hold the same
463px column a four-up board uses, centre themselves, and give the leftover wall
to the clock. Three clients expand to fill (620px each) and four is the standard
width — both unchanged from today. The card inside a column therefore never has
to be redrawn for the session size.

The week's number and the recent bests are **idle-screen only**. They were in the
margin of a live board at first and read as noise the moment a session started —
a coach looking at a client's sets does not need the gym's weekly total in the
corner. The clock earns its place; a stat card does not.

**Rejected: letting the open lift grow to 900px.** It was the only way to get a
three-zone card (sets | note | every week side by side) at four clients, and it
bought that by resizing the sibling columns — which the brief rules out, and which
means columns move when someone taps. Consistency won. The consequence is real
and is designed around: **the three-zone card does not exist.** History lives in
the dock instead (below).

---

## History — the paper sheet, in the dock

Modelled on `app/(coach)/spc/print/[blockId].web.js`, whose grid is
`Main Session | Sets | Reps | Rest | Week 1 | Week 2 | …` with `coach:` and
`date:` under each week column.

**On the card**, the last completed week reads as a one-line strip: its label,
its sets as bubbles, the note whoever wrote it, and `2 weeks ›`. That answers the
question a coach actually asks without a tap.

**Tapping it opens the block history into the dock** — the same corner and the
same footprint the keypad and the calculator use, with `‹ Back to keypad`
returning. Weeks read most-recent-first, each with that week's sets as bubbles
and that week's note and author. The sets being entered stay on screen above it,
which is the entire point: this is the view a coach makes a call from mid-set.

The dock is now one slot with three occupants — keypad, calculator, history — all
the same size, all dismissable with the `⌄`. That is what replaced the
three-zone card, and it is a better answer for a 463px column than a card that
only worked at 900.

**Set bubbles are the same everywhere**: reps large, weight small beside it, each
set in its own pill — the resting row's chips, the card's strip, and the dock's
week rows. Never a run of text like `8×65 · 8×65 · 7×65`, which reads as a
sentence rather than as three sets you can compare.

---

## The expanded card

Clay 2px border (`#a46a57`), 16px radius, white, soft shadow. It is the only
2px-clay thing on the board, so "the lift being typed into" is unmistakable from
across the room. The keypad dock directly beneath it carries a 2px clay top
border for the same reason — that is what ties a keypad to its client, alongside
its label line (`BOB · DB BENCH PRESS · SET 2 WEIGHT`).

**Header**: lift name 20px bold `#8a5140`, prescription line beneath in
`#6f6862`, and a 40pt bordered peach circle at the right edge that collapses the
card. Collapse is a control in a circle, never a line of text.

**Superset pair**: full-width pills under the header, active one filled clay.
Switching A1↔A2 does not close the card (existing behaviour, kept).

**Set rows** adopt the member app's pattern from
`design_handoff_member_lasttime_v1` exactly, so the two surfaces cannot disagree
about what an empty box means:

| | unkeyed | keyed | active |
|---|---|---|---|
| border | 1.5px dashed `#ddd6cd` | 1px solid `#dbe8cf` | 2px solid `#a46a57` |
| ground | `#fdfbf8` | `#f3f6ef` | white |
| value | `#9a9187` 17px + a 9px `TARGET` tag | `#3f4a36` 21px | `#292524` 21px + caret |

Per-set schemes read down the column (`TARGET 10 / 8 / 8`). A weight box with
nothing in it holds an en dash, never a target — there is no programmed weight.
Row height 44 (was 58 on the TV, 48 on the phone).

**The ghost value is `colors.hint` `#9a9187`, not the `#d5cdc4` quoted in
`design_handoff_member_lasttime_v1`.** That README predates the 2026-08-18
"Member legibility pass: it was the grey, not the size" work; `#d5cdc4` measures
~1.5:1 and `lib/theme.js` names `hint` (~3:1) for exactly this use. On a wall
read from across a gym floor it is the programmed target and the empty-weight
dash on every unkeyed set — do not lighten it.

**`+ Add set` and `Same as last`** are 44pt bordered peach buttons, not text
links. Deliberately renamed from "Same as last set" — at 463px the longer label
truncated.

**One notes field.** Labelled `NOTES · WEEK 3`, white, `#ece7e1` border, sitting
beside the sets at three clients (619px) and dropping to a one-line
`Add a note for week 3…` field below the sets at 463px. Under it: *"Coach or
client — one note, both see it."* Saved notes appear in the history attributed
by first name. The coach-only field is gone.

> **Data note, not a design ask:** the mockup shows one note per lift per week,
> written by anyone, visible to everyone. Today that is two tables
> (`logs.notes` and `programming.exercise_coaching_notes`) with different keys
> and lifetimes. The implementing session resolves the merge; nothing here is
> designed around the current split.

---

## Calculator

`components/WeightCalculator.js`, reused, internals unchanged: bar first (No bar
/ Barbell 35 / Specialty ›), then tap each plate as it is actually loaded, then
Insert.

It opens from a **`▦ Calculator` pill in the keypad dock**, beside the pad and
above `Next`, visible whenever the active field is a weight field, and it **takes
the keypad's place inside the column** — same corner, same fixed footprint
(330px wide), `‹ Keypad` returns. Bar row, plates 4-across, then `TOTAL` and
`Insert`. It never covers the sets it is filling in and it cannot touch another
client's column.

**The dock never stretches, and it can be dismissed.** Keypad and calculator are
fixed-width blocks pinned to the bottom-right of their column at every client
count — a 148px label / Calculator / `Next` strip, an 8px gutter, a 214px pad;
the calculator is 428px with its plates in one row. A `⌄` button in the dock's
top-left corner puts the whole thing away, so a column can go back to being just
programming without collapsing the card. `TOTAL` reads in the calculator's header
line rather than in a cell of its own, which is what let the panel stay shorter
than the pad it replaces.

**Columns never stretch either.** One client is a 463px column centred on the
wall with the clock beside it — not one 1856px column.

Specialty is a `›` because it opens the coach-configured bar list rather than
switching modes — same behaviour as the member app.

---

## The rest of the board

**Warm-ups** stay a collapsed strip at the top of each column, now with a 30pt
bordered chevron button at the right edge. The strip also states the count
(`Warm-up · 6 · Cat Cow · Quadruped T Spine · …`) so the control has something
to promise.

**Finalize** stays per column at the bottom. A **finalized column** gets a 6px
olive bar across its top, a `COMPLETE` pill in the header, and an outlined
`Un-finalize session` button. *Deviation:* the shipped column paints its whole
background `#eef1e7` when finalized; visual-pass v4's house rule is
border-and-fill, never a full wash. The bar + pill + outlined button carry the
signal from across the room without the wash. If Terra prefers the wash, it is
one style change.

**Nothing published** reads as a sentence in `#6f6862`, not an error: *"Nothing
published for this session yet. A coach can publish it from their phone and it
appears here within a few seconds."*

**More lifts than fit** — that column's lift list scrolls on its own. Columns
never resize, reorder or reflow because of anything happening in another column.

**Reps-only lifts** drop the LB column entirely rather than showing an empty
one — see Kelsey's expanded pull-up in the two-expanded frame.

---

## Idle screen

What is on the wall most of the day. A 250px Protest Strike clock and the date,
one number for the gym's week (`128 sessions logged`), and a rotating list of
recent bests by first name, on a 20-second cycle. The only instruction on the
screen is one quiet line: *"A coach starts the board from their phone — SPC →
Live session."* No dashboard, no calls to action, no logo wall.

Recent bests are member names and numbers on a screen in a shared room — worth
Terra's explicit yes before it ships.

---

## Setup screen (coach phone)

Four slots, `Add client` with a `SLOT n` marker on each so the four-client cap is
visible before anything is picked. A filled slot shows the name, the week, and
session pills (completed ones carry a tick); an unresolvable slot shows its own
error in `#b23a22` and does not block the others. Start is dimmed until at least
one slot resolves and counts what it will start: `Start live session (2)`.

---

## Coach phone — the same pattern, not a modal

The phone adopts expand-in-place. Same clay card, same keypad dock above the
same Finalize, same history strip. Two surfaces, one pattern — and it means the
entry pad modal (`HubEntryPad.js`) goes away on both.

First-name segmented tabs stay: at 390px it is the cheapest client switch, and
it is already what coaches use.

Everything the annotated screenshot showed, resolved:

| problem | fix |
|---|---|
| keypad eats half the sheet, sets scroll away | 3×4 pad docks in the bottom-right corner; the card above it never scrolls |
| `Next` sliced by the pinned Cancel/Save footer | no modal, so no footer; `Next` sits beside the pad, not under it |
| target reps render full-size in the empty box | member app's `TARGET` + dashed field pattern |
| history is one grey line | the week strip: last week's sets, its note, `2 weeks ›` |
| "Note history" is unstyled grey text | it is the history strip's own tap target |
| `+ Add set` / `Same as last set` are plain links | 44pt bordered peach buttons |
| no calculator near the weight field | `▦ Calc` in the keypad dock, beside the pad |
| two note fields | one, with `+ Note` on the history strip |

At 390px the card holds sets + the history strip + the note affordance and
nothing more — the note is a one-line `+ Note` on the strip rather than an open
field. That is the phone's version of the same width trade the TV makes at four
clients.

---

## Icons

The mockup draws icons as text glyphs. The intended Ionicons, all already in use
in `components/hub/`:

| drawn | Ionicon |
|---|---|
| `⇅` reorder toggle | `swap-vertical` (and `close-circle` while reordering) |
| `✓` completion tick | `checkmark-circle` / `checkmark-circle-outline` |
| `✎` note present on a lift | `chatbox-ellipses-outline` |
| `⌄` / `⌃` expand & collapse | `chevron-down` / `chevron-up` |
| `▦` calculator | `calculator-outline` |
| `⌫` keypad backspace | `backspace-outline` |
| `+` add client slot | `add-circle-outline` |

The Kova roundel is `assets/kova-logo.jpg`, as `app/(display)/index.js` already
uses it: 32px in the top bar, 150px on the idle screen.

## A column with more lifts than fit

The lift list scrolls **inside its own column** — `overflow-y: auto` on the list,
not on the board. **No scrollbar**: `scrollbar-width: none` plus a
`::-webkit-scrollbar { width: 0 }` rule, because a classic scrollbar consumes
content width in the scrolling column only, which would render that client's
cards ~19px narrower than its neighbours' on a four-up wall. Wrong on a touch
display anyway.

Two things carry the signal instead: the bottom 22px of the list fades out, so a
card cut at the fold reads as "there is more below", and a pinned
**`2 more lifts ⌄`** row sits between the list and Finalize, outside the scroll
area, so it never scrolls away. Finalize stays put. Nothing in any other column
moves.

The fade is on every column's list, not just the overflowing one — it only bites
when content actually reaches the bottom edge, so a short list is unaffected and
there is no width- or count-dependent variant to implement.

---

## Open questions

1. **What "last completed week" resolves to** when a client skips a week: the
   previous week of the block, or the last week this lift was actually logged?
   They diverge immediately and the strip's label (`WEEK 2`) depends on it.
3. **Recent bests on the idle screen** — names and numbers visible to anyone in
   the room. Yes, or brand-only?
4. **Note attribution** — first name (`— Georgie`) is what is drawn. Is a
   client-written note attributed the same way, or left unattributed?
5. **The finalized wash** — bar + pill (drawn) or the current full olive column?
6. **Warm-ups expanded** — the strip expands in place and pushes the lift list
   down. At four clients with a lift already expanded there is no room for both;
   should expanding the warm-ups collapse the open lift?

## Not designed, deliberately

The data model, the 3-second poll, the display account's RLS scope, and the
rules about who can be in a session are untouched. Nothing here needs a new
query that `lib/programming/hub.js` and `coachingNotes.js` don't already imply,
except the note merge flagged above.

## Screen map

| frame | id | built from |
|---|---|---|
| 2a — two widths, centred at 1–2 clients | `#2a` | `app/(display)/index.js`, `HubBoard.js` |
| history open in the dock | `#2h` | `print/[blockId].web.js` (history model) |
| 1a — open card, 3 clients | `#1a` | `HubClientColumn.js`, `HubEntryPad.js`, `HubBoard.js` |
| 1b — tabbed card, 3 clients | `#1b` | same |
| 4 clients resting (finalized / empty / overflow) | `#s4` | `HubClientColumn.js`, `HubBoard.js` |
| two columns expanded, reps-only lift | `#s2x` | `HubEntryPad.js`, `HubNumberPad.js` |
| 1 client, centred + calculator | `#s1` | `WeightCalculator.js` |
| idle | `#idle` | `app/(display)/index.js` |
| coach phone — setup ×2, live | `#phone` | `HubSessionSetup.js`, `app/(coach)/spc/live.js` |

## Files

- `Kova SPC Live Hub - Directions.dc.html`
- `screenshots/00-2a-two-widths.png`, `00-2h-history-in-dock.png`
- `screenshots/01-1a-open-card.png`, `02-1b-tabbed-card.png`,
  `03-four-clients-resting.png`, `04-two-expanded-reps-only.png`,
  `06-calculator-in-place.png`, `07-idle.png`, `08-phone.png`

This folder is written in the design project; copy it to the repo root as
`design_handoff_spc_hub_v1/` alongside the other handoffs.
